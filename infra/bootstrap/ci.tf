# GitHub Actions' access to AWS (specs/2026-09-26-ci-deploy/SPEC.md §2). It lives here, applied by
# hand, rather than in infra/, so the deploy role never manages its own permissions. When infra/
# gains a resource type, add the actions it needs here and apply this before merging that PR:
#
#   terraform -chdir=infra/bootstrap apply
#
# No AdministratorAccess or ReadOnlyAccess: every action is listed, and scoped to Cranny's
# resources wherever the service allows it. CloudFront, ACM and API Gateway name resources by
# generated IDs, so those are scoped to their resource type in this account.
#
# Neither role can read the Ably key: infra/ doesn't manage its parameter, so plans never read it
# and it isn't in state. Keep it that way.

# The repository uses GitHub's immutable subject claims, which carry the owner's and repository's
# IDs, so a deleted and re-created repository of the same name can't match. Check the prefix with
#   gh api repos/cookejames/cranny/actions/oidc/customization/sub
variable "github_subject_prefix" {
  description = "The start of the OIDC sub claim for the repository whose workflows may assume the CI roles."
  type        = string
  default     = "repo:cookejames@2211370/cranny@1386290316"
}

variable "zone_name" {
  description = "The Route 53 hosted zone the site's records live in (infra/variables.tf)."
  type        = string
  default     = "cooke.ing"
}

variable "domain_name" {
  description = "The site's name (infra/variables.tf); CI may change only records for it."
  type        = string
  default     = "cranny.cooke.ing"
}

data "aws_route53_zone" "zone" {
  name = var.zone_name
}

locals {
  account        = data.aws_caller_identity.current.account_id
  state_key      = "cranny/terraform.tfstate"
  site_bucket    = "arn:aws:s3:::cranny-site-*"
  rooms_function = "arn:aws:lambda:${var.region}:${local.account}:function:cranny-rooms"
  rooms_role     = "arn:aws:iam::${local.account}:role/cranny-rooms"
  rooms_logs     = "arn:aws:logs:${var.region}:${local.account}:log-group:/aws/lambda/cranny-rooms"
  # Built from its name, as infra/rooms.tf does, so both policies are known at plan time.
  rooms_boundary = "arn:aws:iam::${local.account}:policy/cranny-rooms-boundary"
  ably_key       = "arn:aws:ssm:${var.region}:${local.account}:parameter/cranny/ably-key"
  certificates   = "arn:aws:acm:us-east-1:${local.account}:certificate/*"
  api_gateway    = ["arn:aws:apigateway:${var.region}::/apis", "arn:aws:apigateway:${var.region}::/apis/*", "arn:aws:apigateway:${var.region}::/tags/*"]
}

# GitHub's OIDC issuer. An account has at most one per URL: if another project already created
# it, import it (terraform import aws_iam_openid_connect_provider.github <arn>) rather than
# creating a second.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# Trust for one kind of workflow run: `subject` is the token's sub claim.
data "aws_iam_policy_document" "ci_trust" {
  for_each = {
    deploy = "${var.github_subject_prefix}:environment:production"
    plan   = "${var.github_subject_prefix}:pull_request"
  }

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [each.value]
    }
  }
}

# The deploy workflow, and only from the `production` environment, which only main may use.
resource "aws_iam_role" "ci_deploy" {
  name               = "cranny-ci-deploy"
  assume_role_policy = data.aws_iam_policy_document.ci_trust["deploy"].json
}

# The PR plan workflow. Fork PRs get no OIDC token, so only branches in the repository can use it.
resource "aws_iam_role" "ci_plan" {
  name               = "cranny-ci-plan"
  assume_role_policy = data.aws_iam_policy_document.ci_trust["plan"].json
}

# Everything `terraform plan` reads while refreshing infra/'s state. Plans on PRs run with
# -lock=false, so this is all the plan role gets.
data "aws_iam_policy_document" "ci_read" {
  statement {
    sid       = "StateRead"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
  statement {
    sid       = "StateObjectRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.state.arn}/${local.state_key}"]
  }
  statement {
    sid = "SiteBucketRead"
    actions = [
      "s3:GetBucket*",
      "s3:GetAccelerateConfiguration",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:ListBucket",
    ]
    resources = [local.site_bucket]
  }
  # CloudFront's List* calls (the managed cache policies are looked up by name) take no resource.
  statement {
    sid       = "CloudFrontRead"
    actions   = ["cloudfront:Get*", "cloudfront:List*"]
    resources = ["*"]
  }
  statement {
    sid       = "CertificateRead"
    actions   = ["acm:DescribeCertificate", "acm:GetCertificate", "acm:ListTagsForCertificate"]
    resources = [local.certificates]
  }
  statement {
    sid       = "ZoneLookup"
    actions   = ["route53:ListHostedZones", "route53:ListHostedZonesByName"]
    resources = ["*"]
  }
  statement {
    sid       = "ZoneRead"
    actions   = ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ListTagsForResource"]
    resources = [data.aws_route53_zone.zone.arn]
  }
  statement {
    sid       = "ChangeRead"
    actions   = ["route53:GetChange"]
    resources = ["arn:aws:route53:::change/*"]
  }
  statement {
    sid       = "FunctionRead"
    actions   = ["lambda:Get*", "lambda:List*"]
    resources = [local.rooms_function]
  }
  statement {
    sid       = "ApiRead"
    actions   = ["apigateway:GET"]
    resources = local.api_gateway
  }
  statement {
    sid       = "LogsRead"
    actions   = ["logs:DescribeLogGroups", "logs:ListTagsForResource", "logs:ListTagsLogGroup"]
    resources = ["arn:aws:logs:${var.region}:${local.account}:log-group:*"]
  }
  statement {
    sid       = "RoleRead"
    actions   = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"]
    resources = [local.rooms_role]
  }
}

resource "aws_iam_policy" "ci_read" {
  name   = "cranny-ci-read"
  policy = data.aws_iam_policy_document.ci_read.json
}

# What `terraform apply` and scripts/deploy.sh change, on top of cranny-ci-read.
data "aws_iam_policy_document" "ci_deploy" {
  statement {
    sid       = "StateWrite"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/${local.state_key}", "${aws_s3_bucket.state.arn}/${local.state_key}.tflock"]
  }
  statement {
    sid = "SiteBucketWrite"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketOwnershipControls",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:PutBucketTagging",
    ]
    resources = [local.site_bucket]
  }
  statement {
    sid       = "SiteUpload"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.site_bucket}/*"]
  }
  statement {
    sid = "CloudFrontWrite"
    actions = [
      "cloudfront:CreateDistribution",
      "cloudfront:UpdateDistribution",
      "cloudfront:DeleteDistribution",
      "cloudfront:CreateInvalidation",
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:UpdateOriginAccessControl",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:CreateResponseHeadersPolicy",
      "cloudfront:UpdateResponseHeadersPolicy",
      "cloudfront:DeleteResponseHeadersPolicy",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
    ]
    resources = [
      "arn:aws:cloudfront::${local.account}:distribution/*",
      "arn:aws:cloudfront::${local.account}:origin-access-control/*",
      "arn:aws:cloudfront::${local.account}:response-headers-policy/*",
    ]
  }
  statement {
    sid       = "CertificateRequest"
    actions   = ["acm:RequestCertificate"]
    resources = ["*"]
  }
  statement {
    sid       = "CertificateWrite"
    actions   = ["acm:DeleteCertificate", "acm:AddTagsToCertificate", "acm:RemoveTagsFromCertificate"]
    resources = [local.certificates]
  }
  # Only the site's own records and its certificate's validation records, never the rest of the zone.
  statement {
    sid       = "RecordsWrite"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [data.aws_route53_zone.zone.arn]
    condition {
      test     = "ForAllValues:StringLike"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = [var.domain_name, "_*.${var.domain_name}"]
    }
  }
  statement {
    sid = "FunctionWrite"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:TagResource",
      "lambda:UntagResource",
    ]
    resources = [local.rooms_function]
  }
  statement {
    sid       = "ApiWrite"
    actions   = ["apigateway:POST", "apigateway:PATCH", "apigateway:PUT", "apigateway:DELETE"]
    resources = local.api_gateway
  }
  statement {
    sid = "LogsWrite"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:TagResource",
      "logs:UntagResource",
      "logs:TagLogGroup",
      "logs:UntagLogGroup",
    ]
    resources = [local.rooms_logs, "${local.rooms_logs}:*"]
  }
  # The rooms Lambda's role, and only while it keeps its permissions boundary, so whatever policy
  # CI gives it can't exceed cranny-rooms-boundary.
  statement {
    sid = "RoomsRoleWrite"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePermissionsBoundary",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
    ]
    resources = [local.rooms_role]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.rooms_boundary]
    }
  }
  statement {
    sid       = "RoomsRoleManage"
    actions   = ["iam:DeleteRole", "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:ListInstanceProfilesForRole"]
    resources = [local.rooms_role]
  }
  statement {
    sid       = "RoomsRolePass"
    actions   = ["iam:PassRole"]
    resources = [local.rooms_role]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }
  statement {
    sid       = "KeepRoomsBoundary"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = [local.rooms_role]
  }
}

resource "aws_iam_policy" "ci_deploy" {
  name   = "cranny-ci-deploy"
  policy = data.aws_iam_policy_document.ci_deploy.json
}

resource "aws_iam_role_policy_attachment" "ci_deploy_read" {
  role       = aws_iam_role.ci_deploy.name
  policy_arn = aws_iam_policy.ci_read.arn
}

resource "aws_iam_role_policy_attachment" "ci_deploy" {
  role       = aws_iam_role.ci_deploy.name
  policy_arn = aws_iam_policy.ci_deploy.arn
}

resource "aws_iam_role_policy_attachment" "ci_plan_read" {
  role       = aws_iam_role.ci_plan.name
  policy_arn = aws_iam_policy.ci_read.arn
}

# The most the rooms Lambda's role may ever do (infra/rooms.tf sets it as that role's boundary),
# whatever policy it's given: read the Ably key and write its logs.
data "aws_iam_policy_document" "rooms_boundary" {
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [local.ably_key]
  }
  # The AWS-managed aws/ssm key's own policy grants decryption, but only up to this boundary.
  statement {
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.region}:${local.account}:key/*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${local.rooms_logs}:*"]
  }
}

resource "aws_iam_policy" "rooms_boundary" {
  name   = "cranny-rooms-boundary"
  policy = data.aws_iam_policy_document.rooms_boundary.json
}

output "ci_deploy_role_arn" {
  description = "The GitHub repository variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.ci_deploy.arn
}

output "ci_plan_role_arn" {
  description = "The GitHub repository variable AWS_PLAN_ROLE_ARN."
  value       = aws_iam_role.ci_plan.arn
}

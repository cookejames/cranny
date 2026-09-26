# The multiplayer room directory (specs/2026-09-25-multiplayer/SPEC.md §7, §13): one Lambda
# behind an HTTP API, reached through CloudFront as /api/rooms/* so it's same-origin. It keeps no
# state, so there is no database.

# The Ably API key is a SecureString parameter that Terraform doesn't manage. Managing it, even
# with the value ignored, reads the key into state on every refresh, where anyone who can plan
# could read it (specs/2026-09-26-ci-deploy/SPEC.md §2). Create it, and set it again after
# rotating the key, with
#   aws ssm put-parameter --name /cranny/ably-key --type SecureString --overwrite --value '<key>'
locals {
  ably_key_parameter = "/cranny/ably-key"
  ably_key_arn       = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ably_key_parameter}"
}

# Terraform used to manage the parameter: forget it without deleting it. Remove this block once
# every copy of the state has been applied with it.
removed {
  from = aws_ssm_parameter.ably_key

  lifecycle {
    destroy = false
  }
}

resource "aws_cloudwatch_log_group" "rooms" {
  name              = "/aws/lambda/cranny-rooms"
  retention_in_days = 14
}

data "aws_iam_policy_document" "rooms_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Least privilege: read the one parameter (the AWS-managed aws/ssm key needs no KMS grant) and
# write to the one log group.
data "aws_iam_policy_document" "rooms" {
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [local.ably_key_arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.rooms.arn}:*"]
  }
}

data "aws_caller_identity" "current" {}

# The boundary is created by infra/bootstrap/ci.tf, outside CI's reach: CI may edit this role's
# policy, but never beyond the boundary (specs/2026-09-26-ci-deploy/SPEC.md §2).
resource "aws_iam_role" "rooms" {
  name                 = "cranny-rooms"
  assume_role_policy   = data.aws_iam_policy_document.rooms_assume.json
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/cranny-rooms-boundary"
}

resource "aws_iam_role_policy" "rooms" {
  name   = "cranny-rooms"
  role   = aws_iam_role.rooms.id
  policy = data.aws_iam_policy_document.rooms.json
}

# Terraform creates the function with a stand-in that answers `unavailable`; scripts/deploy.sh
# uploads the real bundle (apps/rooms-api/dist), so code changes never need a Terraform run.
data "archive_file" "rooms_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.terraform/rooms-placeholder.zip"
  source {
    filename = "handler.mjs"
    content  = "export const handler = async () => ({ statusCode: 503, body: '{\"error\":\"unavailable\"}' });\n"
  }
}

resource "aws_lambda_function" "rooms" {
  function_name = "cranny-rooms"
  role          = aws_iam_role.rooms.arn
  runtime       = "nodejs24.x"
  architectures = ["arm64"]
  handler       = "handler.handler"
  memory_size   = 256
  timeout       = 10
  filename      = data.archive_file.rooms_placeholder.output_path

  environment {
    variables = {
      ABLY_KEY_PARAMETER = local.ably_key_parameter
      NODE_OPTIONS       = "--enable-source-maps"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.rooms.name
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_iam_role_policy.rooms]
}

resource "aws_apigatewayv2_api" "rooms" {
  name          = "cranny-rooms"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "rooms" {
  api_id                 = aws_apigatewayv2_api.rooms.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.rooms.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}

resource "aws_apigatewayv2_route" "rooms" {
  api_id    = aws_apigatewayv2_api.rooms.id
  route_key = "POST /api/rooms/{action}"
  target    = "integrations/${aws_apigatewayv2_integration.rooms.id}"
}

# HTTP APIs throttle per stage, not per caller: this caps the total rate (and so the cost and
# what name guessing can do) rather than each IP address.
resource "aws_apigatewayv2_stage" "rooms" {
  api_id      = aws_apigatewayv2_api.rooms.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 10
    throttling_burst_limit = 20
  }
}

resource "aws_lambda_permission" "rooms" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rooms.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.rooms.execution_arn}/*/*/api/rooms/*"
}

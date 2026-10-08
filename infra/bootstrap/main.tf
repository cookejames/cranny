# Set up by hand: the S3 bucket that holds the main configuration's Terraform state (SPEC.md §11),
# and GitHub Actions' roles (ci.tf). Its own state lives in that same bucket under its own key,
# bootstrap/terraform.tfstate, which CI's roles can't reach (ci.tf only names cranny/terraform.tfstate):
# CI must not be able to edit the configuration that defines its permissions. Bucket and region come
# from backend.hcl in this directory (git-ignored; see backend.hcl.example). Run it before
# `terraform init` in infra/, and again whenever ci.tf changes:
#
#   terraform -chdir=infra/bootstrap init -backend-config=backend.hcl
#   terraform -chdir=infra/bootstrap apply
#   terraform -chdir=infra/bootstrap output -raw backend_config > infra/backend.hcl
#
# The first run in a new account has no bucket to hold state yet: see "Starting from scratch" in
# README.md (specs/2026-10-08-bootstrap-remote-state/).

terraform {
  required_version = ">= 1.10"

  # Bucket and region are in backend.hcl: terraform init -backend-config=backend.hcl
  backend "s3" {
    key          = "bootstrap/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "region" {
  description = "Region for the state bucket."
  type        = string
  default     = "eu-west-2"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = { Project = "cranny" }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  # Bucket names are global; the account ID keeps this one unique.
  bucket = "cranny-terraform-state-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Versioning lets a bad state write be rolled back.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# State travels only over HTTPS.
data "aws_iam_policy_document" "state" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket     = aws_s3_bucket.state.id
  policy     = data.aws_iam_policy_document.state.json
  depends_on = [aws_s3_bucket_public_access_block.state]
}

output "bucket" {
  value = aws_s3_bucket.state.id
}

output "backend_config" {
  description = "Settings for infra/backend.hcl, and for infra/bootstrap/backend.hcl, which names the same bucket (terraform init -backend-config=backend.hcl)."
  value       = <<-EOT
    bucket = "${aws_s3_bucket.state.id}"
    region = "${var.region}"
  EOT
}

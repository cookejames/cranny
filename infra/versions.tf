terraform {
  # 1.10+ for native S3 state locking (use_lockfile).
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # The state bucket is created by infra/bootstrap. Its name and region go in backend.hcl (git-ignored;
  # see backend.hcl.example):
  #   terraform init -backend-config=backend.hcl
  backend "s3" {
    key          = "cranny/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = { Project = "cranny" }
  }
}

# CloudFront only accepts certificates from us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = { Project = "cranny" }
  }
}

# The site's name has its DNS at Porkbun, where the domain is registered. The API key is limited to
# this domain, so Terraform can change its records and nothing else. Porkbun's records are named
# relative to the domain, so the apex is "" and ACM's "_x.example.com." becomes "_x".
#
# The old name (legacy_domain_name) stays in its existing Route 53 zone, pointing at the same
# distribution, which redirects it to the new name (functions/redirect-legacy.js.tftpl).
locals {
  # ACM's validation records, keyed by the name they validate.
  validation_options = {
    for option in aws_acm_certificate.site.domain_validation_options : option.domain_name => option
  }

  # The new name's records, as Porkbun wants them: no domain suffix and no trailing dots.
  validation_records = {
    for name, option in local.validation_options : name => {
      subdomain = trimsuffix(trimsuffix(option.resource_record_name, "."), ".${var.domain_name}")
      type      = option.resource_record_type
      content   = trimsuffix(option.resource_record_value, ".")
    } if name == var.domain_name
  }
}

data "aws_route53_zone" "legacy" {
  name = var.legacy_zone_name
}

# Only Amazon may issue certificates for the site's name (and none for wildcards under it).
resource "porkbun_dns_record" "caa" {
  for_each = {
    issue     = "0 issue \"amazon.com\""
    issuewild = "0 issuewild \";\""
  }

  domain    = var.domain_name
  subdomain = ""
  type      = "CAA"
  content   = each.value
}

# The same for the old name. Scoped to the subdomain, so the rest of the zone is unaffected.
resource "aws_route53_record" "caa_legacy" {
  zone_id = data.aws_route53_zone.legacy.zone_id
  name    = var.legacy_domain_name
  type    = "CAA"
  ttl     = 3600
  records = ["0 issue \"amazon.com\"", "0 issuewild \";\""]
}

resource "aws_acm_certificate" "site" {
  provider                  = aws.us_east_1
  domain_name               = var.domain_name
  subject_alternative_names = [var.legacy_domain_name]
  validation_method         = "DNS"

  # ACM checks CAA before issuing.
  depends_on = [porkbun_dns_record.caa, aws_route53_record.caa_legacy]

  lifecycle {
    create_before_destroy = true
  }
}

resource "porkbun_dns_record" "validation" {
  for_each = local.validation_records

  domain    = var.domain_name
  subdomain = each.value.subdomain
  type      = each.value.type
  content   = each.value.content
}

resource "aws_route53_record" "validation_legacy" {
  for_each = { for name, option in local.validation_options : name => option if name == var.legacy_domain_name }

  zone_id         = data.aws_route53_zone.legacy.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.site.arn

  # ACM polls DNS itself; the records only need to exist first.
  depends_on = [porkbun_dns_record.validation, aws_route53_record.validation_legacy]
}

# An ALIAS at the apex, where a CNAME isn't allowed. Porkbun resolves it to CloudFront's addresses.
resource "porkbun_dns_record" "site" {
  domain    = var.domain_name
  subdomain = ""
  type      = "ALIAS"
  content   = aws_cloudfront_distribution.site.domain_name
}

resource "aws_route53_record" "site_legacy" {
  for_each = toset(["A", "AAAA"])

  zone_id = data.aws_route53_zone.legacy.zone_id
  name    = var.legacy_domain_name
  type    = each.value

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

# The old name's records were Route 53 resources under the old addresses. Moving them in state
# keeps apply from deleting and re-creating them (which could race on the same record names).
moved {
  from = aws_route53_record.caa
  to   = aws_route53_record.caa_legacy
}

moved {
  from = aws_route53_record.validation
  to   = aws_route53_record.validation_legacy
}

moved {
  from = aws_route53_record.site
  to   = aws_route53_record.site_legacy
}

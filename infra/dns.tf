# DNS lives at Porkbun, where the domain is registered. The API key is limited to this domain, so
# Terraform can change its records and nothing else. Porkbun's records are named relative to the
# domain, so the apex is "" and ACM's "_x.example.com." becomes "_x".
locals {
  # ACM's validation records, keyed by name. Porkbun wants names without the domain and the trailing dots.
  validation_records = {
    for option in aws_acm_certificate.site.domain_validation_options : option.domain_name => {
      subdomain = trimsuffix(trimsuffix(option.resource_record_name, "."), ".${var.domain_name}")
      type      = option.resource_record_type
      content   = trimsuffix(option.resource_record_value, ".")
    }
  }
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

resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  # ACM checks CAA before issuing.
  depends_on = [porkbun_dns_record.caa]

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

resource "aws_acm_certificate_validation" "site" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.site.arn

  # ACM polls DNS itself; the records only need to exist first.
  depends_on = [porkbun_dns_record.validation]
}

# An ALIAS at the apex, where a CNAME isn't allowed. Porkbun resolves it to CloudFront's addresses.
resource "porkbun_dns_record" "site" {
  domain    = var.domain_name
  subdomain = ""
  type      = "ALIAS"
  content   = aws_cloudfront_distribution.site.domain_name
}

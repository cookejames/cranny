locals {
  # The same headers `pnpm preview` sends, so the CSP is tested before it's deployed.
  headers      = jsondecode(file("${path.module}/../apps/web/security-headers.json"))
  hsts         = local.headers["Strict-Transport-Security"]
  hsts_max_age = tonumber(regex("max-age=(\\d+)", local.hsts)[0])
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "cranny-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "cranny-security-headers"

  # Every header `pnpm preview` sends must reach production too: fail the plan if
  # security-headers.json gains one this policy doesn't map.
  lifecycle {
    precondition {
      condition = length(setsubtract(keys(local.headers), [
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
      ])) == 0
      error_message = "apps/web/security-headers.json has a header that cdn.tf doesn't apply; map it in aws_cloudfront_response_headers_policy.security."
    }
    precondition {
      condition     = local.headers["X-Content-Type-Options"] == "nosniff"
      error_message = "CloudFront can only send X-Content-Type-Options: nosniff."
    }
  }

  security_headers_config {
    content_security_policy {
      content_security_policy = local.headers["Content-Security-Policy"]
      override                = true
    }
    strict_transport_security {
      access_control_max_age_sec = local.hsts_max_age
      include_subdomains         = strcontains(lower(local.hsts), "includesubdomains")
      preload                    = strcontains(lower(local.hsts), "preload")
      override                   = true
    }
    content_type_options {
      override = true
    }
    referrer_policy {
      referrer_policy = local.headers["Referrer-Policy"]
      override        = true
    }
  }
}

# AWS managed "CachingOptimized": honours the Cache-Control the deploy script sets on each file.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# For /api/*: never cache, and forward everything but Host (API Gateway needs its own).
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "Cranny"
  aliases             = [var.domain_name]
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  # North America and Europe edge locations only: cheapest, and fine for a personal project.
  price_class = "PriceClass_100"

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  # The rooms API (rooms.tf), same-origin so the CSP's connect-src needs only 'self' for it.
  origin {
    origin_id   = "rooms-api"
    domain_name = replace(aws_apigatewayv2_api.rooms.api_endpoint, "https://", "")

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "rooms-api"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # SPA deep links (SPEC.md §11): /g/<code> isn't a file, so S3 answers 403 (no ListBucket
  # permission) or 404. Serve the app instead, with 200, and let the router take over. This
  # applies to every origin, so the rooms API never answers 403 or 404 (apps/rooms-api/src/api.ts).
  dynamic "custom_error_response" {
    for_each = [403, 404]
    content {
      error_code            = custom_error_response.value
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 10
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

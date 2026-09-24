output "bucket_name" {
  description = "The site bucket; scripts/deploy.sh uploads the build here."
  value       = aws_s3_bucket.site.id
}

output "distribution_id" {
  description = "The CloudFront distribution; scripts/deploy.sh invalidates it after uploading."
  value       = aws_cloudfront_distribution.site.id
}

output "url" {
  value = "https://${var.domain_name}"
}

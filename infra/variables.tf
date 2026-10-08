variable "domain_name" {
  description = "Where the site is served: a domain registered at Porkbun, with its DNS there too (the apex, not a subdomain)."
  type        = string
  default     = "playcranny.com"
}

variable "region" {
  description = "Region for the site bucket. The certificate is always in us-east-1."
  type        = string
  default     = "eu-west-2"
}

variable "domain_name" {
  description = "Where the site is served: a domain registered at Porkbun, with its DNS there too (the apex, not a subdomain)."
  type        = string
  default     = "playcranny.com"
}

variable "legacy_domain_name" {
  description = "The old name, which still points at the distribution and 301-redirects to domain_name."
  type        = string
  default     = "cranny.cooke.ing"
}

variable "legacy_zone_name" {
  description = "The existing Route 53 hosted zone that legacy_domain_name lives in."
  type        = string
  default     = "cooke.ing"
}

variable "region" {
  description = "Region for the site bucket. The certificate is always in us-east-1."
  type        = string
  default     = "eu-west-2"
}

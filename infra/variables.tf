variable "domain_name" {
  description = "Where the site is served."
  type        = string
  default     = "cranny.cooke.ing"
}

variable "zone_name" {
  description = "The existing Route 53 hosted zone that domain_name lives in."
  type        = string
  default     = "cooke.ing"
}

variable "region" {
  description = "Region for the site bucket. The certificate is always in us-east-1."
  type        = string
  default     = "eu-west-2"
}

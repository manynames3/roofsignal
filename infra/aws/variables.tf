variable "aws_region" {
  description = "AWS region for the Roof Signal backend."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Base name used for AWS resources."
  type        = string
  default     = "roofsignal"
}

variable "allowed_origins" {
  description = "Browser origins allowed to call the API."
  type        = list(string)
  default = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://roofsignal-readiness-agent.pages.dev"
  ]
}

variable "gemini_api_key" {
  description = "Gemini API key stored in SSM SecureString for Lambda use."
  type        = string
  sensitive   = true
}

variable "nrel_api_key" {
  description = "NREL PVWatts API key stored in SSM SecureString for Lambda use."
  type        = string
  sensitive   = true
}

variable "gemini_model" {
  description = "Gemini model used for photo evidence suggestions."
  type        = string
  default     = "gemini-2.5-flash-lite"
}

variable "retention_days" {
  description = "Default report/photo retention window in days."
  type        = number
  default     = 90
}

variable "share_link_ttl_days" {
  description = "Default share-link expiration window in days."
  type        = number
  default     = 30
}

variable "gemini_daily_limit" {
  description = "Per-company daily Gemini request limit."
  type        = number
  default     = 100
}

variable "nrel_daily_limit" {
  description = "Per-company daily NREL request limit."
  type        = number
  default     = 300
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency for the API Lambda; caps cost and provider usage under abuse. Use -1 for no reservation (required if the account has too little unreserved concurrency)."
  type        = number
  default     = 5
}

variable "alarm_actions" {
  description = "ARNs (for example an SNS topic) notified when CloudWatch alarms fire or recover. Empty by default, so alarms change state but notify nobody until this is configured."
  type        = list(string)
  default     = []
}

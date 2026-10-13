terraform {
  required_version = ">= 1.6.0"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

resource "random_id" "suffix" {
  byte_length = 3
}

locals {
  name_prefix         = "${var.project_name}-${random_id.suffix.hex}"
  lambda_source_file  = "${path.module}/../../backend/lambda/app.py"
  api_function_name   = "${local.name_prefix}-api"
  log_retention_days  = 14
  photo_upload_prefix = "companies/*/uploads/*"
  common_tags = {
    App       = "Roof Signal"
    ManagedBy = "Terraform"
  }
}

resource "aws_ssm_parameter" "gemini_api_key" {
  name        = "/${local.name_prefix}/gemini/api-key"
  description = "Gemini API key for Roof Signal photo evidence suggestions."
  type        = "SecureString"
  value       = var.gemini_api_key
  tags        = local.common_tags
}

resource "aws_ssm_parameter" "nrel_api_key" {
  name        = "/${local.name_prefix}/nrel/api-key"
  description = "NREL PVWatts API key for Roof Signal solar estimates."
  type        = "SecureString"
  value       = var.nrel_api_key
  tags        = local.common_tags
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "email"
    required            = true
  }

  # companyId and role stay mutable because changing schema mutability forces pool replacement.
  # The web client is denied write access to them below (write_attributes), so only admin APIs
  # (AdminUpdateUserAttributes) can change tenant or role claims.
  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "companyId"
    required            = false

    string_attribute_constraints {
      max_length = 80
      min_length = 1
    }
  }

  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "role"
    required            = false

    string_attribute_constraints {
      max_length = 20
      min_length = 1
    }
  }

  tags = local.common_tags
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows                  = ["implicit"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls = [
    "http://localhost:5173/app",
    "http://localhost:5174/app",
    "http://127.0.0.1:5173/app",
    "http://127.0.0.1:5174/app",
    "https://roofsignal-readiness-agent.pages.dev/app"
  ]
  logout_urls = [
    "http://localhost:5173/",
    "http://localhost:5174/",
    "http://127.0.0.1:5173/",
    "http://127.0.0.1:5174/",
    "https://roofsignal-readiness-agent.pages.dev/"
  ]
  supported_identity_providers = ["COGNITO"]

  read_attributes  = ["email", "email_verified", "custom:companyId", "custom:role"]
  write_attributes = ["email"]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 7

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_dynamodb_table" "reports" {
  name         = "${local.name_prefix}-reports"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "companyId"
  range_key    = "reportId"

  attribute {
    name = "companyId"
    type = "S"
  }

  attribute {
    name = "reportId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "shares" {
  name         = "${local.name_prefix}-shares"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "shareId"

  attribute {
    name = "shareId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "usage" {
  name         = "${local.name_prefix}-usage"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "usageKey"

  attribute {
    name = "usageKey"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "access_requests" {
  name         = "${local.name_prefix}-access-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "requestId"

  attribute {
    name = "requestId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = local.common_tags
}

resource "aws_s3_bucket" "photos" {
  bucket        = "${local.name_prefix}-photos-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "photos" {
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "photos_tls_only" {
  bucket = aws_s3_bucket.photos.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.photos.arn,
          "${aws_s3_bucket.photos.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.photos]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "POST", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    id     = "expire-roof-photos"
    status = "Enabled"

    filter {
      prefix = "companies/"
    }

    expiration {
      days = var.retention_days
    }
  }
}

# Only app.py is packaged; backend/tests and requirements-dev.txt stay out of the Lambda archive.
data "archive_file" "lambda" {
  type        = "zip"
  source_file = local.lambda_source_file
  output_path = "${path.module}/lambda.zip"
}

# If the function was already invoked before these log groups were managed, Lambda created
# its log group automatically. Import it first:
#   terraform import aws_cloudwatch_log_group.lambda /aws/lambda/<function name>
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.api_function_name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.name_prefix}-api"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_iam_role" "lambda" {
  name = "${local.name_prefix}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "lambda_app" {
  name = "${local.name_prefix}-api-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DeleteItem",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.reports.arn,
          aws_dynamodb_table.shares.arn,
          aws_dynamodb_table.usage.arn,
          aws_dynamodb_table.access_requests.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.photos.arn}/${local.photo_upload_prefix}"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = [
          aws_ssm_parameter.gemini_api_key.arn,
          aws_ssm_parameter.nrel_api_key.arn
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = local.api_function_name
  role             = aws_iam_role.lambda.arn
  handler          = "app.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 25
  memory_size      = 512

  # -1 leaves the function unreserved (needed when the account has too little unreserved concurrency).
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      ACCESS_REQUESTS_TABLE = aws_dynamodb_table.access_requests.name
      ALLOWED_ORIGINS       = join(",", var.allowed_origins)
      GEMINI_DAILY_LIMIT    = tostring(var.gemini_daily_limit)
      GEMINI_MODEL          = var.gemini_model
      GEMINI_PARAM_NAME     = aws_ssm_parameter.gemini_api_key.name
      NREL_DAILY_LIMIT      = tostring(var.nrel_daily_limit)
      NREL_PARAM_NAME       = aws_ssm_parameter.nrel_api_key.name
      PHOTO_BUCKET          = aws_s3_bucket.photos.bucket
      REPORTS_TABLE         = aws_dynamodb_table.reports.name
      RETENTION_DAYS        = tostring(var.retention_days)
      SHARE_LINK_TTL_DAYS   = tostring(var.share_link_ttl_days)
      SHARES_TABLE          = aws_dynamodb_table.shares.name
      USAGE_TABLE           = aws_dynamodb_table.usage.name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda_app
  ]

  tags = local.common_tags
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["authorization", "content-type"]
    allow_methods     = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_origins     = var.allowed_origins
    max_age           = 3600
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.name_prefix}-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 30
    throttling_rate_limit  = 15
  }

  # Metadata only: no client IP, user agent, raw path (share IDs), headers or claims.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn

    format = jsonencode({
      requestId         = "$context.requestId"
      requestTime       = "$context.requestTime"
      httpMethod        = "$context.httpMethod"
      routeKey          = "$context.routeKey"
      status            = "$context.status"
      protocol          = "$context.protocol"
      responseLength    = "$context.responseLength"
      responseLatency   = "$context.responseLatency"
      integrationStatus = "$context.integrationStatus"
      errorType         = "$context.error.responseType"
    })
  }

  tags = local.common_tags
}

# Alarms have no notification target unless var.alarm_actions is set (for example an SNS topic ARN).
# Without it they only change state in CloudWatch and nobody is paged.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.name_prefix}-lambda-errors"
  alarm_description   = "Roof Signal API Lambda invocation errors (crashes, timeouts)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${local.name_prefix}-lambda-throttles"
  alarm_description   = "Roof Signal API Lambda throttles, including reserved concurrency exhaustion."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = local.common_tags
}

# The handler catches its own exceptions and returns HTTP 500, which the Lambda Errors metric
# does not count, so API-level 5xx responses are alarmed separately.
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name_prefix}-api-5xx"
  alarm_description   = "Roof Signal API returned HTTP 5xx responses."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.api.id, Stage = aws_apigatewayv2_stage.api.name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = local.common_tags
}

locals {
  public_routes = {
    "GET /health"          = "GET /health"
    "POST /request-access" = "POST /request-access"
    "GET /share/{shareId}" = "GET /share/{shareId}"
  }

  protected_routes = {
    "GET /reports"                        = "GET /reports"
    "POST /reports"                       = "POST /reports"
    "GET /reports/{reportId}"             = "GET /reports/{reportId}"
    "DELETE /reports/{reportId}"          = "DELETE /reports/{reportId}"
    "POST /reports/{reportId}/share"      = "POST /reports/{reportId}/share"
    "POST /reports/{reportId}/crm-export" = "POST /reports/{reportId}/crm-export"
    "POST /photos/presign"                = "POST /photos/presign"
    "POST /photo-evidence-suggestions"    = "POST /photo-evidence-suggestions"
    "POST /solar-estimate"                = "POST /solar-estimate"
  }
}

resource "aws_apigatewayv2_route" "public" {
  for_each = local.public_routes

  api_id    = aws_apigatewayv2_api.api.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "protected" {
  for_each = local.protected_routes

  api_id             = aws_apigatewayv2_api.api.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

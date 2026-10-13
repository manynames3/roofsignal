output "api_url" {
  value = aws_apigatewayv2_stage.api.invoke_url
}

output "aws_region" {
  value = var.aws_region
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "photo_bucket" {
  value = aws_s3_bucket.photos.bucket
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.lambda.name
}

output "api_access_log_group" {
  value = aws_cloudwatch_log_group.api_access.name
}

# These alarms notify nobody unless alarm_actions is set.
output "alarm_names" {
  value = [
    aws_cloudwatch_metric_alarm.lambda_errors.alarm_name,
    aws_cloudwatch_metric_alarm.lambda_throttles.alarm_name,
    aws_cloudwatch_metric_alarm.api_5xx.alarm_name
  ]
}

output "create_admin_user_command" {
  value = "aws cognito-idp admin-create-user --region ${var.aws_region} --user-pool-id ${aws_cognito_user_pool.main.id} --username <email> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true Name=custom:companyId,Value=<company-slug> Name=custom:role,Value=admin"
}

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

output "create_admin_user_command" {
  value = "aws cognito-idp admin-create-user --region ${var.aws_region} --user-pool-id ${aws_cognito_user_pool.main.id} --username <email> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true Name=custom:companyId,Value=<company-slug> Name=custom:role,Value=admin"
}

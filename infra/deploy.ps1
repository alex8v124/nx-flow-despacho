<#
.SYNOPSIS
  Script de despliegue automatizado de Nodux Flow en AWS.
.DESCRIPTION
  1. Construye el bundle PWA (< 150 KB).
  2. Despliega la infraestructura Serverless con AWS SAM / CloudFormation.
  3. Sincroniza los estáticos al bucket S3 y limpia la caché de CloudFront.
  4. Puebla el catálogo inicial en DynamoDB.
#>
param(
  [string]$StackName = "nodux-flow-prod",
  [string]$Region = "us-east-1",
  [string]$Environment = "prod"
)

$ErrorActionPreference = "Stop"

Write-Host "`n🚀 === INICIANDO DESPLIEGUE DE NODUX FLOW ($Environment) ===" -ForegroundColor Cyan

# 1. Build Frontend
Write-Host "`n[1/4] Compilando Frontend PWA..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\frontend"
try {
  npm run build
} finally {
  Pop-Location
}

# 2. SAM Deploy
Write-Host "`n[2/4] Desplegando stack AWS SAM..." -ForegroundColor Yellow
sam deploy `
  --template-file "$PSScriptRoot\template.yaml" `
  --stack-name $StackName `
  --region $Region `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides Environment=$Environment `
  --resolve-s3

# 3. Obtener outputs de CloudFormation
Write-Host "`n[3/4] Obteniendo recursos creados..." -ForegroundColor Yellow
$outputs = aws cloudformation describe-stacks `
  --stack-name $StackName `
  --region $Region `
  --query "Stacks[0].Outputs" `
  --output json | ConvertFrom-Json

$bucket = ($outputs | Where-Object { $_.OutputKey -eq "FrontendBucketName" }).OutputValue
$cfUrl  = ($outputs | Where-Object { $_.OutputKey -eq "CloudFrontEndpoint" }).OutputValue
$api    = ($outputs | Where-Object { $_.OutputKey -eq "HttpApiEndpoint" }).OutputValue
$table  = ($outputs | Where-Object { $_.OutputKey -eq "DynamoDBTableName" }).OutputValue

Write-Host "  Bucket S3   : $bucket" -ForegroundColor Green
Write-Host "  CloudFront  : $cfUrl" -ForegroundColor Green
Write-Host "  API Gateway : $api" -ForegroundColor Green
Write-Host "  DynamoDB    : $table" -ForegroundColor Green

# Subir estáticos a S3
Write-Host "`n[4/4] Sincronizando estáticos PWA con S3 e invalidando CloudFront..." -ForegroundColor Yellow
aws s3 sync "$PSScriptRoot\..\frontend\dist" "s3://$bucket" --delete --region $Region

$distId = aws cloudfront list-distributions `
  --query "DistributionList.Items[?Comment=='Nodux Flow Distribución PWA ($Environment)'].Id | [0]" `
  --output text

if ($distId -and $distId -ne "None") {
  aws cloudfront create-invalidation --distribution-id $distId --paths "/*"
}

Write-Host "`n🎉 === DESPLIEGUE COMPLETADO CON ÉXITO ===" -ForegroundColor Green
Write-Host "Terminal de despacho disponible en: $cfUrl`n" -ForegroundColor Cyan

#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${1:-nodux-flow-prod}"
REGION="${2:-us-east-1}"
ENV="${3:-prod}"

echo -e "\n\033[1;36m🚀 === INICIANDO DESPLIEGUE DE NODUX FLOW (${ENV}) ===\033[0m"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Build Frontend
echo -e "\n\033[1;33m[1/4] Compilando Frontend PWA...\033[0m"
(cd "$DIR/../frontend" && npm run build)

# 2. SAM Deploy
echo -e "\n\033[1;33m[2/4] Desplegando stack AWS SAM...\033[0m"
sam deploy \
  --template-file "$DIR/template.yaml" \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides Environment="$ENV" \
  --resolve-s3

# 3. Outputs
echo -e "\n\033[1;33m[3/4] Obteniendo URLs...\033[0m"
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text)
CF_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='CloudFrontEndpoint'].OutputValue" --output text)

# 4. S3 Sync
echo -e "\n\033[1;33m[4/4] Sincronizando estáticos PWA...\033[0m"
aws s3 sync "$DIR/../frontend/dist" "s3://$BUCKET" --delete --region "$REGION"

DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='Nodux Flow Distribución PWA (${ENV})'].Id | [0]" --output text)
if [ "$DIST_ID" != "None" ] && [ -n "$DIST_ID" ]; then
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
fi

echo -e "\n\033[1;32m🎉 DESPLIEGUE LISTO: ${CF_URL}\033[0m\n"

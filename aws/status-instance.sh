#!/usr/bin/env bash
# Quick state check: instance state, type, public IP, backend health.
set -euo pipefail

INSTANCE_ID="${CCM_INSTANCE_ID:-i-03460ae59c73a5a38}"
REGION="${CCM_REGION:-us-east-1}"
HEALTH_URL="${CCM_HEALTH_URL:-https://api.chopchopmol.com/health}"

aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --query 'Reservations[0].Instances[0].[InstanceId,InstanceType,State.Name,PublicIpAddress,LaunchTime]' \
  --output table

printf "Backend health: "
if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "✓ UP ($HEALTH_URL)"
else
  echo "✗ DOWN ($HEALTH_URL)"
fi

#!/usr/bin/env bash
# Start the ChopChopMol EC2 GPU instance and wait for /health to respond.
set -euo pipefail

INSTANCE_ID="${CCM_INSTANCE_ID:-i-03460ae59c73a5a38}"
REGION="${CCM_REGION:-us-east-1}"
HEALTH_URL="${CCM_HEALTH_URL:-https://api.chopchopmol.com/health}"

echo "Starting $INSTANCE_ID in $REGION..."
aws ec2 start-instances --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --query 'StartingInstances[0].[InstanceId,CurrentState.Name,PreviousState.Name]' \
  --output table

echo "Waiting for instance to enter 'running' state..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

echo "Waiting for backend /health (Docker container auto-starts)..."
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✓ Backend healthy at $HEALTH_URL"
    exit 0
  fi
  sleep 5
done

echo "⚠ Instance started but /health did not respond after 5 min."
echo "  SSH in: ssh ubuntu@api.chopchopmol.com"
echo "  Then:   docker compose -f ~/chopchopmol-ai-backend/aws/docker-compose.yml logs -f"
exit 1

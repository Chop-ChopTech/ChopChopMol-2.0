#!/usr/bin/env bash
# Resize the ChopChopMol EC2 GPU instance to a different type.
# Usage: ./resize-instance.sh <new-instance-type>
# Example: ./resize-instance.sh g6.2xlarge
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <instance-type>"
  echo "Examples: g4dn.2xlarge | g6.xlarge | g6.2xlarge | g5.xlarge | g5.2xlarge"
  exit 1
fi

NEW_TYPE="$1"
INSTANCE_ID="${CCM_INSTANCE_ID:-i-03460ae59c73a5a38}"
REGION="${CCM_REGION:-us-east-1}"
HEALTH_URL="${CCM_HEALTH_URL:-https://api.chopchopmol.com/health}"

echo "→ Resizing $INSTANCE_ID to $NEW_TYPE in $REGION"
echo "→ Instance will stop for ~3 min. Container auto-restarts via docker compose."
read -r -p "Continue? [y/N] " ans
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "Aborted."; exit 1; }

echo "[1/4] Stopping instance..."
aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --region "$REGION" >/dev/null
aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "      stopped."

echo "[2/4] Changing instance type to $NEW_TYPE..."
aws ec2 modify-instance-attribute --instance-id "$INSTANCE_ID" \
  --instance-type "$NEW_TYPE" --region "$REGION"
echo "      done."

echo "[3/4] Starting instance..."
aws ec2 start-instances --instance-ids "$INSTANCE_ID" --region "$REGION" >/dev/null
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "      running."

echo "[4/4] Waiting for /health..."
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✓ Backend healthy on $NEW_TYPE."
    aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --region "$REGION" \
      --query 'Reservations[0].Instances[0].[InstanceId,InstanceType,State.Name,PublicIpAddress]' \
      --output table
    echo ""
    echo "If you switched GPU family (T4 → L4/A10G), verify nvidia-smi:"
    echo "  ssh ubuntu@api.chopchopmol.com 'nvidia-smi'"
    echo "If it fails, update the driver:"
    echo "  ssh ubuntu@api.chopchopmol.com 'sudo apt-get update && sudo apt-get install -y nvidia-driver-550 && sudo reboot'"
    exit 0
  fi
  sleep 5
done

echo "⚠ /health did not respond after 5 min. SSH in to diagnose:"
echo "  ssh ubuntu@api.chopchopmol.com"
echo "  nvidia-smi"
echo "  docker compose -f ~/chopchopmol-ai-backend/aws/docker-compose.yml logs -f"
exit 1

#!/usr/bin/env bash
# Stop the ChopChopMol EC2 GPU instance. Disk + Elastic IP persist.
set -euo pipefail

INSTANCE_ID="${CCM_INSTANCE_ID:-i-03460ae59c73a5a38}"
REGION="${CCM_REGION:-us-east-1}"

echo "Stopping $INSTANCE_ID in $REGION..."
aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --query 'StoppingInstances[0].[InstanceId,CurrentState.Name,PreviousState.Name]' \
  --output table

echo "Waiting for instance to fully stop..."
aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "✓ Stopped. Run start-instance.sh when you need it again."

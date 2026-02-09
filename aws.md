# Deploying ChopChopMol Backend to AWS

> **Last updated:** February 7, 2026
> **Backend stack:** Python 3.11 / Flask / Gunicorn / PyTorch / MACE-torch / ASE / PySCF

---

## Table of Contents

1. [AWS Account Sign-Up](#1-aws-account-sign-up)
2. [Install & Configure AWS CLI](#2-install--configure-aws-cli)
3. [Prepare Your Backend for AWS (Dockerfile)](#3-prepare-your-backend-for-aws-dockerfile)
4. [Deployment Options Overview](#4-deployment-options-overview)
5. [Option A: EC2 Instance (Recommended)](#5-option-a-ec2-instance-recommended)
6. [Option B: Elastic Beanstalk with Docker](#6-option-b-elastic-beanstalk-with-docker)
7. [Option C: AWS App Runner](#7-option-c-aws-app-runner)
8. [Option D: Amazon Lightsail Containers](#8-option-d-amazon-lightsail-containers)
9. [Environment Variables & Secrets](#9-environment-variables--secrets)
10. [HTTPS & Custom Domain](#10-https--custom-domain)
11. [Pricing Comparison](#11-pricing-comparison)
12. [Frontend CORS Update](#12-frontend-cors-update)

---

## 1. AWS Account Sign-Up

### Step-by-Step

1. **Go to:** [https://aws.amazon.com/free/](https://aws.amazon.com/free/)

2. **Click** the orange **"Create a Free Account"** button (top right corner).

3. **Enter your email address** in the "Root user email address" field. Choose an **AWS account name** (e.g., `chopchopmol-prod`). Click **"Verify email address"**.

4. **Check your email** for a verification code from AWS. Enter the code on the verification page.

5. **Create a root password.** Requirements:
   - 8-128 characters
   - Must include at least 3 of: uppercase, lowercase, numbers, symbols (`!@#$%^&*`)

6. **Choose account type:**
   - Select **"Personal"** (for individual projects) or **"Business"** (for company use).
   - Fill in your name, phone number, and address.

7. **Enter payment information:**
   - A valid credit or debit card is required.
   - AWS may place a **$1 temporary hold** to verify the card (refunded).

8. **Verify your identity:**
   - Choose **Text message (SMS)** or **Voice call**.
   - Enter the CAPTCHA, then enter the PIN you receive.

9. **Select a support plan:**
   - Choose **"Basic support - Free"** (sufficient for most projects).

10. **Click "Complete Sign Up."** You'll receive a confirmation email. Account activation takes a few minutes.

### Free Tier (as of 2026)

AWS restructured its Free Tier in July 2025. New accounts now get:

- **Free Plan:** 6 months at no cost with access to 30+ services
- **$200 in credits:** $100 at sign-up + $100 earned by exploring services (EC2, Budgets, etc.)
- **Always Free tier:** Some services have perpetual free quotas (e.g., Lambda 1M requests/month)
- Credits expire after 12 months from account creation

> **Important:** Accounts created before July 15, 2025 are on the "Legacy Free Tier" with different terms.
>
> Official details: [https://aws.amazon.com/free/](https://aws.amazon.com/free/)

### Create an IAM User (Do This Immediately)

Never use the root account for daily work.

1. Go to: [https://console.aws.amazon.com/iam/](https://console.aws.amazon.com/iam/)
2. Click **"Users"** in the left sidebar, then **"Create user"**.
3. Enter a username (e.g., `chopchopmol-admin`).
4. Check **"Provide user access to the AWS Management Console"**.
5. Select **"I want to create an IAM user"** and set a console password.
6. Click **"Next"**, then **"Attach policies directly"**.
7. Search for and check **`AdministratorAccess`** (for full access during setup).
8. Click **"Next"**, then **"Create user"**.
9. **Save the sign-in URL** shown (e.g., `https://123456789012.signin.aws.amazon.com/console`).

### Create Access Keys (for CLI)

1. In IAM, click on your new user.
2. Click the **"Security credentials"** tab.
3. Scroll to **"Access keys"** and click **"Create access key"**.
4. Select **"Command Line Interface (CLI)"**.
5. Check the acknowledgment box, click **"Next"**, then **"Create access key"**.
6. **Download the `.csv` file** or copy both the **Access Key ID** and **Secret Access Key**. You will not see the secret again.

---

## 2. Install & Configure AWS CLI

### Install AWS CLI v2

**macOS (your system):**

```bash
# Download the installer
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"

# Install it
sudo installer -pkg AWSCLIV2.pkg -target /

# Verify
aws --version
# Should show: aws-cli/2.x.x ...
```

**Alternative (Homebrew):**

```bash
brew install awscli
```

**Linux:**

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

Official install guide: [https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

### Configure AWS CLI

```bash
aws configure
```

You'll be prompted for:
```
AWS Access Key ID [None]: <paste your access key>
AWS Secret Access Key [None]: <paste your secret key>
Default region name [None]: us-east-1
Default output format [None]: json
```

Verify it works:
```bash
aws sts get-caller-identity
```

Should return your account ID and user ARN.

---

## 3. Prepare Your Backend for AWS (Dockerfile)

Your backend uses PyTorch, MACE-torch, and other heavy ML libraries. A Docker container is the best way to ensure consistent deployments regardless of which AWS service you choose.

### Create `Dockerfile`

Create this file in your `chopchopmol-ai-backend/` root:

```dockerfile
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies needed by scientific Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for Docker layer caching
COPY requirements.txt .

# Install Python dependencies
# Use --no-cache-dir to keep image smaller
# PyTorch CPU-only to reduce image size (MACE works fine on CPU)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the port Gunicorn will listen on
EXPOSE 10000

# Run with Gunicorn
CMD ["gunicorn", "app:app", "--workers", "1", "--threads", "4", "--timeout", "120", "--preload", "--bind", "0.0.0.0:10000"]
```

### Create `.dockerignore`

Create this file in `chopchopmol-ai-backend/`:

```
__pycache__
*.pyc
.git
.env
venv/
.venv/
*.egg-info
.pytest_cache
```

### Build & Test Locally

```bash
cd chopchopmol-ai-backend

# Build the image
docker build -t chopchopmol-backend .

# Run locally to test
docker run -p 10000:10000 \
  -e ANTHROPIC_API_KEY="your-key-here" \
  -e OPENAI_API_KEY="your-key-here" \
  chopchopmol-backend
```

Visit `http://localhost:10000` to verify. The image will be ~4-6 GB due to PyTorch + scientific libs.

---

## 4. Deployment Options Overview

| Feature | EC2 | Elastic Beanstalk | App Runner | Lightsail |
|---|---|---|---|---|
| **Difficulty** | Medium | Medium | Easy | Easy |
| **Auto-scaling** | Manual/ASG | Built-in | Built-in | Manual |
| **Docker support** | Yes | Yes | Yes | Yes |
| **GPU support** | Yes | Yes | No | No |
| **Custom instance type** | Yes | Yes | No (max 4 vCPU) | No (max 4 vCPU) |
| **SSH access** | Yes | Yes | No | No |
| **Min. monthly cost** | ~$30 | ~$30 | ~$7-25 | $7-40 |
| **Best for** | Full control, GPU | Managed + flexible | Simple APIs | Simple, fixed cost |
| **Free tier** | 750 hrs/mo (12 mo) | Same as EC2 | No | 3 months (Micro) |

### Recommendation for ChopChopMol

**EC2** is the best fit because:
- PyTorch + MACE need at minimum 4 GB RAM (t3.medium or larger)
- You may want GPU instances later for faster ML calculations
- Full SSH access for debugging
- Most cost-effective for always-on services

**App Runner** is the simplest option if you want zero-ops and your workloads fit within 4 vCPU / 12 GB RAM.

---

## 5. Option A: EC2 Instance (Recommended)

### Step 1: Launch an EC2 Instance

1. **Go to:** [https://console.aws.amazon.com/ec2/](https://console.aws.amazon.com/ec2/)

2. Make sure your region is **US East (N. Virginia)** in the top-right dropdown. This is `us-east-1` — cheapest region.

3. Click the orange **"Launch instance"** button.

4. **Name:** Enter `chopchopmol-backend`

5. **Application and OS Images (AMI):**
   - Click **"Browse more AMIs"**
   - Search for **"Amazon Linux 2023"**
   - Select **"Amazon Linux 2023 AMI"** (Free tier eligible, 64-bit x86)

6. **Instance type:**
   - `t3.micro` — Free tier (1 vCPU, 1 GB RAM) — **too small for PyTorch**
   - `t3.medium` — **$30.37/month** (2 vCPU, 4 GB RAM) — **minimum recommended**
   - `t3.large` — **$60.74/month** (2 vCPU, 8 GB RAM) — **comfortable for MACE**
   - Select **`t3.large`** for production use.

7. **Key pair (login):**
   - Click **"Create new key pair"**
   - Name: `chopchopmol-key`
   - Key pair type: **RSA**
   - Private key file format: **.pem** (for Mac/Linux)
   - Click **"Create key pair"** — the `.pem` file downloads automatically
   - **Save this file securely!** Move it to `~/.ssh/`:
     ```bash
     mv ~/Downloads/chopchopmol-key.pem ~/.ssh/
     chmod 400 ~/.ssh/chopchopmol-key.pem
     ```

8. **Network settings:**
   - Click **"Edit"**
   - **Auto-assign public IP:** Enable
   - **Security group:** Create a new security group
   - Add these rules:
     | Type | Protocol | Port Range | Source | Description |
     |---|---|---|---|---|
     | SSH | TCP | 22 | My IP | SSH access |
     | Custom TCP | TCP | 10000 | 0.0.0.0/0 | Backend API |
     | HTTPS | TCP | 443 | 0.0.0.0/0 | HTTPS (for later) |

9. **Configure storage:**
   - Change root volume to **30 GB** gp3 (default 8 GB is too small for Docker + PyTorch)

10. Click **"Launch instance"**.

11. Wait ~1 minute, then click on the instance ID to see its details. Copy the **Public IPv4 address**.

### Step 2: Connect via SSH

```bash
ssh -i ~/.ssh/chopchopmol-key.pem ec2-user@<YOUR-PUBLIC-IP>
```

If you get a "permission denied" error, make sure you ran `chmod 400` on the key file.

### Step 3: Install Docker on EC2

```bash
# Update system
sudo dnf update -y

# Install Docker
sudo dnf install -y docker

# Start Docker and enable on boot
sudo systemctl start docker
sudo systemctl enable docker

# Add ec2-user to docker group (so you don't need sudo)
sudo usermod -aG docker ec2-user

# Log out and back in for group change to take effect
exit
```

SSH back in:
```bash
ssh -i ~/.ssh/chopchopmol-key.pem ec2-user@<YOUR-PUBLIC-IP>

# Verify Docker works
docker --version
docker ps
```

### Step 4: Install Docker Compose (Optional but Helpful)

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

### Step 5: Deploy Your Backend

**Option 5A: Build on the EC2 Instance**

```bash
# Install git
sudo dnf install -y git

# Clone your repo
git clone https://github.com/YOUR-USERNAME/chopchopmol-ai-backend.git
cd chopchopmol-ai-backend

# Build the Docker image (this will take 10-20 minutes first time)
docker build -t chopchopmol-backend .

# Run the container
docker run -d \
  --name chopchopmol \
  --restart unless-stopped \
  -p 10000:10000 \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e OPENAI_API_KEY="sk-..." \
  -e TAVILY_API_KEY="tvly-..." \
  chopchopmol-backend
```

**Option 5B: Push Image from Local Machine via ECR**

This is faster if your EC2 instance is small. Build locally, push to AWS ECR, pull on EC2.

```bash
# On your LOCAL machine:

# Create ECR repository
aws ecr create-repository --repository-name chopchopmol-backend --region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com

# Tag your image
docker tag chopchopmol-backend:latest <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest

# Push to ECR
docker push <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest
```

Replace `<ACCOUNT-ID>` with your 12-digit AWS account ID (find it at [https://console.aws.amazon.com/billing/](https://console.aws.amazon.com/billing/) or run `aws sts get-caller-identity`).

```bash
# On the EC2 instance:

# Install AWS CLI
sudo dnf install -y aws-cli

# Configure AWS CLI on EC2 (or better, use an IAM instance role)
aws configure

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com

# Pull and run
docker pull <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest

docker run -d \
  --name chopchopmol \
  --restart unless-stopped \
  -p 10000:10000 \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e OPENAI_API_KEY="sk-..." \
  -e TAVILY_API_KEY="tvly-..." \
  <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest
```

### Step 6: Verify It's Running

```bash
# Check container status
docker ps

# Check logs
docker logs chopchopmol

# Test the endpoint
curl http://localhost:10000
```

From your local machine:
```bash
curl http://<YOUR-EC2-PUBLIC-IP>:10000
```

### Step 7: Set Up Auto-Restart on Reboot

The `--restart unless-stopped` flag in the `docker run` command handles this. Docker will restart your container automatically after EC2 reboots.

Make sure Docker starts on boot:
```bash
sudo systemctl enable docker
```

### Step 8: Assign an Elastic IP (Static IP)

EC2 public IPs change on reboot. Fix this:

1. Go to: [https://console.aws.amazon.com/ec2/#Addresses](https://console.aws.amazon.com/ec2/#Addresses)
2. Click **"Allocate Elastic IP address"**
3. Click **"Allocate"**
4. Select the new Elastic IP, click **"Actions" > "Associate Elastic IP address"**
5. Select your `chopchopmol-backend` instance
6. Click **"Associate"**

Now your instance has a permanent IP. **Elastic IPs are free while associated with a running instance.** You are charged ~$3.65/month if the IP is allocated but NOT associated.

### Updating Your Deployment

```bash
# SSH into EC2
ssh -i ~/.ssh/chopchopmol-key.pem ec2-user@<YOUR-ELASTIC-IP>

cd chopchopmol-ai-backend

# Pull latest code
git pull

# Rebuild
docker build -t chopchopmol-backend .

# Stop old container, start new one
docker stop chopchopmol && docker rm chopchopmol
docker run -d \
  --name chopchopmol \
  --restart unless-stopped \
  -p 10000:10000 \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e OPENAI_API_KEY="sk-..." \
  -e TAVILY_API_KEY="tvly-..." \
  chopchopmol-backend
```

---

## 6. Option B: Elastic Beanstalk with Docker

Elastic Beanstalk manages EC2 instances, load balancers, and auto-scaling for you.

### Step 1: Install the EB CLI

```bash
pip install awsebcli
eb --version
```

### Step 2: Initialize EB in Your Project

```bash
cd chopchopmol-ai-backend

eb init
```

You'll be prompted:
1. **Region:** Select `us-east-1` (option 1)
2. **Application name:** `chopchopmol-backend`
3. **Platform:** Select **Docker**
4. **Platform branch:** Select **Docker running on 64bit Amazon Linux 2023**
5. **CodeCommit:** No
6. **SSH:** Yes, select your existing key pair or create a new one

### Step 3: Create an Environment

```bash
eb create chopchopmol-prod \
  --instance-type t3.large \
  --single \
  --timeout 30
```

- `--single` = single instance (no load balancer, cheaper)
- `--instance-type t3.large` = 2 vCPU, 8 GB RAM
- `--timeout 30` = wait up to 30 min for deployment (PyTorch install is slow)

### Step 4: Set Environment Variables

```bash
eb setenv \
  ANTHROPIC_API_KEY="sk-ant-..." \
  OPENAI_API_KEY="sk-..." \
  TAVILY_API_KEY="tvly-..."
```

### Step 5: Configure Instance Storage

Create `.ebextensions/01-storage.config`:

```yaml
option_settings:
  aws:autoscaling:launchconfiguration:
    RootVolumeSize: 30
    RootVolumeType: gp3
```

### Step 6: Deploy

```bash
eb deploy
```

### Step 7: Check Status

```bash
eb status
eb logs
eb open    # Opens your app URL in browser
```

### Updating

```bash
cd chopchopmol-ai-backend
# Make your changes, then:
eb deploy
```

EB will build a new Docker image and deploy it with zero-downtime if using a load balancer.

### EB Console

View your environment: [https://console.aws.amazon.com/elasticbeanstalk/](https://console.aws.amazon.com/elasticbeanstalk/)

---

## 7. Option C: AWS App Runner

App Runner is the simplest option. No servers to manage. You push a Docker image and it runs.

### Limitations

- **Max 4 vCPU / 12 GB RAM** — sufficient for MACE on CPU
- **No GPU support**
- **No SSH access** — debugging via CloudWatch logs only
- **Max 120-second request timeout** (matches your Gunicorn config)

### Step 1: Push Image to ECR

(Same as Option A, Step 5B above)

```bash
# Create ECR repository
aws ecr create-repository --repository-name chopchopmol-backend --region us-east-1

# Build, tag, push
docker build -t chopchopmol-backend .

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com

docker tag chopchopmol-backend:latest <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest

docker push <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest
```

### Step 2: Create App Runner Service

1. **Go to:** [https://console.aws.amazon.com/apprunner/](https://console.aws.amazon.com/apprunner/)

2. Click **"Create service"**

3. **Source and deployment:**
   - Repository type: **Container registry**
   - Provider: **Amazon ECR**
   - Click **"Browse"** and select `chopchopmol-backend:latest`
   - Deployment trigger: **Manual** (or Automatic if you want auto-deploy on push)
   - **ECR access role:** Click **"Create new service role"** — App Runner needs this to pull from ECR

4. **Configure service:**
   - Service name: `chopchopmol-backend`
   - CPU: **2 vCPU**
   - Memory: **4 GB** (or 8 GB for comfortable MACE runs)
   - Port: **10000**
   - Add environment variables:
     - `ANTHROPIC_API_KEY` = `sk-ant-...`
     - `OPENAI_API_KEY` = `sk-...`
     - `TAVILY_API_KEY` = `tvly-...`
   - Health check path: `/` (or create a `/health` endpoint)

5. Click **"Next"**, review, then **"Create & deploy"**

6. Wait 5-10 minutes. You'll get a URL like: `https://xxxxxxxx.us-east-1.awsapprunner.com`

### Pricing Estimate

With 2 vCPU / 4 GB memory:
- **Active:** $0.064/vCPU-hr + $0.007/GB-hr = ~$0.156/hr = **~$112/month** if always active
- **Idle (paused):** $0.007/GB-hr = ~$0.028/hr = **~$20/month**
- App Runner scales to zero active instances when no traffic, so cost depends on usage

### Updating

```bash
# Rebuild and push new image
docker build -t chopchopmol-backend .
docker tag chopchopmol-backend:latest <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest
docker push <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/chopchopmol-backend:latest

# Trigger deployment (if manual)
aws apprunner start-deployment --service-arn <YOUR-SERVICE-ARN>
```

Or in the console: go to your service, click **"Deploy"**.

---

## 8. Option D: Amazon Lightsail Containers

Lightsail is AWS's simplified offering with fixed monthly pricing. No surprise bills.

### Pricing

| Power | vCPU | RAM | Monthly Price |
|---|---|---|---|
| Nano | 0.25 | 0.5 GB | $7 |
| Micro | 0.5 | 1 GB | $10 (3 months free) |
| Small | 1 | 2 GB | $25 |
| Medium | 2 | 4 GB | $50 |
| Large | 4 | 8 GB | $100 |
| X-Large | 4 | 16 GB | $160 |

For ChopChopMol, you need **Medium ($50/mo)** or **Large ($100/mo)**.

Each tier includes 500 GB data transfer/month.

### Step 1: Install Lightsail CLI Plugin

```bash
# Already included in AWS CLI v2
aws lightsail help
```

### Step 2: Create Container Service

1. **Go to:** [https://lightsail.aws.amazon.com/ls/webapp/home/containers](https://lightsail.aws.amazon.com/ls/webapp/home/containers)

2. Click **"Create container service"**

3. **Region:** Virginia (us-east-1)

4. **Capacity:**
   - Power: **Medium** ($50/mo) or **Large** ($100/mo)
   - Scale: **1** (number of nodes)

5. **Deployment:** Skip for now (set up after pushing image)

6. **Service name:** `chopchopmol-backend`

7. Click **"Create container service"**

### Step 3: Push Your Docker Image

```bash
# Build locally
cd chopchopmol-ai-backend
docker build -t chopchopmol-backend .

# Push to Lightsail
aws lightsail push-container-image \
  --region us-east-1 \
  --service-name chopchopmol-backend \
  --label latest \
  --image chopchopmol-backend:latest
```

Note the image name returned (e.g., `:chopchopmol-backend.latest.1`).

### Step 4: Create Deployment

1. Back in the Lightsail console, click on your container service.
2. Click the **"Deployments"** tab, then **"Create your first deployment"**.
3. **Container name:** `app`
4. **Image:** Select the image you just pushed
5. **Environment variables:**
   - `ANTHROPIC_API_KEY` = `sk-ant-...`
   - `OPENAI_API_KEY` = `sk-...`
   - `TAVILY_API_KEY` = `tvly-...`
6. **Open ports:** Add port **10000** with protocol **HTTP**
7. **Public endpoint:** Select container `app`, port `10000`
8. Click **"Save and deploy"**

Your service URL will look like: `https://chopchopmol-backend.xxxxxxxx.us-east-1.cs.amazonlightsail.com`

### Updating

```bash
# Rebuild and push
docker build -t chopchopmol-backend .
aws lightsail push-container-image \
  --region us-east-1 \
  --service-name chopchopmol-backend \
  --label latest \
  --image chopchopmol-backend:latest

# Create new deployment (via console or CLI)
aws lightsail create-container-service-deployment \
  --service-name chopchopmol-backend \
  --containers '{"app":{"image":":chopchopmol-backend.latest.2","ports":{"10000":"HTTP"},"environment":{"ANTHROPIC_API_KEY":"sk-ant-...","OPENAI_API_KEY":"sk-..."}}}' \
  --public-endpoint '{"containerName":"app","containerPort":10000}'
```

---

## 9. Environment Variables & Secrets

Your backend needs these environment variables:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI chat |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `TAVILY_API_KEY` | Optional | Web search feature |

### Using AWS Secrets Manager (Recommended for Production)

Instead of passing API keys as plain-text environment variables, store them in Secrets Manager:

1. **Go to:** [https://console.aws.amazon.com/secretsmanager/](https://console.aws.amazon.com/secretsmanager/)
2. Click **"Store a new secret"**
3. Secret type: **"Other type of secret"**
4. Add key/value pairs:
   - `ANTHROPIC_API_KEY` → `sk-ant-...`
   - `OPENAI_API_KEY` → `sk-...`
   - `TAVILY_API_KEY` → `tvly-...`
5. Secret name: `chopchopmol/api-keys`
6. Click through and **"Store"**

**Cost:** $0.40/secret/month + $0.05 per 10,000 API calls

For **EC2**, retrieve secrets in your startup script:
```bash
# In your EC2 user data or startup script
SECRET=$(aws secretsmanager get-secret-value --secret-id chopchopmol/api-keys --query SecretString --output text --region us-east-1)

export ANTHROPIC_API_KEY=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['ANTHROPIC_API_KEY'])")
export OPENAI_API_KEY=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['OPENAI_API_KEY'])")
export TAVILY_API_KEY=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['TAVILY_API_KEY'])")
```

For **App Runner**, you can reference Secrets Manager ARNs directly in the service configuration.

For **Elastic Beanstalk** (platform versions March 2025+), you can configure secrets as env vars that EB fetches from Secrets Manager at boot.

---

## 10. HTTPS & Custom Domain

### EC2: Use a Reverse Proxy + Let's Encrypt

```bash
# On EC2, install Nginx and Certbot
sudo dnf install -y nginx
sudo dnf install -y certbot python3-certbot-nginx

# Configure Nginx as reverse proxy
sudo tee /etc/nginx/conf.d/chopchopmol.conf << 'EOF'
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:10000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

sudo systemctl start nginx
sudo systemctl enable nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d api.yourdomain.com
```

### App Runner / Elastic Beanstalk / Lightsail

These services provide HTTPS automatically. You get an `*.awsapprunner.com` / `*.elasticbeanstalk.com` / `*.amazonlightsail.com` URL with a valid SSL certificate out of the box.

To use a **custom domain:**
1. Go to your service in the AWS console
2. Look for **"Custom domains"** settings
3. Add your domain (e.g., `api.chopchopmol.com`)
4. Update your DNS to point to the AWS-provided CNAME/alias

---

## 11. Pricing Comparison

Monthly cost estimates for running ChopChopMol backend (2 vCPU, 4-8 GB RAM, always on):

| Service | Instance/Config | Monthly Cost | Notes |
|---|---|---|---|
| **EC2 t3.medium** | 2 vCPU, 4 GB | **~$30** | + storage (~$2.40 for 30GB) |
| **EC2 t3.large** | 2 vCPU, 8 GB | **~$61** | + storage |
| **Elastic Beanstalk** | t3.large, single | **~$61** | Same as EC2 (EB itself is free) |
| **App Runner** | 2 vCPU, 4 GB | **~$20-112** | Scales to zero; active cost high |
| **Lightsail Medium** | 2 vCPU, 4 GB | **$50** | Fixed, predictable |
| **Lightsail Large** | 4 vCPU, 8 GB | **$100** | Fixed, predictable |
| **Render (current)** | Free tier / Starter | **$0-7** | Cold starts on free tier |

Additional costs to consider:
- **Elastic IP** (EC2): Free while attached to running instance; ~$3.65/mo if unused
- **ECR storage:** $0.10/GB/month (your image ~5 GB = ~$0.50/mo)
- **Data transfer:** First 100 GB/month free, then $0.09/GB
- **Secrets Manager:** $0.40/secret/month
- **Domain name:** $10-15/year via Route 53

**Cheapest option:** EC2 t3.medium at ~$32/month total
**Simplest option:** Lightsail Medium at $50/month fixed
**Most flexible:** EC2 (can upgrade to GPU instances later)

---

## 12. Frontend CORS Update

After deploying to AWS, update your frontend to detect the new backend URL.

In `demo/utils/apiUtils.js` (or wherever your backend URL is configured), add your AWS URL:

```javascript
function getBackendUrl() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:10000';
    }
    // Production - update this to your AWS URL
    return 'https://your-aws-url-here.amazonaws.com';
}
```

Also ensure CORS is configured in your Flask backend `app.py` to allow your frontend domain (already set to `*` which allows all origins).

---

## Quick Start Checklist

- [ ] Create AWS account at [https://aws.amazon.com/free/](https://aws.amazon.com/free/)
- [ ] Create IAM user at [https://console.aws.amazon.com/iam/](https://console.aws.amazon.com/iam/)
- [ ] Install AWS CLI: [https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [ ] Run `aws configure` with your access keys
- [ ] Create Dockerfile in `chopchopmol-ai-backend/`
- [ ] Build and test Docker image locally
- [ ] Choose deployment option (EC2 recommended)
- [ ] Deploy and verify backend is accessible
- [ ] Set environment variables (API keys)
- [ ] Set up HTTPS (Nginx + Certbot for EC2, or automatic for managed services)
- [ ] Update frontend backend URL
- [ ] Deploy frontend with `firebase deploy`

---

## Useful Links

- **AWS Console Home:** [https://console.aws.amazon.com/](https://console.aws.amazon.com/)
- **EC2 Dashboard:** [https://console.aws.amazon.com/ec2/](https://console.aws.amazon.com/ec2/)
- **ECR (Container Registry):** [https://console.aws.amazon.com/ecr/](https://console.aws.amazon.com/ecr/)
- **App Runner:** [https://console.aws.amazon.com/apprunner/](https://console.aws.amazon.com/apprunner/)
- **Elastic Beanstalk:** [https://console.aws.amazon.com/elasticbeanstalk/](https://console.aws.amazon.com/elasticbeanstalk/)
- **Lightsail:** [https://lightsail.aws.amazon.com/](https://lightsail.aws.amazon.com/)
- **Secrets Manager:** [https://console.aws.amazon.com/secretsmanager/](https://console.aws.amazon.com/secretsmanager/)
- **IAM:** [https://console.aws.amazon.com/iam/](https://console.aws.amazon.com/iam/)
- **Billing Dashboard:** [https://console.aws.amazon.com/billing/](https://console.aws.amazon.com/billing/)
- **AWS Pricing Calculator:** [https://calculator.aws/](https://calculator.aws/)
- **EC2 Instance Pricing:** [https://aws.amazon.com/ec2/pricing/on-demand/](https://aws.amazon.com/ec2/pricing/on-demand/)
- **EC2 Instance Comparison:** [https://instances.vantage.sh/](https://instances.vantage.sh/)
- **Flask on EB Official Guide:** [https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-python-flask.html](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-python-flask.html)
- **AWS CLI Install Guide:** [https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

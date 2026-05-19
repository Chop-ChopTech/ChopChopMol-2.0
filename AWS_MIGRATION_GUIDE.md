# ChopChopMol → AWS Migration Guide

This guide moves **everything** off Render.com, RunPod, and Firebase and onto AWS, so that the only outside services you depend on are:

- **Squarespace** — DNS only (you keep your `chopchopmol.com` domain there)
- **GitHub** — version control only
- **AWS** — backend compute, database, authentication, and frontend hosting

It is written to be followed literally. Every console step names the exact button, field, and value. Every command is copy‑pasteable. Where you must substitute your own value, it is written in `UPPERCASE_LIKE_THIS` and the guide tells you where that value came from.

> **Companion files:** alongside this guide I created an `aws/` folder in each repo with ready‑to‑use config files (Caddyfile, docker-compose, IAM policies, deploy scripts, DynamoDB table creator, a Cognito JWT verifier, a DynamoDB data layer, and a Firestore→DynamoDB migration script). The guide tells you when to use each one. See the **Companion files index** at the very bottom.

---

## Table of contents

- [0. Read this first — what you have, what you'll get, what it costs](#0-read-this-first)
- [1. Decisions you must make before starting](#1-decisions)
- [PART 1 — AWS account foundation](#part-1--aws-account-foundation)
  - [1.1 Sign in and secure the account](#11-sign-in-and-secure-the-account)
  - [1.2 Install the AWS CLI](#12-install-the-aws-cli)
  - [1.3 Create an IAM admin user + access keys](#13-create-an-iam-admin-user--access-keys)
  - [1.4 Pick your region](#14-pick-your-region)
  - [1.5 Request a GPU quota increase (do this NOW — it takes hours)](#15-request-a-gpu-quota-increase)
- [PART 2 — Backend on EC2 GPU (replaces Render + RunPod)](#part-2--backend-on-ec2-gpu)
  - [2.1 Create an SSH key pair](#21-create-an-ssh-key-pair)
  - [2.2 Create a security group (firewall)](#22-create-a-security-group)
  - [2.3 Launch the GPU instance](#23-launch-the-gpu-instance)
  - [2.4 Attach a static IP (Elastic IP)](#24-attach-a-static-ip)
  - [2.5 Point api.chopchopmol.com at the server (Squarespace DNS)](#25-point-api-at-the-server)
  - [2.6 Connect via SSH](#26-connect-via-ssh)
  - [2.7 Install NVIDIA drivers](#27-install-nvidia-drivers)
  - [2.8 Install Docker + NVIDIA Container Toolkit](#28-install-docker--nvidia-container-toolkit)
  - [2.9 Get the code and build the image](#29-get-the-code-and-build-the-image)
  - [2.10 Run the backend container](#210-run-the-backend-container)
  - [2.11 HTTPS with Caddy](#211-https-with-caddy)
  - [2.12 Point the frontend at the new backend](#212-point-the-frontend-at-the-new-backend)
  - [2.13 Auto-start on reboot](#213-auto-start-on-reboot)
- [PART 3 — Database on DynamoDB (replaces Firestore)](#part-3--database-on-dynamodb)
  - [3.1 What data Firestore is holding today](#31-what-data-firestore-holds)
  - [3.2 Create the DynamoDB tables](#32-create-the-dynamodb-tables)
  - [3.3 Give the EC2 instance permission to use DynamoDB](#33-give-ec2-permission)
  - [3.4 Add the data API to the backend](#34-add-the-data-api-to-the-backend)
  - [3.5 Export your data out of Firestore and import into DynamoDB](#35-export-and-import-data)
  - [3.6 Rewrite the frontend Firestore calls](#36-rewrite-frontend-firestore-calls)
- [PART 4 — Authentication on Cognito (replaces Firebase Auth)](#part-4--authentication-on-cognito)
  - [4.1 Create the Cognito user pool](#41-create-the-cognito-user-pool)
  - [4.2 Add Google sign-in](#42-add-google-sign-in)
  - [4.3 Create the app client and hosted login page](#43-create-the-app-client)
  - [4.4 Make the backend verify Cognito tokens](#44-backend-verify-cognito)
  - [4.5 Make the frontend log in with Cognito](#45-frontend-cognito-login)
  - [4.6 Migrate your existing users](#46-migrate-existing-users)
- [PART 5 — Frontend hosting on S3 + CloudFront (replaces Firebase Hosting)](#part-5--frontend-hosting)
  - [5.1 Create the S3 bucket](#51-create-the-s3-bucket)
  - [5.2 Request the HTTPS certificate (ACM)](#52-request-the-https-certificate)
  - [5.3 Create the CloudFront distribution](#53-create-the-cloudfront-distribution)
  - [5.4 SPA routing + security headers](#54-spa-routing--security-headers)
  - [5.5 Deploy the site](#55-deploy-the-site)
  - [5.6 Point chopchopmol.com at CloudFront (Squarespace DNS)](#56-point-the-domain-at-cloudfront)
- [PART 6 — Cutover, verification, and decommissioning](#part-6--cutover)
- [PART 7 — Operations (cost, updates, monitoring, troubleshooting)](#part-7--operations)
- [Appendix A — Every environment variable](#appendix-a--every-environment-variable)
- [Appendix B — Every hardcoded URL / credential to change](#appendix-b--every-hardcoded-url-to-change)
- [Appendix C — The `chopchopmol-2-0-3` mystery service](#appendix-c--the-secondary-service)
- [Companion files index](#companion-files-index)

---

<a name="0-read-this-first"></a>
## 0. Read this first — what you have, what you'll get, what it costs

### 0.1 What you run today

| Piece | Where it runs today | What it is |
|---|---|---|
| Frontend (static site) | **Firebase Hosting** — `chopchopmol-2.web.app` | The `demo/` folder: `index.html`, `main.js`, `aiagent.js`, etc. No build step. |
| Main AI backend (CPU) | **Render.com** — `chopchopmol-ai-backend.onrender.com` | The Flask app `app.py` from the `chopchopmol-ai-backend` repo. |
| Main AI backend (GPU) | **RunPod** — `l01l6g1um1puzn-10000.proxy.runpod.net` | The *same* `app.py`, in a Docker container, with a GPU for MACE / DFT. |
| Secondary backend | **Render.com** — `chopchopmol-2-0-3.onrender.com` | A separate older service with `/chat`, `/tosmiles`, `/analysis`. **Its source is not in any local repo** — see [Appendix C](#appendix-c--the-secondary-service). |
| Database | **Firebase Firestore** | Saved molecules, folders, conversation history, user accounts/access status, admins, access requests. |
| Authentication | **Firebase Auth** | Google sign-in + email/password. |
| Analytics / Ads | Firebase Analytics (Google Analytics `G-9T7NPR755W`) + Google AdSense (`ca-pub-7912318580869252`) | Optional add-ons, not infrastructure — see [§1](#1-decisions). |
| Payments | Stripe | **Stub only** — `demo/utils/stripe.js` is a no-op, all premium features are hardcoded on. Nothing to migrate; you'll just delete the stub. |
| DNS | **Squarespace** | `chopchopmol.com`. **Stays here.** |
| Version control | **GitHub** | **Stays here.** |

### 0.2 What you'll run after this guide

| Piece | New home on AWS | AWS service |
|---|---|---|
| Frontend (static site) | `https://www.chopchopmol.com` | **S3** (storage) + **CloudFront** (CDN/HTTPS) + **ACM** (certificate) |
| Main AI backend (CPU **and** GPU, merged into one box) | `https://api.chopchopmol.com` | **EC2** `g4dn.xlarge` GPU instance running your Docker container, fronted by Caddy for HTTPS |
| Database | (same backend talks to it) | **DynamoDB** (5 tables) |
| Authentication | `https://YOUR_POOL.auth.REGION.amazoncognito.com` | **Amazon Cognito** user pool (Google + email/password) |
| DNS | unchanged | **Squarespace** (you add 3 records) |
| Version control | unchanged | **GitHub** |

The two separate backend deployments (Render CPU + RunPod GPU) **merge into one** EC2 GPU instance. One box does both jobs.

### 0.3 Cost estimate (us-east-1, 2026 pricing — verify current rates)

| Resource | Always-on | With stop/start or spot |
|---|---|---|
| EC2 `g4dn.xlarge` (NVIDIA T4, 4 vCPU, 16 GB RAM) | ~$380/mo on-demand | Spot: ~$110–150/mo · Stop-when-idle: pay only for hours used (~$0.526/hr) |
| 150 GB gp3 EBS disk | ~$12/mo | same |
| Elastic IP (while attached to a running instance) | free | ~$3.65/mo while the instance is **stopped** |
| S3 (a few hundred MB of static files) | < $1/mo | same |
| CloudFront (small app traffic) | ~$1–5/mo | same |
| DynamoDB (on-demand, small app) | ~$0–2/mo (likely inside free tier) | same |
| Cognito | free for small user counts (check current MAU free tier) | same |
| ACM certificate | free | free |
| **Total** | **~$395–405/mo** | **~$120–170/mo** if you use spot, or less if you stop the instance when not in use |

The EC2 GPU instance dominates the bill. [Part 7](#part-7--operations) covers stop/start scripts and spot instances to cut this dramatically.

### 0.4 How long this takes & the order to do it in

This is a multi-session project — budget **2–4 focused sessions**. The six parts are ordered by **risk, lowest first**, and each part is independently verifiable. You can stop after any part and still have a working app.

| Part | What it does | Risk | Can you stop here? |
|---|---|---|---|
| 1 | AWS account + CLI + GPU quota | none | n/a (foundation) |
| 2 | Backend → EC2 GPU | **low** — frontend still on Firebase, just points at a new backend URL. Easy rollback (flip one URL). | ✅ Yes. If you only want off Render+RunPod, **stop here.** Firebase still hosts the site, DB, and auth. |
| 3 | Database → DynamoDB | **medium** — touches frontend + backend code, needs a data copy. | ✅ Yes (auth still on Firebase). |
| 4 | Auth → Cognito | **medium-high** — every user signs in through new code; existing users need migration. | ✅ Yes. |
| 5 | Frontend hosting → S3/CloudFront | **low** — static files, easy rollback. | ✅ Yes — this is the finish line. |
| 6 | Cutover + decommission Render/RunPod/Firebase | — | — |

> **Strong recommendation:** do Part 1 and Part 2 first and live on them for a few days. That gets you off Render and RunPod (your two compute bills) with almost no code risk. Then tackle Firebase removal (Parts 3–5) when you have a calm window.

---

<a name="1-decisions"></a>
## 1. Decisions you must make before starting

Answer these now; the guide assumes these answers.

**1. Region.** Use **`us-east-1`** (N. Virginia). It has the most GPU capacity, the lowest prices, and **ACM certificates for CloudFront must live in `us-east-1` anyway.** The whole guide uses `us-east-1`. If you pick another region, you must still create the ACM certificate (Part 5) in `us-east-1`.

**2. Domain layout.** Squarespace DNS cannot point a bare/apex domain (`chopchopmol.com` with nothing in front) at CloudFront, because CloudFront has no fixed IP and the DNS standard forbids a `CNAME` on the apex. So:

   - `www.chopchopmol.com` → the frontend (CloudFront). **This becomes your canonical site URL.**
   - `chopchopmol.com` (apex) → a Squarespace **domain forward** that redirects to `https://www.chopchopmol.com`.
   - `api.chopchopmol.com` → the backend (EC2). Subdomains *can* take an `A` record to a fixed IP, so this one is straightforward.

   (If you ever insist on the bare apex serving the app directly, that requires a DNS provider with `ALIAS`/`CNAME‑flattening` such as Route 53 or Cloudflare — but you said Squarespace, so `www` is canonical.)

**3. Analytics & Ads.** Firebase Analytics and Google AdSense are **not infrastructure** — they're Google tag scripts in `index.html`, with no Firebase project dependency beyond a measurement ID. They are *not* "services you rely on" in the operational sense (no server, no DB, nothing breaks without them). You have two clean options:
   - **Keep them** — leave the AdSense `<script>` and the GA `gtag` in place. They work fine on any host. AdSense is revenue; Analytics is free. This guide assumes you keep them and just notes where they are.
   - **Drop them** — delete the AdSense script tag and the `getAnalytics()` call. [Appendix B](#appendix-b--every-hardcoded-url-to-change) lists the exact lines.

   Either way they do **not** block the migration. Decide later.

**4. The mystery secondary backend** `chopchopmol-2-0-3.onrender.com`. Its source code is not in any of your local repos. Three frontend features call it: the old "Generate Molecule" text panel, SMILES→structure conversion, and image analysis. You must decide whether those features are still used. See [Appendix C](#appendix-c--the-secondary-service) for the three options. **This does not block Parts 1–5** — handle it during Part 6.

**5. Container image registry.** This guide **builds the Docker image directly on the EC2 instance** from a `git clone` of your GitHub repo. That means **no Docker Hub and no ECR** — fewer moving parts, and it fits your "GitHub + AWS only" rule perfectly. (If you later run more than one backend instance, Part 7 explains switching to Amazon ECR.)

---

<a name="part-1--aws-account-foundation"></a>
# PART 1 — AWS account foundation

<a name="11-sign-in-and-secure-the-account"></a>
## 1.1 Sign in and secure the account

You said you already have an AWS account, so you only need to confirm it's usable and safe.

1. Open a browser and go to **`https://console.aws.amazon.com`**.
2. Sign in. If you sign in as **Root user**, enter the account's email address and password.
3. Once in, look at the **top-right corner**. It shows your account name/number and, next to it, the **Region** (e.g. "N. Virginia"). Click the Region dropdown and choose **US East (N. Virginia) us-east-1**.
4. **Turn on MFA for the root user if it isn't already** (protects your whole account):
   - Click your account name (top right) → **Security credentials**.
   - Find the **Multi-factor authentication (MFA)** section → click **Assign MFA device**.
   - Device name: `root-mfa`. Choose **Authenticator app**. Click **Next**.
   - Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy). Enter two consecutive codes. Click **Add MFA**.
5. **Set a billing alarm so you're never surprised:**
   - In the search bar at the top, type **`Billing and Cost Management`** and click it.
   - Left sidebar → **Budgets** → **Create budget**.
   - Choose **Use a template** → **Monthly cost budget**.
   - Budget name: `chopchopmol-monthly`. Enter an amount, e.g. `450`. Enter your email for alerts. Click **Create budget**.

<a name="12-install-the-aws-cli"></a>
## 1.2 Install the AWS CLI

On your **Mac**, open **Terminal** and run:

```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
rm AWSCLIV2.pkg
aws --version
```

The last command should print something like `aws-cli/2.x.x Python/3.x.x Darwin/...`. If it does, the CLI is installed.

<a name="13-create-an-iam-admin-user--access-keys"></a>
## 1.3 Create an IAM admin user + access keys

Don't use the root user for daily work. Create a dedicated admin user.

### 1.3a Create the user

1. In the AWS Console search bar, type **`IAM`** and click **IAM**.
2. Left sidebar → **Users** → click the **Create user** button (top-right, orange).
3. **User name** field: type `chopchopmol-admin`.
4. There's a checkbox **Provide user access to the AWS Management Console** — check it if you want to log into the website as this user too. If you check it: select **I want to create an IAM user**, set a password, and **uncheck** "Users must create a new password at next sign-in". Click **Next**.
5. On **Set permissions**: select the radio button **Attach policies directly**.
6. In the policy search box, type `AdministratorAccess`. In the results, check the checkbox on the row labeled **AdministratorAccess** ("Provides full access to AWS services and resources"). Click **Next**.
7. On **Review and create**, confirm it shows `chopchopmol-admin` with `AdministratorAccess`, then click **Create user**.

### 1.3b Create access keys for the CLI

1. On the Users list, click the blue **`chopchopmol-admin`** link.
2. Click the **Security credentials** tab.
3. Scroll to **Access keys** → click **Create access key**.
4. On "Access key best practices", select **Command Line Interface (CLI)**.
5. A yellow warning appears — below it, check the box **I understand the above recommendation and want to proceed to create an access key.** Click **Next**.
6. Description tag value: type `chopchopmol cli` (or leave blank). Click **Create access key**.
7. On the final page, click **Show** next to the **Secret access key**. **Copy both the Access key and the Secret access key now** — you can never see the secret again. Or click **Download .csv file**. Click **Done**.

### 1.3c Connect the CLI to those keys

In Terminal:

```bash
aws configure
```

Answer the four prompts:

```
AWS Access Key ID [None]:        <paste your Access key>
AWS Secret Access Key [None]:    <paste your Secret access key>
Default region name [None]:      us-east-1
Default output format [None]:    json
```

Verify:

```bash
aws sts get-caller-identity
```

You should see a JSON block with `"Arn": "arn:aws:iam::...:user/chopchopmol-admin"`. If you see `Unable to locate credentials`, re-run `aws configure`.

> **Never** commit these keys to GitHub, paste them in chat, or share them. If they leak: IAM → Users → chopchopmol-admin → Security credentials → deactivate and delete the key, then make a new one.

<a name="14-pick-your-region"></a>
## 1.4 Pick your region

Already decided: **`us-east-1`**. Confirm the Console's region selector (top right) says **N. Virginia** every time you do console steps. The CLI default region is already set to `us-east-1` from `aws configure`.

<a name="15-request-a-gpu-quota-increase"></a>
## 1.5 Request a GPU quota increase (do this NOW — it can take hours)

Brand-new AWS accounts (and many older personal accounts) have a **default limit of 0 GPU vCPUs**. You must request an increase **before** you can launch the GPU instance in Part 2. The approval is sometimes instant, sometimes takes up to 24–48 hours, so request it first thing.

1. In the Console search bar, type **`Service Quotas`** and click it.
2. Left sidebar → **AWS services** → in the search box type `EC2` → click **Amazon Elastic Compute Cloud (Amazon EC2)**.
3. In the quota search box, type **`Running On-Demand G and VT instances`** → click that quota name.
4. Click **Request increase at account level** (top right).
5. **Increase quota value**: enter `8`. (A `g4dn.xlarge` uses 4 vCPUs; `8` gives you headroom to resize to `g4dn.2xlarge` later without another request.)
6. Click **Request**.
7. (Optional, only if you plan to use spot instances for cost savings) Repeat steps 3–6 for the quota named **`All G and VT Spot Instance Requests`**, value `8`.

You'll get an email when it's approved. **Continue with Parts 2.1–2.2 while you wait** — they don't need the quota. You only need it for §2.3.

---

<a name="part-2--backend-on-ec2-gpu"></a>
# PART 2 — Backend on EC2 GPU (replaces Render + RunPod)

**Goal of this part:** one `g4dn.xlarge` EC2 instance, running your `chopchopmol-ai-backend` Docker container with GPU access, reachable at `https://api.chopchopmol.com`. After this part, your Firebase-hosted frontend simply points at the new backend URL and you can shut down Render and RunPod.

<a name="21-create-an-ssh-key-pair"></a>
## 2.1 Create an SSH key pair

This is the key you'll use to log into the server. In Terminal on your Mac:

```bash
aws ec2 create-key-pair \
  --key-name chopchopmol-key \
  --key-type ed25519 \
  --query 'KeyMaterial' --output text > ~/.ssh/chopchopmol-key.pem

chmod 400 ~/.ssh/chopchopmol-key.pem
ls -la ~/.ssh/chopchopmol-key.pem
```

The last line should show `-r--------` permissions. SSH refuses keys that are more open than that.

<a name="22-create-a-security-group"></a>
## 2.2 Create a security group (firewall)

A security group controls what traffic can reach the server.

```bash
# 2.2a — get your default VPC id
aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' --output text
```

Copy the printed `vpc-...` value, then:

```bash
# 2.2b — create the security group (paste your vpc id)
aws ec2 create-security-group \
  --group-name chopchopmol-sg \
  --description "ChopChopMol backend - SSH, HTTP, HTTPS" \
  --vpc-id VPC_ID_FROM_2.2a
```

Copy the printed `"GroupId": "sg-..."` value, then:

```bash
# 2.2c — open the three ports (paste your sg id in all three)
# SSH
aws ec2 authorize-security-group-ingress --group-id SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0
# HTTP — needed so Caddy can get the Let's Encrypt certificate
aws ec2 authorize-security-group-ingress --group-id SG_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
# HTTPS — how the frontend talks to the backend
aws ec2 authorize-security-group-ingress --group-id SG_ID \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
```

> Port `10000` (the Flask app) is intentionally **not** opened to the internet. Caddy listens on 443 and forwards to `localhost:10000` inside the box.
>
> **Hardening tip:** for port 22, replace `0.0.0.0/0` with `YOUR_HOME_IP/32` (find your IP at `https://checkip.amazonaws.com`) so only you can SSH in. If your home IP changes, you'll re-add the rule.

<a name="23-launch-the-gpu-instance"></a>
## 2.3 Launch the GPU instance

> ⚠️ Don't do this step until the §1.5 quota increase email has arrived. If you launch early you'll get `VcpuLimitExceeded`.

### 2.3a Find the latest Ubuntu 22.04 image

```bash
aws ec2 describe-images --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
            "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' --output text
```

Copy the printed `ami-...` value.

> Why plain Ubuntu and not the "Deep Learning AMI"? Your backend ships a Docker image that already contains CUDA 12.4, PyTorch, MACE, PySCF, etc. (see the repo's `Dockerfile`). You only need the host to provide the **NVIDIA driver** and **Docker** — a Deep Learning AMI would just be a bigger, more expensive image with software you don't use. Plain Ubuntu + the driver is leaner.

### 2.3b Launch

```bash
aws ec2 run-instances \
  --image-id AMI_ID_FROM_2.3a \
  --instance-type g4dn.xlarge \
  --key-name chopchopmol-key \
  --security-group-ids SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":150,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=chopchopmol-backend}]' \
  --query 'Instances[0].InstanceId' --output text
```

This creates a `g4dn.xlarge` (1× NVIDIA T4 16 GB, 4 vCPU, 16 GB RAM) with a 150 GB SSD running Ubuntu 22.04. Copy the printed `i-...` instance id.

> **Why 150 GB?** Your container image is ~15 GB. On top of that the backend caches downloaded MACE foundation models and writes fine-tuned models — and DFT/MD scratch files can be large. 150 GB is comfortable; you can grow it later but not shrink it.

### 2.3c Wait for it

```bash
aws ec2 wait instance-running --instance-ids INSTANCE_ID
echo "Instance is running"
```

<a name="24-attach-a-static-ip"></a>
## 2.4 Attach a static IP (Elastic IP)

Without this, the server's public IP changes on every stop/start and your DNS record breaks.

```bash
# 2.4a — allocate
aws ec2 allocate-address --query 'AllocationId' --output text
```

Copy the `eipalloc-...` value.

```bash
# 2.4b — attach it to your instance
aws ec2 associate-address \
  --instance-id INSTANCE_ID \
  --allocation-id EIPALLOC_ID
```

```bash
# 2.4c — print the permanent public IP
aws ec2 describe-addresses --allocation-ids EIPALLOC_ID \
  --query 'Addresses[0].PublicIp' --output text
```

Copy the IP (e.g. `54.123.45.67`). This is your server's permanent address — call it `SERVER_IP` for the rest of the guide.

<a name="25-point-api-at-the-server"></a>
## 2.5 Point `api.chopchopmol.com` at the server (Squarespace DNS)

1. Go to **`https://account.squarespace.com`** and sign in.
2. Click **Domains** in the left menu, then click **`chopchopmol.com`**.
3. Click **DNS** (or **DNS Settings**).
4. Scroll to the **Custom Records** section. Click **Add Record**.
5. Fill the row exactly:
   - **Host**: `api`
   - **Type**: select **A** from the dropdown
   - **Priority**: leave blank / default
   - **Data** (or **Value**): `SERVER_IP` from §2.4c (e.g. `54.123.45.67`)
6. Click **Save** (you may be asked to re-enter your password or 2FA).

Wait 5–30 minutes (Squarespace says up to 24–48h, but subdomain A records are usually fast). Verify from your Mac:

```bash
dig api.chopchopmol.com +short
```

It should print your `SERVER_IP`. If it prints nothing, wait longer and re-check the record in Squarespace.

<a name="26-connect-via-ssh"></a>
## 2.6 Connect via SSH

```bash
ssh -i ~/.ssh/chopchopmol-key.pem ubuntu@SERVER_IP
```

Type `yes` at the fingerprint prompt. You should land at a prompt like `ubuntu@ip-172-31-x-x:~$`.

**Everything from §2.7 through §2.13 runs on the server**, not your Mac. The guide says "(on your Mac)" whenever you need to switch back.

> **Convenience:** on your Mac, add this to `~/.ssh/config` so you can just type `ssh chopchopmol`:
> ```
> Host chopchopmol
>     HostName SERVER_IP
>     User ubuntu
>     IdentityFile ~/.ssh/chopchopmol-key.pem
> ```

<a name="27-install-nvidia-drivers"></a>
## 2.7 Install NVIDIA drivers

On the server:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y linux-headers-$(uname -r)
sudo apt-get install -y nvidia-driver-550
sudo reboot
```

The reboot disconnects your SSH session. Wait ~40 seconds, reconnect (`ssh -i ~/.ssh/chopchopmol-key.pem ubuntu@SERVER_IP`), then verify:

```bash
nvidia-smi
```

You should see a table with **`Tesla T4`** and **`15360MiB`** of memory. If `nvidia-smi` says "command not found" or "has failed", see [Troubleshooting](#part-7--operations).

<a name="28-install-docker--nvidia-container-toolkit"></a>
## 2.8 Install Docker + NVIDIA Container Toolkit

On the server:

```bash
# 2.8a — Docker Engine
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 2.8b — run docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# 2.8c — verify
docker run --rm hello-world
```

`docker run --rm hello-world` should print "Hello from Docker!".

```bash
# 2.8d — NVIDIA Container Toolkit (lets containers see the GPU)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 2.8e — verify the container can see the GPU
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

The last command should print the same `Tesla T4` table, but from inside a container. If it does, GPU + Docker is ready.

<a name="29-get-the-code-and-build-the-image"></a>
## 2.9 Get the code and build the image

You'll clone your backend repo from GitHub straight onto the server and build the image there. No Docker Hub, no ECR.

```bash
# 2.9a — install git and clone (use your actual GitHub repo URL for chopchopmol-ai-backend)
sudo apt-get install -y git
cd ~
git clone https://github.com/YOUR_GITHUB_USERNAME/chopchopmol-ai-backend.git
cd chopchopmol-ai-backend
```

> If the repo is **private**, GitHub no longer accepts passwords over HTTPS. Easiest path: create a **fine-grained personal access token** at `https://github.com/settings/tokens` with **Contents: Read-only** scope on that one repo, then clone with:
> `git clone https://YOUR_GITHUB_USERNAME:YOUR_TOKEN@github.com/YOUR_GITHUB_USERNAME/chopchopmol-ai-backend.git`

```bash
# 2.9b — build the image (uses the repo's existing Dockerfile)
docker build -t chopchopmol-backend:latest .
```

This takes **15–40 minutes** the first time — it installs PyTorch CUDA 12.4, MACE, PySCF, GPU4PySCF, cuequivariance, etc. It's normal for it to look stuck on the big `pip install` steps. Let it run.

> The repo's `Dockerfile` is built for RunPod and also installs an SSH server (for RunPod's web terminal). That's harmless on EC2 — you already have real SSH — but the container's `start.sh` only starts `sshd` if a `PUBLIC_KEY` env var is set, and you won't set one, so it just won't start. Nothing to change.

<a name="210-run-the-backend-container"></a>
## 2.10 Run the backend container

### 2.10a Create a persistent data directory

The backend writes fine-tuned MACE models and caches downloaded foundation models. By default those go to `/tmp` **inside the container** and are **lost on every container restart**. Fix that with a host directory mounted into the container:

```bash
sudo mkdir -p /data/mace_finetuned /data/torch_cache
sudo chown -R $USER:$USER /data
```

### 2.10b Create the environment file

Copy the companion template and fill in your real keys:

```bash
cp ~/chopchopmol-ai-backend/aws/chopchopmol.env.example ~/chopchopmol.env
chmod 600 ~/chopchopmol.env
nano ~/chopchopmol.env
```

Fill in at minimum:

```ini
# --- AI providers (required) ---
ANTHROPIC_API_KEY=sk-ant-...        # https://console.anthropic.com/settings/keys
OPENAI_API_KEY=sk-...               # https://platform.openai.com/api-keys
TAVILY_API_KEY=tvly-...             # https://app.tavily.com  (optional: web search)

# --- persistent storage paths (point at the mounted /data) ---
MACE_FINETUNE_DIR=/data/mace_finetuned
MACE_CACHE_DIR=/data/torch_cache

# --- auth: keep OFF until Part 4 is done ---
REQUIRE_AUTH=false

# --- optional notifications (leave blank if unused) ---
RESEND_API_KEY=
SLACK_WEBHOOK_URL=
ADMIN_TOKEN=
```

Save and exit `nano` with `Ctrl+O`, `Enter`, `Ctrl+X`.

> [Appendix A](#appendix-a--every-environment-variable) lists **every** variable the backend reads, what it does, and its default. The ones above are the ones that matter for Part 2. The `FIREBASE_*` and `COGNITO_*` variables come into play in Parts 3–4.

### 2.10c Start the container with docker-compose

A ready-made `docker-compose.yml` is in `~/chopchopmol-ai-backend/aws/`. It pins the image, mounts `/data`, loads `~/chopchopmol.env`, requests the GPU, and sets `restart: unless-stopped`.

```bash
cd ~/chopchopmol-ai-backend/aws
docker compose up -d
```

### 2.10d Watch it boot

```bash
docker compose logs -f
```

First boot takes a minute or two while it warms up the MACE models. Wait for a line indicating the server is listening on `:10000`. Then press `Ctrl+C` to stop following the logs (the container keeps running).

### 2.10e Health check

```bash
curl http://localhost:10000/health
```

You should get a JSON response (e.g. `{"status": "ok"}` or similar). If you do, the backend is alive on the box. If not, read `docker compose logs` for the error.

<a name="211-https-with-caddy"></a>
## 2.11 HTTPS with Caddy

Your frontend is served over HTTPS, and browsers block HTTPS pages from calling plain-HTTP backends. Caddy is a tiny web server that **automatically** gets and renews a free Let's Encrypt certificate and reverse-proxies to your container.

```bash
# 2.11a — install Caddy
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy

# 2.11b — install the Caddyfile (companion file)
sudo cp ~/chopchopmol-ai-backend/aws/Caddyfile /etc/caddy/Caddyfile

# 2.11c — start Caddy
sudo systemctl restart caddy
sudo systemctl enable caddy
```

The companion `Caddyfile` proxies `api.chopchopmol.com` → `localhost:10000` and disables response buffering on the SSE streaming endpoints (`/ai/chat/stream`, `/ai/mace/optimize/stream`, `/ai/mace/md/stream`) with 10-minute timeouts so long ML jobs stream correctly.

### 2.11d Verify HTTPS — from your Mac

```bash
curl https://api.chopchopmol.com/health
```

You should get the same healthy JSON response, now over HTTPS. If it fails, check `sudo journalctl -u caddy --no-pager -n 50` on the server — the usual cause is DNS not propagated yet (`dig api.chopchopmol.com +short` should show `SERVER_IP`).

<a name="212-point-the-frontend-at-the-new-backend"></a>
## 2.12 Point the frontend at the new backend

Now tell the (still Firebase-hosted) frontend to use the AWS backend. **On your Mac**, edit `demo/utils/apiUtils.js`.

Find the URL constants near the top (around lines 10–15):

```javascript
// BEFORE
const RUNPOD_URL = 'https://l01l6g1um1puzn-10000.proxy.runpod.net';
const RENDER_URL = 'https://chopchopmol-ai-backend.onrender.com';
const LOCAL_URL = 'http://127.0.0.1:10000';
const BACKEND_URLS = { runpod: RUNPOD_URL, render: RENDER_URL, local: LOCAL_URL };
```

```javascript
// AFTER
const AWS_URL    = 'https://api.chopchopmol.com';
const RENDER_URL = 'https://chopchopmol-ai-backend.onrender.com'; // keep temporarily as fallback
const LOCAL_URL  = 'http://127.0.0.1:10000';
const BACKEND_URLS = { aws: AWS_URL, render: RENDER_URL, local: LOCAL_URL };
```

Then in `getBackendUrl()` (around lines 43–74), change the health-check probe to try **AWS first**, Render second:

```javascript
_resolvePromise = (async () => {
    try {
        const res = await fetch(`${AWS_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            _resolvedBackendUrl = AWS_URL;
            console.log('Backend: AWS');
            return _resolvedBackendUrl;
        }
    } catch (e) {
        console.log('AWS health check failed:', e.message);
    }
    _resolvedBackendUrl = RENDER_URL; // fallback during transition
    console.log('Backend: Render (fallback)');
    return _resolvedBackendUrl;
})();
return _resolvePromise;
```

Also update the manual backend switcher (the `prompt(...)` block around lines 172–189) so its options read `1: AWS / 2: Render / 3: Local` and map to `AWS_URL / RENDER_URL / LOCAL_URL`.

Then fix the **second, independent** backend-URL helper in `index.html` (around line 5274) — it has its own hardcoded fallback:

```javascript
// index.html ~line 5271-5275  — BEFORE
function getBackendUrl() {
    return window.AIAgent?.getBackendUrl?.() ||
        (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
            ? 'http://127.0.0.1:10000' : 'https://chopchopmol-ai-backend.onrender.com');
}
// AFTER: replace the onrender.com string with 'https://api.chopchopmol.com'
```

Deploy the frontend (still on Firebase for now — that moves in Part 5):

```bash
cd /Users/nguyenpham/Downloads/ChopChopMol-2.0
firebase deploy
```

Open `https://chopchopmol-2.web.app`, open the browser console, and confirm it logs **`Backend: AWS`**. Run a real action that hits the backend (e.g. a MACE energy calculation) to confirm the GPU path works end-to-end.

> **This is your Part 2 finish line.** Render and RunPod are now unused for the main backend. Don't delete them yet — keep them as a fallback until you've run on AWS for a few days (see Part 6). The `chopchopmol-2-0-3.onrender.com` secondary service is still in use — see [Appendix C](#appendix-c--the-secondary-service).

<a name="213-auto-start-on-reboot"></a>
## 2.13 Auto-start on reboot

The `docker-compose.yml` sets `restart: unless-stopped`, and Docker itself starts on boot. Confirm on the server:

```bash
sudo systemctl is-enabled docker   # should print: enabled
sudo systemctl is-enabled caddy    # should print: enabled
```

Test it for real:

```bash
sudo reboot
```

Wait ~60 seconds, reconnect, and check:

```bash
docker compose -f ~/chopchopmol-ai-backend/aws/docker-compose.yml ps   # container is "Up"
curl http://localhost:10000/health                                     # healthy
```

---

<a name="part-3--database-on-dynamodb"></a>
# PART 3 — Database on DynamoDB (replaces Firestore)

**Goal of this part:** move every piece of data out of Firestore into DynamoDB. The architecture changes slightly and for the better: today the **browser talks directly to Firestore**; after this, the **browser talks to your backend**, and the **backend** (which already has a secure home on EC2) talks to DynamoDB. That keeps all database credentials server-side and means there are no AWS keys in the browser.

> **Why not let the browser talk to DynamoDB directly?** You *can* (via a Cognito Identity Pool handing temporary AWS credentials to the browser, plus fine-grained IAM conditions). But it's fiddly, exposes your table structure to the client, and is harder to reason about than Firestore's security rules. Routing through the backend is simpler, more secure, and the backend already exists. This guide uses the backend-proxied approach.

<a name="31-what-data-firestore-holds"></a>
## 3.1 What data Firestore is holding today

From reading the code, here is everything in Firestore and where it's used:

| Firestore path | Written/read by | Holds |
|---|---|---|
| `users/{uid}` | frontend (`index.html`) + backend (`app.py`) | Profile + access control. Frontend writes `storageUsed`, `updatedAt`. Backend writes/reads `status` (`active`/`pending`/`rejected`/`disabled`/`revoked`), `email`, `created`. |
| `users/{uid}/molecules/{moleculeId}` | frontend | Saved molecule structures: name, XYZ/structure data, `folderId`, `timestamp`. |
| `users/{uid}/folders/{folderId}` | frontend | Molecule organization folders: name, `timestamp`. |
| `users/{uid}/conversations/{conversationId}` | frontend | Saved AI chat history: `title`, `createdAt`, `updatedAt`, message list, `pendingJobs`. |
| `admins/{uid}` | backend | If a doc exists at this path, the user is an admin. |
| `accessRequests/*` (a.k.a. `access_requests`) | backend | Queue of access requests from new users. |

### The DynamoDB design (5 tables)

DynamoDB doesn't have "subcollections". The clean equivalent of "a user owns a list of things" is a **composite primary key**: a **partition key** (`uid`) plus a **sort key** (the item id). A `Query` for `uid = X` returns all of that user's items. So:

| DynamoDB table | Partition key (PK) | Sort key (SK) | Replaces |
|---|---|---|---|
| `chopchopmol-users` | `uid` (String) | — (none) | `users/{uid}` **and** `admins/{uid}` — an `isAdmin` boolean attribute folds the admins collection in. |
| `chopchopmol-molecules` | `uid` (String) | `moleculeId` (String) | `users/{uid}/molecules/{moleculeId}` |
| `chopchopmol-folders` | `uid` (String) | `folderId` (String) | `users/{uid}/folders/{folderId}` |
| `chopchopmol-conversations` | `uid` (String) | `conversationId` (String) | `users/{uid}/conversations/{conversationId}` |
| `chopchopmol-access-requests` | `requestId` (String) | — (none) | `accessRequests/*` |

All tables use **on-demand (pay-per-request)** capacity — no capacity planning, near-zero cost for a small app, scales automatically.

<a name="32-create-the-dynamodb-tables"></a>
## 3.2 Create the DynamoDB tables

Run the companion script from your Mac (it's just five `aws dynamodb create-table` calls — open it and read it first if you want):

```bash
cd /Users/nguyenpham/Downloads/chopchopmol-ai-backend/aws
bash dynamodb-create-tables.sh
```

Then confirm in the console: search **`DynamoDB`** → left sidebar **Tables** → you should see all five `chopchopmol-*` tables with **Status: Active**.

<a name="33-give-ec2-permission"></a>
## 3.3 Give the EC2 instance permission to use DynamoDB

The backend should access DynamoDB through an **IAM role attached to the instance** — not access keys in a file. That's the AWS best practice: no long-lived secrets on the box.

### 3.3a Create the role

1. Console → search **`IAM`** → left sidebar **Roles** → **Create role**.
2. **Trusted entity type**: **AWS service**. **Use case**: choose **EC2**. Click **Next**.
3. On **Add permissions**, click **Create policy** (opens a new tab).
4. In the new tab, click the **JSON** tab and paste the contents of the companion file `chopchopmol-ai-backend/aws/iam-ec2-policy.json`. Click **Next**.
5. Policy name: `chopchopmol-backend-policy`. Click **Create policy**. Close that tab.
6. Back on the **Add permissions** tab, click the refresh icon, search `chopchopmol-backend-policy`, check it, click **Next**.
7. Role name: `chopchopmol-backend-role`. Click **Create role**.

### 3.3b Attach the role to the instance

```bash
# from your Mac
aws ec2 associate-iam-instance-profile \
  --instance-id INSTANCE_ID \
  --iam-instance-profile Name=chopchopmol-backend-role
```

(AWS auto-creates an instance profile with the same name as the role.)

### 3.3c Verify from the server

```bash
# SSH into the server, then:
aws dynamodb list-tables --region us-east-1
```

It should list your five tables — with **no `aws configure` ever run on the server**. The credentials come from the role automatically. (If `aws` isn't installed on the server: `sudo apt-get install -y awscli`.)

<a name="34-add-the-data-api-to-the-backend"></a>
## 3.4 Add the data API to the backend

I created two companion files in `chopchopmol-ai-backend/aws/`:

- **`data_store.py`** — a `boto3`-based data layer. One function per operation: `get_user`, `put_user`, `set_user_status`, `list_molecules`, `put_molecule`, `delete_molecule`, `list_folders`, `put_folder`, `delete_folder`, `list_conversations`, `get_conversation`, `put_conversation`, `delete_conversation`, `create_access_request`, `list_access_requests`. It reads the table names from env vars (with the `chopchopmol-*` defaults).
- **`cognito_auth.py`** — verifies Cognito JWTs (used in Part 4).

### 3.4a Wire it into `app.py`

1. Copy both files next to `app.py`:
   ```bash
   # on the server, or locally then commit+push+pull
   cp ~/chopchopmol-ai-backend/aws/data_store.py   ~/chopchopmol-ai-backend/data_store.py
   cp ~/chopchopmol-ai-backend/aws/cognito_auth.py ~/chopchopmol-ai-backend/cognito_auth.py
   ```
2. Add `boto3` and `python-jose[cryptography]` to `requirements.txt` (and `requirements-render.txt` if you keep it).
3. Near the top of `app.py`, add: `import data_store`
4. **Add these HTTP endpoints** to `app.py` (they wrap `data_store` and require a logged-in user — `get_current_uid()` comes from Part 4; until Part 4 is done it can temporarily read a `uid` from the request for testing):

   ```python
   # ---- Data API (DynamoDB-backed) ----
   @app.route("/api/data/molecules", methods=["GET", "POST"])
   def api_molecules():
       uid = get_current_uid()                       # from cognito_auth (Part 4)
       if not uid: return jsonify({"error": "unauthorized"}), 401
       if request.method == "GET":
           return jsonify(data_store.list_molecules(uid))
       body = request.get_json(force=True)
       data_store.put_molecule(uid, body["moleculeId"], body)
       return jsonify({"ok": True})

   @app.route("/api/data/molecules/<molecule_id>", methods=["DELETE"])
   def api_molecule_delete(molecule_id):
       uid = get_current_uid()
       if not uid: return jsonify({"error": "unauthorized"}), 401
       data_store.delete_molecule(uid, molecule_id)
       return jsonify({"ok": True})

   # ... repeat the same GET/POST/DELETE pattern for:
   #   /api/data/folders        + /api/data/folders/<folder_id>
   #   /api/data/conversations  + /api/data/conversations/<conversation_id>
   #   /api/data/user           (GET = profile, POST = update storageUsed etc.)
   ```

5. **Replace the backend's Firestore access-control reads.** Today `app.py` reads `users/{uid}` and `admins/{uid}` from Firestore in its auth gate (`REQUIRE_AUTH`, the `before_request` enforcer, the admin check). Replace those Firestore calls with `data_store.get_user(uid)` — the returned record has `status` and `isAdmin`. Replace the `accessRequests` Firestore writes with `data_store.create_access_request(...)` / `data_store.list_access_requests()`.

   Search `app.py` for `_firestore_client`, `firestore`, and `firebase` to find every call site — the exploration found them clustered around the auth/access-gate code and the `/access/*` routes.

6. Set the table-name env vars in `~/chopchopmol.env` (defaults already match the script, so this is only needed if you renamed tables):
   ```ini
   AWS_REGION=us-east-1
   DDB_USERS_TABLE=chopchopmol-users
   DDB_MOLECULES_TABLE=chopchopmol-molecules
   DDB_FOLDERS_TABLE=chopchopmol-folders
   DDB_CONVERSATIONS_TABLE=chopchopmol-conversations
   DDB_ACCESS_REQUESTS_TABLE=chopchopmol-access-requests
   ```

7. Rebuild and restart the container:
   ```bash
   cd ~/chopchopmol-ai-backend && git pull   # if you edited locally and pushed
   docker build -t chopchopmol-backend:latest .
   cd aws && docker compose up -d
   ```

<a name="35-export-and-import-data"></a>
## 3.5 Export your data out of Firestore and import into DynamoDB

The companion script **`chopchopmol-ai-backend/aws/migrate_firestore_to_dynamodb.py`** does this in one shot: it reads every Firestore collection with the Firebase Admin SDK and writes the equivalent items into the five DynamoDB tables.

### 3.5a Get a Firebase service account key (read access to your old data)

1. Go to **`https://console.firebase.google.com`** → project **chopchopmol-2**.
2. Click the **gear icon** (top left, next to "Project Overview") → **Project settings**.
3. Click the **Service accounts** tab.
4. Click **Generate new private key** → **Generate key**. A JSON file downloads. Save it as `~/firebase-service-account.json` on your Mac.

### 3.5b Run the migration (from your Mac)

```bash
cd /Users/nguyenpham/Downloads/chopchopmol-ai-backend/aws
python3 -m pip install firebase-admin boto3
export GOOGLE_APPLICATION_CREDENTIALS=~/firebase-service-account.json
export AWS_REGION=us-east-1
python3 migrate_firestore_to_dynamodb.py
```

It prints a running count per table and a summary at the end (e.g. "users: 142, molecules: 1,021, folders: 88, conversations: 537, access-requests: 12"). It is **idempotent** — safe to run again; it overwrites items by key, so if users keep using the old site during migration you can re-run it right before cutover to catch last-minute changes.

### 3.5c Spot-check

```bash
aws dynamodb scan --table-name chopchopmol-users --max-items 3 --region us-east-1
```

Confirm a few user records look right (have `uid`, `email`, `status`). Open the DynamoDB console → **Tables** → `chopchopmol-molecules` → **Explore table items** and eyeball a few molecules.

<a name="36-rewrite-frontend-firestore-calls"></a>
## 3.6 Rewrite the frontend Firestore calls

Now point the browser at the new backend data API instead of Firestore. All the Firestore code lives in `demo/index.html` (roughly lines 700–1200). The pattern is mechanical — every Firestore call becomes a `fetch()` to your backend.

1. **Add a small helper** near the other helpers in `index.html`:

   ```javascript
   async function dataApi(path, options = {}) {
       const base = await window.AIAgent.getBackendUrl();   // resolves to api.chopchopmol.com
       const token = window._authToken;                     // set by Cognito in Part 4
       const res = await fetch(`${base}/api/data${path}`, {
           ...options,
           headers: {
               'Content-Type': 'application/json',
               ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
               ...(options.headers || {}),
           },
       });
       if (!res.ok) throw new Error(`dataApi ${path} -> ${res.status}`);
       return res.status === 204 ? null : res.json();
   }
   ```

2. **Replace each Firestore operation** with the equivalent call. Examples:

   | Old (Firestore) | New (backend API) |
   |---|---|
   | `getDocs(query(collection(db,'users',uid,'molecules'), orderBy('timestamp','desc')))` | `await dataApi('/molecules')` (the backend sorts) |
   | `addDoc(collection(db,'users',uid,'molecules'), data)` | `await dataApi('/molecules', { method:'POST', body: JSON.stringify({ moleculeId: crypto.randomUUID(), ...data }) })` |
   | `setDoc(doc(db,'users',uid,'molecules',id), data, {merge:true})` | `await dataApi('/molecules', { method:'POST', body: JSON.stringify({ moleculeId:id, ...data }) })` |
   | `deleteDoc(doc(db,'users',uid,'molecules',id))` | `await dataApi('/molecules/'+id, { method:'DELETE' })` |
   | same shapes for `folders` and `conversations` | `/folders`, `/conversations` |
   | `getDoc(doc(db,'users',uid))` / `setDoc(...)` | `await dataApi('/user')` / `await dataApi('/user',{method:'POST',body:...})` |

3. **Remove the Firestore SDK import.** In `index.html` around line 332, delete the `firebase-firestore.js` import line and the `getFirestore` / `window.firebaseDB` lines (~349–352). (Leave the Auth import for now — it goes in Part 4.)

4. Delete `demo/firestore.rules`, `demo/firestore.indexes.json`, and the `firestore` block in `demo/firebase.json` — they describe a database you no longer use.

5. Test locally against your AWS backend before deploying: `cd demo && python3 -m http.server 8000`, open `http://localhost:8000/demo/`, sign in, and verify saving/loading a molecule, creating a folder, and reloading a conversation all work. Watch the Network tab — calls should go to `api.chopchopmol.com/api/data/...`, not `firestore.googleapis.com`.

> **Tip:** do Part 3 and Part 4 in the same sitting if you can — the data API needs Cognito auth (`get_current_uid()` / `window._authToken`) to be truly secure. You can test Part 3 with a temporary `uid` query param, but don't deploy it to real users until Part 4's auth is in place.

---

<a name="part-4--authentication-on-cognito"></a>
# PART 4 — Authentication on Cognito (replaces Firebase Auth)

**Goal of this part:** users sign in with Google or email/password through **Amazon Cognito** instead of Firebase Auth. The backend verifies **Cognito JWTs** instead of Firebase ID tokens.

**The clean seam:** today the frontend already puts a Firebase ID token in an `Authorization: Bearer <token>` header, and the backend verifies it. We keep that exact shape — only the *token issuer* changes. Frontend: get the token from Cognito instead of Firebase. Backend: verify it as a Cognito JWT instead of a Firebase token. Everything in between is unchanged.

<a name="41-create-the-cognito-user-pool"></a>
## 4.1 Create the Cognito user pool

1. Console → search **`Cognito`** → click **Amazon Cognito**.
2. Click **Create user pool**.
3. **Define your application** step:
   - **Application type**: choose **Single-page application (SPA)**.
   - **Name your application**: `chopchopmol-web`.
   - **Configure options → Sign-in identifiers**: check **Email**.
   - **Required attributes for sign-up**: select **email**.
   - **Add a return URL**: enter `https://www.chopchopmol.com/` (you'll add a second one for local dev shortly).
4. Click **Create user pool**. Cognito creates the pool and a first app client.
5. When it's done, you land on the pool's page. **Copy two values now** and keep them:
   - **User pool ID** — looks like `us-east-1_AbCdEfGhI` → call it `COGNITO_USER_POOL_ID`.
   - The **Region** prefix is part of it (`us-east-1`).

> If your Console shows the older Cognito wizard ("Step 1 Configure sign-in experience" … "Step 6 Review"): on Step 1 choose **Cognito user pool** and **Email**; Step 2 password policy = default, **No MFA** is fine to start (you can require it later), self-service sign-up **enabled**; Step 3 **Send email with Cognito** (fine for low volume; switch to Amazon SES later for production volume); Step 4 set **User pool name** `chopchopmol`, check **Use the Cognito Hosted UI**, set a **domain prefix** like `chopchopmol-auth`; Step 5 create an app client named `chopchopmol-web` of type **Public client**, with callback URL `https://www.chopchopmol.com/` and sign-out URL `https://www.chopchopmol.com/`; Step 6 review and create.

<a name="42-add-google-sign-in"></a>
## 4.2 Add Google sign-in

This has two halves: create OAuth credentials in **Google Cloud Console**, then register them in **Cognito**.

### 4.2a Get the Cognito domain first

You need your Cognito **hosted-UI domain** before configuring Google.

1. In your user pool, open the **App integration** tab.
2. Find the **Domain** section. If there's no domain yet, click **Actions → Create Cognito domain**, enter a prefix like `chopchopmol-auth`, click **Create**.
3. Your domain is now `https://chopchopmol-auth.auth.us-east-1.amazoncognito.com` → call it `COGNITO_DOMAIN`.

### 4.2b Create Google OAuth credentials

1. Go to **`https://console.cloud.google.com`**. You can reuse the **same Google project** that your Firebase app already uses (Firebase projects *are* Google Cloud projects — pick `chopchopmol-2` from the project dropdown). Reusing it means your existing Google sign-in users keep the same Google account linkage.
2. In the search bar type **`Credentials`** → open **APIs & Services → Credentials**.
3. If prompted to configure the **OAuth consent screen** first: choose **External**, fill in app name `ChopChopMol`, your support email, and under **Authorized domains** add `amazoncognito.com` and `chopchopmol.com`. Save.
4. Back on **Credentials**, click **Create credentials** → **OAuth client ID**.
5. **Application type**: **Web application**. **Name**: `chopchopmol-cognito`.
6. Under **Authorized JavaScript origins**, click **Add URI** and enter your `COGNITO_DOMAIN` (e.g. `https://chopchopmol-auth.auth.us-east-1.amazoncognito.com`).
7. Under **Authorized redirect URIs**, click **Add URI** and enter `COGNITO_DOMAIN/oauth2/idpresponse` (e.g. `https://chopchopmol-auth.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`).
8. Click **Create**. Copy the **Client ID** and **Client secret**.

### 4.2c Register Google in Cognito

1. Back in the Cognito console → your user pool → **Sign-in experience** tab → **Federated identity provider sign-in** (or **Social and external providers**) → **Add identity provider**.
2. Choose **Google**.
3. Paste the **Client ID** and **Client secret** from step 4.2b.
4. **Authorized scopes**: enter `profile email openid`.
5. **Map attributes**: map Cognito attribute **email** → Google attribute **email**. (Also map `name` → `name` if you want display names.)
6. Click **Add identity provider**.

<a name="43-create-the-app-client"></a>
## 4.3 Create the app client and hosted login page

1. Cognito console → your user pool → **App integration** tab → scroll to **App clients** → click your `chopchopmol-web` client (or **Create app client** if you need a fresh one — type **Public client**, **don't** generate a client secret for a browser app).
2. In the app client, find **Hosted UI** settings and click **Edit**:
   - **Allowed callback URLs**: add **both**
     - `https://www.chopchopmol.com/`
     - `http://localhost:8000/demo/` (for local testing)
   - **Allowed sign-out URLs**: add the same two.
   - **Identity providers**: check **Cognito user pool** *and* **Google**.
   - **OAuth grant types**: check **Authorization code grant**.
   - **OpenID Connect scopes**: check **email**, **openid**, **profile**.
   - Save.
3. In the app client's **Authentication flows**, make sure **ALLOW_USER_PASSWORD_AUTH** and **ALLOW_REFRESH_TOKEN_AUTH** are enabled. (Required for email/password login and for the user-migration trigger in §4.6.)
4. **Copy the App client ID** → call it `COGNITO_APP_CLIENT_ID`.

You now have everything:

| Value | Example | Where it came from |
|---|---|---|
| `COGNITO_USER_POOL_ID` | `us-east-1_AbCdEfGhI` | §4.1 |
| `COGNITO_APP_CLIENT_ID` | `1a2b3c4d5e6f7g8h9i0j` | §4.3 |
| `COGNITO_DOMAIN` | `https://chopchopmol-auth.auth.us-east-1.amazoncognito.com` | §4.2a |
| `AWS_REGION` | `us-east-1` | §1.4 |

<a name="44-backend-verify-cognito"></a>
## 4.4 Make the backend verify Cognito tokens

The companion **`cognito_auth.py`** already does this. It downloads your pool's public keys (JWKS) once, caches them, and verifies incoming JWTs (signature, expiry, audience, issuer). It exposes:

- `verify_cognito_token(token)` → returns the decoded claims (`sub` = the user id, `email`, etc.) or raises.
- `get_current_uid()` → reads the `Authorization: Bearer` header off the current Flask request, verifies it, returns the `sub`, or `None`.

Wire-up in `app.py`:

1. Add to `~/chopchopmol.env`:
   ```ini
   COGNITO_USER_POOL_ID=us-east-1_AbCdEfGhI
   COGNITO_APP_CLIENT_ID=1a2b3c4d5e6f7g8h9i0j
   AWS_REGION=us-east-1
   ```
2. In `app.py`: `from cognito_auth import get_current_uid, verify_cognito_token`
3. **Replace the Firebase token verification.** Find where `app.py` calls `_fb_auth.verify_id_token(token)` (the exploration located it in the auth gate around the `before_request` enforcer). Replace it with `verify_cognito_token(token)`. The decoded claim `sub` is the new `uid` — it plays the exact role the Firebase `uid` did.
4. The access gate logic (`REQUIRE_AUTH`, `status` check, admin check, grandfathering) stays — it just reads from `data_store.get_user(uid)` now (done in Part 3.4 step 5) instead of Firestore.
5. You can now **delete** the `firebase-admin` import, the `FIREBASE_SERVICE_ACCOUNT*` handling, and `firebase-admin` from `requirements.txt`.
6. Rebuild + restart the container (`docker build ... && docker compose up -d`).
7. Flip the gate on once you've tested: set `REQUIRE_AUTH=true` in `~/chopchopmol.env` and restart.

> **Fail-open reminder:** keep the access-gate behavior fail-open on transient verification errors (a JWKS fetch hiccup shouldn't lock everyone out) — the same principle that's already in your codebase. The real enforcement is the `before_request` check; the frontend gate is only UX.

<a name="45-frontend-cognito-login"></a>
## 4.5 Make the frontend log in with Cognito

The simplest, most robust browser flow for "Google **and** email/password" is the **Cognito Hosted UI** with the **Authorization Code grant + PKCE**: you redirect the user to the hosted login page, they sign in (Google or email/password — Cognito renders both), Cognito redirects back to your site with a `code`, and you exchange that code for tokens.

I put a reference module at **`ChopChopMol-2.0/aws/auth-cognito.js`**. It exports:

- `redirectToLogin()` — send the user to the hosted UI.
- `handleRedirectCallback()` — call once on page load; if the URL has a `?code=`, it exchanges it for tokens, stores them, and cleans the URL.
- `getIdToken()` — returns a valid (auto-refreshed) JWT, or `null`.
- `getUser()` — returns `{ sub, email, name }` from the token, or `null`.
- `logout()` — clears tokens and redirects to the hosted logout.

### Wire-up in `index.html`

1. Add `<script type="module">` that imports `auth-cognito.js`, and fill in its config constants at the top of that file: `COGNITO_DOMAIN`, `COGNITO_APP_CLIENT_ID`, `REDIRECT_URI` (`https://www.chopchopmol.com/` in prod, `http://localhost:8000/demo/` in dev — the module auto-picks based on `location.hostname`).
2. **Replace the Firebase Auth code** (around lines 329–349, 369, 475–633, 1213–1231 in `index.html`):
   - Delete the `firebase-app.js` and `firebase-auth.js` imports and the `firebaseConfig` / `initializeApp` / `getAuth` / `GoogleAuthProvider` lines.
   - The **"Sign in with Google"** button's click handler → `redirectToLogin()`.
   - The **email/password** form → also `redirectToLogin()` (the hosted UI has an email/password form built in — you don't maintain your own).
   - The `onAuthStateChanged` / `onIdTokenChanged` listeners → on page load call `await handleRedirectCallback()` then `const user = getUser()`; if `user` is set, do exactly what the old `onAuthStateChanged` callback did (set `window.currentUser`, `window.currentUserEmail`, show the signed-in UI, load the last conversation). Set `window._authToken = await getIdToken()`.
   - The **sign-out** button → `logout()`.
3. Everywhere the old code read `window._firebaseIdToken`, use `window._authToken`. Everywhere it read `auth.currentUser`, use `getUser()`. (The §3.6 `dataApi` helper already reads `window._authToken`.)
4. Repeat the Firebase-removal for **`demo/admin.html`** and **`demo/set-password.html`** — they each embed the same `firebaseConfig` (admin.html lines ~116–123, set-password.html lines ~109–115). The hosted UI replaces `set-password.html` entirely (Cognito handles password reset). For `admin.html`, gate it on `getUser()` + the backend's `isAdmin` check.
5. Update **`demo/early-access-embed.html`** (line ~73) — it hardcodes the Render backend URL; point it at `https://api.chopchopmol.com`.

### The token refresh detail

Firebase auto-refreshed tokens silently. Cognito ID tokens last 1 hour. `auth-cognito.js`'s `getIdToken()` checks expiry and uses the refresh token to get a new one when needed — so **always call `await getIdToken()` right before a request** rather than caching the token in a long-lived variable. The `dataApi` helper and `aiagent.js`'s fetch calls should `await getIdToken()` each time (it's cheap when the token is still valid).

<a name="46-migrate-existing-users"></a>
## 4.6 Migrate your existing users

Firebase **cannot export password hashes in a usable form**, so existing email/password users can't be bulk-imported with working passwords. You have two options:

### Option A — "Just-in-time" migration with a Lambda trigger (seamless for users)

Cognito can call a **Migrate User Lambda trigger** the first time someone signs in. The Lambda checks the user's email+password against Firebase (using the Firebase Admin SDK), and if valid, Cognito creates the user with that password — silently. The user never notices. After the first login they're a normal Cognito user.

- Google sign-in users need **nothing** — when they click "Sign in with Google" through Cognito, they're recognized by email and a Cognito user is created/linked automatically.
- Worth it if you have many email/password users.
- Setup: create a small Lambda (Node or Python) that imports `firebase-admin`, implement the `UserMigration_Authentication` and `UserMigration_ForgotPassword` triggers, and attach it under your user pool → **User pool properties** → **Lambda triggers** → **Migrate user**. AWS's docs ("Migrate user Lambda trigger") have a copy-pasteable handler. **Do not log the event object** — it contains the plaintext password.

### Option B — Bulk import + password reset (simpler, one-time friction)

Export the user list from Firebase (`firebase auth:export users.json` with the Firebase CLI), transform it to Cognito's CSV format, and import it via Cognito → **Users** → **Import users**. Imported users get status `RESET_REQUIRED` — on first login they must use "Forgot password" once. Google users still just sign in with Google.

- Simpler, no Lambda. The cost is one "reset your password" email per email/password user.
- Fine if you have a small user base or most users are Google sign-in.

**Recommendation:** if most of your users sign in with Google (likely, since Google is the primary button), **Option B** is the pragmatic choice — the handful of email/password users do one password reset. If you have a large email/password base, do **Option A**.

Either way: the `users` **data** (access status, admin flag, storage) was already copied to DynamoDB in §3.5, keyed by `uid`. ⚠️ **Caveat:** Cognito assigns each user a **new `sub`** that is *not* the same as the old Firebase `uid`. So after user migration you must reconcile: keep an `email` attribute on every `chopchopmol-users` item, and on a user's first Cognito login, have the backend look up the old record **by email**, copy its `status`/`isAdmin`/`storageUsed` onto a new item keyed by the new Cognito `sub`, and re-key that user's molecules/folders/conversations from old `uid` → new `sub`. The migration script `migrate_firestore_to_dynamodb.py` writes an `email` attribute on every record specifically so this lookup is possible. (If you do Option A, the Lambda is the natural place to do this re-keying.)

---

<a name="part-5--frontend-hosting"></a>
# PART 5 — Frontend hosting on S3 + CloudFront (replaces Firebase Hosting)

**Goal:** serve the `demo/` static files from S3 through CloudFront at `https://www.chopchopmol.com`, with HTTPS from ACM.

<a name="51-create-the-s3-bucket"></a>
## 5.1 Create the S3 bucket

1. Console → search **`S3`** → **Create bucket**.
2. **Bucket name**: `chopchopmol-frontend` (must be globally unique — if taken, use `chopchopmol-frontend-prod` or similar; remember what you chose).
3. **Region**: **US East (N. Virginia) us-east-1**.
4. **Block Public Access**: **leave ALL four boxes checked** (bucket stays private — CloudFront reaches it through a secure "Origin Access Control", not public access).
5. Leave the rest default. Click **Create bucket**.

<a name="52-request-the-https-certificate"></a>
## 5.2 Request the HTTPS certificate (ACM)

⚠️ **The certificate MUST be in `us-east-1`** regardless of anything else — CloudFront only reads certificates from `us-east-1`. Confirm the Console region selector says **N. Virginia**.

1. Console → search **`Certificate Manager`** → **Request a certificate** → **Request a public certificate** → **Next**.
2. **Fully qualified domain name**: enter `www.chopchopmol.com`. Click **Add another name to this certificate** and add `chopchopmol.com` too (covers the apex for later).
3. **Validation method**: **DNS validation**. Click **Request**.
4. You land on the certificate's page with status **Pending validation**. Expand the domain rows — each shows a **CNAME name** and **CNAME value** for validation.
5. Add those CNAME records in **Squarespace** (Domains → chopchopmol.com → DNS → Custom Records → Add Record): **Type** `CNAME`, **Host** = the part of the CNAME name *before* `.chopchopmol.com`, **Data** = the CNAME value. One record per domain on the cert.
6. Wait 5–30 minutes. The ACM certificate status flips to **Issued**. **Copy the certificate ARN** (`arn:aws:acm:us-east-1:...`).

<a name="53-create-the-cloudfront-distribution"></a>
## 5.3 Create the CloudFront distribution

1. Console → search **`CloudFront`** → **Create distribution**.
2. **Origin → Origin domain**: click the field; in the dropdown pick your **`chopchopmol-frontend`** S3 bucket. AWS will show a banner about restricting bucket access.
3. **Origin access**: choose **Origin access control settings (recommended)** → click **Create new OAC** → keep defaults → **Create**. (This is what lets CloudFront read the private bucket.)
4. **Default cache behavior**:
   - **Viewer protocol policy**: **Redirect HTTP to HTTPS**.
   - **Allowed HTTP methods**: **GET, HEAD** is enough for a static site.
5. **Web Application Firewall**: "Do not enable" is fine to start.
6. **Settings**:
   - **Alternate domain name (CNAME)**: add `www.chopchopmol.com` (and `chopchopmol.com` if you want the cert to cover both).
   - **Custom SSL certificate**: select the ACM certificate you issued in §5.2.
   - **Default root object**: `index.html`.
7. Click **Create distribution**.
8. After creating, AWS shows a banner: **"The S3 bucket policy needs to be updated"** → click **Copy policy**, then **go to the S3 bucket permissions and paste it** — OR just apply the companion file `ChopChopMol-2.0/aws/s3-bucket-policy.json` (edit the bucket name and your account id in it first): S3 → `chopchopmol-frontend` → **Permissions** tab → **Bucket policy** → **Edit** → paste → **Save**.
9. Wait for the distribution **Status** to become **Enabled** (~5–15 min). **Copy the distribution domain name** — looks like `d1234abcd.cloudfront.net` → call it `CLOUDFRONT_DOMAIN`.

<a name="54-spa-routing--security-headers"></a>
## 5.4 SPA routing + security headers

Your app relies on Firebase Hosting's rewrite ("send every path to `/index.html`"). CloudFront needs the equivalent, plus you should reproduce the Content-Security-Policy that's currently in `firebase.json`.

### 5.4a SPA routing — the easy way

Your `firebase.json` rewrites `**` → `/index.html`. The simplest faithful equivalent on CloudFront: in the distribution's **Error pages** tab, click **Create custom error response** twice:

- HTTP error code **403**, **Customize error response: Yes**, response page path `/index.html`, HTTP response code **200**.
- HTTP error code **404**, **Customize error response: Yes**, response page path `/index.html`, HTTP response code **200**.

That makes any unknown path serve `index.html` — same behavior as the Firebase rewrite.

> A cleaner alternative is a **CloudFront Function** on the viewer-request event that rewrites extension-less paths to `/index.html`. I included one as `ChopChopMol-2.0/aws/cloudfront-spa-rewrite.js` if you'd rather do it that way (CloudFront → **Functions** → create, paste, publish, then attach to the distribution's default behavior under **Function associations → Viewer request**). The error-pages method above is good enough for most apps.

### 5.4b Security headers (CSP)

`demo/firebase.json` currently sets a big `Content-Security-Policy` header. Recreate it as a CloudFront **Response headers policy**:

1. CloudFront → **Policies** → **Response headers** → **Create response headers policy**.
2. Name: `chopchopmol-headers`.
3. Under **Security headers**, enable **Content-Security-Policy** and paste your CSP string — but **edit it** for the new world (see [Appendix B](#appendix-b--every-hardcoded-url-to-change)): **remove** `*.onrender.com`, `*.runpod.io`, `*.firebaseio.com`, `firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `*.firebaseapp.com`; **add** `https://api.chopchopmol.com` and your `COGNITO_DOMAIN` to `connect-src`, and `COGNITO_DOMAIN` to `frame-src` (the hosted UI). Keep the CDN entries (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, fonts) and — if you kept them per [§1](#1-decisions) — the AdSense/Analytics entries.
4. Attach the policy: distribution → **Behaviors** → edit the default behavior → **Response headers policy** → select `chopchopmol-headers` → save.

<a name="55-deploy-the-site"></a>
## 5.5 Deploy the site

The companion script `ChopChopMol-2.0/aws/deploy-frontend.sh` syncs the right files to S3 and invalidates the CloudFront cache. Edit the two variables at its top (`BUCKET` and `DISTRIBUTION_ID` — get the distribution id from the CloudFront console), then:

```bash
cd /Users/nguyenpham/Downloads/ChopChopMol-2.0
bash aws/deploy-frontend.sh
```

It uploads `demo/` (and the other static assets the site needs), sets long cache lifetimes on static assets but `no-cache` on `index.html`, and runs a CloudFront invalidation so changes show up immediately.

Test before touching DNS: open `https://CLOUDFRONT_DOMAIN` (the `d1234abcd.cloudfront.net` URL) in your browser. The whole app should load and work — sign-in (Cognito), molecule saving (DynamoDB via your backend), and AI chat (EC2 backend). Fix anything broken **now**, while the real domain still points at Firebase.

<a name="56-point-the-domain-at-cloudfront"></a>
## 5.6 Point `chopchopmol.com` at CloudFront (Squarespace DNS)

Once `https://CLOUDFRONT_DOMAIN` works perfectly:

1. **Squarespace** → Domains → `chopchopmol.com` → **DNS** → **Custom Records**.
2. **Find and remove** the existing record(s) that point `www` (and/or the apex) at Firebase Hosting — Firebase Hosting uses `A` records to Google IPs (commonly `199.36.158.100` and similar) or a `CNAME`. Delete those.
3. **Add** a record: **Host** `www`, **Type** `CNAME`, **Data** `CLOUDFRONT_DOMAIN` (e.g. `d1234abcd.cloudfront.net`). Save.
4. **The apex** (`chopchopmol.com` with nothing in front): you cannot CNAME it. Use Squarespace's domain forwarding instead — Domains → `chopchopmol.com` → look for **Domain Forwarding** (or **URL Redirect**) → forward `chopchopmol.com` → `https://www.chopchopmol.com`, type **Permanent (301)**.
5. Wait for DNS to propagate (minutes to a couple hours). Verify:
   ```bash
   dig www.chopchopmol.com +short        # should show the cloudfront.net domain / its IPs
   curl -I https://www.chopchopmol.com   # should be 200, served by CloudFront
   ```

> **`api.chopchopmol.com`** was already pointed at the EC2 box in §2.5 — leave that record alone.

---

<a name="part-6--cutover"></a>
# PART 6 — Cutover, verification, and decommissioning

### 6.1 Pre-cutover checklist

Don't decommission anything until **all** of these pass on `https://www.chopchopmol.com`:

- [ ] The page loads, no console errors, CSP not blocking anything.
- [ ] **Sign in with Google** works → lands signed-in.
- [ ] **Email/password** sign-in works (test a migrated account, and "forgot password").
- [ ] Browser console logs `Backend: AWS`.
- [ ] Load a molecule file → renders in 3D.
- [ ] Run a **MACE energy** calculation → returns numbers (proves the GPU path).
- [ ] Run an **AI chat** command that calls a tool → streams correctly (proves SSE through Caddy).
- [ ] **Save a molecule**, reload the page → it's still there (proves DynamoDB write+read).
- [ ] Create a **folder**, move a molecule into it → persists.
- [ ] Have an AI conversation, reload → it reloads from history (proves conversations table).
- [ ] The **access gate** behaves: `REQUIRE_AUTH=true`, a non-approved account is blocked, an approved one isn't, an admin sees admin UI.
- [ ] Reboot the EC2 instance (`sudo reboot`) → backend comes back up by itself.

### 6.2 The cutover sequence (the safe order)

1. Do **Parts 1–5** with the real domain still on Firebase. Test everything via the `*.cloudfront.net` and `api.chopchopmol.com` URLs.
2. Re-run `migrate_firestore_to_dynamodb.py` one final time to catch any data users created during the transition.
3. Flip DNS (§5.6). Both old and new now coexist briefly because DNS is cached — that's fine, the data is in sync from step 2.
4. Watch for 24–48 hours. Keep Render/RunPod/Firebase **alive but unused** as an instant rollback.

### 6.3 Rollback (if something is wrong)

- **Backend bad?** In `apiUtils.js`, the Render fallback is still wired — or just flip the manual switch. Revert and `firebase deploy` (Firebase Hosting is still up until §6.4).
- **Frontend bad?** In Squarespace, point `www` back at the old Firebase records. (Note them down *before* you delete them in §5.6.)
- **Data bad?** Firestore is untouched and read-only-from-your-side during migration — nothing was deleted there. Point the frontend back at Firebase.

Because nothing old is *deleted* until §6.4, every part is reversible.

### 6.4 Decommission (after 48+ hours of clean running)

1. **RunPod** — stop/terminate the pod. Cancel if billed.
2. **Render** — dashboard → `chopchopmol-ai-backend` service → **Settings** → **Delete**. Same for `chopchopmol-2-0-3` *once Appendix C is resolved*.
3. **Firebase** — once you're certain DynamoDB + Cognito are solid: in the Firebase console you can **disable** Hosting, Firestore, and Auth (or delete the project). **Keep the final `users.json` export and a Firestore export as a cold backup for a few months** before fully deleting.
4. **Stripe** — delete `demo/utils/stripe.js`, remove its `<script>` tag from `index.html`, and remove `js.stripe.com` / `hooks.stripe.com` / `checkout.chopchopmol.com` from the CSP. It was a no-op stub; nothing breaks.
5. Delete `demo/firebase.json`, `demo/.firebaserc`, `.firebaserc`, `demo/firestore.rules`, `demo/firestore.indexes.json` from the repo. Remove the `firebase` dependency from `demo/package.json`. Commit.
6. Cancel the Render/RunPod billing and remove saved payment methods.

You are now on **Squarespace (DNS) + GitHub (code) + AWS (everything else)**.

---

<a name="part-7--operations"></a>
# PART 7 — Operations

### 7.1 Cost management

**Stop the instance when you don't need it.** The GPU box is ~$0.526/hr; stopped, you pay only ~$0.12/day for the disk + idle Elastic IP. Companion scripts (put them on your Mac, `chmod +x` them):

```bash
# ~/chopchopmol-stop.sh
aws ec2 stop-instances --instance-ids INSTANCE_ID

# ~/chopchopmol-start.sh
aws ec2 start-instances --instance-ids INSTANCE_ID
aws ec2 wait instance-running --instance-ids INSTANCE_ID
echo "Backend coming up at https://api.chopchopmol.com (give it ~60s)"
```

The Elastic IP, the DNS records, the container, and Caddy all survive a stop/start — the box comes back exactly as it was.

**Spot instances** cut the compute bill ~60–70% (~$110–150/mo always-on) at the cost of possible interruption. To use one, add `--instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"persistent","InstanceInterruptionBehavior":"stop"}}'` to the §2.3b `run-instances` command. `"stop"` (not "terminate") preserves your disk when AWS reclaims capacity.

**Reserved instance / Savings Plan** — if you'll run 24/7 for a year, a 1-year commitment saves ~40% (~$230/mo). Buy under EC2 console → **Reserved Instances** or **Savings Plans**.

### 7.2 Updating the backend

You push code to GitHub, then on the server:

```bash
cd ~/chopchopmol-ai-backend && git pull
docker build -t chopchopmol-backend:latest .
cd aws && docker compose up -d        # recreates the container with the new image
```

The companion `update-backend.sh` does these three lines. Downloaded MACE models and fine-tuned models survive because they're on the mounted `/data` volume.

### 7.3 Updating the frontend

On your Mac: `cd ChopChopMol-2.0 && bash aws/deploy-frontend.sh`. It syncs to S3 and invalidates CloudFront. Changes are live in ~30 seconds.

### 7.4 Monitoring

- **GPU**: SSH in → `nvidia-smi`, or `watch -n 1 nvidia-smi`.
- **Container**: `docker compose -f ~/chopchopmol-ai-backend/aws/docker-compose.yml logs -f`.
- **Caddy / HTTPS**: `sudo journalctl -u caddy -f`.
- **CloudWatch**: EC2 → your instance → **Monitoring** tab for CPU, network, disk. Set a CloudWatch alarm on `StatusCheckFailed` to email you if the box goes unhealthy.
- **DynamoDB**: console → table → **Monitor** tab (read/write usage, throttles — you shouldn't see throttles on on-demand).

### 7.5 Troubleshooting

| Symptom | Fix |
|---|---|
| `VcpuLimitExceeded` when launching | The §1.5 quota isn't approved yet. Wait for the email, or check Service Quotas console. |
| `nvidia-smi`: command not found / failed | Driver didn't install. `sudo apt-get purge -y 'nvidia-*' && sudo apt-get autoremove -y && sudo apt-get install -y nvidia-driver-550 && sudo reboot`. |
| Container exits immediately | `docker compose logs` — usually a bad/missing key in `~/chopchopmol.env`, or out of disk (`df -h`). |
| `docker run --gpus all` fails | NVIDIA Container Toolkit step (§2.8d) — re-run `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`. |
| Caddy: "certificate not yet obtained" | DNS not propagated (`dig api.chopchopmol.com +short`), or port 80 closed in the security group. `sudo journalctl -u caddy -n 100`. |
| Frontend CORS errors | The backend's Flask-CORS already allows all origins. If you still see CORS errors, the request isn't reaching Flask — check Caddy is proxying (`curl -I https://api.chopchopmol.com/health`). |
| SSE / streaming chat hangs | Caddy's `flush_interval -1` on the stream paths — confirm `/etc/caddy/Caddyfile` matches the companion file and `sudo systemctl restart caddy`. |
| OOM during big MACE/DFT/MD jobs | g4dn.xlarge has 16 GB RAM. Stop the instance, change instance type to `g4dn.2xlarge` (32 GB) in the EC2 console, start again. Or add swap (`sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`). |
| Cognito login loops / "redirect_mismatch" | The callback URL in the app client (§4.3) must **exactly** match `REDIRECT_URI` in `auth-cognito.js`, including the trailing slash. |
| `401` from the data API | Token expired or not sent. Make sure the frontend does `await getIdToken()` immediately before the request, not a cached value. |
| DynamoDB `AccessDeniedException` from the backend | The instance role (§3.3) isn't attached or its policy is wrong. `aws sts get-caller-identity` on the box should show the role ARN. |

### 7.6 Full teardown (if you ever want to undo everything)

```bash
aws ec2 terminate-instances --instance-ids INSTANCE_ID
aws ec2 wait instance-terminated --instance-ids INSTANCE_ID
aws ec2 release-address --allocation-id EIPALLOC_ID
aws ec2 delete-security-group --group-id SG_ID
aws ec2 delete-key-pair --key-name chopchopmol-key && rm ~/.ssh/chopchopmol-key.pem
# DynamoDB tables, the S3 bucket, the CloudFront distribution, the Cognito pool,
# and the ACM cert are each deleted from their own console pages.
```

---

<a name="appendix-a--every-environment-variable"></a>
## Appendix A — Every environment variable the backend reads

From a full read of `app.py`. Set these in `~/chopchopmol.env` on the server.

| Variable | Default | Needed? | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | — | **yes** | Claude API key. |
| `OPENAI_API_KEY` | — | **yes** | GPT API key (also used for Whisper transcription). |
| `TAVILY_API_KEY` | — | optional | Web search tool. |
| `PORT` | `10000` | no | Flask/gunicorn bind port. Leave at 10000 (Caddy + compose assume it). |
| `MACE_FINETUNE_DIR` | `/tmp/mace_finetuned` | **set it** | Fine-tuned model output. Point at `/data/mace_finetuned` so it survives restarts. |
| `MACE_CACHE_DIR` | — | **set it** | Downloaded MACE foundation model cache. Point at `/data/torch_cache`. |
| `TORCH_HOME` | `~/.cache/torch` | no | Auto-set from `MACE_CACHE_DIR`. |
| `REQUIRE_AUTH` | `false` | **yes** | `true` once Cognito is wired (Part 4). The real access gate. |
| `COGNITO_USER_POOL_ID` | — | **yes (Part 4)** | From §4.1. Used to verify JWTs. |
| `COGNITO_APP_CLIENT_ID` | — | **yes (Part 4)** | From §4.3. JWT audience check. |
| `AWS_REGION` | — | **yes (Parts 3–4)** | `us-east-1`. Used by boto3 + Cognito JWKS URL. |
| `DDB_USERS_TABLE` etc. | `chopchopmol-*` | no | Only if you renamed the DynamoDB tables. |
| `GRANDFATHER_BEFORE_MS` | — | optional | Users created before this epoch-ms auto-approve. |
| `ACCESS_APP_URL` | `https://chopchopmol-2.web.app` | **update** | Set to `https://www.chopchopmol.com` — used in access-request emails. |
| `ACCESS_FROM_EMAIL` | `noreply@guavion.com` | optional | Sender for access emails. |
| `ACCESS_FOUNDER_EMAILS` | — | optional | Comma-separated emails that auto-approve. |
| `GUEST_BYPASS_CODE` | `0987` | optional | `X-Guest-Code` header value that bypasses the gate. Set empty to disable. |
| `RESEND_API_KEY` | — | optional | Email delivery (access requests). |
| `SLACK_WEBHOOK_URL` | — | optional | Admin notifications. |
| `ADMIN_TOKEN` | — | optional | Protects `/access/*` admin endpoints. |
| `MACE_COMPILE` | `1` | no | `torch.compile` fallback. Leave default. |
| `MACE_AUTOCAST` | — | no | `""` or `bf16`. Leave default. |
| `FIREBASE_SERVICE_ACCOUNT` / `FIREBASE_SERVICE_ACCOUNT_PATH` / `GOOGLE_APPLICATION_CREDENTIALS` | — | **delete after Part 4** | Old Firebase admin auth. Remove once Cognito is live. |

> The `start.sh` inside the container also sets threading/CUDA tuning vars (`OMP_NUM_THREADS=1`, `PYTORCH_CUDA_ALLOC_CONF=...`, etc.) — those are baked into the image, you don't set them yourself.

<a name="appendix-b--every-hardcoded-url-to-change"></a>
## Appendix B — Every hardcoded URL / credential to change in the frontend

From a full read of `demo/`. 

| File | ~Line | Today | Change to |
|---|---|---|---|
| `demo/utils/apiUtils.js` | 10–15 | `RUNPOD_URL`, `RENDER_URL`, `LOCAL_URL` consts | `AWS_URL = 'https://api.chopchopmol.com'` (§2.12) |
| `demo/utils/apiUtils.js` | 43–74 | `getBackendUrl()` probes RunPod then Render | Probe AWS, fall back to Render during transition (§2.12) |
| `demo/utils/apiUtils.js` | 172–189 | manual switcher `1:runpod 2:render 3:local` | `1:AWS 2:Render 3:Local` |
| `demo/index.html` | ~2074, 2099, 2122 | `chopchopmol-2-0-3.onrender.com/chat`, `/tosmiles`, `/analysis` | See [Appendix C](#appendix-c--the-secondary-service) |
| `demo/index.html` | ~5274 | `getBackendUrl()` fallback `chopchopmol-ai-backend.onrender.com` | `https://api.chopchopmol.com` |
| `demo/index.html` | 329–332 | Firebase SDK imports (`firebase-app/-auth/-firestore/-analytics`) | Remove; add `auth-cognito.js` import (Parts 3–4). Keep/remove analytics per [§1](#1-decisions). |
| `demo/index.html` | 334–342 | `firebaseConfig` object (apiKey, authDomain, projectId, …) | Delete — replaced by Cognito config in `auth-cognito.js` |
| `demo/index.html` | 344–352 | `initializeApp` / `getAuth` / `getFirestore` / `getAnalytics` / `window.firebaseDB` | Delete (auth → Cognito, db → `dataApi`) |
| `demo/index.html` | 369, 475–633, 1213–1231 | Firebase Auth flows + `onAuthStateChanged` / `onIdTokenChanged` | Cognito hosted-UI flow (§4.5) |
| `demo/index.html` | ~700–1200 | All Firestore reads/writes (`users`, `molecules`, `folders`, `conversations`) | `dataApi(...)` calls (§3.6) |
| `demo/admin.html` | 116–138 | `firebaseConfig` + Firebase Auth | Cognito (§4.5 step 4) |
| `demo/set-password.html` | 109–118 | `firebaseConfig` + Firebase Auth | Delete page — Cognito hosted UI handles password reset |
| `demo/early-access-embed.html` | ~73 | `chopchopmol-ai-backend.onrender.com` | `https://api.chopchopmol.com` |
| `demo/firebase.json` | 28 | CSP allowlists onrender/runpod/firebase domains | Move CSP to CloudFront response-headers policy; swap domains (§5.4b). Then delete the file. |
| `demo/firestore.rules`, `demo/firestore.indexes.json`, `demo/.firebaserc`, `.firebaserc` | — | Firebase config files | Delete (§6.4 step 5) |
| `demo/utils/stripe.js` + its `<script>` in `index.html` | — | No-op Stripe stub | Delete (§6.4 step 4) |
| `demo/package.json` | — | `"firebase": "^12.0.0"` dependency | Remove |

**Credentials currently hardcoded in the frontend** (these are *public* by design — the Firebase web API key and AdSense ID are meant to be in client code — but they go away with Firebase):
- Firebase web API key `AIzaSyAAlbmJmNxVGJ3wv1KiyoFWJ86Ik31jY-w`, project `chopchopmol-2`, measurement ID `G-9T7NPR755W` — removed with Firebase.
- AdSense publisher `ca-pub-7912318580869252` — keep or remove per [§1](#1-decisions).

**Third-party CDN scripts** (`cdn.jsdelivr.net` → three.js, chart.js, marked, vad-web; `cdnjs.cloudflare.com` → Font Awesome; `unpkg.com` → undo-manager; Google Fonts): these load JS libraries, not "services you depend on" — no account, no billing, no data. You can leave them. If you want **zero** third-party origins, download those library files into `demo/vendor/` and serve them from your own S3/CloudFront, then update the `<script>`/`importmap` URLs. Optional; not required for the migration.

<a name="appendix-c--the-secondary-service"></a>
## Appendix C — The `chopchopmol-2-0-3` mystery service

`demo/index.html` calls `https://chopchopmol-2-0-3.onrender.com` at three places:

- line ~2074 — `POST /chat` — the old "Generate Molecule" text panel (`sendChatMessage()`).
- line ~2099 — `POST /tosmiles` — SMILES → structure (`convertToJson()`).
- line ~2122 — `POST /analysis` — molecule image analysis (`analyzeMolecule()`).

**The source code for this service is not in any of your local repos** (`chopchopmol-ai-backend`, `ChopChopMol 3.0`, `ChopChopMol Backend`, `Guavion` — I checked; none define `/tosmiles` or `/analysis`). It's a separate Render deployment named "2.0.3". Before you can fully leave Render you must resolve it. Three options:

1. **Find its repo and migrate it like the main backend.** It's almost certainly a small Flask/FastAPI app in one of your GitHub repos. Once you find it, you can run it as a *second container on the same EC2 box* — add a service block to `docker-compose.yml` and a second `Caddyfile` site block (e.g. `tools.chopchopmol.com` or a path prefix). No new instance needed.
2. **Fold those three endpoints into the main backend.** If they're simple (a SMILES library call + an LLM prompt), reimplement `/chat`, `/tosmiles`, `/analysis` directly in `app.py`. Then point the three `index.html` calls at `https://api.chopchopmol.com`. This is the cleanest end state — one backend.
3. **Remove the features** if they're dead. The main AI chat (`aiagent.js` → `api.chopchopmol.com`) is the primary interface; these three look like older standalone panels. If you confirm they're unused, delete `sendChatMessage()`, `convertToJson()`, `analyzeMolecule()` and their UI panels.

**Recommendation:** option 2 if the endpoints are small, option 1 if not, option 3 if the features are abandoned. This is the one thing I couldn't do for you because the code isn't on disk — decide during Part 6, it doesn't block Parts 1–5.

---

<a name="companion-files-index"></a>
## Companion files index

I created these alongside the guide. Paths are relative to each repo root.

### In `chopchopmol-ai-backend/aws/`
| File | What it is | Used in |
|---|---|---|
| `chopchopmol.env.example` | Template for `~/chopchopmol.env` — every variable, commented. | §2.10b |
| `docker-compose.yml` | Runs the backend container: GPU, `/data` volume mount, env file, auto-restart. | §2.10c |
| `Caddyfile` | HTTPS reverse proxy for `api.chopchopmol.com`, with SSE-safe streaming config. | §2.11 |
| `update-backend.sh` | `git pull` + `docker build` + `docker compose up -d`. | §7.2 |
| `dynamodb-create-tables.sh` | Creates the 5 DynamoDB tables (on-demand capacity). | §3.2 |
| `iam-ec2-policy.json` | IAM policy: lets the EC2 role read/write only the `chopchopmol-*` tables. | §3.3 |
| `data_store.py` | boto3 data layer — drop-in module, one function per DB operation. | §3.4 |
| `cognito_auth.py` | Cognito JWT verification — `verify_cognito_token()`, `get_current_uid()`. | §4.4 |
| `migrate_firestore_to_dynamodb.py` | One-time Firestore → DynamoDB data copy. Idempotent. | §3.5 |

### In `ChopChopMol-2.0/aws/`
| File | What it is | Used in |
|---|---|---|
| `deploy-frontend.sh` | Syncs `demo/` to S3, sets cache headers, invalidates CloudFront. | §5.5, §7.3 |
| `s3-bucket-policy.json` | Bucket policy allowing only your CloudFront distribution (OAC) to read. | §5.3 |
| `iam-deploy-user-policy.json` | Minimal IAM policy for a CI/deploy user (S3 + CloudFront invalidation only). | optional |
| `cloudfront-spa-rewrite.js` | CloudFront Function for SPA routing (alternative to the error-pages method). | §5.4a |
| `auth-cognito.js` | Frontend auth module — hosted-UI redirect, token exchange, refresh, logout. | §4.5 |

> The companion files are infrastructure config and reference implementations. The `.py` and `.js` modules are written to match your codebase's patterns but **must be wired in and tested by you** — they are deliberately *new files*, not edits to your live `app.py` / `index.html`, so nothing in your running app changes until you choose to integrate them following Parts 3–5.

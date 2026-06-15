# Deploy Bubble V2

Target:

- Domain: `bubblev2.site`
- VPS IP: `141.11.25.59`
- App directory: `/var/www/bubblev2`

## DNS

Atur DNS domain:

- `A` record `@` -> `141.11.25.59`
- `A` record `www` -> `141.11.25.59`

## Auto Deploy

Alurnya:

```text
VS Code -> GitHub -> VPS
```

Setiap push ke branch `main`, GitHub Actions akan SSH ke VPS, pull code terbaru,
install dependency, lalu restart PM2.

## 1. Buat SSH Key Di VPS

Jalankan di VPS:

```bash
ssh-keygen -t ed25519 -N "" -C "github-deploy-bubblev2" -f ~/.ssh/github_deploy_bubblev2
cat ~/.ssh/github_deploy_bubblev2.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy_bubblev2
```

Copy output private key dari command terakhir, mulai dari:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
```

sampai:

```text
-----END OPENSSH PRIVATE KEY-----
```

## 2. Buat Secret GitHub

Buka GitHub repo:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Name:

```text
MAIN
```

Secret:

```text
VPS_HOST=141.11.25.59
VPS_USER=root
VPS_PORT=22
VPS_SSH_KEY<<EOF
-----BEGIN OPENSSH PRIVATE KEY-----
PASTE_PRIVATE_KEY_DARI_VPS_DI_SINI
-----END OPENSSH PRIVATE KEY-----
EOF
```

Klik `Add secret`.

## 3. Test Dari VS Code

Dari PowerShell lokal di folder project:

```powershell
.\scripts\auto-push.ps1 "test auto deploy"
```

Lalu buka GitHub tab `Actions`. Kalau hijau, auto deploy berhasil.

## Manual Update Jika Dibutuhkan

Jalankan di VPS:

```bash
cd /var/www/bubblev2
git fetch --all
git reset --hard origin/main
npm install --production
pm2 restart bubblev2 || pm2 start ecosystem.config.js
pm2 save
```

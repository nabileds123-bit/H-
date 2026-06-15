# Deploy Bubble V2

Target:

- Domain: `bubblev2.site`
- VPS IP: `141.11.25.59`
- App port: `8080`
- App directory: `/var/www/bubblev2`

## 1. DNS

Atur DNS domain:

- `A` record `@` -> `141.11.25.59`
- `A` record `www` -> `141.11.25.59`

Tunggu propagasi DNS sebelum menjalankan SSL.

## 2. VPS Setup

Login ke VPS, lalu install dependency dasar:

```bash
sudo apt update
sudo apt install -y git nginx nodejs npm certbot python3-certbot-nginx
sudo npm install -g pm2
```

Clone atau update code:

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER:$USER" /var/www
git clone https://github.com/nabileds123-bit/COBA.git /var/www/bubblev2
cd /var/www/bubblev2
npm install --production
cp .env.production.example .env
```

Edit `.env` dan isi SMTP jika fitur email dipakai.

## 3. Start App

```bash
cd /var/www/bubblev2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Jika `pm2 startup` menampilkan command tambahan, jalankan command itu juga.

## 4. Nginx

```bash
sudo cp /var/www/bubblev2/deploy/nginx-bubblev2.site.conf /etc/nginx/sites-available/bubblev2.site
sudo ln -s /etc/nginx/sites-available/bubblev2.site /etc/nginx/sites-enabled/bubblev2.site
sudo nginx -t
sudo systemctl reload nginx
```

## 5. SSL

Jalankan setelah DNS mengarah ke VPS:

```bash
sudo certbot --nginx -d bubblev2.site -d www.bubblev2.site
```

Setelah SSL aktif, buka:

```text
https://bubblev2.site
```

## 6. Auto Pull Saat Push

Repo ini punya GitHub Actions workflow di `.github/workflows/deploy.yml`.
Setiap ada push ke branch `main`, GitHub akan SSH ke VPS lalu update app di
`/var/www/bubblev2`.

Di VPS, buat SSH key khusus deploy:

```bash
ssh-keygen -t ed25519 -C "github-deploy-bubblev2" -f ~/.ssh/github_deploy_bubblev2
cat ~/.ssh/github_deploy_bubblev2.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy_bubblev2
```

Copy isi private key yang tampil dari command terakhir, termasuk baris:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

Di GitHub repo, buka `Settings` -> `Secrets and variables` -> `Actions` ->
`New repository secret`, lalu buat:

- `VPS_HOST` = `141.11.25.59`
- `VPS_USER` = `root`
- `VPS_PORT` = `22`
- `VPS_SSH_KEY` = isi private key `~/.ssh/github_deploy_bubblev2`

Setelah itu, setiap commit yang di-push ke `main` akan otomatis pull/restart di
VPS.

## 7. Auto Push Dari Lokal

Dari Windows PowerShell di folder project:

```powershell
.\scripts\auto-push.ps1 "Pesan commit kamu"
```

Script ini akan menjalankan:

- `git add -A`
- `git commit -m "..."`
- `git push`

Setelah push berhasil, workflow GitHub Actions otomatis deploy ke VPS.

## 8. Manual Update Jika Dibutuhkan

```bash
cd /var/www/bubblev2
git fetch origin main
git reset --hard origin/main
npm install --production
pm2 restart bubblev2
```

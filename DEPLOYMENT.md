# Deploy Bubble V2

Target:

- Domain: `bubblev2.site`
- VPS IP: `103.93.129.69`
- App directory: `/var/www/bubblev2`

## DNS

Atur DNS domain:

- `A` record `@` -> `103.93.129.69`
- `A` record `www` -> `103.93.129.69`

## Setup VPS Baru

Jalankan di VPS sebagai `root`:

```bash
apt update
apt install -y git nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

mkdir -p /var/www
cd /var/www
git clone https://github.com/nabileds123-bit/H-.git bubblev2
cd /var/www/bubblev2
npm install --omit=dev
cp .env.production.example .env
nano .env
```

Start aplikasi:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Ikuti command yang muncul dari `pm2 startup`, lalu jalankan lagi:

```bash
pm2 save
```

Setup Nginx:

```bash
cp /var/www/bubblev2/deploy/nginx-bubblev2.site.conf /etc/nginx/sites-available/bubblev2.site
ln -sf /etc/nginx/sites-available/bubblev2.site /etc/nginx/sites-enabled/bubblev2.site
nginx -t
systemctl reload nginx
```

Opsional HTTPS:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d bubblev2.site -d www.bubblev2.site
```

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

Secrets:

```text
VPS_HOST=103.93.129.69
VPS_USER=root
VPS_PORT=22
VPS_SSH_KEY_B64=<private-key-yang-sudah-di-base64>
```

Untuk membuat isi `VPS_SSH_KEY_B64`, jalankan di VPS:

```bash
base64 -w 0 ~/.ssh/github_deploy_bubblev2
```

Buat secret satu per satu, lalu klik `Add secret`.

## 3. Test Dari VS Code

Dari PowerShell lokal di folder project:

```powershell
.\scripts\auto-push.ps1 "test auto deploy"
```

Lalu buka GitHub tab `Actions`. Kalau hijau, auto deploy berhasil.

## Admin Panel

Admin panel tersedia di:

```text
https://bubblev2.site/admin
```

Set password admin di file `.env` VPS:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ganti_password_panjang
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_BUCKET=skins
```

Lalu restart:

```bash
pm2 restart bubblev2
```

Saat `maintenanceMode = 1`, hanya browser yang sudah login admin di `/admin` yang bisa membuka game. Alurnya:

1. Buka `https://bubblev2.site/admin`
2. Login admin
3. Buka `https://bubblev2.site/` di browser yang sama

Link `?maintenanceKey=...` tidak dipakai untuk bypass publik.

Session admin tersimpan sampai 30 hari dan tetap hidup setelah PM2 restart. Klik `Logout` di admin panel untuk mencabut akses browser tersebut.

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

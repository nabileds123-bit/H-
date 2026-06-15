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
VPS_HOST=103.93.129.69
VPS_USER=lyncervps
VPS_PORT=22
VPS_SSH_KEY<<EOF
EOF
```

Klik `Add secret`.

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

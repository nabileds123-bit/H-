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

## 6. Update Deploy Berikutnya

```bash
cd /var/www/bubblev2
git pull
npm install --production
pm2 restart bubblev2
```

# LumindaRentals — Production Deployment Reference

## Stack
- **Backend**: Django 6 + Gunicorn (port 8000)
- **Frontend**: Next.js (port 3000)
- **Database**: PostgreSQL
- **Cache / Queue**: Redis + Celery
- **Static files**: WhiteNoise (served by Django/Gunicorn directly)
- **Reverse proxy**: Nginx (handles SSL, routes /api/* and /media/* to Django, everything else to Next.js)

## Directory layout on VPS
```
/var/www/lumindarentals/
├── backend/          ← Django project
├── frontend/         ← Next.js project
└── venv/             ← Python virtual environment
```

## Environment variables

### Backend — /var/www/lumindarentals/backend/.env
Copy from `backend/.env.example` and fill in:
```
SECRET_KEY=<generate: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())">
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
FRONTEND_URL=https://yourdomain.com
DATABASE_URL=postgres://lumindarentals:PASSWORD@localhost:5432/lumindarentals_db
REDIS_URL=redis://localhost:6379/0

MPESA_CONSUMER_KEY=<live key>
MPESA_CONSUMER_SECRET=<live key>
MPESA_SHORTCODE=<live shortcode>
MPESA_PASSKEY=<live passkey>
MPESA_CALLBACK_URL=https://yourdomain.com/api/payments/mpesa/callback/

PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_SECRET_KEY=sk_live_...

EMAIL_HOST_USER=nestiumsystems@gmail.com
EMAIL_HOST_PASSWORD=<gmail app password>
DEFAULT_FROM_EMAIL=LumindaRentals <nestiumsystems@gmail.com>

AT_USERNAME=<live africastalking username>
AT_API_KEY=<live key>
AT_SENDER_ID=LumindaRent

VAPID_PUBLIC_KEY=BHwkwmaE9307Snr1YIGtLr0CsAlVHwPtOx6i6osQ-XwkrQR5F5Xfzlk9d7sgPik4p0TjDKFeuHYKf3akvnonsLA
VAPID_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg8sbyKPijvfqBOq7C\nblYb/vJL8bEZzliIB0ZOeMOp0YqhRANCAAR8JMJmhPd9O0p69WCBrS69ArAJVR8D\n7TseouqLEPl8JK0EeReV385ZPXe7ID4pOKdE4wyhXrh2Cn92pL56J7Cw\n-----END PRIVATE KEY-----\n
VAPID_CLAIM_EMAIL=nestiumsystems@gmail.com
```

### Frontend — /var/www/lumindarentals/frontend/.env.production
```
DJANGO_URL=http://127.0.0.1:8000
```
Next.js rewrites proxy /api/* and /media/* to Django on the same server.
The browser never sees this — all API calls use relative URLs.

## Deploy commands (run on VPS)

### First deploy
```bash
# 1. Install system packages
apt update && apt install -y python3-venv python3-pip nodejs npm postgresql redis-server nginx

# 2. Create database
sudo -u postgres psql -c "CREATE USER lumindarentals WITH PASSWORD 'PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE lumindarentals_db OWNER lumindarentals;"

# 3. Clone / upload project to /var/www/lumindarentals/

# 4. Backend setup
cd /var/www/lumindarentals
python3 -m venv venv
venv/bin/pip install -r backend/requirements.txt
cd backend
../venv/bin/python manage.py migrate
../venv/bin/python manage.py collectstatic --noinput
../venv/bin/python manage.py createsuperuser

# 5. Frontend setup
cd /var/www/lumindarentals/frontend
npm ci
npm run build
```

### Subsequent deploys
```bash
cd /var/www/lumindarentals

# Backend
venv/bin/pip install -r backend/requirements.txt
cd backend && ../venv/bin/python manage.py migrate && ../venv/bin/python manage.py collectstatic --noinput
sudo systemctl restart lumindarentals-django lumindarentals-celery

# Frontend
cd /var/www/lumindarentals/frontend && npm ci && npm run build
sudo systemctl restart lumindarentals-nextjs
```

## Systemd service files

### /etc/systemd/system/lumindarentals-django.service
```ini
[Unit]
Description=LumindaRentals Django (Gunicorn)
After=network.target postgresql.service redis.service

[Service]
User=www-data
WorkingDirectory=/var/www/lumindarentals/backend
EnvironmentFile=/var/www/lumindarentals/backend/.env
ExecStart=/var/www/lumindarentals/venv/bin/gunicorn core.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers 3 \
    --timeout 120 \
    --access-logfile /var/log/lumindarentals/django-access.log \
    --error-logfile  /var/log/lumindarentals/django-error.log
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### /etc/systemd/system/lumindarentals-celery.service
```ini
[Unit]
Description=LumindaRentals Celery Worker
After=network.target redis.service

[Service]
User=www-data
WorkingDirectory=/var/www/lumindarentals/backend
EnvironmentFile=/var/www/lumindarentals/backend/.env
ExecStart=/var/www/lumindarentals/venv/bin/celery -A core worker --loglevel=info \
    --logfile=/var/log/lumindarentals/celery.log
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### /etc/systemd/system/lumindarentals-nextjs.service
```ini
[Unit]
Description=LumindaRentals Next.js
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/lumindarentals/frontend
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node node_modules/.bin/next start --port 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Nginx config — /etc/nginx/sites-available/lumindarentals
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 20M;

    # Django — API and media
    location ~ ^/(api|media|admin|static)/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Next.js — everything else
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
```

## SSL — Let's Encrypt
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## After everything is running
```bash
# Enable and start all services
sudo systemctl daemon-reload
sudo systemctl enable --now lumindarentals-django lumindarentals-celery lumindarentals-nextjs
sudo ln -s /etc/nginx/sites-available/lumindarentals /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Important post-deploy checklist
- [ ] Switch M-Pesa keys from sandbox to live (developer.safaricom.co.ke)
- [ ] Switch Paystack keys from test to live (dashboard.paystack.com)
- [ ] Switch Africa's Talking from sandbox to live username
- [ ] Update MPESA_CALLBACK_URL to real domain
- [ ] Set up Cloudflare in front of the domain (free CDN + DDoS)
- [ ] Test login → dashboard on a real phone
- [ ] Test M-Pesa STK push end-to-end
- [ ] Verify push notifications work (requires HTTPS — only works in production)
- [ ] Set up automated PostgreSQL backups (pg_dump cron job)

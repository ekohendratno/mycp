# MyControlPanel Scripts

Folder ini berisi script shell terpisah untuk aksi server yang nantinya dipanggil oleh backend/API control panel.

Semua script yang mengubah server perlu dijalankan sebagai root atau melalui sudo.

## Website

```bash
sudo scripts/site-create.sh \
  --domain example.com \
  --user example \
  --password 'StrongPass123!' \
  --runtime php \
  --php-version 8.3 \
  --database mysql \
  --port 80 \
  --ssl no \
  --ftp yes
```

```bash
sudo scripts/site-update-domain.sh --domain example.com --new-domain app.example.com --root /home/example/htdocs
sudo scripts/site-update-runtime.sh --domain example.com --runtime php --php-version 8.3
sudo scripts/site-change-password.sh --domain example.com --password 'NewPass123!'
sudo scripts/site-delete.sh --domain example.com --delete-user yes --delete-home yes
```

## Detail Website

```bash
sudo scripts/vhost-save.sh --domain example.com --root /home/example/htdocs --runtime php --php-version 8.3
sudo scripts/ssl-issue.sh --domain example.com --email admin@example.com
sudo scripts/database-create.sh --domain example.com --type mysql --database example_db --user example_user --password 'DbPass123!'
sudo scripts/ftp-create.sh --domain example.com --user example_ftp --password 'FtpPass123!' --path /home/example/htdocs
sudo scripts/cron-add.sh --domain example.com --schedule '*/5 * * * *' --command 'php spark queue:work'
sudo scripts/folder-create.sh --domain example.com --path storage/logs
sudo scripts/file-write.sh --domain example.com --path .env --content-file /tmp/new-env.txt
```

## Status

```bash
sudo scripts/status.sh
sudo scripts/site-list.sh
sudo scripts/file-list.sh --domain example.com --path .
sudo scripts/log-read.sh --domain example.com --type access --lines 100
```

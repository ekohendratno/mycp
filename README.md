# MyControlPanel

Prototype control panel hosting Linux dengan tampilan web statis dan kumpulan script server di folder `scripts/`.

## Ujicoba Dari WSL

Clone repo:

```bash
git clone https://github.com/ekohendratno/mycp.git
cd mycp
sudo bash install.sh
```

Atau langsung via curl:

```bash
curl -fsSL https://raw.githubusercontent.com/ekohendratno/mycp/main/install.sh | sudo bash
```

Setelah install:

```text
URL   : http://127.0.0.1:8089/login.html
Login : admin / admin123
User  : srv / srV@1234
```

## Command Server

Installer membuat helper `mycp` yang memanggil script di `/opt/mycontrolpanel/scripts`.

```bash
sudo mycp status
sudo mycp site:list
sudo mycp site:create --domain example.com --user example --password 'StrongPass123!' --runtime php --php-version 8.3 --database mysql --ssl no --ftp yes
sudo mycp db:create --domain example.com --type mysql --database example_db --user example_user --password 'DbPass123!'
sudo mycp cron:add --domain example.com --schedule '*/5 * * * *' --command 'php spark queue:work'
sudo mycp log:read --domain example.com --type access --lines 100
```

## Struktur

- `index.html` daftar website
- `dashboard.html` dashboard server dan terminal mockup
- `detail.html` detail website
- `assets/` CSS dan JavaScript panel
- `scripts/` script shell untuk operasi server
- `install.sh` installer WSL/Ubuntu/Debian

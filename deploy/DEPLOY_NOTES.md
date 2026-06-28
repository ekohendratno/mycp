# Catatan Deploy MyControlPanel

Project MyControlPanel berjalan di berbagai distro Linux via `install.sh`.

## Changelog

| Area                           | Perubahan                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `install.sh`                   | Multi-distro (Debian/Ubuntu/WSL/RHEL/Fedora/Arch) + auto-detect                                 |
| `install.sh`                   | Multi-PHP install via PPA ondrej (Ubuntu) / Sury repo (Debian) / Remi (RHEL)                    |
| `install.sh`                   | NVM untuk Node.js 18/20/22 — di root DAN `APP_USER`                                             |
| `install.sh`                   | Post-install `verify_services()` — auto-start PHP-FPM, buat `/run/php-fpm` & `/var/log/php-fpm` |
| `scripts/phpini-save.sh`       | Auto-fallback ke PHP version yang tersedia jika yang diminta belum terinstall                   |
| `scripts/phpini-save.sh`       | PHP-FPM pool isolation penuh: `open_basedir`, `disable_functions`, memory limit, per-site log   |
| `scripts/lib/common.sh`        | Tambah `warn()` function                                                                        |
| `scripts/exec.js`              | `getInstalledPhpVersions()` + `resolveActualPhpVersion()` untuk fallback detection              |
| `server/` (modular)            | Monolitik `server.js` dipecah ke `server/routes/*.js` (16 file rute)                            |
| `assets/js/detail.js`          | Tampilkan warning banner jika versi yang diminta tidak tersedia                                 |
| `views/detail.ejs`             | Tambah elemen `#phpVersionWarning` + dropdown Runtime/PHP Version sinkron dengan modal          |
| `assets/js/app.js`             | `updateVersionOptions()` auto-select versi sesuai runtime                                       |
| `templates/index.php.template` | Default Hello World landing page dengan info PHP version                                        |

## Distro Didukung

- **Debian 11/12/13** (tested)
- **Ubuntu 20.04 / 22.04 / 24.04** (full support via PPA ondrej/php)
- **WSL** (Ubuntu atau Debian di WSL)
- **CentOS Stream 8/9 / RHEL / AlmaLinux / Rocky Linux** (via Remi repo)
- **Fedora 38+**
- **Arch Linux / Manjaro**

## Lokasi Penting

| Komponen      | Windows              | WSL / Linux                                                                                                          |
| ------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Source code   | `C:\laragon\www\mycp\` | `/home/{APP_USER}/mycp/` atau `/opt/mycontrolpanel/`                                                                          |
| Node server   | -                    | `/opt/mycontrolpanel/server/server.js` (port 8089)                                                                   |
| Bash scripts  | `scripts/`           | `/opt/mycontrolpanel/scripts/`                                                                                       |
| Site metadata | -                    | `/etc/mycontrolpanel/sites/{domain}.env`                                                                             |
| PHP-FPM pool  | -                    | `/etc/php/{ver}/fpm/pool.d/mycp-{domain}.conf`                                                                       |
| Nginx vhost   | -                    | `/etc/nginx/sites-available/mycp-{domain}` (Debian/Ubuntu) atau `/etc/nginx/conf.d/mycp-{domain}.conf` (RHEL/Fedora) |
| Server log    | -                    | `/tmp/mycp-server.log`                                                                                                 |

## Cara Install di Linux Server (Bare Metal / VPS)

```bash
# Download installer + jalankan
curl -fsSL https://raw.githubusercontent.com/ekohendratno/mycp/main/install.sh -o install.sh
chmod +x install.sh
sudo bash install.sh

# Atau override PHP versions
sudo INSTALL_PHP_VERSIONS="8.1 8.2 8.3 8.4" bash install.sh
```

## Cara Install di WSL

```bash
# 1. Buka terminal WSL Ubuntu/Debian
# 2. Sync source dari Windows ke WSL
wsl -e bash -lc "rsync -av --delete --exclude=node_modules --exclude=data /mnt/c/laragon/www/mycp/ /home/{APP_USER}/mycp/"

# 3. Install dependencies
sudo bash /home/{APP_USER}/mycp/install.sh
```

## Lokasi Penting

| Komponen      | Windows              | WSL                                                |
| ------------- | -------------------- | -------------------------------------------------- |
| Source code   | `C:\laragon\www\mycp\` | `/home/{APP_USER}/mycp/`                                    |
| Node server   | -                    | `/home/{APP_USER}/mycp/server/server.js` (port 8089)           |
| Bash scripts  | `scripts/`           | `/home/{APP_USER}/mycp/scripts/`                            |
| Site metadata | -                    | `/etc/mycontrolpanel/sites/{domain}.env`           |
| PHP-FPM pool  | -                    | `/etc/php/8.4/fpm/pool.d/mycp-{domain}.conf`       |
| Nginx vhost   | -                    | `/etc/nginx/sites-available/mycp-{domain}`         |
| Server log    | -                    | `/tmp/mycp-server.log`                               |
| Server PID    | -                    | `1879228` (cek dengan `pgrep -f 'node server/server'`) |

## Cara Sync Source → WSL

```bash
wsl -e bash -lc "rsync -av --delete --exclude=node_modules --exclude=data /mnt/c/laragon/www/mycp/ /home/{APP_USER}/mycp/"
```

Atau per-file:

```bash
wsl -e rsync -av /mnt/c/laragon/www/mycp/server/ /home/{APP_USER}/mycp/server/
```

## Cara Start/Restart Server Node

```bash
# Kill server lama
wsl -e bash -lc "pkill -9 -f 'node server/server'"

# Start server baru (background, persistent)
wsl -e bash -lc "cd /home/{APP_USER}/mycp && setsid nohup npm start > /tmp/mycp-server.log 2>&1 < /dev/null &"
```

Verifikasi:

```bash
wsl -e bash -lc "ss -tln | grep ':8089' && curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8089/login"
```

## IP Akses

WSL IP bisa berubah tiap restart. Cara cek:

```bash
wsl -e hostname -I
```

Biasanya `172.22.127.180`. Akses:

```
http://172.22.127.180:8089/login
```

Login default: `admin` / `admin123`.

## Perbaikan yang Sudah Diterapkan

### 1. Default PHP version = 8.4 (bukan 8.3)

System WSL hanya punya `/etc/php/8.4/fpm/pool.d`. Semua reference ke `8.3`
diubah jadi `8.4`:

- **`server/app.js`** / `server/routes/sites.js`: `version: version || "PHP 8.4"`
- **`scripts/site-create.sh` line 12**: `PHP_VERSION="8.4"`

### 2. Auto-create PHP-FPM pool saat website dibuat

**`scripts/site-create.sh`** memanggil `phpini-save.sh` setelah vhost terbentuk.
Pool config otomatis di `/etc/php/8.4/fpm/pool.d/mycp-{domain}.conf`
dengan default:

- `memory_limit=512M`
- `max_execution_time=60`
- `upload_max_filesize=64M`
- `post_max_size=64M`
- `display_errors=on`

Socket: `/run/php-fpm/mycp-{domain}.sock`

### 3. Form Runtime/PHP Version Detail Page

**`views/detail.ejs`** dropdown `settingRuntime` & `settingPhpVersion`
menggunakan opsi yang sama dengan modal "Tambah Website":

- Runtime: PHP Native / CodeIgniter 3 / CodeIgniter 4 / Laravel / Node.js / Static HTML / Reverse Proxy
- PHP Version: PHP 8.4 / 8.3 / 8.2 / 8.1 / 8.0 / 7.4 + Node.js 22/20/18 + Nginx Static/Proxy

**`assets/js/detail.js`** function `loadPhpForm()` populate form
dari `site.runtime` & `site.version` saat dashboard tab aktif.

### 4. Create-Site Modal Auto-Select Version

**`assets/js/app.js`** function `updateVersionOptions()` sekarang set
`versionSelect.value = versions[0]` setelah rebuild option list,
supaya versi otomatis cocok dengan runtime (mis. pilih CodeIgniter 3 → versi otomatis PHP 7.4).

```js
function updateVersionOptions() {
  const runtime = form.elements.runtime.value;
  const versionSelect = form.elements.version;
  const versions = versionsByRuntime[runtime] || versionsByRuntime['PHP Native'];
  versionSelect.innerHTML = versions.map(v => `<option>${v}</option>`).join('');
  versionSelect.value = versions[0] || '';   // ← ini tambahan baru
  form.elements.port.value = runtime === 'Node.js' ? '3000' : ...;
}
```

## Testing

### Test buat website baru via API

```bash
# Login
wsl -e bash -lc "curl -s -c /tmp/cookies.txt -X POST http://127.0.0.1:8089/api/login -H 'Content-Type: application/json' --data @/mnt/c/laragon/www/cp/login.json -o /dev/null"

# Create site
wsl -e bash -lc "curl -s -b /tmp/cookies.txt -X POST http://127.0.0.1:8089/api/sites -H 'Content-Type: application/json' --data '{\"domain\":\"test.com\",\"username\":\"test\",\"password\":\"Test123!\",\"runtime\":\"CodeIgniter 3\",\"version\":\"PHP 7.4\"}'"

# Verify pool terbuat
wsl -e bash -lc "ls -la /etc/php/8.4/fpm/pool.d/mycp-test.com.conf"
```

### Verify API site detail

```bash
wsl -e bash -lc "curl -s -b /tmp/cookies.txt 'http://127.0.0.1:8089/api/sites/test5.com'"
```

Output yang diharapkan:

```json
{"domain":"test5.com","runtime":"CodeIgniter 3","version":"PHP 7.4",...}
```

## Perintah Umum

| Tujuan                 | Perintah                                      |
| ---------------------- | --------------------------------------------- |
| Lihat server log       | `wsl -e tail -30 /tmp/mycp-server.log`          |
| Cek port 8089          | `wsl -e ss -tln \| grep 8089`                 |
| Cek PHP-FPM reload     | `wsl -e sudo systemctl reload php8.4-fpm`     |
| Test vhost syntax      | `wsl -e sudo nginx -t`                        |
| Reload Nginx           | `wsl -e sudo systemctl reload nginx`          |
| Lihat semua pool       | `wsl -e ls /etc/php/8.4/fpm/pool.d/`          |
| Lihat semua vhost      | `wsl -e ls /etc/nginx/sites-available/mycp-*` |
| Cek socket permissions | `wsl -e ls -la /run/php-fpm/`                 |

## Catatan

- **Backup db**: Selalu ada di `data/db.json` (tidak ikut sync dari Windows)
- **Permission**: File di `/etc/` butuh `sudo` (script sudah handle via `require_root`)
- **PHP 7.4 tidak terinstall**: Hanya ada PHP 8.4 di WSL saat ini. CodeIgniter 3 tetap
  terdaftar sebagai runtime option tapi execution-nya akan pakai PHP 8.4.
- **vsftpd.service**: Tidak tersedia di WSL ini, FTP creation akan warning tapi tidak fatal.

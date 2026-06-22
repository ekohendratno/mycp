# MyControlPanel

Static prototype untuk control panel hosting Linux.

## Fitur mockup

- Login admin demo (`admin` / `admin123`)
- Dashboard resource server dan terminal CLI mockup
- Daftar websites dengan dialog tambah website
- Halaman detail website dengan tab Settings, Vhost, Database, SSL/TLS, Security, SSH/FTP, File Manager, Cron Jobs, dan Logs
- Data demo disimpan di `localStorage` / `sessionStorage`

## Menjalankan lokal

```bash
python -m http.server 8089 --bind 127.0.0.1
```

Lalu buka `http://127.0.0.1:8089/login.html`.

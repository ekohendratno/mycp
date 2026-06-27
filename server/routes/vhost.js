const path = require("path");
const fs = require("fs");
const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

function getDefaultVhost(site) {
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${site.domain} www.${site.domain};
    root ${site.path};

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_hide_header X-Varnish;
        proxy_redirect off;
        proxy_max_temp_file_size 0;
        proxy_connect_timeout      720;
        proxy_send_timeout         720;
        proxy_read_timeout         720;
        proxy_buffer_size          128k;
        proxy_buffers              4 256k;
        proxy_busy_buffers_size    256k;
        proxy_temp_file_write_size 256k;
    }

    location ~* ^.+\\.(css|js|jpg|jpeg|gif|png|ico|gz|svg|svgz|ttf|otf|woff|woff2|eot|mp4|ogg|ogv|webm|webp|zip|swf|map)$ {
        add_header Access-Control-Allow-Origin "*";
        expires max;
        access_log off;
    }

    if (-f $request_filename) { break; }
}

server {
    listen 8088;
    listen [::]:8088;
    server_name ${site.domain} www.${site.domain};
    root ${site.path};

    try_files $uri $uri/ /index.php?$args;
    index index.php index.html;

    location ~ \\.php$ {
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        try_files $uri =404;
        fastcgi_read_timeout 3600;
        fastcgi_send_timeout 3600;
        fastcgi_param HTTPS "on";
        fastcgi_pass unix:/run/php-fpm/mycp-${site.domain}.sock;
    }

    if (-f $request_filename) { break; }
  }`;
}

module.exports = function (app) {
  app.get("/api/sites/:domain/vhost", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    try {
      const result = await exec.execReadVhost(req.params.domain);
      if (result.stdout && !result.stdout.startsWith("#")) return res.json({ vhost: result.stdout });
    } catch (e) { /* fall through */ }
    const configFile = path.join(__dirname, "..", "..", "data", `${site.domain}.vhost.conf`);
    if (fs.existsSync(configFile)) return res.json({ vhost: fs.readFileSync(configFile, "utf-8") });
    res.json({ vhost: getDefaultVhost(site) });
  });

  app.put("/api/sites/:domain/vhost", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    const isDefault = req.body.vhost && req.body.vhost === getDefaultVhost(site);
    let configFile = "";
    if (!isDefault) {
      configFile = path.join(__dirname, "..", "..", "data", `${site.domain}.vhost.conf`);
      fs.writeFileSync(configFile, req.body.vhost);
    }
    exec.execSaveVhost(site.domain, site.path, site.runtime, site.version, site.port, configFile)
      .catch((e) => console.warn("[scripts] vhost stderr:", e.stderr));
    res.json({ ok: true, message: "Vhost saved" });
  });
};

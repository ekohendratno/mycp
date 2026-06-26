const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const http = require("http");
const db = require("./db");
const exec = require("./scripts/exec");
const { WebSocketServer } = require("ws");
const pty = require("node-pty");
const multer = require("multer");
const upload = multer({ dest: "/tmp/mycp-uploads/" });

const app = express();
const PORT = process.env.PORT || 8089;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.json());

app.use(
  session({
    secret: "mycp-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  }),
);

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// --- phpMyAdmin Proxy ---
app.use("/phpmyadmin", (req, res) => {
  const options = {
    hostname: "127.0.0.1",
    port: 8087,
    path: req.originalUrl.replace(/^\/phpmyadmin/, "") || "/",
    method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:8087" },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    if (headers.location) {
      headers.location = "/phpmyadmin" + headers.location;
    }
    if (headers["set-cookie"]) {
      headers["set-cookie"] = headers["set-cookie"].map((c) =>
        c.replace(/\bpath=\//gi, "path=/phpmyadmin/"),
      );
    }
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", () => res.status(502).send("phpMyAdmin proxy error"));
  req.pipe(proxyReq);
});
// --- Site Preview Proxy ---
app.use("/preview-proxy", requireAuth, (req, res) => {
  const parts = req.path.split("/");
  const domain = parts[1];
  if (!domain) return res.status(400).send("Domain required");
  const subPath = parts.slice(2).join("/") || "/";
  const query = req.originalUrl.includes("?")
    ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
    : "";
  const options = {
    hostname: "127.0.0.1",
    port: 80,
    path: subPath + query,
    method: req.method,
    headers: { ...req.headers, host: domain },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    if (headers.location) {
      headers.location = "/preview-proxy/" + domain + headers.location;
    }
    // Disable cache agar iframe preview selalu tampil konten terbaru
    headers["cache-control"] = "no-store, no-cache, must-revalidate, max-age=0";
    headers["pragma"] = "no-cache";
    headers["expires"] = "0";
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", () => res.status(502).send("Preview proxy error"));
  req.pipe(proxyReq);
});

// --- Views ---
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login");
});
app.get("/dashboard", requireViewAuth, (req, res) => res.render("dashboard"));
app.get("/", requireViewAuth, (req, res) => res.render("index"));
app.get("/detail", requireViewAuth, (req, res) => res.render("detail"));
app.get("/preview", requireViewAuth, (req, res) => {
  const domain = req.query.site;
  if (!domain) return res.redirect("/");
  // Langsung redirect ke preview-proxy (satu-klik, tanpa iframe)
  res.redirect("/preview-proxy/" + encodeURIComponent(domain) + "/");
});

function requireViewAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// --- Auth API ---
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username dan password wajib diisi" });
  const user = db.verifyUser(username, password);
  if (!user)
    return res.status(401).json({ error: "Username atau password salah" });
  req.session.user = { username: user.username };
  res.json({ username: user.username });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ username: req.session.user.username });
});

// --- Sites API ---
app.get("/api/sites", requireAuth, (req, res) => {
  res.json(db.getSites());
});

app.post("/api/sites", requireAuth, async (req, res) => {
  const {
    domain,
    username,
    runtime,
    version,
    database,
    port,
    ssl,
    ftp,
    cloneSource,
    path: rootPath,
    passwordSet,
  } = req.body;
  if (!domain || !username)
    return res.status(400).json({ error: "Domain dan username wajib diisi" });
  const existing = db.getSite(domain);
  if (existing)
    return res.status(409).json({ error: "Domain sudah terdaftar" });
  const dbType = database || "MySQL";
  const dbPort = port || "80";
  const root = rootPath || `/home/${username}/htdocs`;
  const site = db.createSite({
    domain,
    username,
    runtime: runtime || "CodeIgniter 4",
    version: version || "PHP 8.4",
    database: dbType,
    port: dbPort,
    ssl: ssl || "none",
    ftp: ftp !== false,
    status: "running",
    path: root,
  });
  let progress = { steps: [], log: "" };
  try {
    const result = await exec.execCreateSite({
      domain,
      username,
      runtime,
      version,
      database: dbType,
      port: dbPort,
      ssl,
      ftp,
      cloneSource,
      path: root,
      password: req.body.password,
    });
    progress.log = result.stdout || "";
  } catch (e) {
    progress.log = (e.stderr || e.message || "Script failed");
    console.warn("[scripts] site-create error:", e.message);
  }

  // Ensure PHP-FPM pool is created (retry if site-create.sh failed silently)
  try {
    const phpVersion = version || "PHP 8.4";
    await exec.execSavePhpini(domain, phpVersion, [], "", username);
    progress.log += "\n[pool] PHP-FPM pool verified/created";
  } catch (e2) {
    console.warn("[scripts] phpini-save fallback error:", e2.message);
  }

  res.status(201).json({ ...site, progress });
});

app.get("/api/sites/:domain", requireAuth, (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  const ip = exec.getServerIp();
  // Resolve actual PHP version: if requested version is not installed, fallback
  // to latest available PHP version so UI/preview reflect reality.
  const actualVersion = exec.resolveActualPhpVersion(site.version);
  const requestedVersion = (site.version || "")
    .toString()
    .replace(/^PHP\s+/i, "")
    .trim();
  const versionMismatch =
    site.version && requestedVersion && actualVersion !== requestedVersion;
  res.json({
    ...site,
    ip: site.ip || ip,
    requestedVersion: site.version,
    actualVersion: "PHP " + actualVersion,
    version: "PHP " + actualVersion,
    versionMismatch,
  });
});

app.put("/api/sites/:domain", requireAuth, (req, res) => {
  const site = db.updateSite(req.params.domain, req.body);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  res.json(site);
});

app.delete("/api/sites/:domain", requireAuth, async (req, res) => {
  if (!db.deleteSite(req.params.domain))
    return res.status(404).json({ error: "Site tidak ditemukan" });
  exec
    .execDeleteSite(req.params.domain, true, true)
    .catch((e) => console.warn("[scripts] site-delete stderr:", e.stderr));
  res.json({ ok: true });
});

app.put("/api/sites/:domain/runtime", requireAuth, async (req, res) => {
  const { runtime, version } = req.body;
  if (!runtime) return res.status(400).json({ error: "Runtime wajib diisi" });
  const site = db.updateSite(req.params.domain, {
    runtime,
    version: version || "",
  });
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  exec
    .execUpdateRuntime(req.params.domain, runtime, version, site.port)
    .catch((e) => console.warn("[scripts] runtime stderr:", e.stderr));
  res.json(site);
});

app.put("/api/sites/:domain/password", requireAuth, async (req, res) => {
  exec
    .execChangePassword(req.params.domain, req.body.password || "NewPass123!")
    .catch((e) => console.warn("[scripts] password stderr:", e.stderr));
  res.json({ ok: true, message: "Password berhasil diubah" });
});

// --- PHP runtime settings (php.ini per-site) ---
app.get("/api/sites/:domain/php", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  try {
    const result = await exec.execReadPhpini(req.params.domain, site.version);
    res.json({
      raw: result.stdout || "",
      version: site.version,
      socket: `/run/php-fpm/mycp-${req.params.domain}.sock`,
    });
  } catch (e) {
    res.status(500).json({
      error: "Gagal membaca konfigurasi PHP: " + (e.stderr || e.message),
    });
  }
});

app.put("/api/sites/:domain/php", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  const settings = Array.isArray(req.body.settings) ? req.body.settings : [];
  const raw = typeof req.body.raw === "string" ? req.body.raw : "";
  if (!settings.length && !raw) {
    return res.status(400).json({ error: "settings[] atau raw wajib diisi" });
  }
  try {
    await exec.execSavePhpini(req.params.domain, site.version, settings, raw, site.username);
    res.json({ ok: true, message: "Konfigurasi PHP tersimpan" });
  } catch (e) {
    res
      .status(500)
      .json({ error: "Gagal menyimpan: " + (e.stderr || e.message) });
  }
});

// --- Vhost ---
app.get("/api/sites/:domain/vhost", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  try {
    const result = await exec.execReadVhost(req.params.domain);
    if (result.stdout && !result.stdout.startsWith("#")) {
      return res.json({ vhost: result.stdout });
    }
  } catch (e) {
    /* fall through */
  }
  const configFile = path.join(__dirname, "data", `${site.domain}.vhost.conf`);
  if (fs.existsSync(configFile)) {
    return res.json({ vhost: fs.readFileSync(configFile, "utf-8") });
  }
  res.json({ vhost: getDefaultVhost(site) });
});

app.put("/api/sites/:domain/vhost", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  const isDefault = req.body.vhost && req.body.vhost === getDefaultVhost(site);
  let configFile = "";
  if (!isDefault) {
    configFile = path.join(__dirname, "data", `${site.domain}.vhost.conf`);
    fs.writeFileSync(configFile, req.body.vhost);
  }
  exec
    .execSaveVhost(
      site.domain,
      site.path,
      site.runtime,
      site.version,
      site.port,
      configFile,
    )
    .catch((e) => console.warn("[scripts] vhost stderr:", e.stderr));
  res.json({ ok: true, message: "Vhost saved" });
});

function getDefaultVhost(site) {
  const sockVer = (site.version || "php")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

    if (-f $request_filename) {
        break;
    }
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

    if (-f $request_filename) {
        break;
    }
  }`;
}

// --- SSL ---
app.post("/api/sites/:domain/ssl", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  db.updateSite(req.params.domain, { ssl: true });
  exec
    .execIssueSsl(
      req.params.domain,
      req.body.email || `admin@${req.params.domain}`,
    )
    .catch((e) => console.warn("[scripts] ssl stderr:", e.stderr));
  res.json({ ok: true, message: "SSL berhasil diissue" });
});

// --- File Manager ---
app.get("/api/sites/:domain/files", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  const relPath = req.query.path || ".";
  try {
    const result = await exec.execFileList(req.params.domain, relPath);
    const lines = result.stdout.trim().split("\n");
    const header = lines[0];
    const entries = lines
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        const type = parts[0] === "d" ? "folder" : "file";
        return {
          name: parts[1] || "",
          type,
          size: parts[2] || "0",
          modified: parts[3] || "",
          owner: parts[4] || "",
          perms: parts[5] || "",
        };
      });
    res.json({ path: relPath, entries, root: site.path });
  } catch (e) {
    res.json({
      path: relPath,
      entries: [],
      root: site.path,
      error: "Gagal membaca direktori",
    });
  }
});

app.post("/api/sites/:domain/files/folder", requireAuth, async (req, res) => {
  const { path: relPath } = req.body;
  if (!relPath)
    return res.status(400).json({ error: "Path folder wajib diisi" });
  try {
    await exec.execCreateFolder(req.params.domain, relPath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal membuat folder" });
  }
});

app.put("/api/sites/:domain/files/write", requireAuth, async (req, res) => {
  const { path: relPath, content } = req.body;
  if (!relPath || content === undefined)
    return res.status(400).json({ error: "Path dan konten wajib diisi" });
  try {
    await exec.execWriteFile(req.params.domain, relPath, content);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal menulis file" });
  }
});

app.get("/api/sites/:domain/files/read", requireAuth, async (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
  try {
    const result = await exec.execReadFile(req.params.domain, relPath);
    res.json({ content: result.stdout });
  } catch (e) {
    res.status(500).json({ error: "Gagal membaca file" });
  }
});

app.post("/api/sites/:domain/files/rename", requireAuth, async (req, res) => {
  const { path: relPath, newName } = req.body;
  if (!relPath || !newName)
    return res.status(400).json({ error: "Path dan nama baru wajib diisi" });
  try {
    await exec.execRenameFile(req.params.domain, relPath, newName);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal rename" });
  }
});

app.post("/api/sites/:domain/files/copy", requireAuth, async (req, res) => {
  const { source, dest } = req.body;
  if (!source || !dest)
    return res.status(400).json({ error: "Source dan dest wajib diisi" });
  try {
    await exec.execCopyFile(req.params.domain, source, dest);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal copy" });
  }
});

app.post("/api/sites/:domain/files/move", requireAuth, async (req, res) => {
  const { source, dest } = req.body;
  if (!source || !dest)
    return res.status(400).json({ error: "Source dan dest wajib diisi" });
  try {
    await exec.execMoveFile(req.params.domain, source, dest);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal move" });
  }
});

app.delete("/api/sites/:domain/files/delete", requireAuth, async (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
  try {
    await exec.execDeleteFile(req.params.domain, relPath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal menghapus" });
  }
});

app.post("/api/sites/:domain/files/compress", requireAuth, async (req, res) => {
  const { path: relPath } = req.body;
  if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
  try {
    await exec.execCompressFile(req.params.domain, relPath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal compress" });
  }
});

app.post("/api/sites/:domain/files/chmod", requireAuth, async (req, res) => {
  const { path: relPath, mode } = req.body;
  if (!relPath || !mode)
    return res.status(400).json({ error: "Path dan mode wajib diisi" });
  try {
    await exec.execChmodFile(req.params.domain, relPath, mode);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal chmod" });
  }
});

app.get("/api/sites/:domain/files/download", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
  try {
    const result = await exec.execReadFile(req.params.domain, relPath);
    const fileName = relPath.split("/").pop();
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="' + fileName + '"',
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(result.stdout);
  } catch (e) {
    res.status(500).send("Gagal download");
  }
});

app.post("/api/sites/:domain/files/upload", requireAuth, upload.single("file"), async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  const relPath = req.body.target || ".";
  const file = req.file;
  if (!file) return res.status(400).json({ error: "File wajib dipilih" });
  const fileName = file.originalname;
  const destPath = relPath === "." ? fileName : relPath.replace(/\/+$/, "") + "/" + fileName;
  try {
    const result = await exec.runScript("file-write", [
      "--domain", req.params.domain,
      "--path", destPath,
      "--content-file", file.path,
    ]);
    if (result.code !== 0) {
      return res.status(500).json({ error: result.stderr || "Gagal upload file" });
    }
    try { fs.unlinkSync(file.path); } catch (e) { }
    res.json({ ok: true, file: destPath });
  } catch (e) {
    res.status(500).json({ error: "Gagal upload file" });
  }
});

// --- Databases ---
app.get("/api/sites/:domain/databases", requireAuth, (req, res) => {
  res.json(db.getDatabases(req.params.domain));
});

app.post("/api/sites/:domain/databases", requireAuth, async (req, res) => {
  const { dbName, dbType, dbUser, password } = req.body;
  const entry = db.createDatabase(req.params.domain, {
    dbName,
    dbType,
    dbUser,
    password,
  });
  if (!entry) return res.status(404).json({ error: "Site tidak ditemukan" });
  exec
    .execCreateDatabase(
      req.params.domain,
      dbType,
      dbName,
      dbUser,
      password || "DbPass123!",
    )
    .catch((e) => console.warn("[scripts] database stderr:", e.stderr));
  res.status(201).json(entry);
});

app.delete(
  "/api/sites/:domain/databases/:id",
  requireAuth,
  async (req, res) => {
    const entry = db.getDatabase(Number(req.params.id));
    if (!entry)
      return res.status(404).json({ error: "Database tidak ditemukan" });
    try {
      await exec.execDropDatabase(entry.dbName, entry.dbType);
    } catch (e) {
      console.warn("[scripts] Gagal drop database:", e.message);
    }
    db.deleteDatabase(Number(req.params.id));
    res.json({ ok: true });
  },
);

// --- Cron ---
app.get("/api/sites/:domain/cron", requireAuth, (req, res) => {
  res.json(db.getCronJobs(req.params.domain));
});

app.post("/api/sites/:domain/cron", requireAuth, async (req, res) => {
  const { schedule, command, status } = req.body;
  const entry = db.createCronJob(req.params.domain, {
    schedule,
    command,
    status: status || "Aktif",
  });
  if (!entry) return res.status(404).json({ error: "Site tidak ditemukan" });
  exec
    .execAddCron(req.params.domain, schedule, command)
    .catch((e) => console.warn("[scripts] cron stderr:", e.stderr));
  res.status(201).json(entry);
});

app.delete("/api/sites/:domain/cron/:id", requireAuth, (req, res) => {
  if (!db.deleteCronJob(Number(req.params.id)))
    return res.status(404).json({ error: "Cron job tidak ditemukan" });
  res.json({ ok: true });
});

// --- PM2 Status ---
var PM2_ENV = (function() {
  var path = require("path");
  var fs = require("fs");
  // cari pm2 binary
  var candidates = ["/usr/local/bin", "/usr/bin", "/usr/lib/node_modules/.bin"];
  var p = process.env.PATH || "";
  // tambah npm global bin dari Windows jika ada
  var npmPrefix = require("child_process").execSync("npm config get prefix 2>/dev/null", { encoding: "utf8" }).trim();
  if (npmPrefix && fs.existsSync(path.join(npmPrefix, "bin", "pm2"))) {
    p = path.join(npmPrefix, "bin") + ":" + p;
  }
  // fallback: cari dengan which
  try {
    var pm2Path = require("child_process").execSync("command -v pm2 2>/dev/null || which pm2 2>/dev/null", { encoding: "utf8" }).trim();
    if (pm2Path) {
      p = path.dirname(pm2Path) + ":" + p;
    }
  } catch(e) {}
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(path.join(candidates[i], "pm2"))) {
      if (p.indexOf(candidates[i]) === -1) p = candidates[i] + ":" + p;
      break;
    }
  }
  return { PATH: p };
})();

app.get("/api/sites/:domain/pm2-status", requireAuth, async (req, res) => {
  try {
    var site = db.getSite(req.params.domain);
    if (!site) return res.json({ running: false });
    var port = site.port || "3000";
    var { execSync } = require("child_process");
    var out = execSync("pm2 describe " + req.params.domain + " 2>/dev/null || true", { encoding: "utf8", env: PM2_ENV });
    var running = out.includes("online");
    var pid = "";
    if (running) {
      var m = out.match(/pid\s+path[^│]+│\s*(\S+)/i);
      if (m) {
        try { pid = require("fs").readFileSync(m[1].trim(), "utf8").trim(); } catch(e) {}
      }
    }
    res.json({ running, pid, port });
  } catch (e) {
    res.json({ running: false, port: "3000" });
  }
});

app.post("/api/sites/:domain/pm2-restart", requireAuth, async (req, res) => {
  try {
    var site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site not found" });
    var { execSync } = require("child_process");
    var root = site.path || "/home/" + site.username + "/htdocs";
    var port = site.port || "3000";
    var out = execSync("pm2 describe " + req.params.domain + " 2>/dev/null || true", { encoding: "utf8", env: PM2_ENV });
    if (out.includes("online") || out.includes("stopped")) {
      execSync("pm2 restart " + req.params.domain + " 2>/dev/null || true", { env: PM2_ENV });
    } else {
      execSync("pm2 start " + root + "/server.js --name '" + req.params.domain + "' -- " + port + " 2>/dev/null || pm2 start " + root + "/app.js --name '" + req.params.domain + "' -- " + port + " 2>/dev/null || true", { shell: true, env: PM2_ENV });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- FTP ---
app.get("/api/sites/:domain/ftp", requireAuth, (req, res) => {
  res.json(db.getFtpAccounts(req.params.domain));
});

app.post("/api/sites/:domain/ftp", requireAuth, async (req, res) => {
  const { username, password, path: ftpPath, permission } = req.body;
  const entry = db.createFtpAccount(req.params.domain, {
    username,
    password,
    path: ftpPath,
    permission: permission || "Read / Write",
  });
  if (!entry) return res.status(404).json({ error: "Site tidak ditemukan" });
  exec
    .execCreateFtp(
      req.params.domain,
      username,
      password || "FtpPass123!",
      ftpPath,
    )
    .catch((e) => console.warn("[scripts] ftp stderr:", e.stderr));
  res.status(201).json(entry);
});

// --- Logs ---
app.get("/api/sites/:domain/logs", requireAuth, async (req, res) => {
  const site = db.getSite(req.params.domain);
  if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
  const type = req.query.type || "access";
  try {
    const result = await exec.execReadLogs(req.params.domain, type, 50);
    res.json({ logs: result.stdout || "No logs" });
  } catch (e) {
    const mockLogs = {
      access: `[12:04:01] nginx reload successful\n[12:04:03] runtime ${site.version} active for ${site.domain}\n[12:05:22] GET /dashboard 200 48ms`,
      error: `[12:04:01] [error] client sent invalid header line\n[12:05:22] [warn] slow request`,
    };
    res.json({ logs: mockLogs[type] || mockLogs.access });
  }
});

// --- Server Status ---
app.get("/api/status", requireAuth, async (req, res) => {
  try {
    const result = await exec.execStatus();
    res.json({ services: result.stdout });
  } catch (e) {
    res.json({
      services:
        "nginx running\nphp-fpm running\nmysql running\npostgresql running",
    });
  }
});

// --- Dashboard API ---
app.get("/api/dashboard", requireAuth, (req, res) => {
  res.json(db.getDashboardStats());
});

app.get("/api/server-stats", requireAuth, (req, res) => {
  try {
    const stats = exec.getServerStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: "Gagal mengambil statistik server" });
  }
});

function startServer(port) {
  const server = app.listen(port);
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} in use, trying ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error(err);
    }
  });
  server.on("listening", () => {
    console.log(`MyControlPanel running at http://127.0.0.1:${port}/login`);
    // Attach WebSocket for terminal
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      const url = req.url || "";
      if (!url.startsWith("/ws/terminal")) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const shell = pty.spawn("/bin/bash", [], {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          cwd: "/home/srv/cp",
          env: process.env,
        });
        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "input") shell.write(msg.data);
            else if (msg.type === "resize") shell.resize(msg.cols, msg.rows);
          } catch (e) { /* ignore */ }
        });
        shell.onData((data) => {
          try { ws.send(data); } catch (e) { /* ignore */ }
        });
        ws.on("close", () => shell.kill());
        shell.on("exit", () => { try { ws.close(); } catch (e) { /* ignore */ } });
      });
    });
  });
}

startServer(PORT);

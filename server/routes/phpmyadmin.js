const http = require("http");
const db = require("../models/db");
const { requireAuth } = require("../middleware/auth");
const config = require("../config");

module.exports = function (app) {
  app.get("/api/sites/:domain/phpmyadmin-login", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    const dbs = db.getDatabases(req.params.domain);
    if (!dbs || !dbs.length) return res.status(404).json({ error: "Tidak ada database untuk site ini" });
    const dbEntry = dbs[0];
    const body = "pma_username=" + encodeURIComponent(dbEntry.dbUser) + "&pma_password=" + encodeURIComponent(dbEntry.password) + "&server=1";
    const opts = { hostname: config.PMA_HOST, port: config.PMA_PORT, path: "/index.php", method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } };
    const loginReq = http.request(opts, (loginRes) => {
      let data = "";
      loginRes.on("data", (chunk) => { data += chunk; });
      loginRes.on("end", () => {
        const cookies = loginRes.headers["set-cookie"] || [];
        res.json({
          ok: true,
          cookies: cookies.map((c) => c.replace(/\bpath=\//gi, "path=/phpmyadmin/")),
          url: "/phpmyadmin/index.php", user: dbEntry.dbUser, database: dbEntry.dbName,
        });
      });
    });
    loginReq.on("error", (e) => res.status(502).json({ error: e.message }));
    loginReq.write(body);
    loginReq.end();
  });

  app.get("/api/sites/:domain/phpmyadmin-redirect", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    const dbs = db.getDatabases(req.params.domain);
    if (!dbs || !dbs.length) return res.status(404).json({ error: "Tidak ada database" });
    const dbEntry = dbs[0];
    const body = "pma_username=" + encodeURIComponent(dbEntry.dbUser) + "&pma_password=" + encodeURIComponent(dbEntry.password) + "&server=1";
    const opts = { hostname: config.PMA_HOST, port: config.PMA_PORT, path: "/index.php", method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } };
    const loginReq = http.request(opts, (loginRes) => {
      const cookies = loginRes.headers["set-cookie"] || [];
      cookies.forEach((c) => {
        res.setHeader("Set-Cookie", c.replace(/\bpath=\//gi, "path=/phpmyadmin/"));
      });
      res.writeHead(302, { Location: "/phpmyadmin/index.php" });
      res.end();
    });
    loginReq.on("error", () => res.status(502).send("Proxy error"));
    loginReq.write(body);
    loginReq.end();
  });

  app.use("/phpmyadmin", (req, res) => {
    const opts = { hostname: config.PMA_HOST, port: config.PMA_PORT,
      path: req.originalUrl.replace(/^\/phpmyadmin/, "") || "/",
      method: req.method, headers: { ...req.headers, host: config.PMA_HOST + ":" + config.PMA_PORT } };
    const proxyReq = http.request(opts, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      if (headers.location) headers.location = "/phpmyadmin" + headers.location;
      if (headers["set-cookie"])
        headers["set-cookie"] = headers["set-cookie"].map((c) => c.replace(/\bpath=\//gi, "path=/phpmyadmin/"));
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", () => res.status(502).send("phpMyAdmin proxy error"));
    req.pipe(proxyReq);
  });
};

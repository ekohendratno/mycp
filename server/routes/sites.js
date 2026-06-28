const path = require("path");
const db = require("../models/db");
const exec = require("../../scripts/exec");
const config = require("../config");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/api/sites", requireAuth, (req, res) => {
    res.json(db.getSites());
  });

  app.post("/api/sites", requireAuth, async (req, res) => {
    const {
      domain, username, runtime, version, database,
      port, ssl, ftp, cloneSource, path: rootPath, password,
    } = req.body;
    if (!domain || !username)
      return res.status(400).json({ error: "Domain dan username wajib diisi" });
    const existing = db.getSite(domain);
    if (existing)
      return res.status(409).json({ error: "Domain sudah terdaftar" });
    const dbType = database || "MySQL";
    const dbPort = port || "80";
    const root = rootPath || `${config.MYCP_HOME_PREFIX}/${username}/htdocs`;
    const site = db.createSite({
      domain, username, runtime: runtime || "CodeIgniter 4",
      version: version || "PHP 8.4", database: dbType, port: dbPort,
      ssl: ssl || "none", ftp: ftp !== false, status: "running", path: root,
    });
    let progress = { steps: [], log: "" };
    try {
      const result = await exec.execCreateSite({
        domain, username, runtime, version, database: dbType, port: dbPort,
        ssl, ftp, cloneSource, path: root, password,
      });
      progress.log = result.stdout || "";
    } catch (e) {
      progress.log = (e.stderr || e.message || "Script failed");
      console.warn("[scripts] site-create error:", e.message);
    }
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
    const actualVersion = exec.resolveActualPhpVersion(site.version);
    const requestedVersion = (site.version || "")
      .toString().replace(/^PHP\s+/i, "").trim();
    const versionMismatch = site.version && requestedVersion && actualVersion !== requestedVersion;
    res.json({
      ...site, ip: site.ip || ip,
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
    exec.execDeleteSite(req.params.domain, true, true)
      .catch((e) => console.warn("[scripts] site-delete stderr:", e.stderr));
    res.json({ ok: true });
  });

  app.put("/api/sites/:domain/runtime", requireAuth, async (req, res) => {
    const { runtime, version } = req.body;
    if (!runtime) return res.status(400).json({ error: "Runtime wajib diisi" });
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    db.updateSite(req.params.domain, { runtime, version: version || "" });
    exec.execUpdateRuntime(req.params.domain, runtime, version, site.port)
      .catch((e) => console.warn("[scripts] runtime stderr:", e.stderr));
    res.json({ ok: true, message: "Runtime berhasil diubah" });
  });

  app.put("/api/sites/:domain/password", requireAuth, async (req, res) => {
    db.getSite(req.params.domain);
    exec.execChangePassword(req.params.domain, req.body.password || "NewPass123!")
      .catch((e) => console.warn("[scripts] password stderr:", e.stderr));
    res.json({ ok: true, message: "Password berhasil diubah" });
  });
};

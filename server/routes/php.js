const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/api/sites/:domain/php", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    try {
      const result = await exec.execReadPhpini(req.params.domain, site.version);
      res.json({ raw: result.stdout || "", version: site.version, socket: `/run/php-fpm/mycp-${req.params.domain}.sock` });
    } catch (e) {
      res.status(500).json({ error: "Gagal membaca konfigurasi PHP: " + (e.stderr || e.message) });
    }
  });

  app.put("/api/sites/:domain/php", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    const settings = Array.isArray(req.body.settings) ? req.body.settings : [];
    const raw = typeof req.body.raw === "string" ? req.body.raw : "";
    if (!settings.length && !raw) return res.status(400).json({ error: "settings[] atau raw wajib diisi" });
    try {
      await exec.execSavePhpini(req.params.domain, site.version, settings, raw, site.username);
      res.json({ ok: true, message: "Konfigurasi PHP tersimpan" });
    } catch (e) {
      res.status(500).json({ error: "Gagal menyimpan: " + (e.stderr || e.message) });
    }
  });
};

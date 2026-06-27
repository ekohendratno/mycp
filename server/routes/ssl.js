const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.post("/api/sites/:domain/ssl", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    db.updateSite(req.params.domain, { ssl: true });
    exec.execIssueSsl(req.params.domain, req.body.email || `admin@${req.params.domain}`)
      .catch((e) => console.warn("[scripts] ssl stderr:", e.stderr));
    res.json({ ok: true, message: "SSL berhasil diissue" });
  });
};

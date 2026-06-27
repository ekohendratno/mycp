const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/api/sites/:domain/ftp", requireAuth, (req, res) => {
    res.json(db.getFtpAccounts(req.params.domain));
  });

  app.post("/api/sites/:domain/ftp", requireAuth, async (req, res) => {
    const { username, password, path: ftpPath, permission } = req.body;
    const entry = db.createFtpAccount(req.params.domain, {
      username, password, path: ftpPath, permission: permission || "Read / Write",
    });
    if (!entry) return res.status(404).json({ error: "Site tidak ditemukan" });
    exec.execCreateFtp(req.params.domain, username, password || "FtpPass123!", ftpPath)
      .catch((e) => console.warn("[scripts] ftp stderr:", e.stderr));
    res.status(201).json(entry);
  });
};

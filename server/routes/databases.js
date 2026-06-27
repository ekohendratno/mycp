const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/api/sites/:domain/databases", requireAuth, (req, res) => {
    res.json(db.getDatabases(req.params.domain));
  });

  app.post("/api/sites/:domain/databases", requireAuth, async (req, res) => {
    const { dbName, dbType, dbUser, password } = req.body;
    const entry = db.createDatabase(req.params.domain, { dbName, dbType, dbUser, password });
    if (!entry) return res.status(404).json({ error: "Site tidak ditemukan" });
    exec.execCreateDatabase(req.params.domain, dbType, dbName, dbUser, password || "DbPass123!")
      .catch((e) => console.warn("[scripts] database stderr:", e.stderr));
    res.status(201).json(entry);
  });

  app.delete("/api/sites/:domain/databases/:id", requireAuth, async (req, res) => {
    const entry = db.getDatabase(Number(req.params.id));
    if (!entry) return res.status(404).json({ error: "Database tidak ditemukan" });
    try {
      await exec.execDropDatabase(entry.dbName, entry.dbType, entry.dbUser);
    } catch (e) {
      console.warn("[scripts] Gagal drop database:", e.message);
    }
    db.deleteDatabase(Number(req.params.id));
    res.json({ ok: true });
  });
};

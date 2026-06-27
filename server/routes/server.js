const path = require("path");
const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/api/status", requireAuth, async (req, res) => {
    try {
      const result = await exec.execStatus();
      res.json({ services: result.stdout });
    } catch (e) {
      res.json({ services: "nginx running\nphp-fpm running\nmysql running\npostgresql running" });
    }
  });

  app.get("/api/dashboard", requireAuth, (req, res) => {
    res.json(db.getDashboardStats());
  });

  app.post("/api/admin/fix-db-privileges", requireAuth, async (req, res) => {
    try {
      const result = exec.execCommand("sudo -n " + path.join(__dirname, "..", "..", "scripts", "fix-db-privileges.sh"), { timeout: 60000 });
      res.json({ ok: true, message: result.stdout || "Privileges fixed" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/server-stats", requireAuth, (req, res) => {
    try {
      const stats = exec.getServerStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: "Gagal mengambil statistik server" });
    }
  });
};

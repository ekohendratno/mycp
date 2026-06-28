const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");
const { execSync } = require("child_process");

module.exports = function (app) {
  app.post("/api/update", requireAuth, async (req, res) => {
    try {
      const result = await exec.execUpdatePanel();
      res.json({ ok: true, log: result.stdout || "Update selesai" });
      // Restart setelah response terkirim
      setImmediate(() => {
        try {
          execSync("sudo -n systemctl daemon-reload && sudo -n systemctl restart mycp-server 2>/dev/null || sudo -n service mycp-server restart 2>/dev/null || true", { timeout: 10000 });
        } catch (_) {}
      });
    } catch (e) {
      res.status(500).json({ error: e.stderr || e.message || "Update gagal" });
    }
  });
};
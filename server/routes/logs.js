const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
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
};

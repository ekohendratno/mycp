const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/api/sites/:domain/cron", requireAuth, (req, res) => {
    res.json(db.getCronJobs(req.params.domain));
  });

  app.post("/api/sites/:domain/cron", requireAuth, async (req, res) => {
    const { schedule, command, status } = req.body;
    const entry = db.createCronJob(req.params.domain, { schedule, command, status: status || "Aktif" });
    if (!entry) return res.status(404).json({ error: "Site tidak ditemukan" });
    exec.execAddCron(req.params.domain, schedule, command)
      .catch((e) => console.warn("[scripts] cron stderr:", e.stderr));
    res.status(201).json(entry);
  });

  app.delete("/api/sites/:domain/cron/:id", requireAuth, (req, res) => {
    if (!db.deleteCronJob(Number(req.params.id)))
      return res.status(404).json({ error: "Cron job tidak ditemukan" });
    res.json({ ok: true });
  });
};

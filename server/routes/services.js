const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/api/sites/:domain/services", requireAuth, (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    const services = exec.getSiteServices(req.params.domain);
    res.json(services);
  });

  app.post("/api/sites/:domain/services", requireAuth, async (req, res) => {
    const { service, action } = req.body;
    if (!service || !action) return res.status(400).json({ error: "service dan action wajib diisi" });
    if (!["start", "stop", "restart"].includes(action)) return res.status(400).json({ error: "Action tidak valid" });
    const result = exec.execServiceAction(req.params.domain, service, action);
    res.json(result);
  });
};

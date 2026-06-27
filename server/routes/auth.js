const db = require("../models/db");

module.exports = function (app) {
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    const user = db.verifyUser(username, password);
    if (!user) return res.status(401).json({ error: "Username atau password salah" });
    req.session.user = { username: user.username };
    res.json({ username: user.username });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/me", (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    res.json({ username: req.session.user.username });
  });
};

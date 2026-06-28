const db = require("../models/db");
const { requireAuth } = require("../middleware/auth");

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

  app.get("/api/me", requireAuth, (req, res) => {
    res.json({ username: req.session.user.username });
  });

  app.put("/api/me/password", requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "Current password dan new password wajib diisi" });
    if (newPassword.length < 8)
      return res.status(400).json({ error: "Password baru minimal 8 karakter" });
    const user = db.verifyUser(req.session.user.username, currentPassword);
    if (!user) return res.status(401).json({ error: "Current password salah" });
    db.updateUserPassword(req.session.user.username, newPassword);
    res.json({ ok: true, message: "Password berhasil diubah" });
  });
};

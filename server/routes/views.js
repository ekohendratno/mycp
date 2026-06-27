const { requireViewAuth } = require("../middleware/auth");

module.exports = function (app) {
  app.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/");
    res.render("login");
  });

  app.get("/dashboard", requireViewAuth, (req, res) => res.render("dashboard"));

  app.get("/", requireViewAuth, (req, res) => res.render("index"));

  app.get("/detail", requireViewAuth, (req, res) => res.render("detail"));

  app.get("/preview", requireViewAuth, (req, res) => {
    const domain = req.query.site;
    if (!domain) return res.redirect("/");
    res.redirect("/preview-proxy/" + encodeURIComponent(domain) + "/");
  });
};

const { requireViewAuth } = require("../middleware/auth");
const config = require("../config");

function withConfig(req, res, next) {
  res.locals.mycpConfig = {
    APP_DIR: config.APP_DIR,
    APP_USER: config.APP_USER,
    APP_HOME: config.APP_HOME,
    HOME_PREFIX: config.MYCP_HOME_PREFIX,
    NGINX_PREFIX: config.MYCP_NGINX_PREFIX,
  };
  next();
}

module.exports = function (app) {
  app.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/");
    res.render("login");
  });

  app.get("/dashboard", requireViewAuth, withConfig, (req, res) => res.render("dashboard"));

  app.get("/", requireViewAuth, withConfig, (req, res) => res.render("index"));

  app.get("/detail", requireViewAuth, withConfig, (req, res) => res.render("detail"));

  app.get("/preview", requireViewAuth, (req, res) => {
    const domain = req.query.site;
    if (!domain) return res.redirect("/");
    res.redirect("/preview-proxy/" + encodeURIComponent(domain) + "/");
  });

  app.get("/terminal", requireViewAuth, (req, res) => {
    res.render("terminal", { cwd: req.query.cwd || config.APP_DIR });
  });
};

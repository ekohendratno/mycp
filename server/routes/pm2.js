const path = require("path");
const fs = require("fs");
const db = require("../models/db");
const { requireAuth } = require("../middleware/auth");

function getPm2Env() {
  var candidates = ["/usr/local/bin", "/usr/bin", "/usr/lib/node_modules/.bin"];
  var p = process.env.PATH || "";
  try {
    var npmPrefix = require("child_process").execSync("npm config get prefix 2>/dev/null", { encoding: "utf8" }).trim();
    if (npmPrefix && fs.existsSync(path.join(npmPrefix, "bin", "pm2"))) {
      p = path.join(npmPrefix, "bin") + ":" + p;
    }
  } catch(e) {}
  try {
    var pm2Path = require("child_process").execSync("command -v pm2 2>/dev/null || which pm2 2>/dev/null", { encoding: "utf8" }).trim();
    if (pm2Path) p = path.dirname(pm2Path) + ":" + p;
  } catch(e) {}
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(path.join(candidates[i], "pm2"))) {
      if (p.indexOf(candidates[i]) === -1) p = candidates[i] + ":" + p;
      break;
    }
  }
  return { PATH: p };
}

module.exports = function (app) {
  app.get("/api/sites/:domain/pm2-status", requireAuth, async (req, res) => {
    try {
      var site = db.getSite(req.params.domain);
      if (!site) return res.json({ running: false });
      var port = site.port || "3000";
      var { execSync } = require("child_process");
      var env = getPm2Env();
      var out = execSync("pm2 describe " + req.params.domain + " 2>/dev/null || true", { encoding: "utf8", env: env });
      var running = out.includes("online");
      var pid = "";
      if (running) {
        var m = out.match(/pid\s+path[^│]+│\s*(\S+)/i);
        if (m) {
          try { pid = require("fs").readFileSync(m[1].trim(), "utf8").trim(); } catch(e) {}
        }
      }
      res.json({ running, pid, port });
    } catch (e) {
      res.json({ running: false, port: "3000" });
    }
  });

  app.post("/api/sites/:domain/pm2-restart", requireAuth, async (req, res) => {
    try {
      var site = db.getSite(req.params.domain);
      if (!site) return res.status(404).json({ error: "Site not found" });
      var { execSync } = require("child_process");
      var root = site.path || "/home/" + site.username + "/htdocs";
      var port = site.port || "3000";
      var env = getPm2Env();
      var out = execSync("pm2 describe " + req.params.domain + " 2>/dev/null || true", { encoding: "utf8", env: env });
      if (out.includes("online") || out.includes("stopped")) {
        execSync("pm2 restart " + req.params.domain + " 2>/dev/null || true", { env: env });
      } else {
        execSync("pm2 start " + root + "/server.js --name '" + req.params.domain + "' -- " + port + " 2>/dev/null || pm2 start " + root + "/app.js --name '" + req.params.domain + "' -- " + port + " 2>/dev/null || true", { shell: true, env: env });
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};

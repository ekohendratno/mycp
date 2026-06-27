const http = require("http");
const { requireAuth } = require("../middleware/auth");
const config = require("../config");

module.exports = function (app) {
  app.use("/preview-proxy", requireAuth, (req, res) => {
    const parts = req.path.split("/");
    const domain = parts[1];
    if (!domain) return res.status(400).send("Domain required");
    const subPath = parts.slice(2).join("/") || "/";
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    const opts = { hostname: "127.0.0.1", port: config.NGINX_PORT, path: subPath + query,
      method: req.method, headers: { ...req.headers, host: domain } };
    const proxyReq = http.request(opts, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      if (headers.location) headers.location = "/preview-proxy/" + domain + headers.location;
      headers["cache-control"] = "no-store, no-cache, must-revalidate, max-age=0";
      headers["pragma"] = "no-cache";
      headers["expires"] = "0";
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", () => res.status(502).send("Preview proxy error"));
    req.pipe(proxyReq);
  });
};

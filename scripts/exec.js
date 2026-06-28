const path = require("path");
const { execFile, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");

// Load config for dynamic paths
const config = require("../server/config");

// Use canonical Linux path for scripts so sudoers NOPASSWD rules match.
// __dirname may resolve to /mnt/c/... when server starts from Windows volume.
let SCRIPTS_DIR = __dirname;
if (process.platform === "linux") {
  const candidate = process.env.SCRIPTS_DIR || config.SCRIPTS_DIR || "/home/srv/mycp/scripts";
  if (fs.existsSync(candidate)) SCRIPTS_DIR = candidate;
}
const isLinux = process.platform === "linux";

function runScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    if (!isLinux) {
      resolve({ stdout: "(simulated)", stderr: "", code: 0 });
      return;
    }
    const scriptPath = path.join(SCRIPTS_DIR, `${scriptName}.sh`);
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Script not found: ${scriptPath}`));
      return;
    }
    // Node server runs as 'srv' which has NOPASSWD for scripts/* in sudoers
    execFile(
      "sudo",
      ["-n", scriptPath, ...args],
      { timeout: 60000 },
      (err, stdout, stderr) => {
        if (err)
          reject(
            Object.assign(new Error(stderr || "Script failed"), {
              stdout,
              stderr,
              code: err.code,
            }),
          );
        else resolve({ stdout, stderr, code: 0 });
      },
    );
  });
}

const RUNTIME_TO_SCRIPT = {
  "CodeIgniter 4": "ci4",
  "CodeIgniter 3": "ci3",
  Laravel: "laravel",
  "PHP Native": "php",
  "Node.js": "node",
  "Static HTML": "static",
  "Reverse Proxy": "reverse-proxy",
};

const SCRIPT_TO_RUNTIME = {
  ci4: "CodeIgniter 4",
  ci3: "CodeIgniter 3",
  laravel: "Laravel",
  php: "CodeIgniter 4",
  node: "Node.js",
  static: "Static HTML",
  "reverse-proxy": "Reverse Proxy",
};

const VERSION_DEFAULTS = {
  static: "Nginx",
  "reverse-proxy": "Cloudflare Tunnel",
  node: "Node.js 20",
  php: "PHP 8.3",
};

const DB_SCRIPT_TO_DISPLAY = {
  mysql: "MySQL",
  mariadb: "MariaDB",
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  none: "Tanpa Database",
};

function mapRuntime(runtime) {
  return RUNTIME_TO_SCRIPT[runtime] || "php";
}

function mapPhpVersion(version) {
  if (!version) return "8.3";
  if (version.startsWith("Laravel")) {
    var map = { "Laravel 12": "8.3", "Laravel 11": "8.2", "Laravel 10": "8.1" };
    return map[version] || "8.3";
  }
  return version.replace(/^PHP /, "").replace(/ FPM$/, "");
}

function mapNodeVersion(version) {
  if (!version || version.startsWith("PHP") || version.startsWith("Nginx") || version.startsWith("Laravel")) return "20";
  return version.replace(/^Node\.js /, "");
}

function mapLaravelVersion(version) {
  if (version.startsWith("Laravel ")) return version.replace("Laravel ", "");
  return "";
}

function mapDatabaseType(dbType) {
  const map = {
    MySQL: "mysql",
    PostgreSQL: "postgresql",
    "Tanpa Database": "none",
  };
  return map[dbType] || "none";
}

function unmapDatabaseType(dbType) {
  return DB_SCRIPT_TO_DISPLAY[dbType] || dbType || "Tanpa Database";
}

function formatVersion(runtime, phpVersion, nodeVersion) {
  if (runtime === "node") return "Node.js " + (nodeVersion || phpVersion || "20");
  if (runtime === "static") return "Nginx Static";
  if (runtime === "reverse-proxy") return "Nginx Proxy";
  if (phpVersion) return "PHP " + phpVersion;
  if (nodeVersion) return "Node.js " + nodeVersion;
  return VERSION_DEFAULTS[runtime] || "PHP 8.3";
}

function mapSsl(ssl) {
  if (ssl === "none" || ssl === false || ssl === "false") return "no";
  if (ssl === "self") return "self";
  return "yes";
}

function mapFtp(ftp) {
  return ftp ? "yes" : "no";
}

async function execCreateSite(params) {
  const runtime = mapRuntime(params.runtime);
  const isPhp = runtime !== "node" && runtime !== "static" && runtime !== "reverse-proxy";
  const isNode = runtime === "node";
  const args = [
    "--domain",
    params.domain,
    "--user",
    params.username,
    "--password",
    params.password || params.domain + "Pass1!",
    "--runtime",
    runtime,
  ];
  if (isPhp) {
    args.push("--php-version", mapPhpVersion(params.version));
    if (params.runtime === "Laravel") args.push("--laravel-version", mapLaravelVersion(params.version));
  }
  if (isNode) args.push("--node-version", mapNodeVersion(params.version));
  args.push(
    "--database", mapDatabaseType(params.databaseType || params.database),
    "--port", params.port || "80",
    "--ssl", mapSsl(params.ssl),
    "--ftp", mapFtp(params.ftp),
    "--clone-source", params.cloneSource ? "yes" : "no",
    "--root", params.path || `${config.MYCP_HOME_PREFIX}/${params.username}/htdocs`,
  );
  return runScript("site-create", args);
}

async function execDeleteSite(domain, deleteUser, deleteHome) {
  return runScript("site-delete", [
    "--domain",
    domain,
    "--delete-user",
    deleteUser ? "yes" : "no",
    "--delete-home",
    deleteHome ? "yes" : "no",
  ]);
}

async function execUpdateRuntime(domain, runtime, version, port) {
  const args = ["--domain", domain, "--runtime", mapRuntime(runtime)];
  if (version) args.push("--php-version", mapPhpVersion(version));
  if (port) args.push("--port", port);
  return runScript("site-update-runtime", args);
}

async function execUpdateDomain(domain, newDomain, root) {
  const args = ["--domain", domain, "--new-domain", newDomain];
  if (root) args.push("--root", root);
  return runScript("site-update-domain", args);
}

async function execChangePassword(domain, password) {
  return runScript("site-change-password", [
    "--domain",
    domain,
    "--password",
    password,
  ]);
}

async function execReadPhpini(domain, phpVersion) {
  const args = ["--domain", domain, "--read-only"];
  if (phpVersion) args.push("--php-version", mapPhpVersion(phpVersion));
  return runScript("phpini-save", args);
}

async function execSavePhpini(domain, phpVersion, settings, raw, username) {
  const args = ["--domain", domain];
  if (phpVersion) args.push("--php-version", mapPhpVersion(phpVersion));
  if (username) args.push("--user", username);
  if (Array.isArray(settings)) {
    settings.forEach(function (kv) {
      args.push("--set", kv);
    });
  }
  if (raw) args.push("--raw", raw);
  return runScript("phpini-save", args);
}

async function execSaveVhost(
  domain,
  root,
  runtime,
  phpVersion,
  port,
  configFile,
) {
  const args = [
    "--domain",
    domain,
    "--root",
    root,
    "--runtime",
    mapRuntime(runtime),
  ];
  if (phpVersion) args.push("--php-version", mapPhpVersion(phpVersion));
  if (port) args.push("--port", port);
  if (configFile) args.push("--config-file", configFile);
  return runScript("vhost-save", args);
}

async function execIssueSsl(domain, email) {
  return runScript("ssl-issue", [
    "--domain",
    domain,
    "--email",
    email || `admin@${domain}`,
  ]);
}

async function execDropDatabase(dbName, dbType, dbUser) {
  const args = [
    "--database",
    dbName,
    "--type",
    mapDatabaseType(dbType),
  ];
  if (dbUser) {
    args.push("--user", dbUser);
  }
  return runScript("database-drop", args);
}

async function execCreateDatabase(domain, type, dbName, dbUser, password) {
  return runScript("database-create", [
    "--domain",
    domain,
    "--type",
    mapDatabaseType(type),
    "--database",
    dbName,
    "--user",
    dbUser,
    "--password",
    password,
  ]);
}

async function execCreateFtp(domain, user, password, ftpPath) {
  return runScript("ftp-create", [
    "--domain",
    domain,
    "--user",
    user,
    "--password",
    password,
    "--path",
    ftpPath,
  ]);
}

async function execAddCron(domain, schedule, command, runUser) {
  const args = [
    "--domain",
    domain,
    "--schedule",
    schedule,
    "--command",
    command,
  ];
  if (runUser) args.push("--user", runUser);
  return runScript("cron-add", args);
}

async function execReadLogs(domain, type, lines) {
  return runScript("log-read", [
    "--domain",
    domain,
    "--type",
    type || "access",
    "--lines",
    String(lines || 100),
  ]);
}

async function execStatus() {
  return runScript("status", []);
}

async function execListSites() {
  return runScript("site-list", []);
}

function getServerStats() {
  if (!isLinux) {
    return {
      uptime: "N/A",
      loadAvg: [0, 0, 0],
      cpuCores: 0,
      ramTotal: 0,
      ramUsed: 0,
      ramPercent: 0,
      diskTotal: "0G",
      diskUsed: "0G",
      diskPercent: 0,
      services: [],
      networkRx: 0,
      networkTx: 0,
      cpuSpark: [0, 0, 0, 0, 0, 0],
    };
  }
  try {
    const uptimeStr = execSync("uptime -p", {
      timeout: 5000,
      encoding: "utf-8",
    })
      .trim()
      .replace(/^up /, "");
    const loadStr = execSync("cat /proc/loadavg | awk '{print $1,$2,$3}'", {
      timeout: 5000,
      encoding: "utf-8",
    }).trim();
    const loadAvg = loadStr.split(" ").map(Number);
    const cpuCores =
      parseInt(
        execSync("nproc", { timeout: 5000, encoding: "utf-8" }).trim(),
      ) || 0;
    const memInfo = execSync("free -m | awk '/^Mem:/{print $2,$3,$3/$2*100}'", {
      timeout: 5000,
      encoding: "utf-8",
    }).trim();
    const [ramTotal, ramUsed, ramPercent] = memInfo.split(" ").map(Number);
    const diskInfo = execSync("df -h / | awk 'NR==2{print $2,$3,$5}'", {
      timeout: 5000,
      encoding: "utf-8",
    }).trim();
    const [diskTotal, diskUsed, diskPercentStr] = diskInfo.split(" ");
    const diskPercent = parseInt(diskPercentStr) || 0;
    const servicesOutput = execSync(
      "sudo -n " + path.join(SCRIPTS_DIR, "status.sh"),
      { timeout: 10000, encoding: "utf-8" },
    ).trim();
    const servicesSection = servicesOutput.split("\nSites")[0];
    const services = servicesSection
      .split("\n")
      .filter((l) => l.includes("running") || l.includes("stopped"))
      .map((l) => {
        const parts = l.trim().split(/\s+/);
        return { name: parts[0], status: parts[1] || "unknown" };
      });
    let networkRx = 0, networkTx = 0;
    try {
      const netStr = execSync("awk 'NR>2{if($2>0){gsub(/:$/,\"\",$1);printf \"%s %.2f %.2f\",$1,$2/1024/1024,$10/1024/1024;exit}}' /proc/net/dev", { timeout: 5000, encoding: "utf-8" }).trim();
      const parts = netStr.split(" ");
      if (parts.length >= 3) {
        networkRx = parseFloat(parts[1]) || 0;
        networkTx = parseFloat(parts[2]) || 0;
      }
    } catch (e) {}
    const cpuSpark = [];
    try {
      const raw = execSync("cat /proc/loadavg", { timeout: 3000, encoding: "utf-8" }).trim();
      const fields = raw.split(/\s+/);
      const cpus = cpuCores || 1;
      cpuSpark.push(Math.min(Math.round((parseFloat(fields[0]) / cpus) * 100), 100));
      cpuSpark.push(Math.min(Math.round((parseFloat(fields[1]) / cpus) * 100), 100));
      cpuSpark.push(Math.min(Math.round((parseFloat(fields[2]) / cpus) * 100), 100));
      for (let i = cpuSpark.length; i < 6; i++) {
        cpuSpark.push(Math.round(cpuSpark[i - 1] * (0.7 + Math.random() * 0.6)));
      }
    } catch (e) {
      for (let i = 0; i < 6; i++) cpuSpark.push(0);
    }
    return {
      uptime: uptimeStr,
      loadAvg,
      cpuCores,
      ramTotal,
      ramUsed,
      ramPercent: Math.round(ramPercent),
      diskTotal,
      diskUsed,
      diskPercent,
      services,
      networkRx,
      networkTx,
      cpuSpark,
    };
  } catch (e) {
    return {
      uptime: "error",
      loadAvg: [0, 0, 0],
      cpuCores: 0,
      ramTotal: 0,
      ramUsed: 0,
      ramPercent: 0,
      diskTotal: "0G",
      diskUsed: "0G",
      diskPercent: 0,
      services: [],
      networkRx: 0,
      networkTx: 0,
      cpuSpark: [0, 0, 0, 0, 0, 0],
    };
  }
}

  const MYCP_SITES_DIR = process.env.MYCP_SITES_DIR || config.MYCP_SITES_DIR;

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const site = {};
  for (const line of content.split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    const m = trimmed.match(/^([A-Z_]+)="(.*)"$/);
    if (m) site[m[1].toLowerCase()] = m[2];
  }
  return site;
}

function syncSitesFromServer() {
  if (!isLinux) return null;
  if (!fs.existsSync(MYCP_SITES_DIR)) {
    try {
      execSync("sudo -n bash " + path.join(SCRIPTS_DIR, "site-list.sh"), {
        timeout: 10000,
        stdio: "ignore",
      });
    } catch (e) {
      /* ignore */
    }
    if (!fs.existsSync(MYCP_SITES_DIR)) return null;
  }
  const files = fs
    .readdirSync(MYCP_SITES_DIR)
    .filter((f) => f.endsWith(".env"));
  if (!files.length) return null;

  const sites = files.map((f) => {
    const raw = parseEnvFile(path.join(MYCP_SITES_DIR, f));
    const runtime =
      SCRIPT_TO_RUNTIME[raw.runtime] || raw.runtime || "PHP Native";
    return {
      domain: raw.domain || f.replace(".env", ""),
      username: raw.username || "",
      runtime: runtime,
      version: formatVersion(raw.runtime, raw.php_version, raw.node_version),
      database: unmapDatabaseType(raw.db_type),
      port: raw.app_port || "80",
      ssl: raw.ssl_enabled === "yes",
      ftp: raw.ftp_enabled === "yes",
      status: raw.status || "running",
      path: raw.root_dir || `${config.MYCP_HOME_PREFIX}/${raw.username || "unknown"}/htdocs`,
      ip: getServerIp(),
      createdAt: new Date().toISOString(),
    };
  });

  return sites;
}

let cachedIp = null;
function getServerIp() {
  if (cachedIp) return cachedIp;
  if (!isLinux) return "127.0.0.1";
  try {
    const ip = execSync("hostname -I | awk '{print $1}'", {
      timeout: 2000,
      encoding: "utf-8",
    }).trim();
    if (ip) {
      cachedIp = ip;
      return ip;
    }
  } catch (e) {
    /* ignore */
  }
  try {
    const ip = execSync("curl -s --max-time 2 ifconfig.me", {
      timeout: 2000,
      encoding: "utf-8",
    }).trim();
    if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      cachedIp = ip;
      return ip;
    }
  } catch (e) {
    /* ignore */
  }
  cachedIp = "103.133.61.102";
  return cachedIp;
}

function execReadVhost(domain) {
  if (!isLinux) return Promise.resolve({ stdout: "(simulated)\n" });
  return runScript("vhost-save", ["--domain", domain, "--read-only"]);
}

function execFileList(domain, relPath) {
  return runScript("file-list", ["--domain", domain, "--path", relPath || "."]);
}

function execCreateFolder(domain, relPath) {
  return runScript("folder-create", ["--domain", domain, "--path", relPath]);
}

function execWriteFile(domain, relPath, content) {
  if (!isLinux)
    return Promise.resolve({ stdout: "(simulated)", stderr: "", code: 0 });
  const tmpFile = path.join(os.tmpdir(), "mycp_write_" + Date.now());
  try {
    fs.writeFileSync(tmpFile, content, "utf-8");
    return runScript("file-write", [
      "--domain",
      domain,
      "--path",
      relPath,
      "--content-file",
      tmpFile,
    ]).finally(() => {
      try {
        fs.unlinkSync(tmpFile);
      } catch (e) {
        /* ignore */
      }
    });
  } catch (e) {
    return Promise.reject(e);
  }
}

function execReadFile(domain, relPath) {
  return runScript("file-read", ["--domain", domain, "--path", relPath]);
}

function execRenameFile(domain, oldPath, newName) {
  return runScript("file-rename", [
    "--domain",
    domain,
    "--old-path",
    oldPath,
    "--new-name",
    newName,
  ]);
}

function execCopyFile(domain, srcPath, destPath) {
  return runScript("file-copy", [
    "--domain",
    domain,
    "--source",
    srcPath,
    "--dest",
    destPath,
  ]);
}

function execMoveFile(domain, srcPath, destPath) {
  return runScript("file-move", [
    "--domain",
    domain,
    "--source",
    srcPath,
    "--dest",
    destPath,
  ]);
}

function execDeleteFile(domain, relPath) {
  return runScript("file-delete", ["--domain", domain, "--path", relPath]);
}

function execCompressFile(domain, relPath) {
  return runScript("file-compress", ["--domain", domain, "--path", relPath]);
}

function execChmodFile(domain, relPath, mode) {
  return runScript("file-chmod", [
    "--domain",
    domain,
    "--path",
    relPath,
    "--mode",
    mode,
  ]);
}

let _installedPhpCache = null;
function getInstalledPhpVersions() {
  if (_installedPhpCache) return _installedPhpCache;
  if (!isLinux) {
    _installedPhpCache = ["8.3", "8.4"];
    return _installedPhpCache;
  }
  try {
    const phpDir = process.env.MYCP_PHP_CONFIG_DIR || config.MYCP_PHP_CONFIG_DIR;
    const out = execSync("ls -1 " + phpDir + " 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    _installedPhpCache = out ? out.split(/\s+/).filter(Boolean).sort() : [];
  } catch (e) {
    _installedPhpCache = [];
  }
  return _installedPhpCache;
}

function execCommand(command, options) {
  const opts = options || {};
  const cwd = opts.cwd || process.env.APP_DIR || config.APP_DIR;
  const timeout = opts.timeout || 15000;
  if (!isLinux) {
    return { stdout: "(simulated: " + command + ")", stderr: "", exitCode: 0 };
  }
  try {
    const stdout = execSync(command, {
      cwd,
      timeout,
      shell: "/bin/bash",
      encoding: "utf-8",
    });
    return { stdout: stdout || "", stderr: "", exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "Command failed",
      exitCode: err.status || 1,
    };
  }
}

function resolveActualPhpVersion(requested) {
  const installed = getInstalledPhpVersions();
  if (!installed.length) return "8.4";
  const normalized = (requested || "")
    .toString()
    .replace(/^PHP\s+/i, "")
    .replace(/\s*FPM$/i, "")
    .trim();
  if (normalized && installed.includes(normalized)) return normalized;
  return installed[installed.length - 1];
}

function getSiteServices(domain) {
const MYCP_SITES_DIR = process.env.MYCP_SITES_DIR || config.MYCP_SITES_DIR;
  const siteFile = path.join(MYCP_SITES_DIR, domain + ".env");
  let runtime = "", phpVersion = "8.4", hasDb = false, hasFtp = false;
  try {
    const envContent = fs.readFileSync(siteFile, "utf-8");
    const mRuntime = envContent.match(/^RUNTIME=(.*)$/m);
    if (mRuntime) runtime = mRuntime[1].replace(/^["']|["']$/g, "").toLowerCase();
    const mPhp = envContent.match(/^PHP_VERSION=(.*)$/m);
    if (mPhp) phpVersion = mPhp[1].replace(/^["']|["']$/g, "").replace(/^PHP\s*/i, "");
    const mDb = envContent.match(/^DB_TYPE=(.*)$/m);
    if (mDb) hasDb = mDb[1].replace(/^["']|["']$/g, "").length > 0;
    const mFtp = envContent.match(/^FTP_ENABLED=(.*)$/m);
    if (mFtp) hasFtp = mFtp[1].replace(/^["']|["']$/g, "") === "1";
  } catch (e) {}
  const results = [];
  function checkService(serviceName, label) {
    try {
      const out = execSync("sudo -n service " + serviceName + " status 2>&1", { timeout: 5000, encoding: "utf-8" });
      const running = out.includes("running") || out.includes("active");
      results.push({ service: serviceName, label, status: running ? "running" : "stopped" });
    } catch (e) {
      results.push({ service: serviceName, label, status: "stopped" });
    }
  }
  function checkPidFile(pidPath, label, serviceKey) {
    try {
      const exists = fs.existsSync(pidPath);
      if (exists) {
        const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
        if (pid > 0) {
          const out = execSync("ps -p " + pid + " -o pid= 2>&1", { timeout: 3000, encoding: "utf-8" });
          if (out.trim().length > 0) {
            results.push({ service: serviceKey || label, label, status: "running" });
            return;
          }
        }
      }
    } catch (e) {}
    results.push({ service: serviceKey || label, label, status: "stopped" });
  }
  function checkSocket(socketPath, label, serviceKey) {
    try {
      if (fs.existsSync(socketPath)) {
        results.push({ service: serviceKey || label, label, status: "running" });
        return;
      }
    } catch (e) {}
    results.push({ service: serviceKey || label, label, status: "stopped" });
  }
  checkPidFile(config.MYCP_NGINX_PID, "Nginx", "nginx");
  if (runtime.includes("php") || runtime.includes("laravel") || runtime.includes("codeigniter")) {
    var phpService = "php" + phpVersion + "-fpm";
    var sockPath = config.MYCP_SOCK_DIR + "/mycp-" + domain + ".sock";
    checkSocket(sockPath, "PHP " + phpVersion + " FPM", phpService);
  }
  if (runtime.includes("node")) {
    var pm2PidPath = config.MYCP_PM2_HOME + "/pids/" + domain + "-0.pid";
    checkPidFile(pm2PidPath, "PM2 (" + domain + ")", "pm2:" + domain);
  }
  if (hasDb) checkPidFile(config.MYCP_MYSQL_PID, "MySQL (Shared)", "mysql");
  if (hasFtp) checkPidFile(config.MYCP_VSFTPD_PID, "FTP", "vsftpd");
  return results;
}

function execServiceAction(domain, serviceName, action) {
  if (!isLinux) return { ok: true, message: "(simulated) " + action + " " + serviceName };
  if (serviceName.startsWith("pm2:")) {
    const appName = serviceName.slice(4);
    try {
      if (action === "start") {
        var root = config.MYCP_HOME_PREFIX + "/" + appName.replace(/\..*$/, "") + "/htdocs";
        execSync("pm2 start " + root + "/server.js --name " + appName + " -f 2>&1", { timeout: 15000, encoding: "utf-8", maxBuffer: 1024 * 1024 });
      } else if (action === "stop") {
        execSync("pm2 stop " + appName + " 2>&1", { timeout: 10000, encoding: "utf-8", maxBuffer: 1024 * 1024 });
      } else if (action === "restart") {
        execSync("pm2 restart " + appName + " 2>&1", { timeout: 10000, encoding: "utf-8", maxBuffer: 1024 * 1024 });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  var isNginx = serviceName === "nginx";
  var isPhp = serviceName.startsWith("php") && serviceName.endsWith("-fpm");
  try {
    if (action === "start") {
      if (isNginx) {
        execSync("sudo -n " + (process.env.MYCP_NGINX_BIN || "nginx") + " 2>&1", { timeout: 10000, encoding: "utf-8" });
      } else if (isPhp) {
        var phpVer = serviceName.replace("php", "").replace("-fpm", "");
        execSync("sudo -n " + (process.env.MYCP_SERVICE_BIN || "/usr/sbin/service") + " " + serviceName + " start 2>&1", { timeout: 10000, encoding: "utf-8" });
      } else {
        execSync("sudo -n " + (process.env.MYCP_SERVICE_BIN || "/usr/sbin/service") + " " + serviceName + " start 2>&1", { timeout: 15000, encoding: "utf-8" });
      }
    } else if (action === "stop") {
      if (isNginx) {
        execSync("sudo -n pkill nginx 2>&1", { timeout: 10000, encoding: "utf-8" });
      } else if (isPhp) {
        execSync("sudo -n pkill " + serviceName + " 2>&1", { timeout: 10000, encoding: "utf-8" });
      } else {
        execSync("sudo -n " + (process.env.MYCP_SERVICE_BIN || "/usr/sbin/service") + " " + serviceName + " stop 2>&1", { timeout: 15000, encoding: "utf-8" });
      }
    } else if (action === "restart") {
      if (isNginx) {
        execSync("sudo -n " + (process.env.MYCP_SERVICE_BIN || "/usr/sbin/service") + " nginx restart 2>&1", { timeout: 15000, encoding: "utf-8" });
      } else if (isPhp) {
        execSync("sudo -n " + (process.env.MYCP_SERVICE_BIN || "/usr/sbin/service") + " " + serviceName + " restart 2>&1", { timeout: 15000, encoding: "utf-8" });
      } else {
        execSync("sudo -n " + (process.env.MYCP_SERVICE_BIN || "/usr/sbin/service") + " " + serviceName + " restart 2>&1", { timeout: 15000, encoding: "utf-8" });
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  isLinux,
  runScript,
  execCommand,
  syncSitesFromServer,
  getServerStats,
  getServerIp,
  getInstalledPhpVersions,
  resolveActualPhpVersion,
  execCreateSite,
  execDeleteSite,
  execUpdateRuntime,
  execUpdateDomain,
  execChangePassword,
  execSaveVhost,
  execIssueSsl,
  execCreateDatabase,
  execDropDatabase,
  execCreateFtp,
  execAddCron,
  execReadLogs,
  execStatus,
  execListSites,
  execFileList,
  execCreateFolder,
  execWriteFile,
  execReadVhost,
  execReadFile,
  execRenameFile,
  execCopyFile,
  execMoveFile,
  execDeleteFile,
  execCompressFile,
  execChmodFile,
  getSiteServices,
  execServiceAction,
  execReadPhpini,
  execSavePhpini,
};

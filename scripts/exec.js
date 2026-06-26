const path = require("path");
const { execFile, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");

// Use canonical Linux path for scripts so sudoers NOPASSWD rules match.
// __dirname may resolve to /mnt/c/... when server starts from Windows volume.
let SCRIPTS_DIR = __dirname;
if (process.platform === "linux") {
  const candidate = "/home/srv/cp/scripts";
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
  "CodeIgniter 4": "php",
  "CodeIgniter 3": "php",
  Laravel: "php",
  "PHP Native": "php",
  "Node.js": "node",
  "Static HTML": "static",
  "Reverse Proxy": "reverse-proxy",
};

const SCRIPT_TO_RUNTIME = {
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
  const isPhp = runtime === "php";
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
    "--root", params.path || `/home/${params.username}/htdocs`,
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

async function execDropDatabase(dbName, dbType) {
  return runScript("database-drop", [
    "--database",
    dbName,
    "--type",
    mapDatabaseType(dbType),
  ]);
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
    };
  }
}

const MYCP_SITES_DIR = "/etc/mycontrolpanel/sites";

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
      path: raw.root_dir || `/home/${raw.username || "unknown"}/htdocs`,
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
    const out = execSync("ls -1 /etc/php 2>/dev/null", {
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
  const cwd = opts.cwd || "/home/srv/cp";
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
  execReadPhpini,
  execSavePhpini,
};

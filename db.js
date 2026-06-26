const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const exec = require("./scripts/exec");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_DATA = {
  users: [
    {
      username: "admin",
      password: bcrypt.hashSync("admin123", 10),
      createdAt: new Date().toISOString(),
    },
  ],
  sites: [],
  databases: [
    {
      id: 1,
      siteDomain: "dsmartlampung.com",
      dbName: "dsmartlampung_db",
      dbType: "MySQL",
      dbUser: "dsmartlampung_user",
      createdAt: new Date().toISOString(),
    },
  ],
  cronJobs: [
    {
      id: 1,
      siteDomain: "dsmartlampung.com",
      schedule: "*/5 * * * *",
      command: "php spark queue:work",
      status: "Aktif",
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      siteDomain: "dsmartlampung.com",
      schedule: "15 3 * * *",
      command: "php spark backup:database",
      status: "Aktif",
      createdAt: new Date().toISOString(),
    },
  ],
  ftpAccounts: [
    {
      id: 1,
      siteDomain: "dsmartlampung.com",
      username: "dsmartlampung_ftp",
      password: "********",
      path: "/home/dsmartlampung/htdocs",
      permission: "Read / Write",
      createdAt: new Date().toISOString(),
    },
  ],
};

let data = null;

function load() {
  if (data) return data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Try syncing from real server first
  const synced = exec.syncSitesFromServer();
  if (Array.isArray(synced)) {
    // Build data from real server state + default users
    data = {
      users: JSON.parse(JSON.stringify(DEFAULT_DATA.users)),
      sites: synced,
      databases: [],
      cronJobs: [],
      ftpAccounts: [],
    };
    // Try reading existing JSON db for sub-resources and preserve runtime only
    if (fs.existsSync(DATA_FILE)) {
      try {
        const existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
        data.databases = existing.databases || [];
        data.cronJobs = existing.cronJobs || [];
        data.ftpAccounts = existing.ftpAccounts || [];
        // Preserve runtime from existing JSON (user choice), tapi version & root
        // SELALU ambil dari env file (.env) karena env adalah server reality.
        if (Array.isArray(existing.sites)) {
          data.sites = synced.map((s) => {
            const old = existing.sites.find((x) => x.domain === s.domain);
            return old ? { ...s, runtime: old.runtime } : s;
          });
        }
      } catch (e) {
        /* ignore */
      }
    }
    save();
    return data;
  }

  // Fallback: read from JSON file or use defaults
  if (fs.existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
      if (parsed && Array.isArray(parsed.sites)) {
        data = parsed;
        return data;
      }
    } catch (e) {
      /* fall through */
    }
  }
  data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  save();
  return data;
}

function save() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, DATA_FILE);
}

load();

// --- Users ---
function verifyUser(username, password) {
  const user = data.users.find((u) => u.username === username);
  return user && bcrypt.compareSync(password, user.password) ? user : null;
}

function getUser(username) {
  return data.users.find((u) => u.username === username) || null;
}

// --- Sites ---
function getSites() {
  return data.sites.map((s) => ({ ...s }));
}

function getSite(domain) {
  return data.sites.find((s) => s.domain === domain) || null;
}

function createSite(site) {
  if (data.sites.find((s) => s.domain === site.domain)) return null;
  const entry = {
    ...site,
    ip: site.ip || "103.133.61.102",
    createdAt: new Date().toISOString(),
  };
  data.sites.push(entry);
  save();
  return entry;
}

function updateSite(domain, updates) {
  const idx = data.sites.findIndex((s) => s.domain === domain);
  if (idx === -1) return null;
  data.sites[idx] = { ...data.sites[idx], ...updates, domain };
  save();
  return data.sites[idx];
}

function deleteSite(domain) {
  const idx = data.sites.findIndex((s) => s.domain === domain);
  if (idx === -1) return false;
  data.sites.splice(idx, 1);
  data.databases = data.databases.filter((d) => d.siteDomain !== domain);
  data.cronJobs = data.cronJobs.filter((c) => c.siteDomain !== domain);
  data.ftpAccounts = data.ftpAccounts.filter((f) => f.siteDomain !== domain);
  save();
  return true;
}

// --- Databases ---
function getDatabases(siteDomain) {
  return data.databases.filter((d) => d.siteDomain === siteDomain);
}

function createDatabase(siteDomain, info) {
  if (!data.sites.find((s) => s.domain === siteDomain)) return null;
  const maxId = data.databases.reduce((m, d) => Math.max(m, d.id), 0);
  const entry = {
    id: maxId + 1,
    siteDomain,
    ...info,
    createdAt: new Date().toISOString(),
  };
  data.databases.push(entry);
  save();
  return entry;
}

function getDatabase(id) {
  return data.databases.find((d) => d.id === id) || null;
}

function deleteDatabase(id) {
  const idx = data.databases.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  data.databases.splice(idx, 1);
  save();
  return true;
}

// --- Cron Jobs ---
function getCronJobs(siteDomain) {
  return data.cronJobs.filter((c) => c.siteDomain === siteDomain);
}

function createCronJob(siteDomain, info) {
  if (!data.sites.find((s) => s.domain === siteDomain)) return null;
  const maxId = data.cronJobs.reduce((m, c) => Math.max(m, c.id), 0);
  const entry = {
    id: maxId + 1,
    siteDomain,
    ...info,
    createdAt: new Date().toISOString(),
  };
  data.cronJobs.push(entry);
  save();
  return entry;
}

function deleteCronJob(id) {
  const idx = data.cronJobs.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  data.cronJobs.splice(idx, 1);
  save();
  return true;
}

// --- FTP Accounts ---
function getFtpAccounts(siteDomain) {
  return data.ftpAccounts.filter((f) => f.siteDomain === siteDomain);
}

function createFtpAccount(siteDomain, info) {
  if (!data.sites.find((s) => s.domain === siteDomain)) return null;
  const maxId = data.ftpAccounts.reduce((m, f) => Math.max(m, f.id), 0);
  const entry = {
    id: maxId + 1,
    siteDomain,
    ...info,
    createdAt: new Date().toISOString(),
  };
  data.ftpAccounts.push(entry);
  save();
  return entry;
}

function deleteFtpAccount(id) {
  const idx = data.ftpAccounts.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  data.ftpAccounts.splice(idx, 1);
  save();
  return true;
}

// --- Dashboard ---
function getDashboardStats() {
  const sites = data.sites;
  const running = sites.filter((s) => s.status === "running").length;
  const sslActive = sites.filter((s) => s.ssl).length;
  return {
    totalSites: sites.length,
    runningSites: running,
    issueSites: sites.length - running,
    sslActive,
    totalDatabases: data.databases.length,
    totalCronJobs: data.cronJobs.length,
    totalFtpAccounts: data.ftpAccounts.length,
  };
}

module.exports = {
  verifyUser,
  getUser,
  getSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  getDatabases,
  getDatabase,
  createDatabase,
  deleteDatabase,
  getCronJobs,
  createCronJob,
  deleteCronJob,
  getFtpAccounts,
  createFtpAccount,
  deleteFtpAccount,
  getDashboardStats,
};

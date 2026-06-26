import * as api from '../api/detailApi.js';

// Ensure global functions exist for existing code
window.getSite = api.getSite;
window.getDatabases = api.getDatabases;
window.getCronJobs = api.getCronJobs;
window.getFtpAccounts = api.getFtpAccounts;
window.getFileList = api.getFileList;
window.readFile = api.readFile;
window.writeFile = api.writeFile;
window.compressFile = api.compressFile;
window.copyFile = api.copyFile;
window.moveFile = api.moveFile;
window.renameFile = api.renameFile;
window.deleteFile = api.deleteFile;
window.updateSite = api.updateSite;
window.createDatabase = api.createDatabase;
window.deleteDatabase = api.deleteDatabase;
window.createCronJob = api.createCronJob;
window.createFolder = api.createFolder;
window.deleteDb = api.deleteDb;
window.issueSsl = api.issueSsl;
window.getVhost = api.getVhost;
window.saveVhost = api.saveVhost;
window.fetchPhpini = api.fetchPhpini;
window.changePassword = api.changePassword;
window.deleteSite = api.deleteSite;

// --- Original detail.js content starts here ---
const params = new URLSearchParams(window.location.search);
const domain = params.get("site");
let site = null;
let activeDialog = "";
let currentFilePath = ".";
let clipboard = { items: [], action: null }; // action: 'copy' | 'cut'

// Utilities
const escapeHtml = (str) => str.replace(/[&<>"']/g, (tag) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[tag]));

const FILE_ICONS = {
  html: "fa-brands fa-html5",
  htm: "fa-brands fa-html5",
  css: "fa-brands fa-css3-alt",
  js: "fa-brands fa-js",
  json: "fa-solid fa-brackets-curly",
  php: "fa-brands fa-php",
  py: "fa-brands fa-python",
  rb: "fa-brands fa-ruby",
  java: "fa-brands fa-java",
  ts: "fa-solid fa-code",
  tsx: "fa-solid fa-code",
  jsx: "fa-solid fa-code",
  md: "fa-solid fa-markdown",
  yml: "fa-solid fa-file-lines",
  yaml: "fa-solid fa-file-lines",
  xml: "fa-solid fa-file-code",
  sql: "fa-solid fa-database",
  sh: "fa-solid fa-terminal",
  env: "fa-solid fa-gear",
  gitignore: "fa-solid fa-code-fork",
  txt: "fa-solid fa-file-lines",
  pdf: "fa-solid fa-file-pdf",
  zip: "fa-solid fa-file-zipper",
  tar: "fa-solid fa-file-zipper",
  gz: "fa-solid fa-file-zipper",
  png: "fa-solid fa-file-image",
  jpg: "fa-solid fa-file-image",
  jpeg: "fa-solid fa-file-image",
  gif: "fa-solid fa-file-image",
  svg: "fa-solid fa-file-image",
  ico: "fa-solid fa-file-image",
  mp4: "fa-solid fa-file-video",
  webm: "fa-solid fa-file-video",
  mp3: "fa-solid fa-file-audio",
  wav: "fa-solid fa-file-audio",
  woff: "fa-solid fa-file-font",
  woff2: "fa-solid fa-file-font",
  ttf: "fa-solid fa-file-font",
  eot: "fa-solid fa-file-font",
  conf: "fa-solid fa-file-lines",
  cfg: "fa-solid fa-file-lines",
  log: "fa-solid fa-file-lines",
  lock: "fa-solid fa-lock",
};

function getFileIcon(name) {
  if (name.startsWith(".")) return "fa-solid fa-eye-slash";
  const ext = name.split(".").pop().toLowerCase();
  return FILE_ICONS[ext] || "fa-solid fa-file-code";
}

async function loadDetail() {
  if (!domain) {
    document.body.innerHTML =
      '<div class="main"><h1>Domain tidak diberikan</h1><a href="/">Kembali</a></div>';
    return;
  }
  site = await getSite(domain);
  if (!site) {
    document.body.innerHTML =
      '<div class="main"><h1>Site tidak ditemukan</h1><a href="/">Kembali</a></div>';
    return;
  }

  document.title = site.domain + " - MyControlPanel";
  document.querySelector("#detailDomain").textContent = site.domain;
  document.querySelector("#detailDomainLink").href = "http://" + site.domain;
  var ip = site.ip || window.location.hostname;
  document.querySelector("#detailDomainUrl").textContent =
    "http://" + ip + ":" + (site.port || "80") + "/";
  document.querySelector("#detailUser").textContent = site.username;
  document.querySelector("#detailIp").textContent = site.ip || "-";
  document.querySelector("#detailPath").textContent = site.path;
  document.querySelector("#detailPreviewLink").href =
    "/preview-proxy/" + encodeURIComponent(site.domain) + "/";

  document.querySelector("#settingDomain").value = site.domain;
  document.querySelector("#settingRoot").value = site.path;
  document.querySelector("#settingUser").value = site.username;
  document.querySelector("#settingRuntime").value =
    site.runtime || "CodeIgniter 4";
  document.querySelector("#settingPhpVersion").value =
    site.version || "PHP 8.4";
  document.querySelector("#sslStatus").textContent = site.ssl
    ? "Valid"
    : "Disabled";
  document.querySelector("#sslStatus").className = site.ssl ? "ok" : "muted";

  var initialTab = params.get("tab") || "dashboard";
  switchTab(initialTab);
}

async function loadDatabases() {
  const dbs = await getDatabases(domain);
  const tbody = document.querySelector("#databaseRows");
  if (dbs.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#9aa3ad">Belum ada database. Klik "New Database" untuk membuat.</td></tr>';
  } else {
    tbody.innerHTML = dbs
      .map(function (db) {
        const safeDbName = escapeHtml(db.dbName);
        const safeDbType = escapeHtml(db.dbType);
        const safeDbUser = escapeHtml(db.dbUser);
        return (
          "<tr><td>" +
          safeDbName +
          "</td><td>" +
          safeDbType +
          "</td><td>" +
          safeDbUser +
          '</td><td><button class="ghost-btn compact" type="button" onclick="window.open(\'/phpmyadmin/index.php?route=/database/structure&db=' +
          encodeURIComponent(db.dbName) +
          '\', \'_blank\')" title="Manage">Manage</button> <button class="danger-btn compact" type="button" onclick="deleteDb(' +
          db.id +
          ')" title="Hapus database">Hapus</button></td></tr>'
        );
      })
      .join("");
  }
  document.querySelector("#dbCount").textContent = dbs.length;
}

async function loadCronJobs() {
  const jobs = await getCronJobs(domain);
  const tbody = document.querySelector("#cronRows");
  if (jobs.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" style="text-align:center;color:#9aa3ad">Belum ada cron job. Klik "New Cron" untuk menambah.</td></tr>';
  } else {
    tbody.innerHTML = jobs
      .map(function (job) {
        const safeSchedule = escapeHtml(job.schedule);
        const safeCommand = escapeHtml(job.command);
        const safeStatus = escapeHtml(job.status);
        return (
          "<tr><td>" +
          safeSchedule +
          "</td><td>" +
          safeCommand +
          '</td><td><span class="status ' +
          (job.status === "Aktif" ? "running" : "issue") +
          '">' +
          safeStatus +
          "</span></td></tr>"
        );
      })
      .join("");
  }
}

async function loadFtpAccounts() {
  const accounts = await getFtpAccounts(domain);
  const container = document.querySelector("#ftpRows");
  if (!container) return;
  if (accounts.length === 0) {
    container.innerHTML =
      '<div class="service-row"><span style="color:#9aa3ad">Belum ada akun FTP</span></div>';
  } else {
    container.innerHTML = accounts
      .map(function (acc) {
        return (
          '<div class="service-row"><span>' +
          acc.username +
          '</span><b class="ok">Enabled</b></div>'
        );
      })
      .join("");
  }
}

// --- Context Menu ---
function createContextMenu() {
  var existing = document.querySelector("#fileContextMenu");
  if (existing && existing.isConnected) return existing;
  if (existing && !existing.isConnected) existing.remove(); // orphan

  var menu = document.createElement("div");
  menu.id = "fileContextMenu";
  menu.className = "context-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML =
    '<button data-action="download" role="menuitem"><i class="fa-solid fa-download"></i> Download</button>' +
    '<button data-action="edit" role="menuitem"><i class="fa-solid fa-pen-to-square"></i> Edit</button>' +
    '<button data-action="chmod" role="menuitem"><i class="fa-solid fa-lock"></i> Chmod</button>' +
    '<button data-action="compress" role="menuitem"><i class="fa-solid fa-compress"></i> Compress</button>' +
    "<hr>" +
    '<button data-action="copy" role="menuitem"><i class="fa-solid fa-copy"></i> Copy</button>' +
    '<button data-action="cut" role="menuitem"><i class="fa-solid fa-scissors"></i> Cut</button>' +
    '<button data-action="paste" role="menuitem"><i class="fa-solid fa-paste"></i> Paste</button>' +
    "<hr>" +
    '<button data-action="rename" role="menuitem"><i class="fa-solid fa-pencil"></i> Rename</button>' +
    '<button data-action="delete" class="danger-action" role="menuitem"><i class="fa-solid fa-trash"></i> Delete</button>';
  document.body.appendChild(menu);

  menu.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();
    var action = btn.dataset.action;
    handleContextAction(action);
  });

  return menu;
}

function showContextMenu(x, y, path, type) {
  var menu = createContextMenu();
  if (!menu || !path) return;

  hideContextMenu();
  menu.dataset.contextPath = path;
  menu.dataset.contextType = type || "file";
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.classList.add("open", "measuring");

  // Force reflow agar getBoundingClientRect mengembalikan ukuran asli
  void menu.offsetWidth;

  // Position menu within viewport
  var rect = menu.getBoundingClientRect();
  var mw = rect.width || 200;
  var mh = rect.height || 280;
  var vw = window.innerWidth,
    vh = window.innerHeight;
  var left = Math.min(x, vw - mw - 5);
  var top = Math.min(y, vh - mh - 5);
  left = Math.max(5, left);
  top = Math.max(5, top);

  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.classList.remove("measuring");

  // Disable download/chmod/edit/compress for folders
  var isFolder = type === "folder";
  menu
    .querySelectorAll(
      '[data-action="download"], [data-action="edit"], [data-action="chmod"]',
    )
    .forEach(function (b) {
      b.style.display = isFolder ? "none" : "";
    });
  menu.querySelector('[data-action="compress"]').style.display = isFolder
    ? ""
    : "";
}

function hideContextMenu() {
  var menu = document.querySelector("#fileContextMenu");
  if (menu) menu.classList.remove("open");
}

document.addEventListener("click", function (e) {
  // Tutup menu hanya jika klik di luar context menu DAN bukan tombol yang membukanya
  if (e.target.closest(".context-menu")) return;
  if (e.button === 2) return; // right-click - jangan tutup
  hideContextMenu();
});

document.addEventListener("scroll", hideContextMenu, true);
window.addEventListener("resize", hideContextMenu);

function initFileContextMenu() {
  var menu = createContextMenu();
  var list = document.querySelector("#fileRows");
  if (!list) {
    console.warn("[file-context] #fileRows not found");
    return;
  }

  // Guard: pasang listener sekali saja pada <ul> (parent tetap sama walau isi di-rebuild).
  if (list.dataset.contextReady === "1") {
    // Tetap pastikan #fileContextMenu ada di body (misal halaman di-cache sebagian)
    if (menu && !menu.isConnected) document.body.appendChild(menu);
    return;
  }
  list.dataset.contextReady = "1";

  list.addEventListener("contextmenu", function (e) {
    var li = e.target.closest("li[data-path]");
    if (!li || !list.contains(li)) return; // klik di area kosong list -> biarkan browser
    e.preventDefault();
    e.stopPropagation();
    console.log(
      "[file-context] right-click on",
      li.dataset.path,
      li.dataset.type,
    );
    showContextMenu(
      e.clientX,
      e.clientY,
      li.dataset.path,
      li.dataset.type || "file",
    );
  });

  // Tutup menu saat klik kanan di tempat lain di dalam list tapi bukan di <li>
  list.addEventListener(
    "contextmenu",
    function (e) {
      if (!e.target.closest("li[data-path]")) hideContextMenu();
    },
    true,
  );
}

function handleContextAction(action) {
  var menu = document.querySelector("#fileContextMenu");
  var path = menu ? menu.dataset.contextPath : "";
  var type = menu ? menu.dataset.contextType : "file";
  if (!path) return;

  switch (action) {
    case "download":
      triggerDownload(path);
      break;
    case "edit":
      openFileEditor(path);
      break;
    case "chmod":
      openChmodDialog(path);
      break;
    case "compress":
      compressItem(path);
      break;
    case "copy":
      clipboard = { items: [path], action: "copy" };
      showToast("Copied: " + path.split("/").pop());
      break;
    case "cut":
      clipboard = { items: [path], action: "cut" };
      showToast("Cut: " + path.split("/").pop());
      break;
    case "paste":
      pasteItem(path, type);
      break;
    case "rename":
      openRenameDialog(path);
      break;
    case "delete":
      deleteItem(path);
      break;
  }
}

// --- File List ---
async function loadFileList(path) {
  currentFilePath = path || ".";
  const data = await getFileList(domain, currentFilePath);
  document.querySelector("#currentPath").textContent =
    "Path: " +
    data.root +
    "/" +
    (currentFilePath === "." ? "" : currentFilePath);
  const list = document.querySelector("#fileRows");
  var html = "";
  if (currentFilePath !== ".") {
    var parentPath = currentFilePath.split("/").slice(0, -1).join("/") || ".";
    html +=
      '<li class="file-back" data-path="' +
      parentPath +
      '" data-type="folder"><span><i class="fa-solid fa-arrow-left"></i> ..</span><small>folder</small></li>';
  }
  data.entries.forEach(function (entry) {
    // -- XSS sanitization: escape user-controlled values before inserting into HTML
    const safeName = escapeHtml(entry.name);
    const safeSize = escapeHtml(entry.size + " B");
    const icon = entry.type === "folder" ? "fa-folder" : getFileIcon(entry.name);
    var fullPath =
      currentFilePath === "." ? entry.name : currentFilePath + "/" + entry.name;
    html += '<li data-path="' + fullPath + '" data-type="' + entry.type + '">';
    html += '<span><i class="' + icon + '"></i> ' + safeName + "</span>";
    html +=
      "<small>" + safeSize + "</small></li>";
  });
  list.innerHTML =
    html || '<li style="color:#9aa3ad;text-align:center">(kosong)</li>';
  initFileContextMenu();

  list.querySelectorAll("li[data-path]").forEach(function (li) {
    li.addEventListener("click", function (e) {
      if (e.button !== 0) return;
      var type = li.dataset.type;
      var p = li.dataset.path;
      if (type === "folder" || li.classList.contains("file-back")) {
        loadFileList(p);
      } else {
        openFileEditor(p);
      }
    });
  });
}

// --- File Operations ---
function triggerDownload(path) {
  window.open(
    "/api/sites/" +
      encodeURIComponent(domain) +
      "/files/download?path=" +
      encodeURIComponent(path),
    "_blank",
  );
}

async function openFileEditor(path) {
  var data = await readFile(domain, path);
  var content = data ? data.content : "// Error reading file";
  var fileName = path.split("/").pop();

  document.querySelector("#editorFileName").textContent = fileName;
  document.querySelector("#editorFilePath").textContent = path;
  var editor = document.querySelector("#fileEditor");
  editor.querySelector("textarea").value = content;
  editor.classList.add("open");
}

async function saveFileEditor() {
  var editor = document.querySelector("#fileEditor");
  var path = editor.querySelector("#editorFilePath").textContent;
  var content = editor.querySelector("textarea").value;
  await writeFile(domain, path, content);
  showToast("File saved");
  closeFileEditor();
}

function closeFileEditor() {
  document.querySelector("#fileEditor").classList.remove("open");
}

async function openChmodDialog(path) {
  var newPath = prompt(
    "Change permissions for: " + path + "\nEnter mode (e.g. 644, 755):",
    "644",
  );
  if (!newPath) return;
  var mode = newPath.trim();
  if (!/^[0-7]{3,4}$/.test(mode)) {
    alert("Invalid mode. Use 3-4 digit octal (e.g. 644, 755).");
    return;
  }
  await chmodFile(domain, path, mode);
  showToast("Permissions changed to " + mode);
}

async function compressItem(path) {
  await compressFile(domain, path);
  showToast("Compressed: " + path.split("/").pop() + ".zip");
}

async function pasteItem(targetPath, targetType) {
  if (!clipboard.items || clipboard.items.length === 0) {
    showToast("Nothing to paste");
    return;
  }
  var srcPath = clipboard.items[0];
  var destPath =
    (targetType === "folder" ? targetPath : currentFilePath) +
    "/" +
    srcPath.split("/").pop();
  if (clipboard.action === "copy") {
    await copyFile(domain, srcPath, destPath);
    showToast("Pasted (copy): " + srcPath.split("/").pop());
  } else if (clipboard.action === "cut") {
    await moveFile(domain, srcPath, destPath);
    clipboard = { items: [], action: null };
    showToast("Pasted (moved): " + srcPath.split("/").pop());
  }
  await loadFileList(currentFilePath);
}

async function openRenameDialog(path) {
  var oldName = path.split("/").pop();
  var newName = prompt("Rename:", oldName);
  if (!newName || newName === oldName) return;
  var parentPath = path.includes("/")
    ? path.substring(0, path.lastIndexOf("/"))
    : ".";
  await renameFile(domain, path, newName);
  showToast("Renamed to " + newName);
  await loadFileList(currentFilePath);
}

async function deleteItem(path) {
  if (!confirm("Delete " + path + "?")) return;
  await deleteFile(domain, path);
  showToast("Deleted: " + path.split("/").pop());
  await loadFileList(currentFilePath);
}

// --- Toast & Loader (dynamic UI) ---
function injectDynamicStyles(){
  if (document.getElementById('dynamicStyles')) return;
  const style = document.createElement('style');
  style.id = 'dynamicStyles';
  style.textContent = `
    .fade-in {animation: fadeIn 0.3s forwards;}
    .fade-out {animation: fadeOut 0.3s forwards;}
    @keyframes fadeIn {from {opacity:0;} to {opacity:1;}}
    @keyframes fadeOut {from {opacity:1;} to {opacity:0;}}
    .loader-overlay {
      position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;z-index:9999;pointer-events:none;
    }
    .loader-spinner {
      border:4px solid #f3f3f3; border-top:4px solid #3498db; border-radius:50%; width:40px; height:40px;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}
  `;
  document.head.appendChild(style);
}

function showToast(msg) {
  injectDynamicStyles();
  var t = document.querySelector('#toastMsg');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toastMsg';
    t.style.cssText = "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 24px;border-radius:8px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);opacity:0;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('fade-out');
  t.classList.add('fade-in');
  clearTimeout(t._hide);
  t._hide = setTimeout(function () {
    t.classList.remove('fade-in');
    t.classList.add('fade-out');
  }, 2500);
}

function showLoader(){
  injectDynamicStyles();
  let loader = document.querySelector('#loaderOverlay');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loaderOverlay';
    loader.className = 'loader-overlay';
    loader.innerHTML = '<div class="loader-spinner"></div>';
    document.body.appendChild(loader);
  }
  loader.style.display = 'flex';
}
function hideLoader(){
  const loader = document.querySelector('#loaderOverlay');
  if (loader) loader.style.display = 'none';
}

// --- Tabs (lazy load on first click, update URL) ---
var loadedTabs = {};
function activateTab(tab) {
  document.querySelectorAll("[data-tab]").forEach(function (item) {
    item.classList.remove("active");
  });
  document.querySelectorAll("[data-panel]").forEach(function (panel) {
    panel.classList.remove("active");
  });
  document.querySelector('[data-tab="' + tab + '"]')?.classList.add("active");
  document.querySelector('[data-panel="' + tab + '"]')?.classList.add("active");
}
function loadTabContent(tab) {
  if (tab === "files") {
    loadFileList(".");
    return;
  }
  if (tab === "dashboard") {
    loadPhpForm();
    loadPhpStatus();
    return;
  }
  if (loadedTabs[tab]) return;
  loadedTabs[tab] = true;
  if (tab === "vhost") {
    getVhost(domain).then(function (v) {
      document.querySelector("#vhostCode").value =
        v || "server {\n    # error loading vhost\n}";
    });
  } else if (tab === "logs") {
    getSiteLogs(domain).then(function (l) {
      document.querySelector("#siteLogs").textContent = l;
    });
  } else if (tab === "databases") {
    loadDatabases();
  } else if (tab === "cron") {
    loadCronJobs();
  } else if (tab === "ftp") {
    loadFtpAccounts();
  }
}
function switchTab(tab) {
  activateTab(tab);
  loadTabContent(tab);
  var url = new URL(window.location);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url);
}
document.querySelectorAll("[data-tab]").forEach(function (button) {
  button.addEventListener("click", function () {
    switchTab(button.dataset.tab);
  });
});

// --- Save Settings ---
document
  .querySelector("#domainSaveBtn")
  ?.addEventListener("click", async function () {
    var newDomain = document.querySelector("#settingDomain").value.trim();
    var newRoot = document.querySelector("#settingRoot").value.trim();
    if (!newDomain || !newRoot) {
      alert("Domain dan Root wajib diisi");
      return;
    }
    await updateSite(domain, { domain: newDomain, path: newRoot });
    alert("Domain settings saved");
    if (newDomain !== domain) {
      window.location.href = "/detail?site=" + encodeURIComponent(newDomain);
    }
  });

// --- PHP Settings (memory, timeout, upload, dll) ---
function readPhpSettingsForm() {
  return [
    "memory_limit=" + document.querySelector("#phpMemory").value,
    "max_execution_time=" + document.querySelector("#phpMaxExecution").value,
    "upload_max_filesize=" + document.querySelector("#phpUploadMax").value,
    "post_max_size=" + document.querySelector("#phpPostMax").value,
    "max_input_vars=" + document.querySelector("#phpMaxInputVars").value,
    "display_errors=" + document.querySelector("#phpDisplayErrors").value,
  ];
}

async function loadPhpForm() {
  try {
    if (!site) return;
    // Populate form from site data
    document.querySelector("#settingRuntime").value =
      site.runtime || "CodeIgniter 4";
    document.querySelector("#settingPhpVersion").value =
      site.version || "PHP 8.4";
  } catch (e) {
    console.error("Failed to load PHP form:", e);
  }
}

async function loadPhpStatus() {
  try {
    const data = await fetchPhpini(domain);
    if (!data) return;
    document.querySelector("#phpiniPath").textContent =
      data.socket || "(default pool)";
    document.querySelector("#phpiniRaw").value = data.raw || "";
    document.querySelector("#phpStatus").innerHTML =
      '<i class="fa-solid fa-circle-info"></i> ' +
      "PHP-FPM pool: <strong>/etc/php/" +
      (data.version || "").toString().replace(/[^0-9.]/g, "") +
      "/fpm/pool.d/mycp-" +
      domain +
      ".conf</strong>";
  } catch (e) {
    document.querySelector("#phpStatus").innerHTML =
      '<i class="fa-solid fa-triangle-exclamation"></i> Gagal membaca php.ini: ' +
      e.message;
  }
}

document
  .querySelector("#phpSaveBtn")
  ?.addEventListener("click", async function () {
    const settings = readPhpSettingsForm();
    try {
      await fetch("/api/sites/" + encodeURIComponent(domain) + "/php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      }).then(function (r) {
        if (!r.ok) throw new Error("Save gagal");
        return r.json();
      });
      showToast("Pengaturan PHP tersimpan");
      await loadPhpStatus();
    } catch (e) {
      alert("Gagal menyimpan: " + e.message);
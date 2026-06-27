const params = new URLSearchParams(window.location.search);
const domain = params.get("site");
let site = null;
let activeDialog = "";
let currentFilePath = ".";
let clipboard = { items: [], action: null }; // action: 'copy' | 'cut'

const FILE_ICONS = {
  html: "fa-brands fa-html5",
  htm: "fa-brands fa-html5",
  css: "fa-brands fa-css3-alt",
  js: "fa-brands fa-js",
  json: "fa-solid fa-file-code",
  php: "fa-brands fa-php",
  py: "fa-brands fa-python",
  rb: "fa-brands fa-ruby",
  java: "fa-brands fa-java",
  ts: "fa-solid fa-code",
  tsx: "fa-solid fa-code",
  jsx: "fa-solid fa-code",
  md: "fa-solid fa-book",
  yml: "fa-solid fa-file-lines",
  yaml: "fa-solid fa-file-lines",
  xml: "fa-solid fa-file-code",
  sql: "fa-solid fa-database",
  sh: "fa-solid fa-terminal",
  env: "fa-solid fa-gear",
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
  return FILE_ICONS[ext] || "fa-solid fa-file";
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
  // Pakai actualVersion (server reality) - fallback kalau PHP yang diminta belum terinstall
  document.querySelector("#settingRuntime").value =
    site.runtime || "CodeIgniter 4";
  document.querySelector("#settingPhpVersion").value =
    site.actualVersion || site.version || "PHP 8.4";

  // Tampilkan warning banner jika versi yang diminta user tidak terinstall
  var runtime = site.runtime || "";
  var isPhp = ["PHP Native", "CodeIgniter 3", "CodeIgniter 4", "Laravel"].includes(runtime);
  var warningEl = document.querySelector("#phpVersionWarning");
  if (warningEl) {
    if (isPhp && site.versionMismatch) {
      warningEl.style.display = "block";
      warningEl.innerHTML =
        '<i class="fa-solid fa-triangle-exclamation"></i> ' +
        "<strong>" +
        site.requestedVersion +
        "</strong> belum terinstall di server. " +
        "Sedang berjalan di <strong>" +
        site.actualVersion +
        "</strong>. " +
        "Install PHP versi tersebut via installer (install.sh) atau pilih versi yang tersedia.";
    } else {
      warningEl.style.display = "none";
      warningEl.innerHTML = "";
    }
  }

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
        var name = encodeURIComponent(db.dbName);
        return (
          "<tr><td>" + db.dbName +
          "</td><td>" + db.dbType +
          "</td><td>" + db.dbUser +
          '</td><td class="db-tools">' +
          '<button class="ghost-btn compact" type="button" onclick="window.open(\'/phpmyadmin/index.php?route=/database/structure&db=' + name + '\', \'_blank\')" title="phpMyAdmin"><i class="fa-solid fa-database"></i></button> ' +
          '<button class="ghost-btn compact" type="button" onclick="alert(\'pgAdmin belum terinstall\')" title="pgAdmin"><i class="fa-solid fa-elephant"></i></button> ' +
          '<button class="ghost-btn compact" type="button" onclick="alert(\'Fitur Export belum tersedia\')" title="Export"><i class="fa-solid fa-download"></i></button> ' +
          '<button class="ghost-btn compact" type="button" onclick="alert(\'Fitur Import belum tersedia\')" title="Import"><i class="fa-solid fa-upload"></i></button> ' +
          '<button class="danger-btn compact" type="button" onclick="deleteDb(' + db.id + ')" title="Hapus database"><i class="fa-solid fa-trash"></i></button>' +
          "</td></tr>"
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
        return (
          "<tr><td>" +
          job.schedule +
          "</td><td>" +
          job.command +
          '</td><td><span class="status ' +
          (job.status === "Aktif" ? "running" : "issue") +
          '">' +
          job.status +
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
    var tr = e.target.closest("tr[data-path]");
    if (!tr || !list.contains(tr)) return;
    e.preventDefault();
    e.stopPropagation();
    console.log(
      "[file-context] right-click on",
      tr.dataset.path,
      tr.dataset.type,
    );
    showContextMenu(
      e.clientX,
      e.clientY,
      tr.dataset.path,
      tr.dataset.type || "file",
    );
  });

  list.addEventListener(
    "contextmenu",
    function (e) {
      if (!e.target.closest("tr[data-path]")) hideContextMenu();
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
  renderBreadcrumb(data.root, currentFilePath);

  // Add select/delete buttons to header (once)
  var headActions = document.querySelector('[data-panel="files"] .panel-head .inline-actions');
  if (headActions && !document.querySelector("#toggleSelectBtn")) {
    var selCount = document.createElement("span");
    selCount.id = "selCount";
    selCount.style.cssText = "color:#9aa3ad;font-size:12px;margin-right:2px";

    var selBtn = document.createElement("button");
    selBtn.className = "ghost-btn compact";
    selBtn.id = "toggleSelectBtn";
    selBtn.type = "button";
    selBtn.innerHTML = '<i class="fa-regular fa-check-square"></i><span>Select All</span>';
    selBtn.addEventListener("click", toggleSelectAll);

    var delBtn = document.createElement("button");
    delBtn.className = "danger-btn compact";
    delBtn.id = "bulkDeleteBtn";
    delBtn.type = "button";
    delBtn.style.display = "none";
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i><span>Delete</span>';
    delBtn.addEventListener("click", bulkDeleteSelected);

    headActions.prepend(selCount, selBtn, delBtn);
  }

  // Uncheck all on new load
  document.querySelectorAll(".file-row .cb").forEach(function (cb) { cb.checked = false; });
  updateSelCount();
  const tbody = document.querySelector("#fileRows");
  var html = "";

  // Back to parent row
  if (currentFilePath !== ".") {
    var parentPath = currentFilePath.split("/").slice(0, -1).join("/") || ".";
    html += '<tr class="file-back" data-path="' + parentPath + '" data-type="folder">';
    html += '<td class="td-name" colspan="5"><i class="fa-solid fa-arrow-left"></i> ..</td></tr>';
  }

  data.entries.forEach(function (entry) {
    var fullPath = currentFilePath === "." ? entry.name : currentFilePath + "/" + entry.name;
    html += '<tr class="file-row" data-path="' + fullPath + '" data-type="' + entry.type + '">';
    html += '<td class="td-name"><label class="cb-wrap"><input class="cb" type="checkbox" data-path="' + fullPath + '" data-type="' + entry.type + '"></label> ';
    if (entry.type === "folder") {
      html += '<i class="fa-solid fa-folder" style="color:#f59e0b;width:18px;text-align:center"></i> ';
    } else if (entry.name.endsWith(".php")) {
      html += '<span class="php-badge">PHP</span> ';
    } else {
      html += '<i class="' + getFileIcon(entry.name) + '" style="width:18px;text-align:center"></i> ';
    }
    html += '<span class="fn">' + entry.name + '</span></td>';
    html += '<td class="td-owner">' + (entry.owner || "-") + '</td>';
    html += '<td class="td-perms">' + (entry.perms || "-") + '</td>';
    html += '<td class="td-size">' + formatSize(entry.size) + '</td>';
    html += '<td class="td-date">' + formatDate(entry.modified) + '</td>';
    html += '</tr>';
  });

  if (!data.entries.length && currentFilePath === ".") {
    html += '<tr><td colspan="5" style="color:#9aa3ad;text-align:center;padding:24px 0">(kosong)</td></tr>';
  }
  tbody.innerHTML = html;
  initFileContextMenu();
  initFileDropTarget();

  tbody.querySelectorAll("tr.file-row").forEach(function (tr) {
    tr.addEventListener("click", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(".cb-wrap")) return;
      var type = tr.dataset.type;
      var p = tr.dataset.path;
      if (type === "folder") loadFileList(p);
      else openFileEditor(p);
    });
  });
  tbody.querySelectorAll("tr.file-back").forEach(function (tr) {
    tr.addEventListener("click", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(".cb-wrap")) return;
      loadFileList(tr.dataset.path);
    });
  });
  tbody.querySelectorAll(".cb").forEach(function (cb) {
    cb.addEventListener("change", updateSelCount);
  });
}

function renderBreadcrumb(root, path) {
  var el = document.querySelector("#fmBreadcrumb");
  if (!el) return;
  var parts = path === "." ? [] : path.split("/");
  var html = '<a href="#" data-bc-path="."><i class="fa-solid fa-house"></i> Files</a>';
  var cumulative = "";
  parts.forEach(function (p) {
    cumulative = cumulative ? cumulative + "/" + p : p;
    html += ' <i class="fa-solid fa-chevron-right bc-sep"></i> ';
    html += '<a href="#" data-bc-path="' + cumulative + '">' + p + '</a>';
  });
  el.innerHTML = html;
  el.querySelectorAll("[data-bc-path]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      loadFileList(a.dataset.bcPath);
    });
  });
}

function formatSize(bytes) {
  var num = parseInt(bytes, 10);
  if (isNaN(num) || num === 0) return "0 b";
  if (num < 1024) return num + " b";
  if (num < 1048576) return (num / 1024).toFixed(1) + " kb";
  return (num / 1048576).toFixed(1) + " mb";
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  var parts = dateStr.split(" ");
  if (parts.length < 2) return dateStr;
  var datePart = parts[0];
  var timePart = parts[1];
  var d = datePart.split("-");
  if (d.length < 3) return dateStr;
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var month = months[parseInt(d[1], 10) - 1] || d[1];
  var day = parseInt(d[2], 10);
  return month + " " + day + ", " + timePart;
}

function updateSelCount() {
  var allCb = document.querySelectorAll(".file-row .cb");
  var checked = document.querySelectorAll(".file-row .cb:checked");
  var count = checked.length;
  var el = document.querySelector("#selCount");
  if (el) el.textContent = count + " selected";

  // toggle button text
  var btn = document.getElementById("toggleSelectBtn");
  if (btn) {
    if (allCb.length && count === allCb.length) {
      btn.innerHTML = '<i class="fa-regular fa-square"></i><span>Unselect All</span>';
    } else {
      btn.innerHTML = '<i class="fa-regular fa-check-square"></i><span>Select All</span>';
    }
  }

  // show/hide delete
  var delBtn = document.getElementById("bulkDeleteBtn");
  if (delBtn) delBtn.style.display = count ? "inline-flex" : "none";
}

function toggleSelectAll() {
  var allCb = document.querySelectorAll(".file-row .cb");
  var checked = document.querySelectorAll(".file-row .cb:checked");
  if (allCb.length && checked.length === allCb.length) {
    allCb.forEach(function (cb) { cb.checked = false; });
  } else {
    allCb.forEach(function (cb) { cb.checked = true; });
  }
  updateSelCount();
}

function bulkDeleteSelected() {
  var checked = document.querySelectorAll(".file-row .cb:checked");
  var paths = [];
  checked.forEach(function (cb) { paths.push(cb.dataset.path); });
  if (!paths.length) return;
  if (!confirm("Delete " + paths.length + " selected item(s)?")) return;
  var done = 0;
  var failed = 0;
  var msgEl = document.createElement("div");
  msgEl.style.cssText = "position:fixed;bottom:20px;right:20px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;box-shadow:var(--shadow);z-index:999;font-size:13px;min-width:200px";
  document.body.appendChild(msgEl);

  function next() {
    if (done + failed >= paths.length) {
      var text = done + " deleted";
      if (failed) text += ", " + failed + " failed";
      msgEl.innerHTML = '<i class="fa-solid fa-' + (failed ? "xmark" : "check") + '" style="color:' + (failed ? "#e44" : "#16a34a") + '"></i> ' + text;
      if (done) loadFileList(currentFilePath);
      setTimeout(function () { if (msgEl.parentNode) msgEl.parentNode.removeChild(msgEl); }, 3000);
      return;
    }
    var idx = done + failed;
    deleteFile(domain, paths[idx]).then(function (ok) {
      if (ok) done++; else failed++;
      next();
    }).catch(function () { failed++; next(); });
  }
  next();
}

// --- End bulk select ---
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

var editorCM = null;
var editorVhost = null;
var editorPhpini = null;

function initCodeMirror(textareaId, opts) {
  var ta = document.getElementById(textareaId);
  if (!ta) return null;
  var editor = CodeMirror.fromTextArea(ta, Object.assign({
    lineNumbers: true,
    theme: "monokai",
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: true,
    matchBrackets: true,
  }, opts || {}));
  editor.setSize(null, opts && opts.height ? opts.height : "calc(100vh - 120px)");
  setTimeout(function () { editor.refresh(); }, 50);
  return editor;
}

async function openFileEditor(path) {
  var data = await readFile(domain, path);
  var content = data ? data.content : "// Error reading file";
  var fileName = path.split("/").pop();

  document.querySelector("#editorFileName").textContent = fileName;
  document.querySelector("#fileEditor").dataset.editorPath = path;
  var editor = document.querySelector("#fileEditor");
  editor.classList.add("open");

  if (!editorCM) {
    editorCM = CodeMirror.fromTextArea(document.getElementById("editorTextarea"), {
      lineNumbers: true,
      theme: "monokai",
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true,
      autoCloseTags: true,
      matchBrackets: true,
      extraKeys: { "Ctrl-S": function () { saveFileEditor(); } },
    });
    editorCM.setSize(null, "calc(100vh - 120px)");
  }
  editorCM.setValue(content);
  setTimeout(function () { editorCM.refresh(); }, 50);
  var mode = guessMode(path);
  editorCM.setOption("mode", mode);
}

function guessMode(filename) {
  var ext = filename.split(".").pop().toLowerCase();
  var map = {
    php: "application/x-httpd-php",
    html: "htmlmixed", htm: "htmlmixed",
    css: "css", js: "javascript", json: { name: "javascript", json: true },
    ts: "javascript", jsx: "jsx", tsx: "jsx",
    py: "python", rb: "ruby", java: "text/x-java",
    sql: "sql", sh: "shell", bash: "shell",
    xml: "xml", svg: "xml", md: "markdown",
    yml: "yaml", yaml: "yaml",
    conf: "text/plain", cfg: "text/plain", ini: "text/plain",
    txt: "text/plain", env: "text/plain",
  };
  return map[ext] || "text/plain";
}

async function saveFileEditor() {
  var editor = document.querySelector("#fileEditor");
  var path = editor.dataset.editorPath;
  var content = editorCM ? editorCM.getValue() : "";
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

// --- Toast ---
function showToast(msg) {
  var t = document.querySelector("#toastMsg");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastMsg";
    t.style.cssText =
      "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 24px;border-radius:8px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._hide);
  t._hide = setTimeout(function () {
    t.style.opacity = "0";
  }, 2500);
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
      if (!editorVhost) editorVhost = initCodeMirror("vhostCode", { height: "auto", mode: "nginx" });
      editorVhost.setValue(v || "server {\n    # error loading vhost\n}");
      document.getElementById("vhostCode")._cm = editorVhost;
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
  } else if (tab === "services") {
    loadServices();
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

const versionsByRuntime = {
  "PHP Native": ["PHP 8.4", "PHP 8.3", "PHP 8.2", "PHP 8.1", "PHP 8.0", "PHP 7.4"],
  "CodeIgniter 3": ["PHP 7.4", "PHP 8.0", "PHP 8.1", "PHP 8.2", "PHP 8.3", "PHP 8.4"],
  "CodeIgniter 4": ["PHP 8.4", "PHP 8.3", "PHP 8.2", "PHP 8.1", "PHP 8.0"],
  Laravel: ["Laravel 12", "Laravel 11", "Laravel 10"],
  "Node.js": ["Node.js 22", "Node.js 20", "Node.js 18"],
  "Static HTML": ["Nginx Static"],
  "Reverse Proxy": ["Nginx Proxy"],
};

function updateDetailVersionOptions(runtime, selected) {
  const versionSelect = document.querySelector("#settingPhpVersion");
  const versionLabel = document.querySelector("#versionLabel");
  if (!versionSelect) return;
  const versions =
    versionsByRuntime[runtime] || versionsByRuntime["PHP Native"];
  versionSelect.innerHTML = versions
    .map((v) => `<option>${v}</option>`)
    .join("");
  versionSelect.value =
    selected && versions.includes(selected) ? selected : versions[0] || "";
  if (versionLabel) {
    if (runtime === "Node.js") versionLabel.textContent = "Node.js Version";
    else if (runtime === "Static HTML") versionLabel.textContent = "Type";
    else if (runtime === "Reverse Proxy") versionLabel.textContent = "Type";
    else if (runtime === "Laravel") versionLabel.textContent = "Laravel Version";
    else versionLabel.textContent = "PHP Version";
  }
}

async function loadServices() {
  var tbody = document.querySelector("#serviceRows");
  var msg = document.querySelector("#serviceMessage");
  if (msg) msg.style.display = "none";
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#6b7280">Loading...</td></tr>';
  try {
    var res = await fetch("/api/sites/" + encodeURIComponent(domain) + "/services");
    var services = await res.json();
    if (!Array.isArray(services) || !services.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#6b7280">No services found</td></tr>';
      return;
    }
    tbody.innerHTML = services.map(function (s) {
      var isRunning = s.status === "running";
      var statusClass = isRunning ? "ok" : "muted";
      var statusText = isRunning ? "Running" : "Stopped";
      var actions = "";
      if (isRunning) {
        actions += '<button class="ghost-btn compact service-action" data-service="' + s.service + '" data-action="restart"><i class="fa-solid fa-rotate"></i><span>Restart</span></button>';
        actions += '<button class="ghost-btn compact service-action" data-service="' + s.service + '" data-action="stop"><i class="fa-solid fa-stop"></i><span>Stop</span></button>';
      } else {
        actions += '<button class="primary-btn compact service-action" data-service="' + s.service + '" data-action="start"><i class="fa-solid fa-play"></i><span>Start</span></button>';
      }
      return '<tr><td><strong>' + s.label + '</strong></td><td><b class="' + statusClass + '">' + statusText + '</b></td><td style="display:flex;gap:6px">' + actions + '</td></tr>';
    }).join("");
    tbody.querySelectorAll(".service-action").forEach(function (btn) {
      btn.addEventListener("click", function () {
        serviceAction(btn.dataset.service, btn.dataset.action);
      });
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626">Failed to load services</td></tr>';
  }
}

async function serviceAction(serviceName, action) {
  var msg = document.querySelector("#serviceMessage");
  if (msg) {
    msg.style.display = "block";
    msg.style.background = "#fef3c7";
    msg.style.border = "1px solid #f59e0b";
    msg.style.color = "#78350f";
    msg.textContent = action + " " + serviceName + "...";
  }
  try {
    var res = await fetch("/api/sites/" + encodeURIComponent(domain) + "/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: serviceName, action: action }),
    });
    var result = await res.json();
    if (msg) {
      if (result.ok) {
        msg.style.background = "#f0fdf4";
        msg.style.border = "1px solid #86efac";
        msg.style.color = "#166534";
        msg.textContent = serviceName + " " + action + " successful";
      } else {
        msg.style.background = "#fef2f2";
        msg.style.border = "1px solid #fecaca";
        msg.style.color = "#991b1b";
        msg.textContent = result.error || "Action failed";
      }
    }
    loadServices();
  } catch (e) {
    if (msg) {
      msg.style.background = "#fef2f2";
      msg.style.border = "1px solid #fecaca";
      msg.style.color = "#991b1b";
      msg.textContent = "Request failed";
    }
  }
}

async function loadPhpForm() {
  try {
    if (!site) return;
    const runtimeSelect = document.querySelector("#settingRuntime");
    const phpVersionSelect = document.querySelector("#settingPhpVersion");
    if (!runtimeSelect || !phpVersionSelect) return;
    const runtime = site.runtime || "CodeIgniter 4";
    runtimeSelect.value = runtime;
    updateDetailVersionOptions(runtime, site.version);
    toggleRuntimePanels(runtime);
  } catch (e) {
    console.error("Failed to load PHP form:", e);
  }
}

function toggleRuntimePanels(runtime) {
  var isNode = runtime === "Node.js";
  var isPhp = ["PHP Native", "CodeIgniter 3", "CodeIgniter 4", "Laravel"].includes(runtime);
  document.querySelector("#phpSettingsFields").style.display = isPhp ? "" : "none";
  document.querySelector("#nodeSettingsFields").style.display = isNode ? "" : "none";
  document.querySelector("#phpiniPanel").style.display = isPhp ? "" : "none";
  if (isNode) loadNodeStatus();
}

async function loadNodeStatus() {
  var statusEl = document.querySelector("#nodePm2Status");
  var portEl = document.querySelector("#nodePort");
  var restartBtn = document.querySelector("#nodeRestartBtn");
  var restartLabel = document.querySelector("#nodeRestartLabel");
  if (!statusEl) return;
  try {
    var res = await fetch("/api/sites/" + domain + "/pm2-status");
    var data = await res.json();
    var running = data.running;
    statusEl.textContent = running ? "Running (PID: " + data.pid + ")" : "Stopped";
    statusEl.style.background = running ? "#f0fdf4" : "#fef2f2";
    statusEl.style.borderColor = running ? "#86efac" : "#fecaca";
    statusEl.style.color = running ? "#166534" : "#991b1b";
    if (portEl) portEl.value = data.port || "3000";
    if (restartBtn) restartBtn.style.display = "";
    if (restartLabel) restartLabel.textContent = running ? "Restart" : "Start";
  } catch (e) {
    statusEl.textContent = "Unknown";
  }
}

document
  .querySelector("#settingRuntime")
  ?.addEventListener("change", function () {
    updateDetailVersionOptions(this.value, null);
  });

async function loadPhpStatus() {
  try {
    const data = await fetchPhpini(domain);
    if (!data) return;
    document.querySelector("#phpiniPath").textContent =
      data.socket || "(default pool)";
    if (!editorPhpini) {
      editorPhpini = initCodeMirror("phpiniRaw", { height: "350px", mode: "text/plain" });
      document.getElementById("phpiniRaw")._cm = editorPhpini;
    }
    editorPhpini.setValue(data.raw || "");
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
  }
});

document
  .querySelector("#phpiniReloadBtn")
  ?.addEventListener("click", loadPhpStatus);

document
  .querySelector("#nodeRestartBtn")
  ?.addEventListener("click", async function () {
    try {
      await fetch("/api/sites/" + encodeURIComponent(domain) + "/pm2-restart", { method: "POST" });
      showToast("Node.js app restarted");
      await loadNodeStatus();
    } catch (e) {
      alert("Restart gagal: " + e.message);
    }
  });

document.querySelector("#phpiniRawBtn")?.addEventListener("click", function () {
  const rawSection = document.querySelector("#phpiniPanel");
  const structuredSection = document.querySelector("#phpSettingsPanel");
  const isRaw = rawSection.style.display !== "none";
  rawSection.style.display = isRaw ? "none" : "";
  structuredSection.style.display = isRaw ? "" : "none";
  this.innerHTML = isRaw
    ? '<i class="fa-solid fa-code"></i><span>Raw Editor</span>'
    : '<i class="fa-solid fa-list"></i><span>Structured</span>';
});

document
  .querySelector("#phpiniSaveBtn")
  ?.addEventListener("click", async function () {
    const raw = editorPhpini ? editorPhpini.getValue() : document.querySelector("#phpiniRaw").value;
    try {
      await fetch("/api/sites/" + encodeURIComponent(domain) + "/php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      }).then(function (r) {
        if (!r.ok) throw new Error("Save gagal");
        return r.json();
      });
      showToast("PHP-FPM pool tersimpan");
      await loadPhpStatus();
    } catch (e) {
      alert("Gagal menyimpan: " + e.message);
    }
  });

// --- Password Generate ---
document
  .querySelector(".ghost-btn.compact .fa-key")
  ?.closest("button")
  ?.addEventListener("click", async function () {
    var newPass = Math.random().toString(36).slice(2, 10) + "A1!";
    await changePassword(domain, newPass);
    alert("Password baru: " + newPass);
  });

// --- Delete Site ---
document
  .querySelector(".danger-btn")
  ?.addEventListener("click", async function () {
    if (!confirm("Yakin hapus " + (site ? site.domain : "") + "?")) return;
    await deleteSite(domain);
    window.location.href = "/";
  });

// --- SSL Issue ---
document
  .querySelector('[data-panel="ssl"] .primary-btn.compact')
  ?.addEventListener("click", async function () {
    await issueSsl(domain);
    document.querySelector("#sslStatus").textContent = "Valid";
    document.querySelector("#sslStatus").className = "ok";
    alert("SSL issued");
  });

// --- Vhost Copy & Reset & Save ---
document.querySelector("#vhostCopyBtn")?.addEventListener("click", function () {
  var val = editorVhost ? editorVhost.getValue() : document.querySelector("#vhostCode").value;
  navigator.clipboard.writeText(val).then(function () {
    alert("Vhost copied");
  });
});

document
  .querySelector("#vhostResetBtn")
  ?.addEventListener("click", async function () {
    var vhost = await getVhost(domain);
    if (editorVhost) editorVhost.setValue(vhost || "");
    else document.querySelector("#vhostCode").value = vhost || "";
    alert("Vhost reset to default");
  });

document
  .querySelector("#vhostSaveBtn")
  ?.addEventListener("click", async function () {
    var content = editorVhost ? editorVhost.getValue() : document.querySelector("#vhostCode").value;
    await saveVhost(domain, content);
    alert("Vhost saved");
  });

// --- Log Type Toggle ---
document
  .querySelector('[data-panel="logs"] .inline-actions')
  ?.addEventListener("click", async function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var type = btn.querySelector(".fa-file-lines") ? "access" : "error";
    var logs = await getSiteLogs(domain, type);
    document.querySelector("#siteLogs").textContent = logs;
  });

// --- Dialogs ---
var dialog = document.querySelector("#detailDialog");
var dialogForm = document.querySelector("#detailDialogForm");
var dialogTitle = document.querySelector("#detailDialogTitle");
var dialogActions = document.querySelector("#detailDialogActions");

function openDialog(type) {
  var template = dialogTemplates[type];
  if (!template) return;
  activeDialog = type;
  dialogTitle.textContent = template.title;
  dialogForm.innerHTML = template.body;
  dialogForm.enctype = type === "upload" ? "multipart/form-data" : "application/x-www-form-urlencoded";
  dialogActions.innerHTML =
    (template.buttons || "") +
    '<button class="icon-btn" type="button" id="detailDialogClose" title="Tutup"><i class="fa-solid fa-xmark"></i></button>';
  dialogActions.querySelector("#detailDialogClose").addEventListener("click", closeDialog);
  dialog.classList.add("open");
  dialog.setAttribute("aria-hidden", "false");

  if (type === "upload") {
    var dropZone = document.querySelector("#uploadDropZone");
    var fileInput = document.querySelector("#uploadFileInput");
    var statusDiv = document.querySelector("#uploadStatus");

    dropZone.addEventListener("click", function () { fileInput.click(); });

    dropZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropZone.style.borderColor = "var(--accent)";
      dropZone.style.background = "var(--accent-glass)";
    });

    dropZone.addEventListener("dragleave", function () {
      dropZone.style.borderColor = "";
      dropZone.style.background = "";
    });

    dropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropZone.style.borderColor = "";
      dropZone.style.background = "";
      if (e.dataTransfer.files.length) {
        uploadFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener("change", function () {
      if (fileInput.files.length) {
        uploadFiles(fileInput.files);
      }
    });

    function uploadFiles(files) {
      var target = document.querySelector('input[name="target"]').value;
      statusDiv.innerHTML = "";
      var total = files.length;
      var done = 0;
      var failed = 0;

      doUpload(0);

      function doUpload(index) {
        if (index >= total) {
          var msg = done + " file uploaded";
          if (failed) msg += ", " + failed + " failed";
          statusDiv.innerHTML += '<div style="margin-top:8px;font-weight:600;color:' + (failed ? "#e44" : "var(--text)") + '">' + msg + '</div>';
          closeDialog();
          if (done) loadFileList(currentFilePath);
          return;
        }
        var file = files[index];
        var fd = new FormData();
        fd.append("file", file);
        fd.append("target", target);

        statusDiv.innerHTML +=
          '<div id="uf-' + index + '" style="padding:6px 0;display:flex;align-items:center;gap:8px;font-size:13px">' +
          '<i class="fa-solid fa-spinner fa-spin" style="color:var(--muted)"></i>' +
          '<span>' + file.name + '</span></div>';

        fetch("/api/sites/" + encodeURIComponent(domain) + "/files/upload", {
          method: "POST",
          body: fd,
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("Upload failed")); })
          .then(function () {
            done++;
            var el = document.querySelector("#uf-" + index);
            if (el) el.innerHTML = '<i class="fa-solid fa-check" style="color:#16a34a"></i><span>' + file.name + '</span>';
            doUpload(index + 1);
          })
          .catch(function () {
            failed++;
            var el = document.querySelector("#uf-" + index);
            if (el) el.innerHTML = '<i class="fa-solid fa-xmark" style="color:#e44"></i><span>' + file.name + ' — failed</span>';
            doUpload(index + 1);
          });
      }
    }
  }
}

function closeDialog() {
  dialog.classList.remove("open");
  dialog.setAttribute("aria-hidden", "true");
  dialogForm.innerHTML = "";
  activeDialog = "";
}

var dialogTemplates = {
  database: {
    title: "New Database",
    buttons: '<button class="primary-btn" type="submit" form="detailDialogForm"><i class="fa-solid fa-plus"></i><span>Create Database</span></button>',
    get body() {
      return (
        '<div class="form-grid">' +
        '<label>Database Name<input name="dbName" required value="' +
        (site ? site.username : "") +
        '_db"></label>' +
        '<label>Type<select name="dbType"><option>MySQL</option><option>PostgreSQL</option></select></label>' +
        '<label>Username<input name="dbUser" required value="' +
        (site ? site.username : "") +
        '_user"></label>' +
        '<label>Password<input name="password" type="password" required placeholder="Password database"></label></div>'
      );
    },
  },
  cron: {
    title: "New Cron Job",
    buttons: '<button class="primary-btn" type="submit" form="detailDialogForm"><i class="fa-solid fa-plus"></i><span>Add Cron</span></button>',
    get body() {
      return (
        '<div class="form-grid">' +
        '<label>Schedule<input name="schedule" required value="*/5 * * * *"></label>' +
        '<label>Status<select name="status"><option>Aktif</option><option>Disabled</option></select></label>' +
        '</div><label>Command<input name="command" required value="php spark queue:work"></label>'
      );
    },
  },
  upload: {
    title: "Upload Files",
    get body() {
      return (
        '<div class="drop-zone compact-drop" id="uploadDropZone"><i class="fa-solid fa-cloud-arrow-up"></i><span>Drop files here or click to browse</span></div>' +
        '<input type="file" name="file" id="uploadFileInput" style="display:none" multiple>' +
        '<input type="hidden" name="target" value="' + (currentFilePath || ".") + '">' +
        '<div id="uploadStatus" style="margin-top:12px"></div>'
      );
    },
  },
  folder: {
    title: "New Folder",
    buttons: '<button class="primary-btn" type="submit" form="detailDialogForm"><i class="fa-solid fa-folder-plus"></i><span>Create Folder</span></button>',
    get body() {
      return (
        '<label>Folder Name<input name="folder" required placeholder="storage"></label>' +
        '<label>Location<input name="target" value="' +
        (site ? site.path : "") +
        '"></label>'
      );
    },
  },
  file: {
    title: "New File",
    buttons: '<button class="primary-btn" type="submit" form="detailDialogForm"><i class="fa-solid fa-file"></i><span>Create File</span></button>',
    body: '<label>File Name<input name="fileName" required placeholder="index.html"></label>',
  },
};

document.querySelectorAll("[data-dialog]").forEach(function (button) {
  button.addEventListener("click", function () {
    openDialog(button.dataset.dialog);
  });
});

document
  .querySelector("#detailDialogClose")
  .addEventListener("click", closeDialog);
dialog?.addEventListener("click", function (event) {
  if (event.target === dialog || event.target.closest("[data-close-dialog]"))
    closeDialog();
});

dialogForm?.addEventListener("submit", async function (event) {
  event.preventDefault();
  var data = new FormData(dialogForm);

  if (activeDialog === "database") {
    await createDatabase(domain, {
      dbName: data.get("dbName"),
      dbType: data.get("dbType"),
      dbUser: data.get("dbUser"),
      password: data.get("password"),
    });
    await loadDatabases();
  }

  if (activeDialog === "cron") {
    await createCronJob(domain, {
      schedule: data.get("schedule"),
      command: data.get("command"),
      status: data.get("status"),
    });
    await loadCronJobs();
  }

  if (activeDialog === "folder") {
    var folderName = data.get("folder");
    var relPath =
      currentFilePath === "." ? folderName : currentFilePath + "/" + folderName;
    await createFolder(domain, relPath);
    await loadFileList(currentFilePath);
  }

  if (activeDialog === "file") {
    var fileName = data.get("fileName");
    var filePath =
      currentFilePath === "." ? fileName : currentFilePath + "/" + fileName;
    await writeFile(domain, filePath, "");
    await loadFileList(currentFilePath);
  }

  if (activeDialog === "upload") {
    var uploadBtn = document.querySelector("#uploadSubmitBtn");
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Uploading...</span>';
    try {
      await uploadFile(domain, data);
      await loadFileList(currentFilePath);
    } catch (e) {
      alert("Upload failed: " + e.message);
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i><span>Upload</span>';
      return;
    }
  }

  closeDialog();
});

window.deleteDb = async function (id) {
  if (!confirm("Yakin hapus database ini?")) return;
  await deleteDatabase(domain, id);
  await loadDatabases();
};

// --- File Editor saves ---
document
  .querySelector("#fileEditorSave")
  ?.addEventListener("click", saveFileEditor);
document
  .querySelector("#fileEditorClose")
  ?.addEventListener("click", closeFileEditor);
document.querySelector("#fileEditor")?.addEventListener("click", function (e) {
  if (e.target === this) closeFileEditor();
});

// --- File drag-drop upload ---

function uploadFileList(files) {
  return new Promise(function (resolveAll) {
    var total = files.length;
    if (!total) { resolveAll(); return; }
    var done = 0;
    var failed = 0;
    var target = currentFilePath || ".";
    var msgEl = document.createElement("div");
    msgEl.style.cssText = "position:fixed;bottom:20px;right:20px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;box-shadow:var(--shadow);z-index:999;font-size:13px;min-width:200px;max-height:300px;overflow-y:auto";
    document.body.appendChild(msgEl);
    msgEl.innerHTML = "Uploading " + total + " file(s)...";

    doUpload(0);

    function doUpload(index) {
      if (index >= total) {
        var text = done + " file uploaded";
        if (failed) text += ", " + failed + " failed";
        msgEl.innerHTML = '<i class="fa-solid fa-' + (failed ? "xmark" : "check") + '" style="color:' + (failed ? "#e44" : "#16a34a") + '"></i> ' + text;
        if (done) loadFileList(currentFilePath);
        setTimeout(function () { if (msgEl.parentNode) msgEl.parentNode.removeChild(msgEl); }, 3000);
        resolveAll();
        return;
      }
      var item = files[index];
      var fd = new FormData();
      fd.append("file", item.file);
      var parts = item.rel.split("/");
      var folder = parts.slice(0, -1).join("/");
      var tgt = target === "." ? "" : target;
      tgt = folder ? (tgt ? tgt + "/" + folder : folder) : tgt;
      fd.append("target", tgt || ".");

      fetch("/api/sites/" + encodeURIComponent(domain) + "/files/upload", {
        method: "POST",
        body: fd,
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("Upload failed")); })
        .then(function () {
          done++;
          doUpload(index + 1);
        })
        .catch(function () {
          failed++;
          doUpload(index + 1);
        });
    }
  });
}

async function traverseEntry(entry, path) {
  if (entry.isFile) {
    var file = await new Promise(function (resolve) { entry.file(resolve); });
    return [{ file: file, rel: path + file.name }];
  }
  if (entry.isDirectory) {
    var reader = entry.createReader();
    var all = [];
    while (true) {
      var batch = await new Promise(function (resolve) { reader.readEntries(resolve); });
      if (!batch.length) break;
      all = all.concat(Array.from(batch));
    }
    if (all.length === 0) {
      return [{ file: null, rel: path + entry.name + "/" }];
    }
    var results = await Promise.all(all.map(function (e) {
      return traverseEntry(e, path + entry.name + "/");
    }));
    return results.flat();
  }
  return [];
}

// Prevent browser from opening dropped files (global)
window.addEventListener("dragover", function (e) { e.preventDefault(); });
window.addEventListener("drop", function (e) { e.preventDefault(); });

function initFileDropTarget() {
  var fileList = document.querySelector("#fileRows");
  if (!fileList || fileList.dataset.dropInit) return;
  fileList.dataset.dropInit = "1";

  var parent = fileList.closest(".table-wrap") || fileList.parentElement;
  parent.style.position = "relative";

  var overlay = document.createElement("div");
  overlay.id = "dragOverlay";
  overlay.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>Drop files or folders to upload</span>';
  overlay.style.cssText = "display:none;position:absolute;inset:0;background:rgba(37,99,235,0.1);backdrop-filter:blur(2px);z-index:10;border-radius:var(--radius);flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:17px;font-weight:600;color:var(--accent);border:2px dashed var(--accent);margin:0;pointer-events:none";
  parent.appendChild(overlay);

  var dragCounter = 0;

  function showOverlay() { overlay.style.display = "flex"; }
  function hideOverlay() { overlay.style.display = "none"; }

  parent.addEventListener("dragenter", function (e) {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) showOverlay();
  });

  parent.addEventListener("dragover", function (e) {
    e.preventDefault();
  });

  parent.addEventListener("dragleave", function (e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; hideOverlay(); }
  });

  parent.addEventListener("drop", async function (e) {
    e.preventDefault();
    dragCounter = 0;
    hideOverlay();

    try {
      var dt = e.dataTransfer;
      var allFiles = [];

      // Check if any dragged item is a directory
      var hasDir = false;
      if (dt.items) {
        try {
          for (var i = 0; i < dt.items.length; i++) {
            var entry = dt.items[i].webkitGetAsEntry ? dt.items[i].webkitGetAsEntry() : null;
            if (entry && entry.isDirectory) { hasDir = true; break; }
          }
        } catch (e) { /* items iteration failed */ }
      }

      if (hasDir) {
        var seen = {};
        var allFiles = [];
        var emptyDirs = [];
        for (var i = 0; i < dt.items.length; i++) {
          try {
            var itemEntry = dt.items[i].webkitGetAsEntry ? dt.items[i].webkitGetAsEntry() : null;
            if (itemEntry) {
              var result = await traverseEntry(itemEntry, "");
              result.forEach(function (f) {
                if (f.file) {
                  var key = f.file.name + "_" + f.file.size;
                  if (!seen[key]) { seen[key] = true; allFiles.push(f); }
                } else {
                  emptyDirs.push(f.rel);
                }
              });
            } else {
              var f = dt.items[i].getAsFile ? dt.items[i].getAsFile() : null;
              if (f) {
                var key = f.name + "_" + f.size;
                if (!seen[key]) { seen[key] = true; allFiles.push({ file: f, rel: f.name }); }
              }
            }
          } catch (itemErr) {
            console.error("Drop item error:", itemErr);
          }
        }
        // Supplement with dataTransfer.files for anything items missed
        if (dt.files.length) {
          Array.from(dt.files).forEach(function (f) {
            var key = f.name + "_" + f.size;
            if (!seen[key]) { seen[key] = true; allFiles.push({ file: f, rel: f.name }); }
          });
        }
        // Final fallback: if items still yielded nothing, use files directly
        if (!allFiles.length && !emptyDirs.length && dt.files.length) {
          allFiles = Array.from(dt.files).map(function (f) {
            return { file: f, rel: f.name };
          });
        }
        // Upload files then create empty dirs
        if (allFiles.length || emptyDirs.length) {
          if (allFiles.length) await uploadFileList(allFiles);
          for (var d = 0; d < emptyDirs.length; d++) {
            try { await createFolder(domain, emptyDirs[d]); } catch (e) {}
          }
          if (emptyDirs.length) loadFileList(currentFilePath);
        }
      } else {
        // No directories: use dataTransfer.files directly (works like dialog upload)
        allFiles = Array.from(dt.files).map(function (f) {
          return { file: f, rel: f.name };
        });
      }

      if (allFiles.length) uploadFileList(allFiles);
    } catch (err) {
      console.error("Drop error:", err);
    }
  });
}

// --- Keyboard shortcuts ---
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    if (document.querySelector("#fileEditor.open")) closeFileEditor();
    if (document.querySelector("#detailDialog.open")) closeDialog();
    hideContextMenu();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    if (document.querySelector("#fileEditor.open")) {
      e.preventDefault();
      saveFileEditor();
    }
  }
});

document.querySelector("#refreshServices")?.addEventListener("click", loadServices);

document.querySelector("#openPhpMyAdmin")?.addEventListener("click", function () {
  window.open("/api/sites/" + encodeURIComponent(domain) + "/phpmyadmin-redirect", "_blank");
});

loadDetail().catch(function (err) {
  console.error("loadDetail error:", err);
});
initFileContextMenu();

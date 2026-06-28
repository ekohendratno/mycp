const grid = document.querySelector("#sitesGrid");
const search = document.querySelector("#siteSearch");
const totalSites = document.querySelector("#totalSites");
const modal = document.querySelector("#createSiteModal");
const form = document.querySelector("#createSiteForm");
let sites = [];
let activeFilter = "all";

const versionsByRuntime = {
  "PHP Native": ["PHP 8.4", "PHP 8.3", "PHP 8.2", "PHP 8.1", "PHP 8.0", "PHP 7.4"],
  "CodeIgniter 3": ["PHP 7.4", "PHP 8.0", "PHP 8.1", "PHP 8.2", "PHP 8.3", "PHP 8.4"],
  "CodeIgniter 4": ["PHP 8.4", "PHP 8.3", "PHP 8.2", "PHP 8.1", "PHP 8.0"],
  Laravel: ["Laravel 12", "Laravel 11", "Laravel 10"],
  "Node.js": ["Node.js 22", "Node.js 20", "Node.js 18"],
  "Static HTML": ["Nginx Static"],
  "Reverse Proxy": ["Nginx Proxy"],
};

function isValidDomain(str) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(str);
}

function slugFromDomain(domain) {
  return domain
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

function rootFromUsername(username) {
  var prefix = (window.MyCP && window.MyCP.HOME_PREFIX) || "/home";
  return prefix + "/" + (username || "username") + "/htdocs";
}

function updateVersionOptions() {
  const runtime = form.elements.runtime.value;
  const versionSelect = form.elements.version;
  const versions =
    versionsByRuntime[runtime] || versionsByRuntime["PHP Native"];
  versionSelect.innerHTML = versions
    .map((v) => `<option>${v}</option>`)
    .join("");
  versionSelect.value = versions[0] || "";
  form.elements.port.value =
    runtime === "Node.js"
      ? "3000"
      : runtime === "Reverse Proxy"
        ? "8080"
        : "80";
  var cloneLabel = document.querySelector("#cloneSourceWrap");
  if (cloneLabel) {
    var show = ["Laravel", "CodeIgniter 3", "CodeIgniter 4"].includes(runtime);
    cloneLabel.style.display = show ? "" : "none";
  }
}

function updateRootFromUsername() {
  form.elements.root.value = rootFromUsername(
    form.elements.username.value.trim(),
  );
}

async function renderSites() {
  sites = await getSites();
  const query = search.value.trim().toLowerCase();
  const filtered = sites.filter((site) => {
    const matchesQuery = [
      site.domain,
      site.username,
      site.runtime,
      site.database,
      site.status,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesFilter =
      activeFilter === "all" || site.status === activeFilter;
    return matchesQuery && matchesFilter;
  });

  totalSites.textContent = sites.length;
  const rows = filtered
    .map((site, i) => {
      const realIndex = sites.indexOf(site);
      return `
      <tr data-index="${realIndex}">
        <td>
          <button class="site-link" type="button" data-index="${realIndex}">
            <i class="fa-solid fa-globe"></i>
            <span>${site.domain}</span>
          </button>
        </td>
        <td>${site.username || "-"}</td>
        <td>${site.runtime}</td>
        <td>${site.database}</td>
        <td>${site.ssl ? '<span class="status running">SSL</span>' : '<span class="status issue">No SSL</span>'}</td>
        <td><span class="status ${site.status}">${site.status === "running" ? "Running" : "Issue"}</span></td>
        <td>
          <button class="ghost-btn compact-action" type="button" data-index="${realIndex}" title="Detail"><i class="fa-regular fa-eye"></i></button>
          <button class="ghost-btn compact-action preview-btn" type="button" data-domain="${site.domain}" title="Preview"><i class="fa-regular fa-window-restore"></i></button>
          <button class="ghost-btn compact-action terminal-btn" type="button" data-path="${site.path || rootFromUsername(site.username)}" title="Terminal"><i class="fa-solid fa-terminal" style="color:#6366f1"></i></button>
          <button class="ghost-btn compact-action delete-btn" type="button" data-index="${realIndex}" title="Hapus" style="color:#f87171"><i class="fa-regular fa-trash-can"></i></button>
        </td>
      </tr>
    `;
    })
    .join("");

  grid.innerHTML = `
    <div class="table-wrap sites-table-wrap">
      <table class="sites-table">
        <thead>
          <tr>
            <th>Domain</th>
            <th>User</th>
            <th>Type</th>
            <th>Database</th>
            <th>SSL</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (!filtered.length) {
    grid.innerHTML =
      '<div class="metric"><div><strong>Tidak ada website</strong><small>Coba ubah pencarian atau filter.</small></div></div>';
  }
}

function openModal() {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  form.elements.domain.focus();
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  form.reset();
  form.elements.runtime.value = "CodeIgniter 4";
  updateVersionOptions();
  form.elements.username.value = "";
  form.elements.username.dataset.touched = "false";
  form.elements.password.value = "";
  form.elements.database.value = "MySQL";
  form.elements.port.value = "80";
  form.elements.root.value = rootFromUsername("");
  form.elements.ssl.value = "self";
  form.elements.ftp.checked = false;
  form.elements.databaseCreate.checked = false;
  form.elements.cloneSource.checked = true;
  form.elements.www.checked = true;
  form.elements.tunnel.checked = false;
  form.elements.ftp.checked = true;
}

grid.addEventListener("click", (event) => {
  const terminalBtn = event.target.closest(".terminal-btn");
  if (terminalBtn) {
    var path = terminalBtn.dataset.path;
    window.open(
      "/terminal?cwd=" + encodeURIComponent(path),
      "_blank",
      "width=900,height=500",
    );
    return;
  }
  const previewBtn = event.target.closest(".preview-btn");
  if (previewBtn) {
    window.open(
      `/preview?site=${encodeURIComponent(previewBtn.dataset.domain)}`,
      "_blank",
    );
    return;
  }
  const deleteBtn = event.target.closest(".delete-btn");
  if (deleteBtn) {
    const site = sites[Number(deleteBtn.dataset.index)];
    if (confirm(`Hapus website ${site.domain}?`)) {
      deleteSite(site.domain).then(() => renderSites()).catch((e) => alert("Gagal: " + e.message));
    }
    return;
  }
  const target = event.target.closest("[data-index]");
  if (target) {
    const site = sites[Number(target.dataset.index)];
    window.location.href = `/detail?site=${encodeURIComponent(site.domain)}`;
  }
});

search.addEventListener("input", renderSites);

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-filter]")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderSites();
  });
});

document.querySelector("#openCreateSite").addEventListener("click", openModal);
document
  .querySelector("#closeCreateSite")
  .addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const domain = String(data.get("domain")).trim();
  const username = String(data.get("username")).trim();
  const root = String(data.get("root")).trim() || rootFromUsername(username);
  const runtime = String(data.get("runtime"));
  const siteData = {
    domain,
    username,
    passwordSet: Boolean(String(data.get("password")).trim()),
    runtime,
    version: String(data.get("version")),
    database: String(data.get("database")),
    port: String(data.get("port")).trim() || "80",
    ssl: data.get("ssl") || "none",
    ftp: data.has("ftp"),
    cloneSource: data.has("cloneSource"),
    path: root,
  };

  // Show progress modal with spinning steps
  closeModal();
  showProgress(domain, runtime);
  try {
    await createSite(siteData);
    completeProgress(domain);
  } catch (err) {
    failProgress(err.message);
  }
});

var STEP_MAP = {
  user: "Membuat user",
  pool: "Konfigurasi PHP-FPM pool",
  vhost: "Konfigurasi Nginx vhost",
  database: "Membuat database",
  ssl: "Issue SSL certificate",
  ftp: "Aktifkan FTP",
  done: "Selesai",
};

var STEPS_BY_RUNTIME = {
  "PHP Native":   ["user", "pool", "vhost", "database", "ssl", "ftp", "done"],
  "CodeIgniter 3": ["user", "pool", "vhost", "database", "ssl", "ftp", "done"],
  "CodeIgniter 4": ["user", "pool", "vhost", "database", "ssl", "ftp", "done"],
  Laravel:         ["user", "pool", "vhost", "database", "ssl", "ftp", "done"],
  "Node.js":       ["user", "vhost", "database", "ssl", "ftp", "done"],
  "Static HTML":   ["user", "vhost", "ssl", "ftp", "done"],
  "Reverse Proxy": ["user", "vhost", "ssl", "done"],
};

function showProgress(domain, runtime) {
  var steps = STEPS_BY_RUNTIME[runtime] || STEPS_BY_RUNTIME["PHP Native"];
  var container = document.querySelector("#progressSteps");
  container.innerHTML = steps.map(function(k) {
    return '<div class="progress-step" data-step="' + k + '"><i class="fa-regular fa-circle"></i><span>' + (STEP_MAP[k] || k) + '</span></div>';
  }).join("");
  document.querySelector("#progressModal").classList.add("open");
  document.querySelector("#progressModal").setAttribute("aria-hidden", "false");
  document.querySelector("#progressDomain").textContent = domain;
  document.querySelector("#progressSteps").style.display = "";
  document.querySelector("#progressSuccess").style.display = "none";
  document.querySelector("#progressLog").style.display = "none";
  animateSteps();
}

function animateSteps() {
  var steps = document.querySelectorAll(".progress-step");
  var delay = 0;
  steps.forEach(function(s, i) {
    setTimeout(function() {
      s.classList.add("active");
      s.querySelector("i").className = "fa-solid fa-spinner fa-spin";
    }, delay);
    delay += 800;
    setTimeout(function() {
      if (i < steps.length - 1) {
        s.querySelector("i").className = "fa-solid fa-check";
        s.classList.remove("active");
        s.classList.add("done");
      }
    }, delay + 200);
    delay += 200;
  });
}

function completeProgress(domain) {
  var steps = document.querySelectorAll(".progress-step");
  steps.forEach(function(s) {
    s.querySelector("i").className = "fa-solid fa-check";
    s.classList.remove("active");
    s.classList.add("done");
  });
  document.querySelector("#progressSteps").style.display = "none";
  document.querySelector("#progressSuccess").style.display = "";
}

function failProgress(msg) {
  var steps = document.querySelectorAll(".progress-step");
  steps.forEach(function(s) {
    s.querySelector("i").className = "fa-solid fa-xmark";
    s.classList.remove("active");
    s.classList.add("error");
  });
  document.querySelector("#progressSteps").style.display = "none";
  document.querySelector("#progressLog").textContent = msg;
  document.querySelector("#progressLog").style.display = "";
  document.querySelector("#progressSuccess").innerHTML =
    '<i class="fa-solid fa-circle-exclamation" style="color:#f87171;font-size:48px"></i><h3 style="color:#f87171">Gagal!</h3><p>' + msg + '</p><button class="primary-btn" type="button" id="closeProgressSuccess"><i class="fa-solid fa-check"></i><span>Tutup</span></button>';
  document.querySelector("#progressSuccess").style.display = "";
}

document.querySelector("#closeProgressSuccess").addEventListener("click", function() {
  document.querySelector("#progressModal").classList.remove("open");
  document.querySelector("#progressModal").setAttribute("aria-hidden", "true");
  renderSites();
});

form.elements.domain.addEventListener("input", () => {
  const val = form.elements.domain.value.trim();
  const hint = document.querySelector("#domainHint");
  if (!val) { hint.textContent = ""; hint.style.color = ""; return; }
  if (!isValidDomain(val)) {
    hint.textContent = "Format domain tidak valid (contoh: example.com)";
    hint.style.color = "#f87171";
  } else if (sites.some(function(s) { return s.domain === val; })) {
    hint.textContent = "Domain sudah terdaftar";
    hint.style.color = "#f87171";
  } else {
    hint.textContent = "Format domain valid";
    hint.style.color = "#22c55e";
  }
  if (form.elements.username.dataset.touched === "true") return;
  form.elements.username.value = slugFromDomain(val);
  updateRootFromUsername();
});

form.elements.username.addEventListener("input", () => {
  form.elements.username.dataset.touched = "true";
  updateRootFromUsername();
});

form.elements.runtime.addEventListener("change", updateVersionOptions);

updateVersionOptions();
renderSites();

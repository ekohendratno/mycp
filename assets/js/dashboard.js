// === Dashboard Data Loading ===

(async function loadDashboard() {
  const stats = await getDashboardStats();
  if (stats) {
    document.querySelector("#dashboardSites").textContent = stats.totalSites;
    document.querySelector("#dashboardDatabases").textContent = stats.totalDatabases;
    document.querySelector("#dashboardSsl").textContent = stats.sslActive + "/" + stats.totalSites;
  }
  const server = await getServerStats();
  if (server) {
    document.querySelector("#dashboardUptime").textContent = server.uptime || "-";
    const runningServices = server.services.filter((s) => s.status === "running").length;
    document.querySelector("#serviceCount").textContent = runningServices + "/" + server.services.length;
    document.querySelector("#cpuDetail").textContent = server.cpuCores + " cores, load " + server.loadAvg.join(", ");
    const cpuPct = Math.min(Math.round((server.loadAvg[0] / server.cpuCores) * 100), 100);
    document.querySelector("#cpuPercent").textContent = cpuPct + "%";
    document.querySelector("#cpuDonut").style.setProperty("--value", cpuPct);
    document.querySelector("#cpuDonutText").textContent = cpuPct + "%";
    const ramPct = server.ramPercent || 0;
    const ramUsedGb = (server.ramUsed / 1024).toFixed(1);
    const ramTotalGb = (server.ramTotal / 1024).toFixed(1);
    document.querySelector("#ramDetail").textContent = ramUsedGb + " GB dari " + ramTotalGb + " GB";
    document.querySelector("#ramPercent").textContent = ramPct + "%";
    document.querySelector("#ramDonut").style.setProperty("--value", ramPct);
    document.querySelector("#ramDonutText").textContent = ramPct + "%";
    document.querySelector("#diskDetail").textContent = server.diskUsed + " dari " + server.diskTotal;
    document.querySelector("#diskPercent").textContent = server.diskPercent + "%";
    document.querySelector("#diskDonut").style.setProperty("--value", server.diskPercent);
    document.querySelector("#diskDonutText").textContent = server.diskPercent + "%";
    const svcList = document.querySelector("#serviceList");
    svcList.innerHTML = server.services
      .map(
        (s) =>
          '<div class="service-row"><span>' +
          s.name +
          '</span><b class="' +
          (s.status === "running" ? "ok" : "muted") +
          '">' +
          s.status +
          "</b></div>",
      )
      .join("");
    const resPanel = document.querySelector("#resourcesPanel");
    if (resPanel) {
      const bars = [
        { label: "CPU", pct: cpuPct, color: "#2563eb" },
        { label: "RAM", pct: ramPct, color: "#16a34a" },
        { label: "Disk", pct: server.diskPercent, color: "#d97706" },
      ];
      resPanel.innerHTML = bars
        .map(
          (b) =>
            '<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px"><span>' +
            b.label +
            '</span><span>' +
            b.pct +
            '%</span></div><div class="resource-meter"><span style="width:' +
            b.pct +
            "%;background:" +
            b.color +
            '"></span></div></div>',
        )
        .join("");
    }
  }
  const sites = await getSites();
  const recentPanel = document.querySelector("#recentSitesPanel");
  if (recentPanel && sites.length) {
    recentPanel.innerHTML = sites
      .slice()
      .reverse()
      .slice(0, 8)
      .map(
        (s) =>
          '<div class="activity-row"><i class="fa-solid fa-globe"></i><span>' +
          s.domain +
          '</span><small>' +
          (s.createdAt ? new Date(s.createdAt).toLocaleDateString("id") : "-") +
          "</small></div>",
      )
      .join("");
  }
})().catch(console.error);

// === Terminal (xterm.js + WebSocket) ===

var terminal = null;
var ws = null;
var fitAddon = null;

function initTerminal() {
  var container = document.querySelector("#terminal-container");
  if (!container || terminal) return;

  var FA = window.FitAddon && window.FitAddon.FitAddon ? window.FitAddon.FitAddon : window.FitAddon;
  fitAddon = new FA();

  terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    theme: {
      background: "#0c0c0c",
      foreground: "#33ff33",
      cursor: "#33ff33",
      selectionBackground: "#335533",
      black: "#0c0c0c",
      red: "#cc4444",
      green: "#33ff33",
      yellow: "#cccc33",
      blue: "#3366ff",
      magenta: "#cc44cc",
      cyan: "#33cccc",
      white: "#cccccc",
    },
    allowTransparency: true,
  });

  terminal.loadAddon(fitAddon);

  terminal.open(container);
  fitAddon.fit();

  terminal.onData(function (data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data: data }));
    }
  });

  connectWebSocket();
}

function connectWebSocket() {
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }

  var proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  var wsUrl = proto + "//" + window.location.host + "/ws/terminal";

  ws = new WebSocket(wsUrl);

  ws.onopen = function () {
    if (terminal) terminal.focus();
  };

  ws.onmessage = function (ev) {
    if (terminal) terminal.write(ev.data);
  };

  ws.onclose = function () {
    // Reconnect after delay
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = function () {
    ws.close();
  };
}

// === Modal Controls ===

var cliModal = document.querySelector("#cliModal");

function openCli() {
  cliModal.classList.add("open");
  cliModal.setAttribute("aria-hidden", "false");
  setTimeout(function () {
    initTerminal();
    if (terminal) terminal.focus();
  }, 200);
}

function closeCli() {
  cliModal.classList.remove("open");
  cliModal.setAttribute("aria-hidden", "true");
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }
  if (terminal) {
    terminal.dispose();
    terminal = null;
    fitAddon = null;
  }
}

document.querySelector("#openCli")?.addEventListener("click", openCli);
document.querySelector("#closeCli")?.addEventListener("click", closeCli);
cliModal?.addEventListener("click", function (event) {
  if (event.target === cliModal) closeCli();
});

document.querySelector("#refreshDashboard")?.addEventListener("click", function () {
  location.reload();
});

async function getServerStats() {
  try {
    var res = await fetch("/api/server-stats");
    return await res.json();
  } catch { return null; }
}

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
    document.querySelector("#cpuDetail").textContent = server.cpuCores + " cores, load " + (server.loadAvg || [0,0,0]).join(", ");
    const cpuPct = server.cpuCores > 0 ? Math.min(Math.round(((server.loadAvg && server.loadAvg[0] || 0) / server.cpuCores) * 100), 100) : 0;
    document.querySelector("#cpuPercent").textContent = cpuPct + "%";
    document.querySelector("#cpuDonut").style.setProperty("--value", cpuPct);
    document.querySelector("#cpuDonutText").textContent = cpuPct + "%";
    const sparkEl = document.querySelector("#cpuSpark");
    if (sparkEl && server.cpuSpark) {
      sparkEl.innerHTML = server.cpuSpark.map(function(v) { return '<i style="height:' + Math.min(v, 100) + '%"></i>'; }).join("");
    }
    const ramPct = server.ramPercent || 0;
    const ramUsedGb = (server.ramUsed / 1024).toFixed(1);
    const ramTotalGb = (server.ramTotal / 1024).toFixed(1);
    document.querySelector("#ramDetail").textContent = ramUsedGb + " GB dari " + ramTotalGb + " GB";
    document.querySelector("#ramPercent").textContent = ramPct + "%";
    document.querySelector("#ramDonut").style.setProperty("--value", ramPct);
    document.querySelector("#ramDonutText").textContent = ramPct + "%";
    document.querySelector("#ramMeter span").style.width = ramPct + "%";
    document.querySelector("#diskDetail").textContent = server.diskUsed + " dari " + server.diskTotal;
    document.querySelector("#diskPercent").textContent = server.diskPercent + "%";
    document.querySelector("#diskDonut").style.setProperty("--value", server.diskPercent);
    document.querySelector("#diskDonutText").textContent = server.diskPercent + "%";
    document.querySelector("#networkRx").textContent = (server.networkRx || 0).toFixed(1);
    document.querySelector("#networkTx").textContent = (server.networkTx || 0).toFixed(1);
    var netTotal = ((server.networkRx || 0) + (server.networkTx || 0)).toFixed(1);
    document.querySelector("#networkTotal").textContent = netTotal + " MB";
    var svcPanel = document.querySelector("#servicePanel");
    if (svcPanel && server.services) {
      svcPanel.innerHTML = server.services.map(function(s) {
        return '<div class="service-row"><span>' + s.name + '</span><b class="' + (s.status === "running" ? "ok" : "muted") + '">' + s.status + "</b></div>";
      }).join("");
    }
  }
  var sites = await getSites();
  var recentPanel = document.querySelector("#recentPanel");
  if (recentPanel && sites && sites.length) {
    recentPanel.innerHTML = sites.slice().reverse().slice(0, 8).map(function(s) {
      return '<div class="activity-row"><i class="fa-solid fa-globe"></i><span>' + s.domain + '</span><small>' + (s.createdAt ? new Date(s.createdAt).toLocaleDateString("id") : "-") + "</small></div>";
    }).join("");
  }
})().catch(console.error);

document.querySelector("#openCli")?.addEventListener("click", function () {
  window.open("/terminal?cwd=/home/srv/cp", "_blank", "width=900,height=500");
});

document.querySelector("#refreshDashboard")?.addEventListener("click", function () {
  location.reload();
});

document.querySelector("#fixDbPrivileges")?.addEventListener("click", async function () {
  if (!confirm("Perbaiki privileges database untuk semua user? Ini akan mencegah user melihat database situs lain.")) return;
  this.disabled = true;
  this.textContent = "Processing...";
  try {
    var res = await fetch("/api/admin/fix-db-privileges", { method: "POST" });
    var data = await res.json();
    alert(data.ok ? "Selesai! " + (data.message || "") : "Gagal: " + (data.error || ""));
  } catch (e) {
    alert("Error: " + e.message);
  }
  this.disabled = false;
  this.innerHTML = '<i class="fa-solid fa-database"></i><span>Fix DB Priv</span>';
});

async function getServerStats() {
  try {
    var res = await fetch("/api/server-stats");
    return await res.json();
  } catch { return null; }
}

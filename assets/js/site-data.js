async function getSites() {
  try {
    const res = await fetch("/api/sites");
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function getSite(domain) {
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(domain)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function createSite(data) {
  const res = await fetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Gagal membuat site");
  }
  return await res.json();
}

async function updateSite(domain, data) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal update site");
  return await res.json();
}

async function deleteSite(domain) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}`, {
    method: "DELETE",
  });
  return res.ok;
}

async function updateRuntime(domain, runtime, version) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runtime, version }),
  });
  return res.ok ? await res.json() : null;
}

async function changePassword(domain, password) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

async function getVhost(domain) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/vhost`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.vhost;
}

async function saveVhost(domain, vhostContent) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/vhost`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vhost: vhostContent }),
  });
  return res.ok;
}

async function issueSsl(domain) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/ssl`, {
    method: "POST",
  });
  return res.ok;
}

async function getDatabases(domain) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/databases`);
  return res.ok ? await res.json() : [];
}

async function createDatabase(domain, data) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/databases`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return res.ok ? await res.json() : null;
}

async function getCronJobs(domain) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/cron`);
  return res.ok ? await res.json() : [];
}

async function createCronJob(domain, data) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/cron`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.ok ? await res.json() : null;
}

async function getFtpAccounts(domain) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/ftp`);
  return res.ok ? await res.json() : [];
}

async function deleteDatabase(domain, id) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/databases/${id}`,
    { method: "DELETE" },
  );
  return res.ok;
}

async function createFtpAccount(domain, data) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/ftp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.ok ? await res.json() : null;
}

async function getSiteLogs(domain, type = "access") {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/logs?type=${type}`,
  );
  if (!res.ok) return "";
  const data = await res.json();
  return data.logs;
}

async function fetchPhpini(domain) {
  const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/php`);
  return res.ok ? await res.json() : null;
}

async function getDashboardStats() {
  const res = await fetch("/api/dashboard");
  return res.ok ? await res.json() : null;
}

async function getFileList(domain, path) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files?path=${encodeURIComponent(path || ".")}`,
  );
  return res.ok ? await res.json() : { entries: [] };
}

async function createFolder(domain, path) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/folder`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    },
  );
  return res.ok;
}

async function writeFile(domain, path, content) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/write`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    },
  );
  return res.ok;
}

async function readFile(domain, path) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/read?path=${encodeURIComponent(path)}`,
  );
  return res.ok ? await res.json() : null;
}

async function renameFile(domain, path, newName) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/rename`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, newName }),
    },
  );
  return res.ok;
}

async function copyFile(domain, source, dest) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/copy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, dest }),
    },
  );
  return res.ok;
}

async function moveFile(domain, source, dest) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/move`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, dest }),
    },
  );
  return res.ok;
}

async function deleteFile(domain, path) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/delete?path=${encodeURIComponent(path)}`,
    {
      method: "DELETE",
    },
  );
  return res.ok;
}

async function compressFile(domain, path) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/compress`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    },
  );
  return res.ok;
}

async function chmodFile(domain, path, mode) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/chmod`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, mode }),
    },
  );
  return res.ok;
}

async function uploadFile(domain, formData) {
  const res = await fetch(
    `/api/sites/${encodeURIComponent(domain)}/files/upload`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(function () { return { error: "Upload failed" }; });
    throw new Error(err.error || "Upload failed");
  }
  return await res.json();
}

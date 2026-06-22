const grid = document.querySelector('#sitesGrid');
const search = document.querySelector('#siteSearch');
const totalSites = document.querySelector('#totalSites');
const modal = document.querySelector('#createSiteModal');
const form = document.querySelector('#createSiteForm');
let sites = getSites();
let activeFilter = 'all';

const versionsByRuntime = {
  'PHP Native': ['PHP 8.4', 'PHP 8.3', 'PHP 8.2', 'PHP 7.4'],
  'CodeIgniter 3': ['PHP 7.4', 'PHP 8.0', 'PHP 8.1'],
  'CodeIgniter 4': ['PHP 8.4', 'PHP 8.3', 'PHP 8.2'],
  Laravel: ['PHP 8.4', 'PHP 8.3', 'PHP 8.2'],
  'Node.js': ['Node.js 22', 'Node.js 20', 'Node.js 18'],
  'Static HTML': ['Nginx Static'],
  'Reverse Proxy': ['Nginx Proxy']
};

function slugFromDomain(domain) {
  return domain.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
}

function rootFromUsername(username) {
  return `/home/${username || 'username'}/htdocs`;
}

function updateVersionOptions() {
  const runtime = form.elements.runtime.value;
  const versionSelect = form.elements.version;
  const versions = versionsByRuntime[runtime] || versionsByRuntime['PHP Native'];
  versionSelect.innerHTML = versions.map((version) => `<option>${version}</option>`).join('');
  form.elements.port.value = runtime === 'Node.js' ? '3000' : runtime === 'Reverse Proxy' ? '8080' : '80';
}

function updateRootFromUsername() {
  form.elements.root.value = rootFromUsername(form.elements.username.value.trim());
}

function renderSites() {
  const query = search.value.trim().toLowerCase();
  const filtered = sites.filter((site) => {
    const matchesQuery = [site.domain, site.username, site.runtime, site.database, site.status].join(' ').toLowerCase().includes(query);
    const matchesFilter = activeFilter === 'all' || site.status === activeFilter;
    return matchesQuery && matchesFilter;
  });

  totalSites.textContent = sites.length;
  const rows = filtered.map((site) => {
    const realIndex = sites.indexOf(site);
    return `
      <tr data-index="${realIndex}">
        <td><button class="site-link" type="button" data-index="${realIndex}"><i class="fa-solid fa-globe"></i><span>${site.domain}</span></button></td>
        <td>${site.username || '-'}</td>
        <td>${site.runtime}</td>
        <td>${site.database}</td>
        <td>${site.ssl ? '<span class="status running">SSL</span>' : '<span class="status issue">No SSL</span>'}</td>
        <td><span class="status ${site.status}">${site.status === 'running' ? 'Running' : 'Issue'}</span></td>
        <td><button class="ghost-btn compact-action" type="button" data-index="${realIndex}">Detail</button></td>
      </tr>`;
  }).join('');

  grid.innerHTML = `<div class="table-wrap sites-table-wrap"><table class="sites-table"><thead><tr><th>Domain</th><th>User</th><th>Type</th><th>Database</th><th>SSL</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  if (!filtered.length) {
    grid.innerHTML = '<div class="metric"><div><strong>Tidak ada website</strong><small>Coba ubah pencarian atau filter.</small></div></div>';
  }
}

function openModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  form.elements.domain.focus();
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  form.reset();
  form.elements.runtime.value = 'CodeIgniter 4';
  updateVersionOptions();
  form.elements.username.value = '';
  form.elements.username.dataset.touched = 'false';
  form.elements.password.value = '';
  form.elements.database.value = 'MySQL';
  form.elements.port.value = '80';
  form.elements.root.value = rootFromUsername('');
  form.elements.ssl.checked = true;
  form.elements.databaseCreate.checked = true;
  form.elements.www.checked = true;
  form.elements.tunnel.checked = false;
  form.elements.ftp.checked = true;
}

grid.addEventListener('click', (event) => {
  const target = event.target.closest('[data-index]');
  if (!target) return;
  const site = sites[Number(target.dataset.index)];
  window.location.href = `detail.html?site=${encodeURIComponent(site.domain)}`;
});

search.addEventListener('input', renderSites);

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    activeFilter = button.dataset.filter;
    renderSites();
  });
});

document.querySelector('#openCreateSite').addEventListener('click', openModal);
document.querySelector('#closeCreateSite').addEventListener('click', closeModal);
document.querySelector('#cancelCreateSite').addEventListener('click', closeModal);

modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const domain = String(data.get('domain')).trim();
  const username = String(data.get('username')).trim();
  const root = String(data.get('root')).trim() || rootFromUsername(username);
  const runtime = String(data.get('runtime'));
  const site = {
    domain,
    username,
    passwordSet: Boolean(String(data.get('password')).trim()),
    runtime,
    version: String(data.get('version')),
    database: String(data.get('database')),
    port: String(data.get('port')).trim() || '80',
    ssl: data.has('ssl'),
    ftp: data.has('ftp'),
    status: 'running',
    path: root
  };
  sites.unshift(site);
  saveSites(sites);
  closeModal();
  renderSites();
});

form.elements.domain.addEventListener('input', () => {
  if (form.elements.username.dataset.touched === 'true') return;
  form.elements.username.value = slugFromDomain(form.elements.domain.value);
  updateRootFromUsername();
});

form.elements.username.addEventListener('input', () => {
  form.elements.username.dataset.touched = 'true';
  updateRootFromUsername();
});

form.elements.runtime.addEventListener('change', updateVersionOptions);

updateVersionOptions();
renderSites();

const defaultSites = [
  { domain: 'dsmartlampung.com', runtime: 'CodeIgniter 4', version: 'PHP 8.3', username: 'dsmartlampung', ip: '103.133.61.102', database: 'MySQL', port: '80', ssl: true, status: 'running', ftp: true, path: '/home/dsmartlampung/htdocs' },
  { domain: 'karakter.dsmartlampung.com', runtime: 'Laravel', version: 'PHP 8.3', username: 'karakter', ip: '103.133.61.102', database: 'PostgreSQL', port: '80', ssl: true, status: 'running', ftp: true, path: '/home/karakter/htdocs' },
  { domain: 'cbt.s-c-h.my.id', runtime: 'CodeIgniter 3', version: 'PHP 7.4', username: 'schcbt', ip: '103.133.61.102', database: 'MySQL', port: '80', ssl: true, status: 'running', ftp: true, path: '/home/schcbt/htdocs' },
  { domain: 'api.internal.test', runtime: 'Node.js', version: 'Node.js 20', username: 'apiinternal', ip: '103.133.61.102', database: 'PostgreSQL', port: '3001', ssl: false, status: 'issue', ftp: false, path: '/home/apiinternal/htdocs' },
  { domain: 'docs.mypanel.test', runtime: 'Static HTML', version: 'Nginx', username: 'docs', ip: '103.133.61.102', database: 'Tanpa Database', port: '80', ssl: true, status: 'running', ftp: true, path: '/home/docs/htdocs' },
  { domain: 'tunnel.mypanel.test', runtime: 'Reverse Proxy', version: 'Cloudflare Tunnel', username: 'tunnel', ip: '103.133.61.102', database: 'Tanpa Database', port: '8080', ssl: true, status: 'running', ftp: false, path: '/home/tunnel/htdocs' }
];

const storageKey = 'mycontrolpanel-sites';

function normalizeSite(site) {
  const username = site.username || site.domain.split('.')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
  return {
    ...site,
    username,
    ip: site.ip || '103.133.61.102',
    ftp: site.ftp ?? true,
    path: site.path?.startsWith('/home/') ? site.path : `/home/${username}/htdocs`
  };
}

function getSites() {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return defaultSites.map(normalizeSite);
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(normalizeSite) : defaultSites.map(normalizeSite);
  } catch (error) {
    return defaultSites.map(normalizeSite);
  }
}

function saveSites(sites) {
  localStorage.setItem(storageKey, JSON.stringify(sites));
}

function findSiteByDomain(domain) {
  return getSites().find((site) => site.domain === domain) || getSites()[0];
}

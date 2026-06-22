const params = new URLSearchParams(window.location.search);
const domain = params.get('site');
const site = findSiteByDomain(domain);

document.title = `${site.domain} - MyControlPanel`;
document.querySelector('#detailDomain').textContent = site.domain;
document.querySelector('#detailUser').textContent = site.username;
document.querySelector('#detailIp').textContent = site.ip || '103.133.61.102';
document.querySelector('#detailPath').textContent = site.path;
document.querySelector('#settingDomain').value = site.domain;
document.querySelector('#settingRoot').value = site.path;
document.querySelector('#settingUser').value = site.username;
document.querySelector('#sslStatus').textContent = site.ssl ? 'Valid' : 'Disabled';
document.querySelector('#sslStatus').className = site.ssl ? 'ok' : 'muted';

document.querySelector('#vhostCode').textContent = `server {
    listen 80;
    server_name ${site.domain} www.${site.domain};
    root ${site.path};

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/${site.version.toLowerCase().replace(' ', '')}-fpm.sock;
    }
}`;

document.querySelector('#siteLogs').textContent = `[12:04:01] nginx reload successful
[12:04:03] runtime ${site.version} active for ${site.domain}
[12:05:22] GET /dashboard 200 48ms`;

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`[data-panel="${tab}"]`).classList.add('active');
  });
});

const dialog = document.querySelector('#detailDialog');
const dialogForm = document.querySelector('#detailDialogForm');
const dialogTitle = document.querySelector('#detailDialogTitle');
const dialogEyebrow = document.querySelector('#detailDialogEyebrow');
let activeDialog = '';

const dialogTemplates = {
  database: { eyebrow: 'Database', title: 'New Database', body: `<div class="form-grid"><label>Database Name<input name="database" required value="${site.username}_db"></label><label>Type<select name="type"><option>MySQL</option><option>PostgreSQL</option></select></label><label>Username<input name="username" required value="${site.username}_user"></label><label>Password<input name="password" type="password" required placeholder="Password database"></label></div><div class="modal-actions"><button class="ghost-btn" type="button" data-close-dialog>Batal</button><button class="primary-btn" type="submit"><i class="fa-solid fa-plus"></i><span>Create Database</span></button></div>` },
  cron: { eyebrow: 'Cron Jobs', title: 'New Cron Job', body: `<div class="form-grid"><label>Schedule<input name="schedule" required value="*/5 * * * *"></label><label>Status<select name="status"><option>Aktif</option><option>Disabled</option></select></label></div><label>Command<input name="command" required value="php spark queue:work"></label><div class="modal-actions"><button class="ghost-btn" type="button" data-close-dialog>Batal</button><button class="primary-btn" type="submit"><i class="fa-solid fa-plus"></i><span>Add Cron</span></button></div>` },
  upload: { eyebrow: 'File Manager', title: 'Upload File', body: `<label>Target Folder<input name="target" value="${site.path}"></label><label>File Name<input name="filename" required placeholder="backup.zip"></label><div class="drop-zone compact-drop"><i class="fa-solid fa-cloud-arrow-up"></i><span>Drop file here</span></div><div class="modal-actions"><button class="ghost-btn" type="button" data-close-dialog>Batal</button><button class="primary-btn" type="submit"><i class="fa-solid fa-upload"></i><span>Upload</span></button></div>` },
  folder: { eyebrow: 'File Manager', title: 'New Folder', body: `<label>Folder Name<input name="folder" required placeholder="storage"></label><label>Location<input name="target" value="${site.path}"></label><div class="modal-actions"><button class="ghost-btn" type="button" data-close-dialog>Batal</button><button class="primary-btn" type="submit"><i class="fa-solid fa-folder-plus"></i><span>Create Folder</span></button></div>` },
  edit: { eyebrow: 'File Manager', title: 'Edit File', body: `<label>File<select name="file"><option>.env</option><option>composer.json</option><option>public/index.php</option></select></label><label>Content<textarea name="content" rows="8">APP_ENV = production
APP_DEBUG = false</textarea></label><div class="modal-actions"><button class="ghost-btn" type="button" data-close-dialog>Batal</button><button class="primary-btn" type="submit"><i class="fa-solid fa-floppy-disk"></i><span>Save File</span></button></div>` }
};

function openDialog(type) {
  const template = dialogTemplates[type];
  if (!template) return;
  activeDialog = type;
  dialogEyebrow.textContent = template.eyebrow;
  dialogTitle.textContent = template.title;
  dialogForm.innerHTML = template.body;
  dialog.classList.add('open');
  dialog.setAttribute('aria-hidden', 'false');
}

function closeDialog() {
  dialog.classList.remove('open');
  dialog.setAttribute('aria-hidden', 'true');
  dialogForm.innerHTML = '';
  activeDialog = '';
}

document.querySelectorAll('[data-dialog]').forEach((button) => button.addEventListener('click', () => openDialog(button.dataset.dialog)));
document.querySelector('#detailDialogClose').addEventListener('click', closeDialog);
dialog.addEventListener('click', (event) => { if (event.target === dialog || event.target.closest('[data-close-dialog]')) closeDialog(); });

dialogForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(dialogForm);
  if (activeDialog === 'database') document.querySelector('#databaseRows').insertAdjacentHTML('beforeend', `<tr><td>${data.get('database')}</td><td>${data.get('type')}</td><td>${data.get('username')}</td><td><button class="ghost-btn compact" type="button">Manage</button></td></tr>`);
  if (activeDialog === 'cron') document.querySelector('#cronRows').insertAdjacentHTML('beforeend', `<tr><td>${data.get('schedule')}</td><td>${data.get('command')}</td><td><span class="status running">${data.get('status')}</span></td></tr>`);
  if (activeDialog === 'upload') document.querySelector('#fileRows').insertAdjacentHTML('beforeend', `<li><span><i class="fa-solid fa-file"></i> ${data.get('filename')}</span><small>Uploaded</small></li>`);
  if (activeDialog === 'folder') document.querySelector('#fileRows').insertAdjacentHTML('beforeend', `<li><span><i class="fa-solid fa-folder"></i> ${data.get('folder')}</span><small>folder</small></li>`);
  closeDialog();
});

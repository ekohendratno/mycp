const isLoginPage = /^\/?login/.test(location.pathname);

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      document.querySelectorAll('[data-auth-user]').forEach(el => el.textContent = data.username);
      if (isLoginPage) window.location.href = '/';
    } else {
      if (!isLoginPage) window.location.href = '/login';
    }
  } catch (e) {
    if (!isLoginPage) window.location.href = '/login';
  }
}

function toggleDropdown() {
  document.querySelector('.user-dropdown')?.classList.toggle('open');
}

function closeDropdown() {
  document.querySelector('.user-dropdown')?.classList.remove('open');
}

function showDialog(titleHtml, bodyHtml, wide) {
  closeDropdown();
  const dialog = document.getElementById('genericDialog');
  const title = document.getElementById('genericDialogTitle');
  const body = document.getElementById('genericDialogBody');
  if (!dialog) return;
  title.innerHTML = titleHtml;
  body.innerHTML = bodyHtml;
  dialog.classList.toggle('wide', !!wide);
  dialog.setAttribute('aria-hidden', 'false');
  dialog.classList.add('open');
  document.getElementById('genericDialogClose').onclick = closeDialog;
  dialog.querySelector('.modal-backdrop-close')?.addEventListener('click', closeDialog);
}

function closeDialog() {
  const dialog = document.getElementById('genericDialog');
  if (dialog) {
    dialog.setAttribute('aria-hidden', 'true');
    dialog.classList.remove('open');
  }
}

document.getElementById('genericDialog')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDialog();
});

function initAuthUi() {
  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    });
  });

  const toggle = document.querySelector('[data-dropdown-toggle]');
  if (toggle) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
  }

  document.addEventListener('click', (e) => {
    const dd = document.querySelector('.user-dropdown');
    if (dd && dd.classList.contains('open') && !dd.contains(e.target)) {
      closeDropdown();
    }
  });

  // --- Change Password ---
  document.querySelectorAll('[data-open-change-password]').forEach(btn => {
    btn.addEventListener('click', () => {
      showDialog(
        '<i class="fa-solid fa-key"></i> Change Password',
        '<div class="dialog-body"><form id="changePasswordForm" style="display:grid;gap:14px">' +
            '<label>Current Password<input type="password" name="currentPassword" required minlength="1"></label>' +
            '<label>New Password<input type="password" name="newPassword" required minlength="8"></label>' +
            '<label>Confirm New Password<input type="password" name="confirmPassword" required minlength="8"></label>' +
            '<div id="changePasswordError" class="form-error" style="display:none"></div>' +
            '<div class="modal-actions">' +
              '<button class="ghost-btn" type="button" onclick="closeDialog()">Cancel</button>' +
              '<button class="primary-btn" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save</button>' +
            '</div>' +
        '</form></div>'
      );

      document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        const currentPassword = data.get('currentPassword');
        const newPassword = data.get('newPassword');
        const confirmPassword = data.get('confirmPassword');
        const errEl = document.getElementById('changePasswordError');

        if (newPassword.length < 8) {
          errEl.textContent = 'Password baru minimal 8 karakter'; errEl.style.display = 'block';
          return;
        }
        if (newPassword !== confirmPassword) {
          errEl.textContent = 'Konfirmasi password tidak cocok'; errEl.style.display = 'block';
          return;
        }

        try {
          const res = await fetch('/api/me/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          const json = await res.json();
          if (res.ok) {
            closeDialog();
            alert('Password berhasil diubah');
          } else {
            errEl.textContent = json.error || 'Gagal mengubah password'; errEl.style.display = 'block';
          }
        } catch (e) {
          errEl.textContent = 'Gagal menghubungi server'; errEl.style.display = 'block';
        }
      });
    });
  });

  // --- Update Panel ---
  document.querySelectorAll('[data-update-panel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      showDialog(
        '<i class="fa-solid fa-rotate fa-spin"></i> Update Panel',
        '<div id="updateSteps" class="progress-steps"></div>' +
        '<pre id="updateLog" class="progress-log" style="display:none"></pre>' +
        '<div id="updateSuccess" class="progress-success" style="display:none">' +
          '<i class="fa-solid fa-circle-check success-icon"></i>' +
          '<h3>Panel berhasil diupdate!</h3>' +
          '<p>Halaman akan dimuat ulang...</p>' +
          '<button class="primary-btn" type="button" onclick="location.reload()"><i class="fa-solid fa-check"></i><span>OK</span></button>' +
        '</div>',
        true
      );

      function addStep(text, status) {
        const s = document.getElementById('updateSteps');
        if (!s) return;
        const div = document.createElement('div');
        div.className = 'progress-step ' + status;
        div.innerHTML = '<i class="fa-solid fa-' + (status === 'active' ? 'spinner fa-spin' : status === 'done' ? 'check' : 'xmark') + '"></i> ' + text;
        s.appendChild(div);
      }

      addStep('Memulai update...', 'active');

      try {
        const res = await fetch('/api/update', { method: 'POST' });
        const json = await res.json();
        const steps = document.getElementById('updateSteps');
        const log = document.getElementById('updateLog');
        const success = document.getElementById('updateSuccess');
        if (!steps || !log || !success) return;

        steps.innerHTML = '';

        if (res.ok && json.log) {
          json.log.split('\n').filter(Boolean).forEach(function (line) {
            const clean = line.replace(/\[mycp\]\s*(WARN|ERROR):?\s*/g, '').replace(/\[mycp\]/g, '').trim();
            if (clean) addStep(clean, 'done');
          });
        }

        if (res.ok) {
          addStep('Update selesai!', 'done');
          log.textContent = json.log || 'Update selesai';
          log.style.display = 'block';
          success.style.display = 'block';
          document.getElementById('genericDialogTitle').innerHTML = '<i class="fa-solid fa-circle-check" style="color:#16a34a"></i> Update Berhasil';
          setTimeout(function () { location.reload(); }, 3000);
        } else {
          addStep('Gagal: ' + (json.error || 'Unknown error'), 'error');
          log.textContent = json.error || 'Gagal';
          log.style.display = 'block';
          document.getElementById('genericDialogTitle').innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#dc2626"></i> Update Gagal';
        }
      } catch (e) {
        addStep('Gagal menghubungi server', 'error');
        document.getElementById('updateLog').textContent = e.message;
        document.getElementById('updateLog').style.display = 'block';
        document.getElementById('genericDialogTitle').innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#dc2626"></i> Update Gagal';
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { checkAuth(); initAuthUi(); });
} else {
  checkAuth();
  initAuthUi();
}

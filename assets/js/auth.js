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
  const dd = document.querySelector('.user-dropdown');
  if (dd) dd.classList.toggle('open');
}

function closeDropdown() {
  const dd = document.querySelector('.user-dropdown');
  if (dd) dd.classList.remove('open');
}

function openPasswordModal() {
  closeDropdown();
  const modal = document.getElementById('changePasswordModal');
  if (modal) {
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('open');
    document.getElementById('changePasswordForm')?.reset();
    const err = document.getElementById('changePasswordError');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
  }
}

function closePasswordModal() {
  const modal = document.getElementById('changePasswordModal');
  if (modal) {
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('open');
  }
}

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

  document.querySelectorAll('[data-open-change-password]').forEach(btn => {
    btn.addEventListener('click', openPasswordModal);
  });

  document.querySelectorAll('[data-close-change-password]').forEach(btn => {
    btn.addEventListener('click', closePasswordModal);
  });

  const form = document.getElementById('changePasswordForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const currentPassword = data.get('currentPassword');
      const newPassword = data.get('newPassword');
      const confirmPassword = data.get('confirmPassword');
      const errEl = document.getElementById('changePasswordError');

      if (newPassword.length < 8) {
        errEl.textContent = 'Password baru minimal 8 karakter';
        errEl.style.display = 'block';
        return;
      }
      if (newPassword !== confirmPassword) {
        errEl.textContent = 'Konfirmasi password tidak cocok';
        errEl.style.display = 'block';
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
          alert('Password berhasil diubah');
          closePasswordModal();
        } else {
          errEl.textContent = json.error || 'Gagal mengubah password';
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.textContent = 'Gagal menghubungi server';
        errEl.style.display = 'block';
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { checkAuth(); initAuthUi(); });
} else {
  checkAuth();
  initAuthUi();
}

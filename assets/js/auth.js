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

function initAuthUi() {
  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { checkAuth(); initAuthUi(); });
} else {
  checkAuth();
  initAuthUi();
}

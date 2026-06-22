const isLoginPage = location.pathname.endsWith('/login.html') || location.pathname.endsWith('login.html');

if (!isLoginPage && sessionStorage.getItem('mycp-auth') !== '1') {
  window.location.href = 'login.html';
}

function initAuthUi() {
  const userName = sessionStorage.getItem('mycp-user') || 'admin';
  document.querySelectorAll('[data-auth-user]').forEach((el) => {
    el.textContent = userName;
  });

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', () => {
      sessionStorage.removeItem('mycp-auth');
      sessionStorage.removeItem('mycp-user');
      window.location.href = 'login.html';
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthUi);
} else {
  initAuthUi();
}

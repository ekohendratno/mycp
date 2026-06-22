const loginForm = document.querySelector('#loginForm');

if (sessionStorage.getItem('mycp-auth') === '1') {
  window.location.href = 'dashboard.html';
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sessionStorage.setItem('mycp-auth', '1');
  sessionStorage.setItem('mycp-user', loginForm.elements.username.value.trim() || 'admin');
  window.location.href = 'dashboard.html';
});

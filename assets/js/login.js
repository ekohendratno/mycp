const loginForm = document.querySelector('#loginForm');
const loginBtn = loginForm?.querySelector('button[type="submit"]');

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Login...</span>';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginForm.elements.username.value.trim(),
        password: loginForm.elements.password.value
      })
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      const data = await res.json();
      alert(data.error || 'Login gagal');
    }
  } catch (e) {
    alert('Gagal terhubung ke server');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>Login</span>';
  }
});

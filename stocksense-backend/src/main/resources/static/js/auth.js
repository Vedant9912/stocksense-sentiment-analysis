const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authMsg = document.getElementById('auth-msg');
const toRegister = document.getElementById('to-register');
const toLogin = document.getElementById('to-login');

// already logged in? skip straight to the dashboard
if (localStorage.getItem('stocksense_token')) {
  window.location.href = '/index.html';
}

function showMessage(text, type) {
  authMsg.textContent = text;
  authMsg.className = type || '';
}

toRegister.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  toRegister.classList.add('hidden');
  toLogin.classList.remove('hidden');
  showMessage('', '');
});

toLogin.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  toLogin.classList.add('hidden');
  toRegister.classList.remove('hidden');
  showMessage('', '');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('login-submit');
  submitBtn.disabled = true;
  showMessage('Signing in...', '');

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || 'Invalid username or password', 'error');
      return;
    }

    localStorage.setItem('stocksense_token', data.token);
    localStorage.setItem('stocksense_username', data.username);
    window.location.href = '/index.html';
  } catch (err) {
    showMessage('Could not reach the server. Try again.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('register-submit');
  submitBtn.disabled = true;
  showMessage('Creating your account...', '');

  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || 'Could not create account', 'error');
      return;
    }

    showMessage('Account created. You can log in now.', 'success');
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    toLogin.classList.add('hidden');
    toRegister.classList.remove('hidden');
    document.getElementById('login-username').value = username;
  } catch (err) {
    showMessage('Could not reach the server. Try again.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

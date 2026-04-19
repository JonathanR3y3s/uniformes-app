/**
 * MÓDULO DE AUTENTICACIÓN - LOGIN SIMPLE LOCAL
 * Gestiona login/logout sin servidor
 */

import { setUser, getUser, logout as logoutUser, getUserRole, isOperador, isAdmin } from './user-roles.js';

const VALID_USERS = {
  'admin': 'admin2026',
  'operador': 'operador2026'
};

export function initAuth() {
  const user = getUser();
  if (!user || !user.role) {
    showLoginScreen();
    return false;
  }
  return true;
}

export function showLoginScreen() {
  const loginHTML = `
    <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);display:flex;align-items:center;justify-content:center;z-index:10000;font-family:Inter,sans-serif">
      <div style="background:#fff;padding:40px;border-radius:12px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <div style="text-align:center;margin-bottom:30px">
          <div style="font-size:48px;margin-bottom:15px">🔐</div>
          <h1 style="margin:0;font-size:24px;color:#0f172a;font-weight:700">Uniformes ASSA ABLOY</h1>
          <p style="margin:5px 0 0 0;color:#64748b;font-size:14px">Sistema de Gestión v5.0</p>
        </div>

        <div style="margin-bottom:20px">
          <label style="display:block;margin-bottom:8px;font-weight:600;color:#0f172a;font-size:14px">Usuario</label>
          <input type="text" id="loginUser" placeholder="admin / operador" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:14px;box-sizing:border-box;font-family:monospace" />
        </div>

        <div style="margin-bottom:25px">
          <label style="display:block;margin-bottom:8px;font-weight:600;color:#0f172a;font-size:14px">Contraseña</label>
          <input type="password" id="loginPass" placeholder="••••••••" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:14px;box-sizing:border-box" />
        </div>

        <button id="loginBtn" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:16px;cursor:pointer;transition:all 0.3s">Iniciar Sesión</button>

        <div id="loginError" style="margin-top:15px;padding:10px;border-radius:6px;background:#fee2e2;color:#991b1b;font-size:13px;display:none;text-align:center"></div>

        <p style="margin-top:20px;text-align:center;color:#64748b;font-size:12px">
          Demo: admin/admin2026 o operador/operador2026
        </p>
      </div>
    </div>
  `;

  document.body.innerHTML = loginHTML;

  const loginBtn = document.getElementById('loginBtn');
  const userInput = document.getElementById('loginUser');
  const passInput = document.getElementById('loginPass');
  const errorDiv = document.getElementById('loginError');

  loginBtn.addEventListener('click', () => {
    const user = userInput.value.trim();
    const pass = passInput.value;

    if (!user || !pass) {
      showError('Usuario y contraseña requeridos', errorDiv);
      return;
    }

    if (VALID_USERS[user] === pass) {
      setUser(user, user === 'admin' ? 'Admin' : 'Operador', user);
      location.reload();
    } else {
      showError('Usuario o contraseña incorrectos', errorDiv);
      passInput.value = '';
    }
  });

  [userInput, passInput].forEach(el => {
    el.addEventListener('keypress', e => {
      if (e.key === 'Enter') loginBtn.click();
    });
  });
}

function showError(msg, errorDiv) {
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 3000);
}

export function logout() {
  logoutUser();
  showLoginScreen();
}

export function getCurrentRole() {
  return getUserRole();
}

export function isAuthenticated() {
  return getUser() !== null;
}

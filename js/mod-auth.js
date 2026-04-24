/**
 * MÓDULO DE AUTENTICACIÓN — Login contra store dinámico de usuarios
 */
import{setUser,getUser,logout as logoutUser,getUserRole}from'./user-roles.js';
import{initUsersStore,findUser}from'./users.js';

export function initAuth(){
  initUsersStore();
  const user=getUser();
  if(!user||!user.role){showLoginScreen();return false;}
  return true;
}

export function showLoginScreen(){
  const loginHTML=`
    <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:#f4f3ef;display:flex;align-items:center;justify-content:center;z-index:10000;font-family:Inter,-apple-system,sans-serif">
      <div style="width:100%;max-width:360px;padding:16px">
        <div style="background:#0c0c0c;border-radius:12px;padding:32px 28px 28px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#004B87;border:1px solid rgba(0,100,200,.4);border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:20px">
            <i class="fas fa-boxes" style="color:#fff;font-size:16px"></i>
          </div>
          <h1 style="margin:0 0 4px;font-size:18px;color:#fff;font-weight:700;letter-spacing:-.02em">Control Store Pro</h1>
          <p style="margin:0 0 24px;color:rgba(255,255,255,.4);font-size:13px">ASSA ABLOY México — Gestión de Almacén</p>
          <div style="margin-bottom:14px">
            <label style="display:block;margin-bottom:6px;font-weight:600;color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:.06em">Usuario</label>
            <input type="text" id="loginUser" placeholder="usuario" autocomplete="username" style="width:100%;padding:12px 14px;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:15px;box-sizing:border-box;background:rgba(255,255,255,.07);color:#fff;font-family:inherit" />
          </div>
          <div style="margin-bottom:20px">
            <label style="display:block;margin-bottom:6px;font-weight:600;color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:.06em">Contraseña</label>
            <input type="password" id="loginPass" placeholder="••••••••" autocomplete="current-password" style="width:100%;padding:12px 14px;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:15px;box-sizing:border-box;background:rgba(255,255,255,.07);color:#fff;font-family:inherit" />
          </div>
          <button id="loginBtn" style="width:100%;padding:14px;background:#fff;color:#111;border:none;border-radius:6px;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit">Iniciar sesión</button>
          <div id="loginError" style="margin-top:12px;padding:9px 12px;border-radius:6px;background:rgba(220,38,38,.15);color:#fca5a5;font-size:13px;display:none;border:1px solid rgba(220,38,38,.2)"></div>
        </div>
        <p style="text-align:center;color:#aaa;font-size:11px">Control Store Pro v5.0</p>
      </div>
    </div>`;

  document.body.innerHTML=loginHTML;

  const loginBtn=document.getElementById('loginBtn');
  const userInput=document.getElementById('loginUser');
  const passInput=document.getElementById('loginPass');
  const errorDiv=document.getElementById('loginError');

  loginBtn.addEventListener('click',()=>{
    const username=(userInput.value||'').trim();
    const pass=passInput.value;
    if(!username||!pass){showError('Usuario y contraseña requeridos',errorDiv);return;}
    const u=findUser(username);
    if(!u){showError('Usuario o contraseña incorrectos',errorDiv);passInput.value='';return;}
    if(!u.activo){showError('Usuario inactivo — contacta al administrador',errorDiv);passInput.value='';return;}
    if(u.password!==pass){showError('Usuario o contraseña incorrectos',errorDiv);passInput.value='';return;}
    setUser(u.role,u.name,u.username);
    location.reload();
  });

  [userInput,passInput].forEach(el=>{
    el.addEventListener('keypress',e=>{if(e.key==='Enter')loginBtn.click();});
  });

  // Focus automático
  setTimeout(()=>userInput?.focus(),100);
}

function showError(msg,errorDiv){
  errorDiv.textContent=msg;errorDiv.style.display='block';
  setTimeout(()=>{errorDiv.style.display='none';},3500);
}

export function logout(){logoutUser();showLoginScreen();}
export function getCurrentRole(){return getUserRole();}
export function isAuthenticated(){return getUser()!==null;}

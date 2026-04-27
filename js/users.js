/**
 * GESTIÓN DE USUARIOS — Admin crea, edita, activa/desactiva usuarios
 * Store: localStorage '_users_store'  [{id,username,name,password,role,activo,createdAt}]
 */
import{esc,genId}from'./utils.js';
import{notify,modal,confirm}from'./ui.js';
import{getUser}from'./user-roles.js';
import{log}from'./storage.js';

const KEY='_users_store';

export function initUsersStore(){
  if(!localStorage.getItem(KEY)){
    const defaults=[
      {id:'admin',username:'admin',name:'Administrador',password:'admin2026',role:'admin',activo:true,createdAt:new Date().toISOString()},
      {id:'operador',username:'operador',name:'Operador General',password:'operador2026',role:'operador',activo:true,createdAt:new Date().toISOString()}
    ];
    localStorage.setItem(KEY,JSON.stringify(defaults));
  }
}

export function getUsers(){
  initUsersStore();
  try{return JSON.parse(localStorage.getItem(KEY))||[];}catch{return[];}
}

function saveUsers(list){localStorage.setItem(KEY,JSON.stringify(list));}

export function findUser(username){return getUsers().find(u=>u.username===username.trim());}

// ── Render ──────────────────────────────────────────────────────────────────
export function render(){
  const me=getUser();
  let h='<div class="page-head"><div class="page-title"><h1>Usuarios</h1><p>Control de acceso al sistema</p></div>';
  h+='<button class="btn btn-primary" id="btnNewUser"><i class="fas fa-user-plus"></i> Nuevo usuario</button></div>';

  const users=getUsers();
  h+='<div class="card"><div class="table-wrap"><table class="dt"><thead><tr>';
  h+='<th style="width:44px"></th><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th>';
  h+='</tr></thead><tbody>';
  if(!users.length){h+='<tr><td colspan="7" class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios registrados</p></td></tr>';}
  users.forEach(u=>{
    const isSelf=u.username===(me&&me.id);
    const roleColor=u.role==='admin'?'badge-info':u.role==='consulta'?'badge-warning':'badge-neutral';
    const stColor=u.activo?'badge-success':'badge-danger';
    const avatarBg=u.role==='admin'?'#004B87':u.role==='consulta'?'#7c3aed':'#6b7280';
    const avatar='<div style="width:34px;height:34px;border-radius:50%;background:'+avatarBg+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">'+u.name.slice(0,1).toUpperCase()+'</div>';
    h+='<tr>';
    h+='<td>'+avatar+'</td>';
    h+='<td><span class="font-bold">'+esc(u.name)+'</span>'+(isSelf?' <span class="badge badge-warning" style="font-size:10px">Tú</span>':'')+'</td>';
    h+='<td class="font-mono text-xs">'+esc(u.username)+'</td>';
    h+='<td><span class="badge '+roleColor+'">'+u.role.toUpperCase()+'</span></td>';
    h+='<td><span class="badge '+stColor+'">'+(u.activo?'ACTIVO':'INACTIVO')+'</span></td>';
    h+='<td class="text-xs text-muted">'+(u.createdAt?u.createdAt.slice(0,10):'—')+'</td>';
    h+='<td><div class="flex gap-2">';
    h+='<button class="btn btn-ghost btn-sm edit-user" data-id="'+u.id+'" title="Editar"><i class="fas fa-edit"></i></button>';
    h+='<button class="btn btn-ghost btn-sm pwd-user" data-id="'+u.id+'" title="Cambiar contraseña"><i class="fas fa-key"></i></button>';
    if(!isSelf)h+='<button class="btn btn-ghost btn-sm del-user" data-id="'+u.id+'" title="Eliminar"><i class="fas fa-trash"></i></button>';
    h+='</div></td>';
    h+='</tr>';
  });
  h+='</tbody></table></div></div>';
  h+='<div class="card mt-4" style="background:var(--warning-bg);border-color:var(--warning)"><div class="card-body"><p class="text-sm font-bold" style="color:var(--warning)"><i class="fas fa-info-circle"></i> Nota de seguridad</p><p class="text-xs text-muted mt-2">Las contraseñas se guardan localmente en este dispositivo. Cambia la contraseña por defecto antes de compartir el sistema.</p></div></div>';
  return h;
}

// ── Modal Nuevo usuario ──────────────────────────────────────────────────────
function openNewUser(){
  const body=`
    <div class="form-row c2">
      <div class="form-group"><label class="form-label">Nombre completo *</label><input class="form-input" id="nuName" placeholder="Ej. María López"></div>
      <div class="form-group"><label class="form-label">Nombre de usuario *</label><input class="form-input" id="nuUser" placeholder="Ej. mlopez" autocomplete="off"></div>
      <div class="form-group"><label class="form-label">Contraseña *</label><input type="password" class="form-input" id="nuPass" placeholder="Mínimo 6 caracteres" autocomplete="new-password"></div>
      <div class="form-group"><label class="form-label">Confirmar contraseña *</label><input type="password" class="form-input" id="nuPass2" placeholder="Repetir contraseña" autocomplete="new-password"></div>
      <div class="form-group"><label class="form-label">Rol</label><select class="form-select" id="nuRole">
        <option value="operador">Operador — entregas y captura</option>
        <option value="consulta">Consulta — solo lectura</option>
        <option value="admin">Administrador — acceso completo</option>
      </select></div>
      <div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="nuActivo">
        <option value="1">Activo</option>
        <option value="0">Inactivo</option>
      </select></div>
    </div>`;
  modal.open('Nuevo usuario',body,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveNew"><i class="fas fa-save"></i> Guardar</button>','md');
  document.getElementById('mCancel').addEventListener('click',()=>modal.close());
  document.getElementById('mSaveNew').addEventListener('click',saveNewUser);
  setTimeout(()=>document.getElementById('nuName')?.focus(),80);
}

function saveNewUser(){
  const name=(document.getElementById('nuName')?.value||'').trim();
  const username=(document.getElementById('nuUser')?.value||'').trim().toLowerCase();
  const pass=document.getElementById('nuPass')?.value||'';
  const pass2=document.getElementById('nuPass2')?.value||'';
  const role=document.getElementById('nuRole')?.value||'operador';
  const activo=document.getElementById('nuActivo')?.value==='1';

  if(!name){notify('El nombre es obligatorio','warning');return;}
  if(!username){notify('El usuario es obligatorio','warning');return;}
  if(!/^[a-z0-9_]{3,20}$/.test(username)){notify('El usuario solo puede tener letras, números y _ (3-20 chars)','warning');return;}
  if(pass.length<6){notify('La contraseña debe tener al menos 6 caracteres','warning');return;}
  if(pass!==pass2){notify('Las contraseñas no coinciden','warning');return;}

  const users=getUsers();
  if(users.find(u=>u.username===username)){notify('Ese nombre de usuario ya existe','error');return;}

  users.push({id:genId(),username,name,password:pass,role,activo,createdAt:new Date().toISOString()});
  saveUsers(users);
  log('USUARIO_ALTA',username+' ('+role+')');
  modal.close();
  notify('Usuario creado: '+username,'success');
  document.getElementById('mainContent').innerHTML=render();
  init();
}

// ── Modal Editar usuario ─────────────────────────────────────────────────────
function openEditUser(id){
  const users=getUsers();
  const u=users.find(x=>x.id===id);
  if(!u)return;
  const me=getUser();
  const isSelf=u.username===(me&&me.id);
  const body=`
    <div class="form-row c2">
      <div class="form-group"><label class="form-label">Nombre completo *</label><input class="form-input" id="euName" value="${esc(u.name)}"></div>
      <div class="form-group"><label class="form-label">Usuario (no editable)</label><input class="form-input" value="${esc(u.username)}" disabled style="opacity:.5"></div>
      <div class="form-group"><label class="form-label">Rol</label><select class="form-select" id="euRole" ${isSelf?'disabled':''}>
        <option value="operador"${u.role==='operador'?' selected':''}>Operador</option>
        <option value="consulta"${u.role==='consulta'?' selected':''}>Consulta (solo lectura)</option>
        <option value="admin"${u.role==='admin'?' selected':''}>Administrador</option>
      </select></div>
      <div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="euActivo" ${isSelf?'disabled':''}>
        <option value="1"${u.activo?' selected':''}>Activo</option>
        <option value="0"${!u.activo?' selected':''}>Inactivo</option>
      </select></div>
    </div>
    ${isSelf?'<p class="text-xs text-muted mt-3"><i class="fas fa-info-circle"></i> No puedes cambiar tu propio rol o estado.</p>':''}`;
  modal.open('Editar usuario — '+u.name,body,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveEdit"><i class="fas fa-save"></i> Guardar</button>','sm');
  document.getElementById('mCancel').addEventListener('click',()=>modal.close());
  document.getElementById('mSaveEdit').addEventListener('click',()=>{
    const name=(document.getElementById('euName')?.value||'').trim();
    if(!name){notify('El nombre es obligatorio','warning');return;}
    const users2=getUsers();
    const idx=users2.findIndex(x=>x.id===id);
    if(idx<0)return;
    users2[idx].name=name;
    if(!isSelf){
      users2[idx].role=document.getElementById('euRole')?.value||u.role;
      users2[idx].activo=document.getElementById('euActivo')?.value==='1';
    }
    saveUsers(users2);
    log('USUARIO_EDITAR',u.username);
    modal.close();
    notify('Usuario actualizado','success');
    document.getElementById('mainContent').innerHTML=render();
    init();
  });
}

// ── Modal Cambiar contraseña ─────────────────────────────────────────────────
function openPwdUser(id){
  const u=getUsers().find(x=>x.id===id);
  if(!u)return;
  const body=`
    <div class="form-group mb-4"><label class="form-label">Nueva contraseña *</label><input type="password" class="form-input" id="pwdNew" placeholder="Mínimo 6 caracteres" autocomplete="new-password"></div>
    <div class="form-group"><label class="form-label">Confirmar contraseña *</label><input type="password" class="form-input" id="pwdNew2" placeholder="Repetir contraseña" autocomplete="new-password"></div>`;
  modal.open('Cambiar contraseña — '+u.name,body,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSavePwd"><i class="fas fa-key"></i> Cambiar</button>','sm');
  document.getElementById('mCancel').addEventListener('click',()=>modal.close());
  document.getElementById('mSavePwd').addEventListener('click',()=>{
    const p1=document.getElementById('pwdNew')?.value||'';
    const p2=document.getElementById('pwdNew2')?.value||'';
    if(p1.length<6){notify('Mínimo 6 caracteres','warning');return;}
    if(p1!==p2){notify('Las contraseñas no coinciden','warning');return;}
    const users=getUsers();
    const idx=users.findIndex(x=>x.id===id);
    if(idx<0)return;
    users[idx].password=p1;
    saveUsers(users);
    log('USUARIO_PWD',u.username);
    modal.close();
    notify('Contraseña actualizada','success');
  });
  setTimeout(()=>document.getElementById('pwdNew')?.focus(),80);
}

// ── Eliminar usuario ─────────────────────────────────────────────────────────
function delUser(id){
  const users=getUsers();
  const u=users.find(x=>x.id===id);
  if(!u)return;
  const admins=users.filter(x=>x.role==='admin'&&x.activo);
  if(u.role==='admin'&&admins.length<=1){notify('No puedes eliminar el único administrador','error');return;}
  if(!confirm('¿Eliminar usuario "'+u.username+'"?\nEsta acción no se puede deshacer.'))return;
  const nuevo=users.filter(x=>x.id!==id);
  saveUsers(nuevo);
  log('USUARIO_BAJA',u.username);
  notify('Usuario eliminado','success');
  document.getElementById('mainContent').innerHTML=render();
  init();
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function init(){
  document.getElementById('btnNewUser')?.addEventListener('click',openNewUser);
  const main=document.getElementById('mainContent');
  if(main)main.onclick=function(e){
    const ed=e.target.closest('.edit-user');const pw=e.target.closest('.pwd-user');const dl=e.target.closest('.del-user');
    if(ed)openEditUser(ed.dataset.id);
    if(pw)openPwdUser(pw.dataset.id);
    if(dl)delUser(dl.dataset.id);
  };
}

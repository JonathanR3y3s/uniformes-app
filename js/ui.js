import{NAV}from'./config.js';import{esc}from'./utils.js';import{verificarCaptura}from'./rules.js';import{getUserRole,getUser}from'./user-roles.js';
let charts={};
export function notify(msg,type){type=type||'info';const wrap=document.getElementById('notifWrap');if(!wrap)return;const icons={info:'fa-info-circle',success:'fa-check-circle',warning:'fa-exclamation-triangle',error:'fa-times-circle'};const el=document.createElement('div');el.className='notif '+(type==='error'?'error':type);el.innerHTML='<i class="fas '+(icons[type]||icons.info)+'"></i><span>'+esc(msg)+'</span>';wrap.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(100%)';el.style.transition='all .3s';setTimeout(()=>el.remove(),300);},4000);}
export const modal={open(title,body,foot,size){document.getElementById('modalTitle').textContent=title;document.getElementById('modalBody').innerHTML=body;document.getElementById('modalFoot').innerHTML=foot||'';document.getElementById('modalBox').className='modal-box '+(size||'md');document.getElementById('modalOverlay').classList.add('open');},close(){document.getElementById('modalOverlay').classList.remove('open');}};
export function destroyCharts(){Object.keys(charts).forEach(k=>{try{charts[k].destroy();}catch(e){}});charts={};}
export function createChart(id,cfg){if(charts[id])try{charts[id].destroy();}catch(e){}const el=document.getElementById(id);if(!el)return null;charts[id]=new Chart(el,cfg);return charts[id];}
export function confirm(msg){return window.confirm(msg);}
export function buildNav(currentView){
  const nav=document.getElementById('sidebarNav');
  const role=getUserRole();
  const user=getUser();
  const hiddenForOperador=['admin','reportes','config','proveedores','salidas','catalogo','tablero','totales','centro-costos','importar','exportar','usuarios','areas'];
  let html='';let activeLabel='Dashboard';
  NAV.forEach(n=>{
    if(n.section){html+='<div class="nav-section">'+n.section+'</div>';return;}
    if(role==='operador'&&hiddenForOperador.includes(n.id))return;
    const active=currentView===n.id?' active':'';
    if(active)activeLabel=n.label;
    html+='<div class="nav-item'+active+'" data-view="'+n.id+'"><i class="fas '+n.icon+'"></i><span class="sidebar-label">'+n.label+'</span></div>';
  });
  nav.innerHTML=html;
  const topTitle=document.getElementById('topbarTitle');
  if(topTitle)topTitle.textContent=activeLabel;
  const footer=document.getElementById('sidebarFooter');
  if(footer){
    const name=user?user.name:'Usuario';
    const initials=name.slice(0,2).toUpperCase();
    const roleLabel=role==='admin'?'Administrador':'Operador';
    footer.innerHTML=`<div class="sidebar-user"><div class="sidebar-user-avatar">${initials}</div><div class="sidebar-user-info"><div class="sidebar-user-name">${esc(name)}</div><div class="sidebar-user-role">${roleLabel}</div></div></div><button class="sidebar-toggle" id="sidebarToggle"><i class="fas fa-chevron-left" id="sidebarIcon"></i><span class="sidebar-label">Colapsar</span></button>`;
    document.getElementById('sidebarToggle').addEventListener('click',()=>{
      const sb=document.getElementById('sidebar');
      sb.classList.toggle('collapsed');
      const ic=document.getElementById('sidebarIcon');
      ic.className=sb.classList.contains('collapsed')?'fas fa-chevron-right':'fas fa-chevron-left';
    });
  }
  const topbarUser=document.getElementById('topbarUser');
  if(topbarUser&&user)topbarUser.textContent=user.name;
}
export function buildAreaBadge(area){return'<span class="area-badge">'+esc(area)+'</span>';}
export function buildStatusBadge(emp){const baja=['baja','movimiento','incapacidad'].includes(emp.estado);if(baja)return'<span class="badge badge-neutral">'+emp.estado.toUpperCase()+'</span>';return verificarCaptura(emp)?'<span class="badge badge-success"><i class="fas fa-check"></i> Completo</span>':'<span class="badge badge-warning">Pendiente</span>';}
export function setupEvents(navigate){
  document.getElementById('modalOverlay').addEventListener('click',function(e){if(e.target===this)modal.close();});
  document.getElementById('modalClose').addEventListener('click',()=>modal.close());
  document.getElementById('hamburger')?.addEventListener('click',()=>{
    const sb=document.getElementById('sidebar');
    sb.classList.toggle('mobile-open');
    let ov=document.querySelector('.mobile-overlay');
    if(!ov){ov=document.createElement('div');ov.className='mobile-overlay';ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99;display:none';document.body.appendChild(ov);ov.addEventListener('click',()=>{sb.classList.remove('mobile-open');ov.style.display='none';});}
    ov.style.display=sb.classList.contains('mobile-open')?'block':'none';
  });
  document.getElementById('sidebarNav').addEventListener('click',function(e){
    const item=e.target.closest('.nav-item');
    if(item&&item.dataset.view){navigate(item.dataset.view);document.getElementById('sidebar').classList.remove('mobile-open');const ov=document.querySelector('.mobile-overlay');if(ov)ov.style.display='none';}
  });
  document.getElementById('logoutBtn')?.addEventListener('click',()=>{if(confirm('¿Cerrar sesión?'))import('./mod-auth.js').then(m=>m.logout());});
}

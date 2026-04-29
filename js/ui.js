import{NAV}from'./config.js';import{esc}from'./utils.js';import{verificarCaptura}from'./rules.js';import{getUserRole,getUser}from'./user-roles.js';import{getStore}from'./storage.js';import{getProductos}from'./almacen-api.js';
let charts={};
export function notify(msg,type){type=type||'info';const wrap=document.getElementById('notifWrap');if(!wrap)return;const textMap={Error:'Revisa los campos marcados','Error al registrar ajuste':'No se pudo registrar el ajuste'};msg=textMap[msg]||msg;const icons={info:'fa-info-circle',success:'fa-check-circle',warning:'fa-exclamation-triangle',error:'fa-times-circle'};const el=document.createElement('div');el.className='notif '+(type==='error'?'error':type);el.innerHTML='<i class="fas '+(icons[type]||icons.info)+'"></i><span>'+esc(msg)+'</span>';wrap.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(100%)';el.style.transition='all .3s';setTimeout(()=>el.remove(),300);},4000);}
export const modal={open(title,body,foot,size){document.getElementById('modalTitle').textContent=title;document.getElementById('modalBody').innerHTML=body;document.getElementById('modalFoot').innerHTML=foot||'';document.getElementById('modalBox').className='modal-box '+(size||'md');document.getElementById('modalOverlay').classList.add('open');},close(){document.getElementById('modalOverlay').classList.remove('open');}};
window._charts=window._charts||[];
export function registerChart(chart){if(chart)window._charts.push(chart);return chart;}
export function destroyCharts(){Object.keys(charts).forEach(k=>{try{charts[k].destroy();}catch(e){}});charts={};if(!window._charts)return;window._charts.forEach(c=>{try{c.destroy();}catch(e){}});window._charts=[];}
export function createChart(id,cfg){if(charts[id])try{charts[id].destroy();}catch(e){}const el=document.getElementById(id);if(!el)return null;charts[id]=new Chart(el,cfg);registerChart(charts[id]);return charts[id];}
export function confirm(msg){return window.confirm(msg);}
function tabMatches(tab,view){return tab.view===view||(tab.aliases||[]).includes(view);}
function isTabVisible(tab,store,role,user){if(tab.roles&&!tab.roles.includes(role))return false;if(typeof tab.condition==='function'&&!tab.condition(store,role,user))return false;return true;}
function getVisibleTabs(group,store,role,user){return(group.tabs||[]).filter(tab=>isTabVisible(tab,store,role,user));}
function getActiveGroup(currentView,store,role,user){
  return NAV.find(group=>getVisibleTabs(group,store,role,user).some(tab=>tabMatches(tab,currentView)))||NAV.find(group=>getVisibleTabs(group,store,role,user).length);
}
function getPrimaryView(group,store,role,user){
  const tabs=getVisibleTabs(group,store,role,user);
  if(!tabs.length)return'dashboard';
  return(tabs.find(tab=>tabMatches(tab,group.defaultView))||tabs[0]).view;
}
function ensureWorkspaceTabs(){
  const main=document.getElementById('main');
  const content=document.getElementById('mainContent');
  if(!main||!content)return null;
  let tabs=document.getElementById('workspaceTabs');
  if(!tabs){tabs=document.createElement('div');tabs.id='workspaceTabs';tabs.className='workspace-tabs';main.insertBefore(tabs,content);}
  return tabs;
}
function renderWorkspaceTabs(currentView,activeGroup,store,role,user){
  const wrap=ensureWorkspaceTabs();
  if(!wrap)return;
  const tabs=activeGroup?getVisibleTabs(activeGroup,store,role,user):[];
  if(!tabs.length){wrap.hidden=true;wrap.innerHTML='';return;}
  wrap.hidden=false;
  wrap.innerHTML='<div class="workspace-tabs-inner" role="tablist" aria-label="'+esc(activeGroup.label)+'">'+tabs.map(tab=>{
    const active=tabMatches(tab,currentView);
    return'<button type="button" class="workspace-tab'+(active?' active':'')+'" data-view="'+esc(tab.view)+'" role="tab" aria-selected="'+(active?'true':'false')+'"><i class="fas '+esc(tab.icon||'fa-circle')+'"></i><span>'+esc(tab.label)+'</span></button>';
  }).join('')+'</div>';
}
export function buildNav(currentView){
  const nav=document.getElementById('sidebarNav');
  const role=getUserRole();
  const user=getUser();
  const store=getStore();
  // Clear context action buttons on view change
  const ta=document.getElementById('topbarActions');if(ta)ta.innerHTML='';
  const activeGroup=getActiveGroup(currentView,store,role,user);
  let html='';let activeLabel=activeGroup?activeGroup.label:'Inicio';
  NAV.forEach(n=>{
    const visibleTabs=getVisibleTabs(n,store,role,user);
    if(!visibleTabs.length)return;
    const active=activeGroup&&activeGroup.id===n.id?' active':'';
    const target=getPrimaryView(n,store,role,user);
    let badge='';
    if(n.id==='almacen'){try{const bajos=getProductos({bajoStock:true});if(bajos.length)badge='<span class="nav-badge">'+bajos.length+'</span>';}catch(e){}}
    html+='<div class="nav-item'+active+'" data-view="'+esc(target)+'" data-group="'+esc(n.id)+'"><i class="fas '+esc(n.icon)+'"></i><span class="sidebar-label">'+esc(n.label)+badge+'</span></div>';
  });
  nav.innerHTML=html;
  renderWorkspaceTabs(currentView,activeGroup,store,role,user);
  if(role==='operador')nav.classList.add('operador-nav');else nav.classList.remove('operador-nav');
  const topTitle=document.getElementById('topbarTitle');
  if(topTitle)topTitle.textContent=activeLabel;
  const footer=document.getElementById('sidebarFooter');
  if(footer){
    const name=user?user.name:'Usuario';
    const initials=name.slice(0,2).toUpperCase();
    const roleLabel=role==='admin'?'Administrador':role==='consulta'?'Solo Lectura':'Operador';
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
  document.addEventListener('click',function(e){
    const tab=e.target.closest('.workspace-tab');
    if(tab&&tab.dataset.view){navigate(tab.dataset.view);}
  });
  document.getElementById('logoutBtn')?.addEventListener('click',()=>{if(confirm('¿Cerrar sesión?'))import('./mod-auth.js').then(m=>m.logout());});
}

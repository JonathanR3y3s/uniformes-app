/**
 * MÓDULO DE BITÁCORA / TRAZABILIDAD
 * Viewer del auditLog con filtros, búsqueda y exportación.
 * Solo accesible para el rol 'admin'.
 */
import{getStore,saveAuditLog}from'./storage.js';import{esc,fmtDate}from'./utils.js';import{notify,modal}from'./ui.js';

const MOD_COLORS={ENTREGAS:{color:'#059669',bg:'#d1fae5',icon:'fa-hand-holding'},EMPLEADOS:{color:'#2563eb',bg:'#dbeafe',icon:'fa-users'},CAPTURA:{color:'#7c3aed',bg:'#ede9fe',icon:'fa-user-edit'},INVENTARIO:{color:'#d97706',bg:'#fef3c7',icon:'fa-boxes'},PROVEEDORES:{color:'#0891b2',bg:'#cffafe',icon:'fa-truck'},CONFIG:{color:'#dc2626',bg:'#fef2f2',icon:'fa-cog'},AUTH:{color:'#64748b',bg:'#f1f5f9',icon:'fa-lock'},SISTEMA:{color:'#374151',bg:'#f3f4f6',icon:'fa-server'},SYNC:{color:'#6366f1',bg:'#eef2ff',icon:'fa-cloud'}};
const ACT_COLORS={DELETE:'#dc2626',DEL:'#dc2626',REMOVE:'#dc2626',RESET:'#dc2626',CLEAR:'#dc2626',RESTORE:'#059669',BACKUP:'#059669',MIGRATE:'#7c3aed',LOGIN:'#2563eb',LOGOUT:'#64748b'};

function modBadge(modulo){const m=(modulo||'').toUpperCase();const key=Object.keys(MOD_COLORS).find(k=>m.includes(k))||'SISTEMA';const c=MOD_COLORS[key];return'<span style="background:'+c.bg+';color:'+c.color+';font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap"><i class="fas '+c.icon+' mr-1"></i>'+(modulo||'SISTEMA')+'</span>';}

function actColor(action){const a=(action||'').toUpperCase();const key=Object.keys(ACT_COLORS).find(k=>a.includes(k));return key?ACT_COLORS[key]:'#374151';}

export function render(){
  const s=getStore();
  const log=s.auditLog||[];
  const total=log.length;
  const today=new Date().toISOString().slice(0,10);
  const hoy=log.filter(e=>e.ts&&e.ts.slice(0,10)===today).length;
  const usuarios=[...new Set(log.map(e=>e.user).filter(Boolean))].sort();
  const modulos=[...new Set(log.map(e=>e.modulo).filter(Boolean))].sort();

  let h='<div class="page-head"><div class="page-title"><h1>Bitácora de Eventos</h1><p>Trazabilidad completa de acciones del sistema</p></div></div>';

  // KPIs
  h+='<div class="kpi-grid">';
  h+='<div class="kpi"><div class="kpi-label">Total Eventos</div><div class="kpi-value">'+total.toLocaleString('es-MX')+'</div></div>';
  h+='<div class="kpi info"><div class="kpi-label">Hoy</div><div class="kpi-value">'+hoy+'</div><div class="kpi-sub">'+today+'</div></div>';
  h+='<div class="kpi success"><div class="kpi-label">Usuarios Activos</div><div class="kpi-value">'+usuarios.length+'</div></div>';
  h+='<div class="kpi warning"><div class="kpi-label">Capacidad</div><div class="kpi-value">'+(Math.round(total/10))+'%</div><div class="kpi-sub">Máx 1,000 eventos</div></div>';
  h+='</div>';

  // Filtros
  h+='<div class="card mb-4"><div class="card-body">';
  h+='<div class="form-row c4">';
  h+='<div><label class="form-label">Módulo</label><select class="form-select" id="bitFM"><option value="">Todos</option>'+modulos.map(m=>'<option>'+esc(m)+'</option>').join('')+'</select></div>';
  h+='<div><label class="form-label">Usuario</label><select class="form-select" id="bitFU"><option value="">Todos</option>'+usuarios.map(u=>'<option>'+esc(u)+'</option>').join('')+'</select></div>';
  h+='<div><label class="form-label">Buscar</label><input class="form-input" id="bitFS" placeholder="Acción o detalle..."></div>';
  h+='<div class="flex items-center" style="align-items:flex-end"><button class="btn btn-ghost" style="width:100%" id="bitFClear"><i class="fas fa-times"></i> Limpiar</button></div>';
  h+='</div>';
  h+='<div class="form-row c4" style="margin-top:10px">';
  h+='<div><label class="form-label">Fecha desde</label><input type="date" class="form-input" id="bitFD"></div>';
  h+='<div><label class="form-label">Fecha hasta</label><input type="date" class="form-input" id="bitFH"></div>';
  h+='<div></div>';
  h+='<div class="flex items-center" style="align-items:flex-end"><button class="btn btn-danger" id="bitClear" style="width:100%"><i class="fas fa-eraser mr-1"></i> Limpiar Bitácora</button></div>';
  h+='</div>';
  h+='</div></div>';

  // Tabla
  h+='<div class="card"><div class="card-head"><h3>Eventos del Sistema</h3><span class="text-sm text-muted" id="bitCount"></span></div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr><th>Fecha y Hora</th><th>Módulo</th><th>Acción</th><th>Detalle</th><th>Usuario</th></tr></thead><tbody id="bitTB"></tbody></table></div></div>';
  return h;
}

function renderRows(){
  const log=(getStore().auditLog||[]).slice().reverse();
  const fm=document.getElementById('bitFM')?.value||'';
  const fu=document.getElementById('bitFU')?.value||'';
  const fs=(document.getElementById('bitFS')?.value||'').toLowerCase();
  const fd=document.getElementById('bitFD')?.value||'';
  const fh=document.getElementById('bitFH')?.value||'';
  let list=log;
  if(fm)list=list.filter(e=>(e.modulo||'')=== fm);
  if(fu)list=list.filter(e=>(e.user||'')=== fu);
  if(fs)list=list.filter(e=>(e.action||'').toLowerCase().includes(fs)||(e.det||'').toLowerCase().includes(fs));
  if(fd)list=list.filter(e=>e.ts&&e.ts.slice(0,10)>=fd);
  if(fh)list=list.filter(e=>e.ts&&e.ts.slice(0,10)<=fh);

  const tb=document.getElementById('bitTB');if(!tb)return;
  const cc=document.getElementById('bitCount');if(cc)cc.textContent=list.length+' eventos';

  if(!list.length){
    tb.innerHTML='<tr><td colspan="5" class="empty-state"><i class="fas fa-clipboard-list"></i><p>Sin eventos'+(fm||fu||fs||fd||fh?' que coincidan con los filtros':'')+'</p></td></tr>';
    return;
  }

  tb.innerHTML=list.slice(0,500).map(e=>{
    const dt=e.ts?new Date(e.ts).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
    const ac=(e.action||'—');
    const col=actColor(ac);
    return'<tr>'
      +'<td class="text-xs font-mono" style="white-space:nowrap">'+esc(dt)+'</td>'
      +'<td>'+modBadge(e.modulo)+'</td>'
      +'<td><span style="color:'+col+';font-weight:700;font-size:12px">'+esc(ac)+'</span></td>'
      +'<td class="text-xs" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(e.det||'')+'">'+esc(e.det||'—')+'</td>'
      +'<td class="text-xs font-bold">'+esc(e.user||'—')+'</td>'
      +'</tr>';
  }).join('');

  if(list.length>500){
    const tr=document.createElement('tr');
    tr.innerHTML='<td colspan="5" style="text-align:center;padding:12px;font-size:12px;color:var(--text-muted)">Mostrando los primeros 500 de '+list.length+' eventos. Usa los filtros para acotar.</td>';
    tb.appendChild(tr);
  }
}

export function init(){
  ['bitFM','bitFU','bitFD','bitFH'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderRows));
  document.getElementById('bitFS')?.addEventListener('input',renderRows);
  document.getElementById('bitFClear')?.addEventListener('click',()=>{
    ['bitFM','bitFU','bitFD','bitFH'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('bitFS').value='';
    renderRows();
  });
  document.getElementById('bitClear')?.addEventListener('click',()=>{
    if(!confirm('¿Limpiar toda la bitácora?\nEsta acción no se puede deshacer.'))return;
    getStore().auditLog=[];
    saveAuditLog();
    notify('Bitácora limpiada','success');
    renderRows();
  });
  renderRows();
}

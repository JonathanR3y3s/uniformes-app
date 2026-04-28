import{getStore,saveCampanias,log}from'./storage.js';import{esc,fmtDate,today,fmtMoney}from'./utils.js';import{notify,modal,confirm}from'./ui.js';import{getUserRole}from'./user-roles.js';

const ESTADOS={activa:{label:'Activa',color:'#059669',bg:'#d1fae5'},planificacion:{label:'Planificación',color:'#2563eb',bg:'#dbeafe'},cerrada:{label:'Cerrada',color:'#64748b',bg:'#f1f5f9'},cancelada:{label:'Cancelada',color:'#dc2626',bg:'#fee2e2'}};

function badgeEstado(e){const x=ESTADOS[e]||ESTADOS.planificacion;return`<span style="background:${x.bg};color:${x.color};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">${x.label}</span>`;}

function calcCampStats(camp){
  const s=getStore();
  const entregas=s.entregas.filter(e=>e.campaniaId===camp.id);
  const empleados=new Set(entregas.map(e=>e.empleadoId)).size;
  const prendas=entregas.reduce((t,e)=>(e.prendas||[]).length+t,0);
  const costo=s.proveedores.filter(p=>p.campaniaId===camp.id).reduce((t,p)=>t+p.cantidad*p.precioUnitario,0);
  return{entregas:entregas.length,empleados,prendas,costo};
}

export function render(){
  const s=getStore();
  const camps=s.campanias||[];
  const isOp=getUserRole()==='operador';
  let h='<div class="page-head"><div class="page-title"><h1>Campañas de Dotación</h1><p>Periodos de entrega de uniformes</p></div></div>';
  // KPIs
  const activas=camps.filter(c=>c.estado==='activa').length;
  const cerradas=camps.filter(c=>c.estado==='cerrada').length;
  const totalEnt=camps.reduce((t,c)=>{const st=calcCampStats(c);return t+st.entregas;},0);
  h+='<div class="kpi-grid">';
  h+=`<div class="kpi success"><div class="kpi-label">Campañas Activas</div><div class="kpi-value">${activas}</div></div>`;
  h+=`<div class="kpi"><div class="kpi-label">Total Campañas</div><div class="kpi-value">${camps.length}</div></div>`;
  h+=`<div class="kpi info"><div class="kpi-label">Entregas Registradas</div><div class="kpi-value">${totalEnt}</div><div class="kpi-sub">en todas las campañas</div></div>`;
  h+=`<div class="kpi"><div class="kpi-label">Cerradas</div><div class="kpi-value">${cerradas}</div></div>`;
  h+='</div>';
  if(!isOp){h+='<div class="mb-4"><button class="btn btn-primary" id="btnNuevaCamp"><i class="fas fa-plus mr-2"></i>Nueva Campaña</button></div>';}
  if(!camps.length){
    h+='<div class="card"><div class="card-body"><div class="empty-state"><i class="fas fa-calendar-plus"></i><p>Sin campañas registradas</p><p class="text-sm text-muted">Crea la primera campaña para organizar las entregas</p></div></div></div>';
  } else {
    h+='<div class="grid-2">';
    camps.slice().reverse().forEach(c=>{
      const st=calcCampStats(c);
      h+=`<div class="card" style="border-top:3px solid ${ESTADOS[c.estado]?.color||'#64748b'}">
        <div class="card-head">
          <div style="flex:1;min-width:0">
            <h3 style="font-size:16px;margin:0">${esc(c.nombre)}</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">${badgeEstado(c.estado)}<span class="text-xs text-muted">${esc(c.año||'')}</span></div>
          </div>
          ${!isOp?`<div class="flex gap-2">
            <button class="btn btn-ghost btn-sm camp-edit" data-id="${c.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>
            <button class="btn btn-ghost btn-sm camp-del" data-id="${c.id}" title="Eliminar" style="color:#dc2626"><i class="fas fa-trash"></i></button>
          </div>`:''}
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
            <div style="background:var(--surface-2);border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:var(--primary)">${st.entregas}</div>
              <div class="text-xs text-muted">Entregas</div>
            </div>
            <div style="background:var(--surface-2);border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:#059669">${st.empleados}</div>
              <div class="text-xs text-muted">Empleados</div>
            </div>
          </div>
          ${c.descripcion?`<p class="text-sm text-sec mb-2">${esc(c.descripcion)}</p>`:''}
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px">
            <span><i class="fas fa-calendar-alt mr-1"></i>${c.fechaInicio?fmtDate(c.fechaInicio):'Sin inicio'} — ${c.fechaFin?fmtDate(c.fechaFin):'Sin fin'}</span>
            ${st.costo>0?`<span class="font-bold" style="color:#059669">${fmtMoney(st.costo)}</span>`:''}
          </div>
        </div>
      </div>`;
    });
    h+='</div>';
  }
  return h;
}

function formCampaña(camp=null){
  const isEdit=!!camp;
  return`<div class="form-group"><label class="form-label">Nombre de la Campaña *</label><input class="form-input" id="campNombre" placeholder="Ej: Dotación Anual 2026" value="${esc(camp?.nombre||'')}"></div>
  <div class="form-row c2">
    <div class="form-group"><label class="form-label">Año</label><input type="number" class="form-input" id="campAnio" min="2020" max="2035" value="${camp?.año||new Date().getFullYear()}"></div>
    <div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="campEstado">${Object.entries(ESTADOS).map(([k,v])=>`<option value="${k}"${(camp?.estado||'planificacion')===k?' selected':''}>${v.label}</option>`).join('')}</select></div>
  </div>
  <div class="form-row c2">
    <div class="form-group"><label class="form-label">Fecha Inicio</label><input type="date" class="form-input" id="campFI" value="${camp?.fechaInicio||today()}"></div>
    <div class="form-group"><label class="form-label">Fecha Fin</label><input type="date" class="form-input" id="campFF" value="${camp?.fechaFin||''}"></div>
  </div>
  <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input" id="campDesc" rows="2" placeholder="Descripción opcional de la campaña...">${esc(camp?.descripcion||'')}</textarea></div>`;
}

function saveCampModal(camp=null){
  const isEdit=!!camp;
  const nombre=document.getElementById('campNombre')?.value.trim();
  if(!nombre){notify('El nombre es requerido','warning');return;}
  const obj={
    id:camp?.id||('camp_'+Date.now()),
    nombre,
    año:document.getElementById('campAnio')?.value||new Date().getFullYear(),
    estado:document.getElementById('campEstado')?.value||'planificacion',
    fechaInicio:document.getElementById('campFI')?.value||'',
    fechaFin:document.getElementById('campFF')?.value||'',
    descripcion:document.getElementById('campDesc')?.value||'',
    creadoEn:camp?.creadoEn||new Date().toISOString(),
  };
  const s=getStore();
  if(!s.campanias)s.campanias=[];
  if(isEdit){const idx=s.campanias.findIndex(c=>c.id===camp.id);if(idx>=0)s.campanias[idx]=obj;}
  else s.campanias.push(obj);
  saveCampanias();
  log(isEdit?'CAMP_EDIT':'CAMP_CREATE',obj.nombre,'CAMPAÑAS');
  notify(isEdit?'Campaña actualizada':'Campaña creada','success');
  modal.close();
  document.getElementById('mainContent').innerHTML=render();
  init();
}

export function init(){
  const isOp=getUserRole()==='operador';
  if(!isOp){
    document.getElementById('btnNuevaCamp')?.addEventListener('click',()=>{
      modal.open('Nueva Campaña',formCampaña(),'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveCamp"><i class="fas fa-check mr-1"></i>Guardar</button>');
      document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
      document.getElementById('mSaveCamp')?.addEventListener('click',()=>saveCampModal());
    });
    document.querySelectorAll('.camp-edit').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const camp=getStore().campanias?.find(c=>c.id===btn.dataset.id);
        if(!camp)return;
        modal.open('Editar Campaña',formCampaña(camp),'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveCamp"><i class="fas fa-check mr-1"></i>Guardar</button>');
        document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
        document.getElementById('mSaveCamp')?.addEventListener('click',()=>saveCampModal(camp));
      });
    });
    document.querySelectorAll('.camp-del').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(!confirm('¿Eliminar esta campaña?'))return;
        const s=getStore();
        s.campanias=(s.campanias||[]).filter(c=>c.id!==btn.dataset.id);
        saveCampanias();
        log('CAMP_DELETE',btn.dataset.id,'CAMPAÑAS');
        notify('Campaña eliminada','info');
        document.getElementById('mainContent').innerHTML=render();
        init();
      });
    });
  }
}

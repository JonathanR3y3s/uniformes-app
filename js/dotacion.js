import{esc}from'./utils.js';
import{getDotaciones,saveDotaciones}from'./storage.js';
import{notify,modal,confirm as confirmDialog,buildNav}from'./ui.js';

function today(){return new Date().toISOString().slice(0,10);}
function timestamp(){return Date.now();}
function dotaciones(){return getDotaciones();}
function findDotacion(id){return dotaciones().find(d=>d.id===id);}

export function render(){
  return `
    <div class="page-head">
      <div class="page-title">
        <h1>📦 DOTACIÓN</h1>
        <p>Gestión de dotaciones por año</p>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="tabs" id="dotTabs">
          <button class="tab active" data-tab="dotaciones">Dotaciones</button>
          <button class="tab" data-tab="kits">Kits</button>
          <button class="tab" data-tab="captura">Captura Tallas</button>
          <button class="tab" data-tab="entrega">Entrega</button>
        </div>
        <div id="dotTabContent" class="mt-4"></div>
      </div>
    </div>`;
}

export function init(){
  document.querySelectorAll('#dotTabs .tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#dotTabs .tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderTab(btn.dataset.tab);
    });
  });
  renderTab('dotaciones');
}

function renderTab(tab){
  const wrap=document.getElementById('dotTabContent');
  if(!wrap)return;
  if(tab!=='dotaciones'){
    wrap.innerHTML='<div class="empty-state"><i class="fas fa-clock"></i><p>Próximamente</p></div>';
    return;
  }
  wrap.innerHTML=renderDotaciones();
  bindDotaciones();
}

function renderDotaciones(){
  const list=dotaciones().slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0));
  let h='<div class="flex justify-between items-center gap-3 mb-4"><div><h2 style="font-size:18px;margin:0">Dotaciones</h2><p class="text-sm text-muted">Control anual de dotaciones</p></div><button class="btn btn-primary" id="btnNuevaDotacion"><i class="fas fa-plus"></i> Nueva Dotación</button></div>';
  if(!list.length){
    h+='<div class="empty-state"><i class="fas fa-box-open"></i><p>No hay dotaciones registradas</p></div>';
    return h;
  }
  h+='<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">';
  list.forEach(d=>{
    const activa=d.estado==='activa';
    h+='<div class="card" style="margin:0"><div class="card-body">';
    h+='<div class="flex justify-between items-start gap-3"><div><h3 style="margin:0 0 4px;font-size:16px">'+esc(d.nombre||'Dotación')+'</h3><p class="text-sm text-muted">Año '+esc(String(d.anio||''))+'</p></div>';
    h+='<span class="badge '+(activa?'badge-success':'badge-neutral')+'">'+(activa?'ACTIVA':'INACTIVA')+'</span></div>';
    h+='<div class="mt-4" style="display:grid;gap:8px;font-size:13px">';
    h+='<div class="flex justify-between"><span class="text-muted">Capturados / Totales</span><strong>'+Number(d.empleados_capturados||0)+' / '+Number(d.empleados_totales||0)+'</strong></div>';
    h+='<div class="flex justify-between"><span class="text-muted">Fecha creación</span><strong>'+esc(d.fecha_creacion||'—')+'</strong></div>';
    h+='</div>';
    h+='<div class="flex gap-2 mt-4" style="flex-wrap:wrap">';
    h+='<button class="btn btn-sm '+(activa?'btn-ghost':'btn-primary')+' dot-toggle" data-id="'+esc(d.id)+'">'+(activa?'Desactivar':'Activar')+'</button>';
    h+='<button class="btn btn-ghost btn-sm dot-edit" data-id="'+esc(d.id)+'"><i class="fas fa-edit"></i> Editar</button>';
    h+='<button class="btn btn-ghost btn-sm dot-delete" data-id="'+esc(d.id)+'"><i class="fas fa-trash"></i> Eliminar</button>';
    h+='</div></div></div>';
  });
  h+='</div>';
  return h;
}

function bindDotaciones(){
  document.getElementById('btnNuevaDotacion')?.addEventListener('click',openNuevaDotacion);
  document.querySelectorAll('.dot-toggle').forEach(btn=>btn.addEventListener('click',()=>toggleDotacion(btn.dataset.id)));
  document.querySelectorAll('.dot-edit').forEach(btn=>btn.addEventListener('click',()=>openEditarDotacion(btn.dataset.id)));
  document.querySelectorAll('.dot-delete').forEach(btn=>btn.addEventListener('click',()=>deleteDotacion(btn.dataset.id)));
}

function openNuevaDotacion(){
  const anio=new Date().getFullYear();
  const body=`
    <div class="form-row c2">
      <div class="form-group"><label class="form-label">Año *</label><input class="form-input" id="dotAnio" type="number" min="2000" max="2100" value="${anio}"></div>
      <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="dotNombre" value="Dotación ${anio}"></div>
    </div>`;
  modal.open('Nueva Dotación',body,'<button class="btn btn-ghost" id="dotCancel">Cancelar</button><button class="btn btn-primary" id="dotSave">Guardar</button>','md');
  document.getElementById('dotCancel').addEventListener('click',()=>modal.close());
  document.getElementById('dotSave').addEventListener('click',saveNuevaDotacion);
}

function saveNuevaDotacion(){
  const anio=Number(document.getElementById('dotAnio')?.value||0);
  const nombre=(document.getElementById('dotNombre')?.value||'').trim();
  if(!anio||!nombre){notify('Año y nombre son obligatorios','warning');return;}
  dotaciones().push({id:'dot-'+anio+'-'+timestamp(),anio,nombre,estado:'inactiva',fecha_creacion:today(),empleados_capturados:0,empleados_totales:0});
  saveDotaciones();
  modal.close();
  renderTab('dotaciones');
  notify('Dotación creada','success');
}

function toggleDotacion(id){
  const d=findDotacion(id);
  if(!d)return;
  if(d.estado==='activa')d.estado='inactiva';
  else{dotaciones().forEach(x=>{x.estado='inactiva';});d.estado='activa';}
  saveDotaciones();
  buildNav('dotacion');
  renderTab('dotaciones');
}

function openEditarDotacion(id){
  const d=findDotacion(id);
  if(!d)return;
  const body=`
    <div class="form-row c2">
      <div class="form-group"><label class="form-label">Año *</label><input class="form-input" id="dotEditAnio" type="number" min="2000" max="2100" value="${esc(String(d.anio||''))}"></div>
      <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="dotEditNombre" value="${esc(d.nombre||'')}"></div>
    </div>`;
  modal.open('Editar Dotación',body,'<button class="btn btn-ghost" id="dotEditCancel">Cancelar</button><button class="btn btn-primary" id="dotEditSave">Guardar</button>','md');
  document.getElementById('dotEditCancel').addEventListener('click',()=>modal.close());
  document.getElementById('dotEditSave').addEventListener('click',()=>saveEditDotacion(id));
}

function saveEditDotacion(id){
  const d=findDotacion(id);
  if(!d)return;
  const anio=Number(document.getElementById('dotEditAnio')?.value||0);
  const nombre=(document.getElementById('dotEditNombre')?.value||'').trim();
  if(!anio||!nombre){notify('Año y nombre son obligatorios','warning');return;}
  d.anio=anio;
  d.nombre=nombre;
  saveDotaciones();
  modal.close();
  renderTab('dotaciones');
  notify('Dotación actualizada','success');
}

function deleteDotacion(id){
  const list=dotaciones();
  const idx=list.findIndex(d=>d.id===id);
  if(idx<0)return;
  const d=list[idx];
  if(!confirmDialog('¿Eliminar '+(d.nombre||'Dotación '+d.anio)+'? Los datos de captura y entregas NO se borran.'))return;
  list.splice(idx,1);
  saveDotaciones();
  buildNav('dotacion');
  renderTab('dotaciones');
  notify('Dotación eliminada','success');
}

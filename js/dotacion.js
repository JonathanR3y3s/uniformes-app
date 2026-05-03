import{esc,fmtMoney,genId}from'./utils.js';
import{getDotaciones,saveDotaciones,getDotacionTipos,saveDotacionTipos,getDotacionKits,saveDotacionKits,getDotacionTallas,saveDotacionTallas,getDotacionConfig,saveDotacionConfig,getDotacionEntregas,saveDotacionEntregas,getStore,saveEmployees,log}from'./storage.js';
import{notify,modal,confirm as confirmDialog,buildNav}from'./ui.js';
import{getProductos,registrarEntregaNueva,getStockDisponible}from'./almacen-api.js';
import{getAreaNames}from'./areas-config.js';
import{saveEvidence,getEvidenceSrc}from'./evidence-storage.js';

function today(){return new Date().toISOString().slice(0,10);}
function timestamp(){return Date.now();}
function dotaciones(){return getDotaciones();}
function tipos(){return getDotacionTipos();}
function kits(){return getDotacionKits();}
function findDotacion(id){return dotaciones().find(d=>d.id===id);}
function findTipo(id){return tipos().find(t=>t.id===id);}
function findKit(tipoId,anio){return kits().find(k=>k.tipo_id===tipoId&&Number(k.anio)===Number(anio));}

// ── Estado del tab kits (año seleccionado) ──────────────────────────────
let kitsAnioSel=null;

function aniosDisponibles(){
  const a=Array.from(new Set(dotaciones().map(d=>Number(d.anio)).filter(Boolean)));
  a.sort((x,y)=>y-x);
  return a;
}
function anioActivo(){
  const a=dotaciones().find(d=>d.estado==='activa');
  return a?Number(a.anio):null;
}
function getAnioSel(){
  const lista=aniosDisponibles();
  if(!lista.length)return null;
  if(kitsAnioSel&&lista.includes(Number(kitsAnioSel)))return Number(kitsAnioSel);
  const act=anioActivo();
  if(act&&lista.includes(act)){kitsAnioSel=act;return act;}
  kitsAnioSel=lista[0];
  return kitsAnioSel;
}
function sanitizeId(s){
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim().replace(/\s+/g,'-')
    .replace(/-+/g,'-');
}
function costoProducto(p){
  if(!p)return 0;
  const c=Number(p.costo_promedio||p.costo_unitario||0);
  return isNaN(c)?0:c;
}

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
          <button class="tab active" data-tab="dotaciones">Dotación por año</button>
          <button class="tab" data-tab="kits">Configuración de dotación</button>
          <button class="tab" data-tab="captura">Captura de tallas</button>
          <button class="tab" data-tab="concentrado">Para compras</button>
          <button class="tab" data-tab="entrega">Entrega dotación anual</button>
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
  if(tab==='dotaciones'){
    wrap.innerHTML=renderDotaciones();
    bindDotaciones();
    return;
  }
  if(tab==='kits'){
    wrap.innerHTML=renderKits();
    bindKits();
    return;
  }
  if(tab==='captura'){
    wrap.innerHTML=renderCaptura();
    bindCaptura();
    return;
  }
  if(tab==='concentrado'){
    wrap.innerHTML=renderConcentrado();
    bindConcentrado();
    return;
  }
  if(tab==='entrega'){
    wrap.innerHTML=renderEntregaMasiva();
    bindEntregaMasiva();
    return;
  }
  wrap.innerHTML='<div class="empty-state"><i class="fas fa-clock"></i><p>Próximamente</p></div>';
}

// ════════════════════════════════════════════════════════════════════════
// TAB DOTACIONES (sin cambios funcionales)
// ════════════════════════════════════════════════════════════════════════
function renderDotaciones(){
  const list=dotaciones().slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0));
  let h='<div class="flex justify-between items-center gap-3 mb-4"><div><h2 style="font-size:18px;margin:0">Dotación por año</h2><p class="text-sm text-muted">Control anual de dotaciones</p></div><button class="btn btn-primary" id="btnNuevaDotacion"><i class="fas fa-plus"></i> Nueva Dotación</button></div>';
  if(!list.length){
    h+='<div class="empty-state"><i class="fas fa-box-open"></i><p>No hay dotaciones configuradas aún</p><p style="font-size:13px;color:#666;margin-top:8px">Crea una nueva dotación para comenzar</p></div>';
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

// ════════════════════════════════════════════════════════════════════════
// TAB KITS — Tipos de empleado + kits versionados por año
// ════════════════════════════════════════════════════════════════════════
function renderKits(){
  const lista=aniosDisponibles();
  if(!lista.length){
    return '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Primero crea una dotación</p><p class="text-sm text-muted">Ve al tab "Dotación por año" para crear el año a configurar.</p></div>';
  }
  const sel=getAnioSel();
  let h='';
  // Encabezado
  h+='<div class="flex justify-between items-center gap-3 mb-4" style="flex-wrap:wrap">';
  h+='<div><h2 style="font-size:18px;margin:0">Configuración de dotación</h2><p class="text-sm text-muted">Define qué prendas y cantidades corresponden a cada tipo de empleado para el año seleccionado.</p></div>';
  h+='<div class="flex gap-2" style="flex-wrap:wrap;align-items:center">';
  h+='<label class="form-label" style="margin:0">Año:</label>';
  h+='<select class="form-input" id="kitAnioSel" style="width:auto;min-width:110px">';
  lista.forEach(a=>{h+='<option value="'+a+'"'+(a===sel?' selected':'')+'>'+a+'</option>';});
  h+='</select>';
  h+='<button class="btn btn-primary" id="btnNuevoTipo"><i class="fas fa-plus"></i> Crear Tipo</button>';
  h+='<button class="btn btn-ghost" id="btnDuplicarKits"><i class="fas fa-copy"></i> Duplicar configuración</button>';
  h+='</div></div>';
  // Lista de tipos
  const lstTipos=tipos();
  if(!lstTipos.length){
    h+='<div class="empty-state"><i class="fas fa-users"></i><p>No hay tipos de empleado</p><p class="text-sm text-muted">Pulsa "Crear Tipo" para empezar.</p></div>';
    return h;
  }
  h+='<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">';
  lstTipos.forEach(t=>{
    const k=findKit(t.id,sel);
    const items=(k&&Array.isArray(k.items))?k.items:[];
    let totalPrendas=0;let costo=0;let tieneSinCosto=false;
    items.forEach(it=>{
      const cant=Number(it.cantidad||0);
      totalPrendas+=cant;
      const p=getProductos().find(x=>x.id===it.producto_id);
      const c=costoProducto(p);
      if(c<=0&&cant>0)tieneSinCosto=true;
      costo+=c*cant;
    });
    h+='<div class="card" style="margin:0"><div class="card-body">';
    h+='<div class="flex justify-between items-start gap-3">';
    h+='<div><h3 style="margin:0 0 4px;font-size:16px">'+esc(t.nombre)+'</h3>';
    h+='<p class="text-sm text-muted">'+esc(t.descripcion||'—')+'</p></div>';
    h+='<button class="btn btn-ghost btn-sm tipo-delete" data-id="'+esc(t.id)+'" title="Eliminar tipo"><i class="fas fa-trash"></i></button>';
    h+='</div>';
    if(!items.length){
      h+='<div class="mt-4 text-sm text-muted" style="padding:10px;background:#f9fafb;border-radius:6px;text-align:center">Kit vacío</div>';
    }else{
      h+='<div class="mt-4" style="font-size:13px;display:grid;gap:6px;max-height:140px;overflow:auto">';
      items.slice(0,6).forEach(it=>{
        h+='<div class="flex justify-between"><span>'+esc(it.nombre||'Producto')+'</span><strong>×'+Number(it.cantidad||0)+'</strong></div>';
      });
      if(items.length>6)h+='<div class="text-sm text-muted">+ '+(items.length-6)+' más…</div>';
      h+='</div>';
      h+='<div class="mt-4" style="display:grid;gap:6px;font-size:13px;border-top:1px solid #e5e7eb;padding-top:10px">';
      h+='<div class="flex justify-between"><span class="text-muted">Total prendas</span><strong>'+totalPrendas+'</strong></div>';
      h+='<div class="flex justify-between"><span class="text-muted">Costo estimado</span><strong>'+fmtMoney(costo)+'</strong></div>';
      if(tieneSinCosto)h+='<div class="text-sm" style="color:#b45309"><i class="fas fa-exclamation-triangle"></i> Algunos productos sin costo</div>';
      h+='</div>';
    }
    h+='<div class="flex gap-2 mt-4">';
    h+='<button class="btn btn-primary btn-sm kit-edit" data-tipo="'+esc(t.id)+'"><i class="fas fa-edit"></i> Editar kit</button>';
    h+='</div>';
    h+='</div></div>';
  });
  h+='</div>';
  return h;
}

function bindKits(){
  const sel=document.getElementById('kitAnioSel');
  if(sel){
    sel.addEventListener('change',()=>{
      kitsAnioSel=Number(sel.value);
      renderTab('kits');
    });
  }
  document.getElementById('btnNuevoTipo')?.addEventListener('click',openNuevoTipo);
  document.getElementById('btnDuplicarKits')?.addEventListener('click',openDuplicarKits);
  document.querySelectorAll('.kit-edit').forEach(btn=>btn.addEventListener('click',()=>openEditarKit(btn.dataset.tipo)));
  document.querySelectorAll('.tipo-delete').forEach(btn=>btn.addEventListener('click',()=>deleteTipo(btn.dataset.id)));
}

// ── Crear tipo ────────────────────────────────────────────────────────
function openNuevoTipo(){
  const body=`
    <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="tipoNombre" placeholder="Ej. Sindicalizado"></div>
    <div class="form-group"><label class="form-label">Descripción</label><input class="form-input" id="tipoDesc" placeholder="Ej. Dotación anual completa"></div>`;
  modal.open('Crear Tipo de Empleado',body,'<button class="btn btn-ghost" id="tipoCancel">Cancelar</button><button class="btn btn-primary" id="tipoSave">Guardar</button>','md');
  document.getElementById('tipoCancel').addEventListener('click',()=>modal.close());
  document.getElementById('tipoSave').addEventListener('click',saveNuevoTipo);
}

function saveNuevoTipo(){
  const nombre=(document.getElementById('tipoNombre')?.value||'').trim();
  const desc=(document.getElementById('tipoDesc')?.value||'').trim();
  if(!nombre){notify('El nombre es obligatorio','warning');return;}
  const slug=sanitizeId(nombre);
  if(!slug){notify('Nombre inválido','warning');return;}
  const id='tipo-'+slug;
  if(tipos().some(t=>t.id===id)){notify('Ya existe un tipo con ese nombre','error');return;}
  tipos().push({id,nombre,descripcion:desc});
  saveDotacionTipos();
  modal.close();
  renderTab('kits');
  notify('Tipo creado','success');
}

function deleteTipo(id){
  const t=findTipo(id);
  if(!t)return;
  const tieneKits=kits().some(k=>k.tipo_id===id);
  const msg=tieneKits
    ?'¿Eliminar el tipo "'+t.nombre+'" y TODOS sus kits asociados?'
    :'¿Eliminar el tipo "'+t.nombre+'"?';
  if(!confirmDialog(msg))return;
  const tList=tipos();
  const idx=tList.findIndex(x=>x.id===id);
  if(idx>=0){tList.splice(idx,1);saveDotacionTipos();}
  if(tieneKits){
    const kList=kits();
    for(let i=kList.length-1;i>=0;i--){if(kList[i].tipo_id===id)kList.splice(i,1);}
    saveDotacionKits();
  }
  renderTab('kits');
  notify('Tipo eliminado','success');
}

// ── Editar kit ────────────────────────────────────────────────────────
// Estado temporal del editor (no se guarda hasta pulsar Guardar)
let _editor={tipoId:null,anio:null,items:[]};

function openEditarKit(tipoId){
  const t=findTipo(tipoId);
  if(!t){notify('Tipo no encontrado','error');return;}
  const anio=getAnioSel();
  if(!anio){notify('Selecciona un año primero','warning');return;}
  const k=findKit(tipoId,anio);
  _editor={tipoId,anio,items:k&&Array.isArray(k.items)?k.items.map(it=>({...it})):[]};
  const body=`
    <div class="mb-4" style="font-size:13px;color:#6b7280">
      <strong>${esc(t.nombre)}</strong> — Año <strong>${anio}</strong>
    </div>
    <div class="form-group" style="position:relative">
      <label class="form-label">Buscar producto</label>
      <input class="form-input" id="kitSearch" placeholder="Escribe nombre o SKU…" autocomplete="off">
      <div id="kitSearchResults" style="position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;max-height:200px;overflow:auto;z-index:20;display:none;box-shadow:0 4px 12px rgba(0,0,0,.08)"></div>
    </div>
    <div id="kitItemsWrap" class="mt-4"></div>
    <div id="kitTotalsWrap" class="mt-4" style="border-top:1px solid #e5e7eb;padding-top:10px;font-size:13px;display:grid;gap:6px"></div>`;
  modal.open('Editar Kit',body,'<button class="btn btn-ghost" id="kitCancel">Cancelar</button><button class="btn btn-primary" id="kitSave">Guardar</button>','lg');
  document.getElementById('kitCancel').addEventListener('click',()=>modal.close());
  document.getElementById('kitSave').addEventListener('click',saveKit);
  bindEditorSearch();
  renderEditorItems();
}

function bindEditorSearch(){
  const inp=document.getElementById('kitSearch');
  const res=document.getElementById('kitSearchResults');
  if(!inp||!res)return;
  inp.addEventListener('input',()=>{
    const q=inp.value.trim().toLowerCase();
    if(!q){res.style.display='none';res.innerHTML='';return;}
    const productos=getProductos().filter(p=>{
      const nom=(p.nombre||'').toLowerCase();
      const sku=(p.sku||'').toLowerCase();
      return nom.includes(q)||sku.includes(q);
    }).slice(0,10);
    if(!productos.length){
      res.innerHTML='<div style="padding:10px;color:#6b7280;font-size:13px">Sin coincidencias</div>';
      res.style.display='block';
      return;
    }
    res.innerHTML=productos.map(p=>{
      const c=costoProducto(p);
      return '<div class="kit-prod-opt" data-id="'+esc(p.id)+'" data-nombre="'+esc(p.nombre||'')+'" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6">'
        +'<div style="font-weight:600;font-size:13px">'+esc(p.nombre||'')+'</div>'
        +'<div style="font-size:11px;color:#6b7280">'+esc(p.sku||'')+(c>0?(' · '+fmtMoney(c)):' · sin costo')+'</div>'
        +'</div>';
    }).join('');
    res.style.display='block';
    res.querySelectorAll('.kit-prod-opt').forEach(el=>{
      el.addEventListener('click',()=>{
        addItem(el.dataset.id,el.dataset.nombre);
        inp.value='';
        res.style.display='none';
        res.innerHTML='';
        inp.focus();
      });
      el.addEventListener('mouseenter',()=>{el.style.background='#f3f4f6';});
      el.addEventListener('mouseleave',()=>{el.style.background='';});
    });
  });
  inp.addEventListener('blur',()=>{setTimeout(()=>{res.style.display='none';},200);});
}

function addItem(productoId,nombre){
  const ex=_editor.items.find(it=>it.producto_id===productoId);
  if(ex){ex.cantidad=Number(ex.cantidad||0)+1;}
  else _editor.items.push({producto_id:productoId,nombre:nombre||'Producto',cantidad:1});
  renderEditorItems();
}

function renderEditorItems(){
  const wrap=document.getElementById('kitItemsWrap');
  const totals=document.getElementById('kitTotalsWrap');
  if(!wrap||!totals)return;
  if(!_editor.items.length){
    wrap.innerHTML='<div class="empty-state" style="padding:20px"><i class="fas fa-box-open"></i><p>Kit vacío</p><p class="text-sm text-muted">Busca productos arriba para agregarlos.</p></div>';
    totals.innerHTML='';
    return;
  }
  let totalPrendas=0;let costo=0;let sinCosto=false;
  let h='<div style="display:grid;gap:6px">';
  h+='<div style="display:grid;grid-template-columns:1fr 90px 100px 40px;gap:8px;font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:600;padding:0 6px"><div>Producto</div><div>Cantidad</div><div style="text-align:right">Subtotal</div><div></div></div>';
  _editor.items.forEach((it,idx)=>{
    const p=getProductos().find(x=>x.id===it.producto_id);
    const c=costoProducto(p);
    const cant=Number(it.cantidad||0);
    const sub=c*cant;
    totalPrendas+=cant;
    costo+=sub;
    if(c<=0&&cant>0)sinCosto=true;
    h+='<div style="display:grid;grid-template-columns:1fr 90px 100px 40px;gap:8px;align-items:center;padding:6px;background:#f9fafb;border-radius:6px">';
    h+='<div><div style="font-size:13px;font-weight:600">'+esc(it.nombre||'Producto')+'</div><div style="font-size:11px;color:#6b7280">'+(c>0?fmtMoney(c)+' c/u':'Sin costo')+'</div></div>';
    h+='<input class="form-input kit-item-cant" data-idx="'+idx+'" type="number" min="1" value="'+cant+'" style="text-align:center">';
    h+='<div style="text-align:right;font-weight:600">'+fmtMoney(sub)+'</div>';
    h+='<button class="btn btn-ghost btn-sm kit-item-del" data-idx="'+idx+'" title="Eliminar"><i class="fas fa-trash"></i></button>';
    h+='</div>';
  });
  h+='</div>';
  wrap.innerHTML=h;
  let th='<div class="flex justify-between"><span class="text-muted">Total prendas</span><strong>'+totalPrendas+'</strong></div>';
  th+='<div class="flex justify-between"><span class="text-muted">Costo estimado</span><strong>'+fmtMoney(costo)+'</strong></div>';
  if(sinCosto)th+='<div style="color:#b45309;font-size:12px"><i class="fas fa-exclamation-triangle"></i> Hay productos sin costo unitario — el total puede ser inexacto.</div>';
  totals.innerHTML=th;
  // Bind cantidad y eliminar
  wrap.querySelectorAll('.kit-item-cant').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const idx=Number(inp.dataset.idx);
      let v=parseInt(inp.value,10);
      if(isNaN(v)||v<1)v=1;
      _editor.items[idx].cantidad=v;
      renderEditorItems();
    });
  });
  wrap.querySelectorAll('.kit-item-del').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const idx=Number(btn.dataset.idx);
      const it=_editor.items[idx];
      if(!confirmDialog('¿Eliminar "'+(it?.nombre||'producto')+'" del kit?'))return;
      _editor.items.splice(idx,1);
      renderEditorItems();
    });
  });
}

function saveKit(){
  if(!_editor.tipoId||!_editor.anio){notify('Editor inválido','error');return;}
  const items=_editor.items
    .map(it=>({producto_id:it.producto_id,nombre:it.nombre,cantidad:Math.max(1,Number(it.cantidad)||1)}))
    .filter(it=>it.producto_id);
  const list=kits();
  const idx=list.findIndex(k=>k.tipo_id===_editor.tipoId&&Number(k.anio)===Number(_editor.anio));
  if(idx>=0){
    list[idx].items=items;
  }else{
    list.push({
      id:'kit-'+_editor.tipoId+'-'+_editor.anio+'-'+timestamp(),
      tipo_id:_editor.tipoId,
      anio:Number(_editor.anio),
      items
    });
  }
  saveDotacionKits();
  modal.close();
  renderTab('kits');
  notify('Kit guardado','success');
}

// ── Duplicar kits ─────────────────────────────────────────────────────
function openDuplicarKits(){
  const lista=aniosDisponibles();
  if(lista.length<2){notify('Necesitas al menos otro año con kits para duplicar','warning');return;}
  const destino=getAnioSel();
  const opciones=lista.filter(a=>a!==destino);
  if(!opciones.length){notify('No hay otro año disponible como origen','warning');return;}
  let opts='';
  opciones.forEach(a=>{
    const cant=kits().filter(k=>Number(k.anio)===Number(a)).length;
    opts+='<option value="'+a+'">'+a+' ('+cant+' kit(s))</option>';
  });
  const body=`
    <div class="form-group"><label class="form-label">Año origen *</label><select class="form-input" id="dupOrigen">${opts}</select></div>
    <div class="form-group"><label class="form-label">Año destino</label><input class="form-input" value="${destino}" disabled></div>
    <div class="text-sm text-muted">Se copiarán los kits del año origen al año destino. Se generarán nuevos IDs.</div>`;
  modal.open('Duplicar configuración de dotación',body,'<button class="btn btn-ghost" id="dupCancel">Cancelar</button><button class="btn btn-primary" id="dupSave">Duplicar</button>','md');
  document.getElementById('dupCancel').addEventListener('click',()=>modal.close());
  document.getElementById('dupSave').addEventListener('click',()=>doDuplicarKits(destino));
}

function doDuplicarKits(destino){
  const origen=Number(document.getElementById('dupOrigen')?.value||0);
  if(!origen){notify('Selecciona un año origen','warning');return;}
  if(origen===destino){notify('Origen y destino no pueden ser iguales','warning');return;}
  const list=kits();
  const origenKits=list.filter(k=>Number(k.anio)===origen);
  if(!origenKits.length){notify('El año origen no tiene kits','warning');return;}
  const destinoKits=list.filter(k=>Number(k.anio)===destino);
  if(destinoKits.length){
    if(!confirmDialog('Ya existen '+destinoKits.length+' kit(s) en el año destino. ¿Sobrescribir?'))return;
    for(let i=list.length-1;i>=0;i--){if(Number(list[i].anio)===destino)list.splice(i,1);}
  }
  origenKits.forEach(k=>{
    list.push({
      id:'kit-'+k.tipo_id+'-'+destino+'-'+timestamp()+'-'+Math.floor(Math.random()*1000),
      tipo_id:k.tipo_id,
      anio:destino,
      items:Array.isArray(k.items)?k.items.map(it=>({...it})):[]
    });
  });
  saveDotacionKits();
  modal.close();
  renderTab('kits');
  notify('Configuración duplicada ('+origenKits.length+' tipos)','success');
}

// ════════════════════════════════════════════════════════════════════════
// TAB CAPTURA DE TALLAS — Fase 2.1
// Captura tallas dinámicas (key=producto_id) con firma digital JPEG
// ════════════════════════════════════════════════════════════════════════

// ── Estado del tab captura ──────────────────────────────────────────────
let _capturaState={
  dotacionId:null,           // dotación seleccionada
  empleadoActual:null,       // empleado en captura
  signatureCanvas:null,      // referencia al canvas
  signatureCtx:null,
  signatureDrawing:false,
  signatureLastX:0,
  signatureLastY:0,
  signatureHasInk:false,     // bandera: se dibujó algo
  tallasSeleccionadas:{}     // {producto_id: talla} - durante captura
};

// ── Inferencia de tallas según el nombre del producto ───────────────────
function inferTallasParaProducto(producto){
  const nombre=((producto?.nombre)||'').toLowerCase();
  // Talla única: gorra, paraguas, toallas
  if(/\b(gorra|paraguas|toalla)/i.test(nombre))return['unica'];
  // Termo / vaso
  if(/\b(termo|vaso)/i.test(nombre))return['termo','vaso'];
  // Zapato tipo (bota o choclo) — debe ir antes que "zapato" genérico
  if(/zapato.*\b(tipo|modelo)\b|\btipo\b.*zapato/i.test(nombre))return['bota','choclo'];
  // Calzado: tenis, zapato, bota (talla numérica calzado)
  if(/\b(tenis|zapato|bota|calzado)\b/i.test(nombre)&&!/tipo|modelo/i.test(nombre)){
    return['24','25','26','27','28','29','30','31','32'];
  }
  // Pantalón → numérica de cintura
  if(/pantal[oó]n/i.test(nombre)){
    return['28','30','32','34','36','38','40'];
  }
  // Prendas extras (sudadera, chamarra, chaleco) → solo letras
  if(/sudadera|chamarra|chaleco/i.test(nombre)){
    return['XS','S','M','L','XL','XXL'];
  }
  // Ropa general (playera, polo, redonda, pants, chancla, etc.)
  if(/playera|polo|redonda|pants|chancla|camisa|blusa|short|falda/i.test(nombre)){
    return['XS','S','M','L','XL','XXL'];
  }
  // Default: opciones completas mixtas
  return['XS','S','M','L','XL','XXL','28','30','32','34','36','38','40'];
}

// ── Helpers de progreso ─────────────────────────────────────────────────
function empleadosActivos(){
  const list=getStore().employees||[];
  return list.filter(e=>{
    const est=(e.estado||'activo').toLowerCase();
    return!['baja','movimiento','incapacidad','incapacitado'].includes(est);
  });
}
function tallasDeDotacion(dotId){
  return getDotacionTallas().filter(t=>t.dotacion_id===dotId);
}
function progresoCaptura(dotId){
  const cap=tallasDeDotacion(dotId).length;
  const total=empleadosActivos().length;
  return{capturados:cap,total,pendientes:Math.max(0,total-cap),pct:total?Math.round(cap*100/total):0};
}
function siguientePendiente(dotId){
  const yaCap=new Set(tallasDeDotacion(dotId).map(t=>t.empleado_id));
  return empleadosActivos().find(e=>!yaCap.has(e.id))||null;
}
function dotacionSeleccionada(){
  if(_capturaState.dotacionId){
    const d=findDotacion(_capturaState.dotacionId);
    if(d)return d;
  }
  // Activa por defecto, si no, la más reciente
  const lst=dotaciones().slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0));
  const act=lst.find(d=>d.estado==='activa');
  const sel=act||lst[0]||null;
  if(sel)_capturaState.dotacionId=sel.id;
  return sel;
}

// ── RENDER ──────────────────────────────────────────────────────────────
function renderCaptura(){
  const lstDot=dotaciones();
  if(!lstDot.length){
    return '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Primero crea una dotación</p><p class="text-sm text-muted">Ve al tab "Dotación por año" para crearla.</p></div>';
  }
  const dotSel=dotacionSeleccionada();
  if(!dotSel){
    return '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Selecciona una dotación válida</p></div>';
  }
  const prog=progresoCaptura(dotSel.id);
  const sig=siguientePendiente(dotSel.id);
  let h='';
  // Header con selector y progreso
  h+='<div class="flex justify-between items-start gap-3 mb-4" style="flex-wrap:wrap">';
  h+='<div><h2 style="font-size:18px;margin:0">Captura de tallas</h2><p class="text-sm text-muted">Registra o valida las tallas que se usarán para la dotación del año.</p></div>';
  h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  h+='<label class="form-label" style="margin:0">Dotación:</label>';
  h+='<select class="form-input" id="capDotSel" style="width:auto;min-width:180px">';
  lstDot.slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0)).forEach(d=>{
    h+='<option value="'+esc(d.id)+'"'+(d.id===dotSel.id?' selected':'')+'>'+esc(d.nombre||('Dotación '+d.anio))+(d.estado==='activa'?' • ACTIVA':'')+'</option>';
  });
  h+='</select></div></div>';
  // Progreso
  h+='<div class="card mb-4" style="background:#f8fafc"><div class="card-body" style="padding:12px 16px">';
  h+='<div class="flex justify-between items-center" style="flex-wrap:wrap;gap:10px">';
  h+='<div><strong>Progreso:</strong> '+prog.capturados+'/'+prog.total+' capturados ('+prog.pct+'%)';
  h+=' &nbsp;·&nbsp; <span class="text-muted">Pendientes: '+prog.pendientes+'</span></div>';
  h+='<div style="display:flex;gap:8px">';
  h+='<button class="btn btn-ghost btn-sm" id="capVerCap"><i class="fas fa-list"></i> Ver capturados</button>';
  h+='<button class="btn btn-ghost btn-sm" id="capVerPend"><i class="fas fa-hourglass-half"></i> Ver pendientes</button>';
  h+='</div></div>';
  // Barra
  h+='<div style="margin-top:8px;height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden">';
  h+='<div style="height:100%;width:'+prog.pct+'%;background:#16a34a;transition:width .3s"></div>';
  h+='</div></div></div>';
  // Buscador + área de captura
  h+='<div class="card"><div class="card-body">';
  h+='<div class="form-row c2" style="align-items:end">';
  h+='<div class="form-group"><label class="form-label">Buscar empleado por número *</label>';
  h+='<input class="form-input" id="capEmpInput" placeholder="Ej. 001" autocomplete="off"></div>';
  h+='<div style="display:flex;gap:8px"><button class="btn btn-primary" id="capEmpBuscar"><i class="fas fa-search"></i> Buscar</button>';
  if(sig)h+='<button class="btn btn-ghost" id="capCargarSig" title="Cargar siguiente pendiente"><i class="fas fa-forward"></i> Siguiente pendiente</button>';
  h+='</div></div>';
  if(sig){
    h+='<p class="text-sm text-muted mt-2"><i class="fas fa-lightbulb"></i> Sugerido: <strong>#'+esc(sig.id)+'</strong> '+esc(sig.nombre||'')+' '+esc(sig.paterno||'')+'</p>';
  }
  h+='<div id="capFichaWrap" class="mt-4"></div>';
  h+='</div></div>';
  return h;
}

// ── BIND principal ──────────────────────────────────────────────────────
function bindCaptura(){
  const sel=document.getElementById('capDotSel');
  if(sel)sel.addEventListener('change',()=>{
    _capturaState.dotacionId=sel.value;
    _capturaState.empleadoActual=null;
    _capturaState.tallasSeleccionadas={};
    renderTab('captura');
  });
  document.getElementById('capEmpBuscar')?.addEventListener('click',()=>{
    const v=(document.getElementById('capEmpInput')?.value||'').trim();
    if(!v){notify('Escribe un número de empleado','warning');return;}
    buscarEmpleadoCaptura(v);
  });
  document.getElementById('capEmpInput')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const v=(e.target.value||'').trim();
      if(v)buscarEmpleadoCaptura(v);
    }
  });
  document.getElementById('capCargarSig')?.addEventListener('click',()=>{
    const dot=dotacionSeleccionada();
    if(!dot)return;
    const sig=siguientePendiente(dot.id);
    if(!sig){notify('No hay pendientes','info');return;}
    document.getElementById('capEmpInput').value=sig.id;
    abrirCapturaParaEmpleado(sig);
  });
  document.getElementById('capVerCap')?.addEventListener('click',()=>openListaCapturados());
  document.getElementById('capVerPend')?.addEventListener('click',()=>openListaPendientes());
}

// ── Búsqueda ────────────────────────────────────────────────────────────
function buscarEmpleadoCaptura(numero){
  const num=String(numero||'').trim();
  const emp=(getStore().employees||[]).find(e=>String(e.id||'')===num);
  if(!emp){
    // Empleado no encontrado → ofrecer crear
    const wrap=document.getElementById('capFichaWrap');
    if(wrap){
      wrap.innerHTML='<div class="card" style="background:#fef3c7;border-color:#f59e0b"><div class="card-body">'
        +'<p style="margin:0"><i class="fas fa-exclamation-triangle"></i> Empleado <strong>#'+esc(num)+'</strong> no encontrado.</p>'
        +'<button class="btn btn-primary mt-3" id="capCrearNuevo"><i class="fas fa-user-plus"></i> Crear nuevo empleado</button>'
        +'</div></div>';
      document.getElementById('capCrearNuevo')?.addEventListener('click',()=>openCrearEmpleadoNuevo(num));
    }
    return;
  }
  abrirCapturaParaEmpleado(emp);
}

function abrirCapturaParaEmpleado(emp){
  _capturaState.empleadoActual=emp;
  _capturaState.tallasSeleccionadas={};
  _capturaState.signatureHasInk=false;
  // Validar tipo de dotación
  if(!emp.tipo_dotacion){
    renderFichaSinTipo(emp);
    return;
  }
  renderFichaCaptura(emp);
}

// ── Si NO tiene tipo asignado → permite asignar ─────────────────────────
function renderFichaSinTipo(emp){
  const wrap=document.getElementById('capFichaWrap');
  if(!wrap)return;
  const tipos=getDotacionTipos();
  let h='<div class="card" style="background:#fff7ed;border-color:#fb923c"><div class="card-body">';
  h+='<h3 style="margin:0 0 8px;font-size:16px">#'+esc(emp.id)+' '+esc(emp.nombre||'')+' '+esc(emp.paterno||'')+'</h3>';
  h+='<p style="margin:0 0 12px"><i class="fas fa-exclamation-triangle"></i> Este empleado no tiene <strong>tipo de dotación</strong> asignado.</p>';
  if(!tipos.length){
    h+='<p class="text-sm text-muted">No hay tipos configurados. Créalos en el tab <strong>Configuración de dotación</strong> primero.</p>';
  }else{
    h+='<div class="form-row c2" style="align-items:end">';
    h+='<div class="form-group"><label class="form-label">Asignar tipo *</label><select class="form-select" id="capAsignarTipo">';
    h+='<option value="">— Selecciona —</option>';
    tipos.forEach(t=>{h+='<option value="'+esc(t.id)+'">'+esc(t.nombre)+'</option>';});
    h+='</select></div>';
    h+='<div><button class="btn btn-primary" id="capAsignarBtn"><i class="fas fa-check"></i> Asignar y continuar</button></div>';
    h+='</div>';
  }
  h+='</div></div>';
  wrap.innerHTML=h;
  document.getElementById('capAsignarBtn')?.addEventListener('click',()=>{
    const tipoId=(document.getElementById('capAsignarTipo')?.value||'').trim();
    if(!tipoId){notify('Selecciona un tipo','warning');return;}
    asignarTipoYContinuar(emp,tipoId);
  });
}

function asignarTipoYContinuar(emp,tipoId){
  const t=getDotacionTipos().find(x=>x.id===tipoId);
  if(!t){notify('Tipo no encontrado','error');return;}
  emp.tipo_dotacion=tipoId;
  if(!Array.isArray(emp.tipo_historial))emp.tipo_historial=[];
  emp.tipo_historial.push({
    tipo_id:tipoId,
    tipo_nombre:t.nombre,
    fecha:today(),
    motivo:'Asignación en captura de tallas'
  });
  saveEmployees();
  log('TIPO_DOTACION','Empleado #'+emp.id+' → '+t.nombre,'DOTACION');
  notify('Tipo asignado: '+t.nombre,'success');
  renderFichaCaptura(emp);
}

// ── Ficha de captura ────────────────────────────────────────────────────
function renderFichaCaptura(emp){
  const wrap=document.getElementById('capFichaWrap');
  if(!wrap)return;
  const dot=dotacionSeleccionada();
  if(!dot){notify('No hay dotación seleccionada','error');return;}
  const tipo=getDotacionTipos().find(t=>t.id===emp.tipo_dotacion);
  const kit=findKit(emp.tipo_dotacion,dot.anio);
  if(!tipo){
    wrap.innerHTML='<div class="empty-state"><i class="fas fa-times-circle"></i><p>Tipo de dotación no encontrado</p></div>';
    return;
  }
  if(!kit||!Array.isArray(kit.items)||!kit.items.length){
    wrap.innerHTML='<div class="empty-state"><i class="fas fa-box-open"></i><p>El tipo "'+esc(tipo.nombre)+'" no tiene kit configurado para el año '+dot.anio+'</p><p class="text-sm text-muted">Configúralo en el tab <strong>Configuración de dotación</strong>.</p></div>';
    return;
  }
  // Cargar tallas previas si existen
  const tallaId='tal-'+emp.id+'-'+dot.id;
  const previo=getDotacionTallas().find(t=>t.id===tallaId);
  _capturaState.tallasSeleccionadas=(previo&&previo.tallas)?{...previo.tallas}:{};
  // Render
  let h='<div class="card"><div class="card-body">';
  // Datos del empleado
  h+='<div class="flex justify-between items-start gap-3" style="flex-wrap:wrap">';
  h+='<div><h3 style="margin:0 0 4px;font-size:17px">#'+esc(emp.id)+' '+esc(emp.nombre||'')+' '+esc(emp.paterno||'')+' '+esc(emp.materno||'')+'</h3>';
  h+='<div class="text-sm text-muted">';
  h+='Tipo: <strong>'+esc(tipo.nombre)+'</strong> &nbsp;·&nbsp; ';
  h+='Área: <strong>'+esc(emp.area||'—')+'</strong> &nbsp;·&nbsp; ';
  h+='Estatus: <strong>'+esc((emp.estado||'activo').toUpperCase())+'</strong>';
  h+='</div></div>';
  if(previo)h+='<span class="badge badge-info">Recaptura</span>';
  h+='</div>';
  // Tallas dinámicas según kit
  h+='<div class="divider-label mt-4">Tallas</div>';
  h+='<div class="form-row c3" id="capTallasGrid">';
  kit.items.forEach(item=>{
    const prod=getProductos().find(p=>p.id===item.producto_id);
    const opciones=inferTallasParaProducto(prod);
    const valActual=_capturaState.tallasSeleccionadas[item.producto_id]||'';
    h+='<div class="form-group">';
    h+='<label class="form-label">'+esc(item.nombre||prod?.nombre||'Producto')+(item.cantidad>1?' (×'+item.cantidad+')':'')+'</label>';
    h+='<select class="form-select cap-talla-sel" data-prod="'+esc(item.producto_id)+'">';
    h+='<option value="">— Seleccionar —</option>';
    opciones.forEach(op=>{h+='<option value="'+esc(op)+'"'+(valActual===op?' selected':'')+'>'+esc(op)+'</option>';});
    h+='</select></div>';
  });
  h+='</div>';
  // Confirmación + firma
  h+='<div class="mt-4" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px">';
  h+='<label style="font-size:15px;font-weight:600;display:block;margin-bottom:4px"><i class="fas fa-pen-fancy"></i> Firma del empleado</label>';
  h+='<p style="font-size:12px;color:#64748b;margin:0 0 8px">Use el dedo o Apple Pencil para firmar. "Confirmo que estas son mis tallas"</p>';
  h+='<div id="capSigContainer" style="border:2px dashed #cbd5e1;border-radius:8px;background:#fff"><canvas id="capSigCanvas" style="display:block;width:100%;height:200px;cursor:crosshair;touch-action:none"></canvas></div>';
  if(previo&&previo.firma){
    h+='<div class="mt-2 text-xs text-muted"><i class="fas fa-info-circle"></i> Firma anterior registrada el '+esc((previo.fecha_captura||'').slice(0,16).replace('T',' '))+'. Vuelve a firmar para reemplazar.</div>';
  }
  h+='<div class="mt-2"><button class="btn btn-ghost" id="capSigClear" style="width:100%"><i class="fas fa-eraser"></i> Limpiar firma</button></div>';
  h+='</div>';
  h+='<div class="mt-4 flex gap-2" style="flex-wrap:wrap">';
  h+='<button class="btn btn-primary" id="capGuardar"><i class="fas fa-save"></i> Guardar</button>';
  h+='<button class="btn btn-ghost" id="capCancelar"><i class="fas fa-times"></i> Cancelar</button>';
  h+='</div>';
  h+='</div></div>';
  wrap.innerHTML=h;
  // Bind tallas
  wrap.querySelectorAll('.cap-talla-sel').forEach(s=>{
    s.addEventListener('change',()=>{
      const pid=s.dataset.prod;
      const val=(s.value||'').trim();
      if(val)_capturaState.tallasSeleccionadas[pid]=val;
      else delete _capturaState.tallasSeleccionadas[pid];
    });
  });
  // Inicializar firma
  initFirmaCanvas();
  document.getElementById('capSigClear')?.addEventListener('click',clearFirmaCanvas);
  document.getElementById('capCancelar')?.addEventListener('click',()=>{
    _capturaState.empleadoActual=null;
    _capturaState.tallasSeleccionadas={};
    document.getElementById('capFichaWrap').innerHTML='';
    const inp=document.getElementById('capEmpInput');if(inp)inp.value='';
  });
  document.getElementById('capGuardar')?.addEventListener('click',guardarTallas);
}

// ── Firma digital (canvas optimizado, JPEG calidad 0.5) ─────────────────
function initFirmaCanvas(){
  const c=document.getElementById('capSigCanvas');
  if(!c)return;
  // Tamaño interno: 400x200 según especificación
  c.width=400;
  c.height=200;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle='#0f172a';
  ctx.lineWidth=2;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  _capturaState.signatureCanvas=c;
  _capturaState.signatureCtx=ctx;
  _capturaState.signatureDrawing=false;
  _capturaState.signatureHasInk=false;
  function toCanvas(cx,cy){
    const r=c.getBoundingClientRect();
    return{x:(cx-r.left)*(c.width/r.width),y:(cy-r.top)*(c.height/r.height)};
  }
  function down(e){
    _capturaState.signatureDrawing=true;
    const p=toCanvas(e.clientX,e.clientY);
    _capturaState.signatureLastX=p.x;_capturaState.signatureLastY=p.y;
  }
  function move(e){
    if(!_capturaState.signatureDrawing)return;
    const p=toCanvas(e.clientX,e.clientY);
    ctx.beginPath();
    ctx.moveTo(_capturaState.signatureLastX,_capturaState.signatureLastY);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
    _capturaState.signatureLastX=p.x;_capturaState.signatureLastY=p.y;
    _capturaState.signatureHasInk=true;
  }
  function up(){_capturaState.signatureDrawing=false;}
  c.addEventListener('mousedown',down);
  c.addEventListener('mousemove',move);
  c.addEventListener('mouseup',up);
  c.addEventListener('mouseleave',up);
  c.addEventListener('touchstart',e=>{e.preventDefault();if(!e.touches[0])return;const t=e.touches[0];down({clientX:t.clientX,clientY:t.clientY});},{passive:false});
  c.addEventListener('touchmove',e=>{e.preventDefault();if(!e.touches[0])return;const t=e.touches[0];move({clientX:t.clientX,clientY:t.clientY});},{passive:false});
  c.addEventListener('touchend',e=>{e.preventDefault();up();},{passive:false});
}

function clearFirmaCanvas(){
  const c=_capturaState.signatureCanvas;
  const ctx=_capturaState.signatureCtx;
  if(!c||!ctx)return;
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,c.width,c.height);
  _capturaState.signatureHasInk=false;
}

function getFirmaJPEG(){
  const c=_capturaState.signatureCanvas;
  if(!c)return null;
  // Calidad 0.5 → archivo liviano
  return c.toDataURL('image/jpeg',0.5);
}

// ── Validación de captura ──────────────────────────────────────────────────
function validateCaptura(empleado, tallas, kit){
  const warnings=[];

  // Validación 1: Verificar que el empleado tenga tipo_dotacion
  if(!empleado.tipo_dotacion){
    warnings.push('⚠ El empleado no tiene tipo de dotación asignado');
  }

  // Validación 2: Verificar que todos los productos del kit tengan talla
  if(kit && Array.isArray(kit.items)){
    const sinTalla=[];
    kit.items.forEach(item=>{
      if(!tallas[item.producto_id]){
        sinTalla.push(item.nombre || 'Producto');
      }
    });
    if(sinTalla.length>0){
      warnings.push('⚠ Faltan tallas por capturar: '+sinTalla.join(', '));
    }
  }

  return{
    valido: warnings.length === 0,
    warnings: warnings
  };
}

// ── Guardar tallas ──────────────────────────────────────────────────────
async function guardarTallas(){
  const emp=_capturaState.empleadoActual;
  const dot=dotacionSeleccionada();
  if(!emp||!dot){notify('Faltan datos','error');return;}
  if(!_capturaState.signatureHasInk){
    notify('La firma es obligatoria','warning');
    return;
  }
  const firma=getFirmaJPEG();
  if(!firma){notify('No se pudo capturar la firma','error');return;}
  const tallas={...(_capturaState.tallasSeleccionadas||{})};

  // VALIDACIÓN DE CAPTURA
  const kit=findKit(emp.tipo_dotacion,dot.anio);
  const validacion=validateCaptura(emp,tallas,kit);
  if(validacion.warnings.length>0){
    validacion.warnings.forEach(w=>notify(w,'warning'));
  }

  if(!Object.keys(tallas).length){
    if(!confirmDialog('No has seleccionado ninguna talla. ¿Guardar de todos modos?'))return;
  }
  const id='tal-'+emp.id+'-'+dot.id;
  const firmaEvidence=await saveEvidence({
    base64:firma,
    tipo:'firma',
    entidad:'dotacion-tallas',
    entidadId:id,
    filename:'firma-tallas.jpg'
  });
  const nombreCompleto=[emp.nombre||'',emp.paterno||'',emp.materno||''].join(' ').replace(/\s+/g,' ').trim();
  const usuario=(()=>{try{const u=JSON.parse(localStorage.getItem('_user')||'{}');return u.name||u.id||'admin';}catch(e){return'admin';}})();
  const reg={
    id,
    dotacion_id:dot.id,
    empleado_id:emp.id,
    empleado_nombre:nombreCompleto,
    tipo_dotacion:emp.tipo_dotacion||'',
    tallas,
    firma:firmaEvidence,
    fecha_captura:new Date().toISOString(),
    capturado_por:usuario
  };
  const list=getStore().dotacionTallas;
  const idx=list.findIndex(t=>t.id===id);
  let recap=false;
  if(idx>=0){list[idx]=reg;recap=true;}
  else list.push(reg);
  saveDotacionTallas();
  log('CAPTURA_TALLAS','Empleado #'+emp.id+(recap?' (recaptura)':'')+' — '+Object.keys(tallas).length+' tallas','DOTACION');
  notify('Tallas guardadas para #'+emp.id+' '+(emp.nombre||''),'success');
  // Reset y mostrar siguiente sugerido
  _capturaState.empleadoActual=null;
  _capturaState.tallasSeleccionadas={};
  _capturaState.signatureHasInk=false;
  renderTab('captura');
}

// ── Crear empleado nuevo desde captura ──────────────────────────────────
function openCrearEmpleadoNuevo(numeroSugerido){
  const areas=getAreaNames();
  const tipos=getDotacionTipos();
  const body=''
    +'<div class="form-row c2">'
    +'<div class="form-group"><label class="form-label">Número *</label><input class="form-input" id="cneId" value="'+esc(numeroSugerido||'')+'"></div>'
    +'<div class="form-group"><label class="form-label">Área *</label><select class="form-select" id="cneArea">'+areas.map(a=>'<option>'+esc(a)+'</option>').join('')+'</select></div>'
    +'<div class="form-group"><label class="form-label">Nombre(s) *</label><input class="form-input" id="cneNom"></div>'
    +'<div class="form-group"><label class="form-label">Apellido paterno</label><input class="form-input" id="cnePat"></div>'
    +'<div class="form-group"><label class="form-label">Apellido materno</label><input class="form-input" id="cneMat"></div>'
    +'<div class="form-group"><label class="form-label">Tipo de dotación</label><select class="form-select" id="cneTipo">'
    +'<option value="">— Sin asignar —</option>'
    +tipos.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.nombre)+'</option>').join('')
    +'</select></div>'
    +'</div>';
  modal.open('Crear empleado nuevo',body,'<button class="btn btn-ghost" id="cneCancel">Cancelar</button><button class="btn btn-primary" id="cneSave">Guardar y capturar</button>','md');
  document.getElementById('cneCancel').addEventListener('click',()=>modal.close());
  document.getElementById('cneSave').addEventListener('click',saveCrearEmpleadoNuevo);
  setTimeout(()=>document.getElementById('cneNom')?.focus(),100);
}

function saveCrearEmpleadoNuevo(){
  const id=(document.getElementById('cneId')?.value||'').trim()||genId();
  const nom=(document.getElementById('cneNom')?.value||'').trim();
  if(!nom){notify('El nombre es obligatorio','warning');return;}
  // VALIDAR DUPLICADO
  if((getStore().employees||[]).some(e=>String(e.id||'')===String(id))){
    notify('Ya existe un empleado con este número','error');
    return;
  }
  const tipoId=(document.getElementById('cneTipo')?.value||'').trim();
  const tipoHist=[];
  if(tipoId){
    const t=getDotacionTipos().find(x=>x.id===tipoId);
    tipoHist.push({tipo_id:tipoId,tipo_nombre:t?t.nombre:tipoId,fecha:today(),motivo:'Alta desde captura tallas'});
  }
  const nuevo={
    id,
    nombre:nom,
    paterno:(document.getElementById('cnePat')?.value||'').trim(),
    materno:(document.getElementById('cneMat')?.value||'').trim(),
    area:document.getElementById('cneArea')?.value||'PLANTA',
    estado:'activo',
    tallas:{},
    perfilDotacion:'AUTO',
    foto:null,
    tipo_dotacion:tipoId,
    tipo_historial:tipoHist
  };
  getStore().employees.push(nuevo);
  saveEmployees();
  log('ALTA',nom+' (#'+id+') desde captura tallas','DOTACION');
  modal.close();
  notify('Empleado creado','success');
  // Pre-llenar input y abrir captura
  const inp=document.getElementById('capEmpInput');if(inp)inp.value=id;
  abrirCapturaParaEmpleado(nuevo);
}

// ── Lista de capturados ─────────────────────────────────────────────────
function openListaCapturados(){
  const dot=dotacionSeleccionada();
  if(!dot)return;
  const cap=tallasDeDotacion(dot.id).slice().sort((a,b)=>String(a.empleado_id).localeCompare(String(b.empleado_id),undefined,{numeric:true}));
  const tipos=getDotacionTipos();
  let h='';
  h+='<div class="form-group"><label class="form-label">Filtrar por tipo</label><select class="form-select" id="capFiltroTipo"><option value="">Todos</option>';
  tipos.forEach(t=>{h+='<option value="'+esc(t.id)+'">'+esc(t.nombre)+'</option>';});
  h+='</select></div>';
  h+='<div id="capListaCapWrap" style="max-height:400px;overflow:auto"></div>';
  modal.open('Capturados — '+esc(dot.nombre||('Dotación '+dot.anio)),h,'<button class="btn btn-ghost" id="capLcCerrar">Cerrar</button>','lg');
  document.getElementById('capLcCerrar').addEventListener('click',()=>modal.close());
  function pintar(filtro){
    const data=cap.filter(t=>!filtro||t.tipo_dotacion===filtro);
    const wrap=document.getElementById('capListaCapWrap');
    if(!wrap)return;
    if(!data.length){
      wrap.innerHTML='<div class="empty-state" style="padding:18px"><i class="fas fa-inbox"></i><p>Sin capturas</p></div>';
      return;
    }
    let html='<table class="dt"><thead><tr><th>#</th><th>Nombre</th><th>Tipo</th><th>Fecha</th><th>Firma</th></tr></thead><tbody>';
    data.forEach(t=>{
      const tipo=tipos.find(x=>x.id===t.tipo_dotacion);
      html+='<tr>';
      html+='<td class="font-mono text-xs">'+esc(t.empleado_id)+'</td>';
      html+='<td>'+esc(t.empleado_nombre||'')+'</td>';
      html+='<td>'+esc(tipo?.nombre||t.tipo_dotacion||'—')+'</td>';
      html+='<td class="text-xs">'+esc((t.fecha_captura||'').slice(0,16).replace('T',' '))+'</td>';
      const firmaSrc=getEvidenceSrc(t.firma);
      html+='<td>'+(firmaSrc?'<img src="'+esc(firmaSrc)+'" style="height:30px;border:1px solid #e5e7eb;border-radius:4px;background:#fff">':'—')+'</td>';
      html+='</tr>';
    });
    html+='</tbody></table>';
    wrap.innerHTML=html;
  }
  pintar('');
  document.getElementById('capFiltroTipo')?.addEventListener('change',e=>pintar(e.target.value||''));
}

// ── Lista de pendientes ─────────────────────────────────────────────────
function openListaPendientes(){
  const dot=dotacionSeleccionada();
  if(!dot)return;
  const yaCap=new Set(tallasDeDotacion(dot.id).map(t=>t.empleado_id));
  const tipos=getDotacionTipos();
  const pendientes=empleadosActivos().filter(e=>!yaCap.has(e.id))
    .sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
  let h='';
  h+='<div class="form-group"><label class="form-label">Filtrar por tipo</label><select class="form-select" id="capFiltroTipoP"><option value="">Todos</option>';
  tipos.forEach(t=>{h+='<option value="'+esc(t.id)+'">'+esc(t.nombre)+'</option>';});
  h+='<option value="__sin__">Sin tipo asignado</option>';
  h+='</select></div>';
  h+='<div id="capListaPendWrap" style="max-height:400px;overflow:auto"></div>';
  modal.open('Pendientes — '+esc(dot.nombre||('Dotación '+dot.anio)),h,'<button class="btn btn-ghost" id="capLpCerrar">Cerrar</button>','lg');
  document.getElementById('capLpCerrar').addEventListener('click',()=>modal.close());
  function pintar(filtro){
    let data=pendientes;
    if(filtro==='__sin__')data=data.filter(e=>!e.tipo_dotacion);
    else if(filtro)data=data.filter(e=>e.tipo_dotacion===filtro);
    const wrap=document.getElementById('capListaPendWrap');
    if(!wrap)return;
    if(!data.length){
      wrap.innerHTML='<div class="empty-state" style="padding:18px"><i class="fas fa-check-circle"></i><p>Todos capturados</p></div>';
      return;
    }
    let html='<table class="dt"><thead><tr><th>#</th><th>Nombre</th><th>Área</th><th>Tipo</th><th></th></tr></thead><tbody>';
    data.forEach(e=>{
      const tipo=tipos.find(x=>x.id===e.tipo_dotacion);
      html+='<tr>';
      html+='<td class="font-mono text-xs">'+esc(e.id)+'</td>';
      html+='<td><a href="#" class="cap-pend-go" data-id="'+esc(e.id)+'" style="color:#1d4ed8;text-decoration:none;font-weight:600">'+esc(e.nombre||'')+' '+esc(e.paterno||'')+'</a></td>';
      html+='<td class="text-xs">'+esc(e.area||'—')+'</td>';
      html+='<td class="text-xs">'+esc(tipo?.nombre||(e.tipo_dotacion?e.tipo_dotacion:'Sin tipo'))+'</td>';
      html+='<td><button class="btn btn-ghost btn-sm cap-pend-go" data-id="'+esc(e.id)+'"><i class="fas fa-pen"></i> Capturar</button></td>';
      html+='</tr>';
    });
    html+='</tbody></table>';
    wrap.innerHTML=html;
    wrap.querySelectorAll('.cap-pend-go').forEach(b=>{
      b.addEventListener('click',ev=>{
        ev.preventDefault();
        const id=b.dataset.id;
        const emp=(getStore().employees||[]).find(x=>x.id===id);
        if(!emp)return;
        modal.close();
        const inp=document.getElementById('capEmpInput');if(inp)inp.value=id;
        abrirCapturaParaEmpleado(emp);
      });
    });
  }
  pintar('');
  document.getElementById('capFiltroTipoP')?.addEventListener('change',e=>pintar(e.target.value||''));
}

// ════════════════════════════════════════════════════════════════════════
// TAB CONCENTRADO — Fase 2.2
// Concentrado automático para compras
// ════════════════════════════════════════════════════════════════════════

let _concentradoDotacionId=null;
let _concentradoUltimo=null;

function dotacionConcentradoSeleccionada(){
  const lista=dotaciones().slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0));
  if(_concentradoDotacionId){
    const d=findDotacion(_concentradoDotacionId);
    if(d)return d;
  }
  const act=lista.find(d=>d.estado==='activa');
  const sel=act||lista[0]||null;
  if(sel)_concentradoDotacionId=sel.id;
  return sel;
}

function renderConcentrado(){
  const lista=dotaciones();
  if(!lista.length){
    return '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Primero crea una dotación</p><p class="text-sm text-muted">Ve al tab "Dotación por año" para crearla.</p></div>';
  }
  const cfg=getDotacionConfig();
  const dot=dotacionConcentradoSeleccionada();
  const data=calcularConcentrado(dot?.id,Number(cfg.buffer_stock));
  _concentradoUltimo=data;
  let h='';
  h+='<div class="flex justify-between items-start gap-3 mb-4" style="flex-wrap:wrap">';
  h+='<div><h2 style="font-size:18px;margin:0">Para compras</h2><p class="text-sm text-muted">Genera el concentrado de prendas, tallas y cantidades para compras.</p></div>';
  h+='<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">';
  h+='<div class="form-group" style="margin:0"><label class="form-label">Dotación</label><select class="form-input" id="concDotSel" style="min-width:220px">';
  lista.slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0)).forEach(d=>{
    h+='<option value="'+esc(d.id)+'"'+(dot&&d.id===dot.id?' selected':'')+'>'+esc(d.nombre||('Dotación '+d.anio))+(d.estado==='activa'?' • ACTIVA':'')+'</option>';
  });
  h+='</select></div>';
  h+='<div class="form-group" style="margin:0"><label class="form-label">Buffer stock</label><div style="display:flex;align-items:center;gap:6px"><input class="form-input" id="concBuffer" type="number" min="0" step="1" value="'+Number(data.buffer_stock||0)+'" style="width:90px;text-align:right"><span class="text-sm text-muted">%</span></div></div>';
  h+='<button class="btn btn-success" id="concExportExcel"><i class="fas fa-file-excel"></i> Exportar Excel</button>';
  h+='<button class="btn btn-ghost" id="concExportPdf"><i class="fas fa-file-pdf"></i> Exportar PDF</button>';
  h+='</div></div>';
  if(data.warnings.length){
    h+='<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px 12px;margin-bottom:14px;color:#9a3412;font-size:13px">';
    h+=data.warnings.map(w=>'<div>'+esc(w)+'</div>').join('');
    h+='</div>';
  }
  h+=renderConcentradoResumen(data);
  h+=renderConcentradoDetalle(data);
  return h;
}

function bindConcentrado(){
  document.getElementById('concDotSel')?.addEventListener('change',e=>{
    _concentradoDotacionId=e.target.value;
    renderTab('concentrado');
  });
  document.getElementById('concBuffer')?.addEventListener('input',e=>{
    const cfg=getDotacionConfig();
    const val=Math.max(0,Number(e.target.value)||0);
    cfg.buffer_stock=val;
    saveDotacionConfig();
    renderTab('concentrado');
  });
  document.getElementById('concExportExcel')?.addEventListener('click',exportarConcentradoExcel);
  document.getElementById('concExportPdf')?.addEventListener('click',exportarConcentradoPDF);
}

function renderConcentradoResumen(data){
  const s=data.resumen;
  const items=[
    ['Empleados capturados',s.empleados_capturados],
    ['Empleados totales',s.empleados_totales],
    ['Cobertura %',s.cobertura_pct+'%'],
    ['Total prendas necesarias',s.total_prendas],
    ['Total con buffer',s.total_con_buffer],
    ['Stock actual disponible',s.stock_actual],
    ['Total a comprar',s.total_a_comprar],
    ['Estimado total',fmtMoney(s.estimado_total)],
    ['Productos sin precio',s.productos_sin_precio]
  ];
  let h='<div class="grid mb-4" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">';
  items.forEach(([label,value])=>{
    h+='<div class="card" style="margin:0;background:#f8fafc"><div class="card-body" style="padding:12px">';
    h+='<div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700">'+esc(label)+'</div>';
    h+='<div style="font-size:22px;font-weight:800;margin-top:4px">'+esc(String(value))+'</div>';
    h+='</div></div>';
  });
  h+='</div>';
  h+='<div class="text-xs text-muted mb-3"><i class="fas fa-info-circle"></i> Costo estimado con precios actuales. Los productos sin precio se excluyen del total financiero.</div>';
  return h;
}

function renderConcentradoDetalle(data){
  if(!data.detalle.length){
    return '<div class="empty-state"><i class="fas fa-table"></i><p>Sin datos de concentrado</p><p class="text-sm text-muted">Configura kits y captura tallas para generar el concentrado.</p></div>';
  }
  let h='<div class="card"><div class="card-head"><h3>Detalle por producto/talla</h3><span class="text-sm text-muted">'+data.detalle.length+' líneas</span></div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr>';
  ['Producto','Talla','Necesario','Buffer','Total','Stock','A Comprar','Costo Unitario','Subtotal','Advertencias'].forEach(th=>{h+='<th>'+th+'</th>';});
  h+='</tr></thead><tbody>';
  data.detalle.forEach(r=>{
    h+='<tr>';
    h+='<td><strong>'+esc(r.producto)+'</strong><div class="text-xs text-muted">'+esc(r.proveedor||'Sin proveedor')+'</div></td>';
    h+='<td><span class="badge badge-info">'+esc(r.talla)+'</span></td>';
    h+='<td style="text-align:right">'+r.necesario+'</td>';
    h+='<td style="text-align:right">'+r.buffer+'</td>';
    h+='<td style="text-align:right;font-weight:700">'+r.total+'</td>';
    h+='<td style="text-align:right">'+r.stock+'</td>';
    h+='<td style="text-align:right;font-weight:800;color:#1d4ed8">'+r.a_comprar+'</td>';
    h+='<td style="text-align:right">'+(r.sin_precio?'<span style="color:#b45309">⚠ Sin precio</span>':fmtMoney(r.costo_unitario))+'</td>';
    h+='<td style="text-align:right">'+(r.sin_precio?'—':fmtMoney(r.subtotal))+'</td>';
    h+='<td class="text-xs">'+(r.advertencias.length?r.advertencias.map(a=>'<div style="color:#b45309">'+esc(a)+'</div>').join(''):'—')+'</td>';
    h+='</tr>';
  });
  h+='</tbody></table></div></div>';
  return h;
}

function calcularConcentrado(dotacionId,bufferStock){
  const dot=findDotacion(dotacionId);
  const buffer=Number.isFinite(Number(bufferStock))?Math.max(0,Number(bufferStock)):30;
  const fecha=new Date();
  const empleados=empleadosActivos();
  const capturas=dot?tallasDeDotacion(dot.id):[];
  const capturadosSet=new Set(capturas.map(c=>String(c.empleado_id)));
  const empleadosPorTipo=new Map();
  empleados.forEach(emp=>{
    const tipo=emp.tipo_dotacion||'';
    if(!empleadosPorTipo.has(tipo))empleadosPorTipo.set(tipo,[]);
    empleadosPorTipo.get(tipo).push(emp);
  });
  const capturasPorTipo=new Map();
  capturas.forEach(cap=>{
    const tipo=cap.tipo_dotacion||'';
    if(!capturasPorTipo.has(tipo))capturasPorTipo.set(tipo,[]);
    capturasPorTipo.get(tipo).push(cap);
  });
  const productos=getProductos();
  const productosById=new Map(productos.map(p=>[p.id,p]));
  const rows=new Map();
  const warnings=[];
  if(!dot){
    return concentradoVacio(buffer,fecha,['Selecciona una dotación válida']);
  }
  const kitsAnio=kits().filter(k=>Number(k.anio)===Number(dot.anio));
  if(!kitsAnio.length)warnings.push('No hay kits configurados para el año '+dot.anio);
  kitsAnio.forEach(kit=>{
    const tipoId=kit.tipo_id||'';
    const empleadosTipo=empleadosPorTipo.get(tipoId)||[];
    const capturasTipo=capturasPorTipo.get(tipoId)||[];
    (kit.items||[]).forEach(item=>{
      const producto=productosById.get(item.producto_id)||null;
      const productoNombre=item.nombre||producto?.nombre||'Producto';
      const cantidad=Math.max(0,Number(item.cantidad)||0);
      if(!cantidad)return;
      if(esProductoSinTalla(producto,item)){
        acumularConcentrado(rows,producto,item,'Única',empleadosTipo.length*cantidad);
        return;
      }
      const porTalla=new Map();
      capturasTipo.forEach(cap=>{
        const talla=normalizarTallaConcentrado(cap.tallas?.[item.producto_id]);
        if(!talla)return;
        porTalla.set(talla,(porTalla.get(talla)||0)+cantidad);
      });
      if(!porTalla.size)return;
      porTalla.forEach((necesario,talla)=>acumularConcentrado(rows,producto,{...item,nombre:productoNombre},talla,necesario));
    });
  });
  const detalle=Array.from(rows.values()).map(base=>finalizarLineaConcentrado(base,buffer));
  detalle.sort((a,b)=>a.producto.localeCompare(b.producto,'es')||a.talla.localeCompare(b.talla,'es',undefined,{numeric:true}));
  const sinPrecio=new Set(detalle.filter(r=>r.sin_precio).map(r=>r.producto_id));
  const resumen={
    dotacion:dot.nombre||('Dotación '+dot.anio),
    anio:dot.anio||'',
    fecha_generacion:fecha.toLocaleString('es-MX'),
    empleados_totales:empleados.length,
    empleados_capturados:capturadosSet.size,
    cobertura_pct:empleados.length?Math.round((capturadosSet.size/empleados.length)*100):0,
    total_prendas:detalle.reduce((t,r)=>t+r.necesario,0),
    total_con_buffer:detalle.reduce((t,r)=>t+r.total,0),
    stock_actual:detalle.reduce((t,r)=>t+r.stock,0),
    total_a_comprar:detalle.reduce((t,r)=>t+r.a_comprar,0),
    estimado_total:detalle.reduce((t,r)=>t+(r.sin_precio?0:r.subtotal),0),
    buffer_aplicado:buffer,
    productos_sin_precio:sinPrecio.size
  };
  return{dotacion:dot,buffer_stock:buffer,fecha,detalle,resumen,warnings};
}

function concentradoVacio(buffer,fecha,warnings){
  return{
    dotacion:null,
    buffer_stock:buffer,
    fecha,
    detalle:[],
    resumen:{
      dotacion:'—',anio:'—',fecha_generacion:fecha.toLocaleString('es-MX'),
      empleados_totales:0,empleados_capturados:0,cobertura_pct:0,total_prendas:0,
      total_con_buffer:0,stock_actual:0,total_a_comprar:0,estimado_total:0,
      buffer_aplicado:buffer,productos_sin_precio:0
    },
    warnings
  };
}

function acumularConcentrado(rows,producto,item,talla,necesario){
  const productoId=item.producto_id||producto?.id||'';
  const key=productoId+'__'+talla;
  if(!rows.has(key)){
    rows.set(key,{
      producto_id:productoId,
      producto:item.nombre||producto?.nombre||'Producto',
      producto_obj:producto,
      talla,
      necesario:0
    });
  }
  rows.get(key).necesario+=necesario;
}

function finalizarLineaConcentrado(base,bufferStock){
  const producto=base.producto_obj;
  const buffer=Math.ceil(base.necesario*(bufferStock/100));
  const total=base.necesario+buffer;
  const stockInfo=obtenerStockConcentrado(producto,base.talla);
  const aComprar=Math.max(0,total-stockInfo.stock);
  const costo=Number(producto?.costo_promedio);
  const sinPrecio=!Number.isFinite(costo)||costo<=0;
  const advertencias=[...stockInfo.advertencias];
  if(sinPrecio)advertencias.push('⚠ Sin precio');
  return{
    producto_id:base.producto_id,
    producto:base.producto,
    talla:base.talla,
    necesario:base.necesario,
    buffer,
    total,
    stock:stockInfo.stock,
    a_comprar:aComprar,
    costo_unitario:sinPrecio?0:costo,
    subtotal:sinPrecio?0:aComprar*costo,
    sin_precio:sinPrecio,
    proveedor:proveedorProducto(producto),
    advertencias
  };
}

function esProductoSinTalla(producto,item){
  const nombre=((producto?.nombre||item?.nombre||'')+'').toLowerCase();
  if(/\b(paraguas|termo|vaso|toalla|gorra|unitalla)\b/i.test(nombre))return true;
  if(esTallaUnica(producto?.talla)||esTallaUnica(producto?.talla_default)||esTallaUnica(item?.talla))return true;
  const variantes=Array.isArray(producto?.variantes)?producto.variantes:[];
  return variantes.length===1&&esTallaUnica(variantes[0]?.talla);
}

function esTallaUnica(v){
  const t=normalizarTallaConcentrado(v).toLowerCase();
  return t==='unica'||t==='única'||t==='unitalla'||t==='sin talla';
}

function normalizarTallaConcentrado(v){
  const s=String(v||'').trim();
  if(!s)return'';
  const low=s.toLowerCase();
  if(low==='unica'||low==='única'||low==='unitalla')return'Única';
  if(low==='sin talla')return'Sin talla';
  return s;
}

function tallaKey(v){
  return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}

function obtenerStockConcentrado(producto,talla){
  if(!producto)return{stock:0,advertencias:[]};
  const advertencias=[];
  const variantes=Array.isArray(producto.variantes)?producto.variantes:[];
  const usaTalla=!(talla==='Única'||talla==='Sin talla');
  if(variantes.length){
    const variante=variantes.find(v=>tallaKey(v.talla)===tallaKey(talla)||tallaKey(v.nombre)===tallaKey(talla));
    return{stock:Number(variante?.stock_actual)||0,advertencias};
  }
  const stock=Number(producto.stock_actual)||0;
  if(usaTalla)advertencias.push('⚠ Stock no segmentado por talla — usando total');
  return{stock,advertencias};
}

function proveedorProducto(producto){
  return(producto?.proveedor_frecuente||producto?.proveedor||producto?.proveedor_nombre||'Sin proveedor').trim()||'Sin proveedor';
}

function exportarConcentradoExcel(){
  const data=_concentradoUltimo||calcularConcentrado(dotacionConcentradoSeleccionada()?.id,Number(getDotacionConfig().buffer_stock));
  if(!window.XLSX){notify('SheetJS no está disponible para exportar Excel','error');return;}
  const wb=window.XLSX.utils.book_new();
  const s=data.resumen;
  const resumenRows=[
    {Campo:'Dotación',Valor:s.dotacion},
    {Campo:'Año',Valor:s.anio},
    {Campo:'Fecha generación',Valor:s.fecha_generacion},
    {Campo:'Total empleados',Valor:s.empleados_totales},
    {Campo:'Empleados capturados',Valor:s.empleados_capturados},
    {Campo:'Cobertura %',Valor:s.cobertura_pct},
    {Campo:'Total prendas',Valor:s.total_prendas},
    {Campo:'Total con buffer',Valor:s.total_con_buffer},
    {Campo:'Stock actual',Valor:s.stock_actual},
    {Campo:'A comprar',Valor:s.total_a_comprar},
    {Campo:'Estimado total',Valor:s.estimado_total},
    {Campo:'Buffer aplicado',Valor:s.buffer_aplicado+'%'},
    {Campo:'Productos sin precio',Valor:s.productos_sin_precio}
  ];
  const detalleRows=data.detalle.map(r=>({
    Producto:r.producto,
    Talla:r.talla,
    Necesario:r.necesario,
    Buffer:r.buffer,
    Total:r.total,
    Stock:r.stock,
    'A Comprar':r.a_comprar,
    'Costo Unitario':r.sin_precio?'Sin precio':r.costo_unitario,
    Subtotal:r.sin_precio?0:r.subtotal,
    Advertencias:r.advertencias.join(' | ')
  }));
  const provMap=new Map();
  data.detalle.forEach(r=>{
    const key=r.proveedor||'Sin proveedor';
    if(!provMap.has(key))provMap.set(key,{Proveedor:key,productos:new Set(),'Total unidades':0,'Total costo':0});
    const row=provMap.get(key);
    row.productos.add(r.producto);
    row['Total unidades']+=r.a_comprar;
    row['Total costo']+=r.sin_precio?0:r.subtotal;
  });
  const proveedorRows=Array.from(provMap.values()).map(r=>({
    Proveedor:r.Proveedor,
    Productos:Array.from(r.productos).join(', '),
    'Total unidades':r['Total unidades'],
    'Total costo':r['Total costo']
  }));
  const fecha=data.fecha.toLocaleString('es-MX');
  const snapshotRows=data.detalle.map(r=>({
    Producto:r.producto,
    'Costo utilizado':r.sin_precio?'Sin precio':r.costo_unitario,
    'Fecha generación':fecha,
    Nota:'Costos al '+fecha+'. Sujetos a cambio.'
  }));
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(resumenRows),'Resumen');
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(detalleRows),'Detalle');
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(proveedorRows),'Por Proveedor');
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(snapshotRows),'Snapshot de Costos');
  const anio=s.anio||today();
  window.XLSX.writeFile(wb,'concentrado_compras_'+anio+'_'+today()+'.xlsx');
  notify('Excel generado con 4 hojas','success');
}

function exportarConcentradoPDF(){
  const data=_concentradoUltimo||calcularConcentrado(dotacionConcentradoSeleccionada()?.id,Number(getDotacionConfig().buffer_stock));
  prepararEstilosPrintConcentrado();
  const prev=document.getElementById('dotConcentradoPrintArea');
  if(prev)prev.remove();
  const area=document.createElement('div');
  area.id='dotConcentradoPrintArea';
  area.innerHTML=htmlPrintConcentrado(data);
  document.body.appendChild(area);
  const cleanup=()=>{setTimeout(()=>area.remove(),300);window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup);
  window.print();
  setTimeout(()=>{if(document.body.contains(area))area.remove();},3000);
}

function prepararEstilosPrintConcentrado(){
  if(document.getElementById('dotConcentradoPrintStyle'))return;
  const st=document.createElement('style');
  st.id='dotConcentradoPrintStyle';
  st.textContent='@media print{body>*:not(#dotConcentradoPrintArea){display:none!important}#dotConcentradoPrintArea{display:block!important;padding:18px;font-family:Inter,Arial,sans-serif;color:#111827}#dotConcentradoPrintArea table{width:100%;border-collapse:collapse;font-size:11px}#dotConcentradoPrintArea th,#dotConcentradoPrintArea td{border:1px solid #d1d5db;padding:5px;text-align:left}#dotConcentradoPrintArea th{background:#f3f4f6}.print-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}.print-kpi{border:1px solid #d1d5db;padding:7px}.print-kpi strong{display:block;font-size:16px;margin-top:2px}}#dotConcentradoPrintArea{display:none}';
  document.head.appendChild(st);
}

function htmlPrintConcentrado(data){
  const s=data.resumen;
  let h='<h1 style="margin:0 0 4px;font-size:22px">Concentrado para compras</h1>';
  h+='<div style="font-size:12px;color:#4b5563;margin-bottom:10px">'+esc(s.dotacion)+' · Año '+esc(String(s.anio))+' · '+esc(s.fecha_generacion)+'</div>';
  h+='<div class="print-grid">';
  [
    ['Total empleados',s.empleados_totales],['Capturados',s.empleados_capturados],['Cobertura',s.cobertura_pct+'%'],
    ['Total prendas',s.total_prendas],['Total con buffer',s.total_con_buffer],['Stock actual',s.stock_actual],
    ['A comprar',s.total_a_comprar],['Estimado total',fmtMoney(s.estimado_total)],['Sin precio',s.productos_sin_precio]
  ].forEach(([label,value])=>{h+='<div class="print-kpi">'+esc(label)+'<strong>'+esc(String(value))+'</strong></div>';});
  h+='</div>';
  h+='<p style="font-size:11px;color:#4b5563">Costo estimado con precios actuales. Buffer aplicado: '+esc(String(s.buffer_aplicado))+'%.</p>';
  h+='<table><thead><tr><th>Producto</th><th>Talla</th><th>Necesario</th><th>Buffer</th><th>Total</th><th>Stock</th><th>A Comprar</th><th>Costo Unitario</th><th>Subtotal</th><th>Advertencias</th></tr></thead><tbody>';
  data.detalle.forEach(r=>{
    h+='<tr><td>'+esc(r.producto)+'</td><td>'+esc(r.talla)+'</td><td>'+r.necesario+'</td><td>'+r.buffer+'</td><td>'+r.total+'</td><td>'+r.stock+'</td><td>'+r.a_comprar+'</td><td>'+(r.sin_precio?'Sin precio':fmtMoney(r.costo_unitario))+'</td><td>'+(r.sin_precio?'—':fmtMoney(r.subtotal))+'</td><td>'+esc(r.advertencias.join(' | '))+'</td></tr>';
  });
  h+='</tbody></table>';
  return h;
}

// ════════════════════════════════════════════════════════════════════════
// TAB ENTREGA MASIVA — Fase 2.3
// Entrega anual de kits por dotación
// ════════════════════════════════════════════════════════════════════════

let _entregaState={
  dotacionId:null,
  empleado:null,
  captura:null,
  productos:[],
  registroExistente:null,
  signatureCanvas:null,
  signatureCtx:null,
  signatureDrawing:false,
  signatureLastX:0,
  signatureLastY:0,
  signatureHasInk:false
};

function dotacionEntregaSeleccionada(){
  if(_entregaState.dotacionId){
    const d=findDotacion(_entregaState.dotacionId);
    if(d)return d;
  }
  const lista=dotaciones().slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0));
  const act=lista.find(d=>d.estado==='activa');
  const sel=act||lista[0]||null;
  if(sel)_entregaState.dotacionId=sel.id;
  return sel;
}

function renderEntregaMasiva(){
  const lista=dotaciones();
  if(!lista.length){
    return '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Primero crea una dotación</p><p class="text-sm text-muted">Ve al tab "Dotación por año" para crearla.</p></div>';
  }
  const dot=dotacionEntregaSeleccionada();
  const stats=statsEntregaMasiva(dot?.id);
  let h='';
  h+='<div class="flex justify-between items-start gap-3 mb-4" style="flex-wrap:wrap">';
  h+='<div><h2 style="font-size:18px;margin:0">Entrega dotación anual</h2><p class="text-sm text-muted">Busca al empleado por número o por nombre para entregar su dotación anual.</p></div>';
  h+='<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">';
  h+='<div class="form-group" style="margin:0"><label class="form-label">Dotación</label><select class="form-input" id="entDotSel" style="min-width:220px">';
  lista.slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0)).forEach(d=>{
    h+='<option value="'+esc(d.id)+'"'+(dot&&d.id===dot.id?' selected':'')+'>'+esc(d.nombre||('Dotación '+d.anio))+(d.estado==='activa'?' • ACTIVA':'')+'</option>';
  });
  h+='</select></div>';
  h+='<button class="btn btn-ghost" id="entVerEntregados"><i class="fas fa-list"></i> Ver entregados</button>';
  h+='<button class="btn btn-ghost" id="entVerPendientes"><i class="fas fa-hourglass-half"></i> Ver pendientes</button>';
  h+='</div></div>';
  h+='<div class="grid mb-4" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">';
  [
    ['Completos',stats.entregados],
    ['Parciales',stats.parciales],
    ['Sin entrega',stats.pendientes],
    ['Hoy',stats.hoy]
  ].forEach(([label,value])=>{
    h+='<div class="card" style="margin:0;background:#f8fafc"><div class="card-body" style="padding:12px">';
    h+='<div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700">'+esc(label)+'</div>';
    h+='<div style="font-size:24px;font-weight:800;margin-top:4px">'+esc(String(value))+'</div>';
    h+='</div></div>';
  });
  h+='</div>';
  h+='<div class="card"><div class="card-body">';
  h+='<div class="form-row c2" style="align-items:end">';
  h+='<div class="form-group"><label class="form-label">Buscar empleado por número o nombre</label><input class="form-input" id="entEmpInput" placeholder="Ej. 001 o nombre" autocomplete="off"></div>';
  h+='<div><button class="btn btn-primary" id="entEmpBuscar"><i class="fas fa-search"></i> Buscar</button></div>';
  h+='</div>';
  h+='<div id="entFlujoWrap" class="mt-4">'+renderEntregaFicha()+'</div>';
  h+='</div></div>';
  return h;
}

function bindEntregaMasiva(){
  document.getElementById('entDotSel')?.addEventListener('change',e=>{
    _entregaState.dotacionId=e.target.value;
    resetEntregaEmpleado();
    renderTab('entrega');
  });
  document.getElementById('entEmpBuscar')?.addEventListener('click',()=>{
    const numero=(document.getElementById('entEmpInput')?.value||'').trim();
    buscarEmpleadoEntrega(numero);
  });
  document.getElementById('entEmpInput')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();buscarEmpleadoEntrega((e.target.value||'').trim());}
  });
  document.getElementById('entVerEntregados')?.addEventListener('click',openEntregadosDotacion);
  document.getElementById('entVerPendientes')?.addEventListener('click',openPendientesEntrega);
  bindEntregaFicha();
}

function bindEntregaFicha(){
  const wrap=document.getElementById('entFlujoWrap');
  if(!wrap||!_entregaState.empleado)return;
  wrap.querySelectorAll('.ent-prod-check').forEach(ch=>{
    ch.addEventListener('change',()=>{
      const idx=Number(ch.dataset.idx);
      if(_entregaState.productos[idx])_entregaState.productos[idx].surtido=ch.checked;
      renderEntregaFichaIntoWrap();
    });
  });
  document.getElementById('entTodos')?.addEventListener('click',()=>{
    _entregaState.productos.forEach(p=>{p.surtido=true;});
    renderEntregaFichaIntoWrap();
  });
  document.getElementById('entNinguno')?.addEventListener('click',()=>{
    _entregaState.productos.forEach(p=>{p.surtido=false;});
    renderEntregaFichaIntoWrap();
  });
  document.getElementById('entSigClear')?.addEventListener('click',clearEntregaFirmaCanvas);
  document.getElementById('entConfirmar')?.addEventListener('click',()=>confirmarEntregaMasiva(false));
  initEntregaFirmaCanvas();
}

function renderEntregaFichaIntoWrap(){
  const wrap=document.getElementById('entFlujoWrap');
  if(!wrap)return;
  wrap.innerHTML=renderEntregaFicha();
  bindEntregaFicha();
}

function renderEntregaFicha(){
  const emp=_entregaState.empleado;
  if(!emp){
    return '<div class="empty-state" style="padding:18px"><i class="fas fa-user-check"></i><p>Busca un empleado para preparar su kit.</p></div>';
  }
  const dot=dotacionEntregaSeleccionada();
  const tipo=findTipo(emp.tipo_dotacion);
  const esParcial=!!_entregaState.registroExistente;
  const seleccionados=_entregaState.productos.filter(p=>p.surtido);
  let h='<div class="card" style="background:#f8fafc;margin:0"><div class="card-body">';
  h+='<div class="flex justify-between items-start gap-3" style="flex-wrap:wrap">';
  h+='<div><h3 style="margin:0 0 4px;font-size:17px">#'+esc(emp.id)+' '+esc(nombreEmpleado(emp))+'</h3>';
  h+='<div class="text-sm text-muted">Dotación: <strong>'+esc(dot?.nombre||'—')+'</strong> &nbsp;·&nbsp; Tipo: <strong>'+esc(tipo?.nombre||emp.tipo_dotacion||'—')+'</strong> &nbsp;·&nbsp; Área: <strong>'+esc(emp.area||'—')+'</strong></div></div>';
  h+='<div class="flex gap-2" style="align-items:center">';
  if(esParcial)h+='<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:11px">Entrega complementaria</span>';
  h+='<span class="badge badge-info">'+seleccionados.length+'/'+_entregaState.productos.length+' seleccionados</span>';
  h+='</div></div>';
  h+='<div class="mt-4 flex gap-2" style="flex-wrap:wrap">';
  h+='<button class="btn btn-ghost btn-sm" id="entTodos"><i class="fas fa-check-double"></i> Marcar todos</button>';
  h+='<button class="btn btn-ghost btn-sm" id="entNinguno"><i class="fas fa-times"></i> Desmarcar</button>';
  h+='</div>';
  if(esParcial){
    h+='<div class="mt-2" style="font-size:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:6px 10px;color:#92400e">Mostrando solo prendas pendientes de entrega anterior.</div>';
  }
  h+='<div class="mt-3" style="display:grid;gap:8px">';
  _entregaState.productos.forEach((p,idx)=>{
    const sinStock=p.stock_disp<=0;
    const stockColor=p.stock_disp>=p.cantidad?'#059669':(p.stock_disp>0?'#b45309':'#dc2626');
    const cols=esParcial?'28px 1fr 72px 72px 72px 88px':'28px 1fr 90px 90px';
    h+='<label style="display:grid;grid-template-columns:'+cols+';gap:8px;align-items:center;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px;cursor:'+(sinStock?'default':'pointer')+'">';
    h+='<input type="checkbox" class="ent-prod-check" data-idx="'+idx+'" '+(p.surtido?'checked':'')+(sinStock?' disabled':'')+' >';
    h+='<span><strong>'+esc(p.nombre)+'</strong><div class="text-xs text-muted">Talla: '+esc(p.talla||'Única')+(p.variante_id?' · stock por talla':'')+'</div></span>';
    if(esParcial){
      h+='<span class="text-xs text-muted" style="text-align:right">Asig.<br><strong>'+Number(p.cantidad_asignada||p.cantidad)+'</strong></span>';
      h+='<span class="text-xs" style="text-align:right;color:#6b7280">Entregado<br><strong>'+Number(p.cantidad_entregada||0)+'</strong></span>';
      h+='<span class="text-sm" style="text-align:right">Pend.<br><strong>'+p.cantidad+'</strong></span>';
    }else{
      h+='<span class="text-sm" style="text-align:right">Cant. <strong>'+p.cantidad+'</strong></span>';
    }
    h+='<span class="text-sm" style="text-align:right;color:'+stockColor+'">'+(sinStock?'<span style="font-size:10px;background:#fee2e2;color:#dc2626;padding:2px 5px;border-radius:4px;font-weight:700">Sin stock</span>':'Stock <strong>'+p.stock_disp+'</strong>')+'</span>';
    h+='</label>';
  });
  h+='</div>';
  h+='<div class="signature-panel mt-4" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px">';
  h+='<label class="signature-title" style="font-size:15px;font-weight:600;display:block;margin-bottom:4px"><i class="fas fa-pen-fancy"></i> Firma del empleado</label>';
  h+='<p class="signature-hint" style="font-size:12px;color:#64748b;margin:0 0 8px">Use el dedo o Apple Pencil</p>';
  h+='<div class="signature-canvas-wrap" style="border:2px dashed #cbd5e1;border-radius:8px;background:#fff"><canvas id="entSigCanvas" style="display:block;width:100%;height:200px;cursor:crosshair;touch-action:none"></canvas></div>';
  h+='<div class="mt-2"><button class="btn btn-ghost" id="entSigClear" style="width:100%"><i class="fas fa-eraser"></i> Limpiar firma</button></div>';
  h+='</div>';
  h+='<div class="mt-4"><button class="btn btn-primary" id="entConfirmar" style="width:100%;min-height:48px;font-size:16px"><i class="fas fa-hand-holding"></i> Confirmar entrega'+(esParcial?' (pendientes)':'')+'</button></div>';
  h+='</div></div>';
  return h;
}

function buscarEmpleadoEntrega(numero){
  if(!numero){notify('Escribe un número de empleado','warning');return;}
  const dot=dotacionEntregaSeleccionada();
  if(!dot){notify('Selecciona una dotación válida','warning');return;}
  const emp=(getStore().employees||[]).find(e=>String(e.id||'')===String(numero));
  if(!emp){resetEntregaEmpleado();renderEntregaFichaIntoWrap();notify('Empleado no encontrado','error');return;}
  const activos=empleadosActivos();
  if(!activos.some(e=>String(e.id||'')===String(emp.id||''))){resetEntregaEmpleado();renderEntregaFichaIntoWrap();notify('El empleado no está activo para entrega','warning');return;}
  if(!emp.tipo_dotacion){resetEntregaEmpleado();renderEntregaFichaIntoWrap();notify('El empleado no tiene tipo de dotación asignado','warning');return;}
  if(entregaExistente(dot.id,emp.id)){resetEntregaEmpleado();renderEntregaFichaIntoWrap();notify('Dotación entregada completa.','warning');return;}
  const captura=tallasDeDotacion(dot.id).find(t=>String(t.empleado_id)===String(emp.id));
  if(!captura){resetEntregaEmpleado();renderEntregaFichaIntoWrap();notify('El empleado no tiene tallas capturadas para esta dotación','warning');return;}
  const kit=findKit(emp.tipo_dotacion,dot.anio);
  if(!kit||!Array.isArray(kit.items)||!kit.items.length){resetEntregaEmpleado();renderEntregaFichaIntoWrap();notify('No hay kit configurado para el tipo del empleado en este año','warning');return;}
  const registroParcial=getRegistroParcial(dot.id,emp.id);
  let armado;
  if(registroParcial){
    armado=armarKitEntregaPendientes(kit,captura,registroParcial);
  }else{
    armado=armarKitEntrega(kit,captura);
  }
  if(!armado.ok){resetEntregaEmpleado();renderEntregaFichaIntoWrap();notify(armado.error,'warning');return;}
  _entregaState.empleado=emp;
  _entregaState.captura=captura;
  _entregaState.productos=armado.productos;
  _entregaState.registroExistente=registroParcial||null;
  _entregaState.signatureHasInk=false;
  renderEntregaFichaIntoWrap();
}

function resetEntregaEmpleado(){
  _entregaState.empleado=null;
  _entregaState.captura=null;
  _entregaState.productos=[];
  _entregaState.registroExistente=null;
  _entregaState.signatureCanvas=null;
  _entregaState.signatureCtx=null;
  _entregaState.signatureHasInk=false;
}

function armarKitEntrega(kit,captura){
  const productos=getProductos();
  const out=[];
  for(const item of (kit.items||[])){
    const prod=productos.find(p=>p.id===item.producto_id);
    if(!prod)return{ok:false,error:'Producto no encontrado en inventario: '+(item.nombre||item.producto_id)};
    const sinTalla=esProductoSinTalla(prod,item);
    const talla=sinTalla?'Única':normalizarTallaConcentrado(captura.tallas?.[item.producto_id]);
    if(!talla)return{ok:false,error:'Falta talla capturada para '+(item.nombre||prod.nombre||'producto')};
    const stock=resolverStockEntrega(prod,talla);
    out.push({
      producto_id:item.producto_id,
      variante_id:stock.variante_id,
      nombre:item.nombre||prod.nombre||'Producto',
      talla,
      cantidad:Math.max(1,Number(item.cantidad)||1),
      stock_disp:stock.stock,
      surtido:true
    });
  }
  return{ok:true,productos:out};
}

function resolverStockEntrega(producto,talla){
  const variantes=Array.isArray(producto?.variantes)?producto.variantes:[];
  if(variantes.length){
    const v=variantes.find(x=>tallaKey(x.talla)===tallaKey(talla)||tallaKey(x.nombre)===tallaKey(talla));
    if(v)return{stock:getStockDisponible(producto.id,v.id),variante_id:v.id};
    return{stock:0,variante_id:null};
  }
  return{stock:producto?getStockDisponible(producto.id,null):0,variante_id:null};
}

function validarStockEntrega(lineas){
  const acc=new Map();
  lineas.forEach(l=>{
    const key=l.producto_id+'__'+(l.variante_id||'general');
    if(!acc.has(key))acc.set(key,{...l,cantidad:0});
    acc.get(key).cantidad+=l.cantidad;
  });
  const faltantes=[];
  acc.forEach(l=>{
    const stock=getStockDisponible(l.producto_id,l.variante_id||l.talla||null);
    if(stock<l.cantidad)faltantes.push({...l,stock_disp:stock,faltante:l.cantidad-stock});
  });
  return faltantes;
}

function getLineasEntregaSeleccionadas(parcial){
  const disponibles=new Map();
  return _entregaState.productos.filter(p=>p.surtido).map(p=>{
    if(!parcial)return{...p};
    const key=p.producto_id+'__'+(p.variante_id||'general');
    if(!disponibles.has(key))disponibles.set(key,Math.max(0,p.stock_disp));
    const disp=disponibles.get(key);
    const cantidad=Math.min(p.cantidad,disp);
    disponibles.set(key,Math.max(0,disp-cantidad));
    return{...p,cantidad};
  }).filter(p=>p.cantidad>0);
}

async function confirmarEntregaMasiva(parcial){
  const emp=_entregaState.empleado;
  const dot=dotacionEntregaSeleccionada();
  if(!emp||!dot){notify('Busca un empleado primero','warning');return;}
  if(!_entregaState.signatureHasInk){notify('Firma obligatoria.','warning');return;}
  const lineas=getLineasEntregaSeleccionadas(Boolean(parcial));
  if(!lineas.length){notify('No hay prendas seleccionadas para entregar.','warning');return;}
  const faltantes=validarStockEntrega(lineas);
  if(faltantes.length&&!parcial){openStockInsuficiente(faltantes);return;}
  const firma=getEntregaFirmaJPEG();
  if(!firma){notify('No se pudo capturar la firma','error');return;}
  const entregaNuevaId='ent-nueva-'+Date.now();
  const firmaEvidence=await saveEvidence({
    base64:firma,
    tipo:'firma',
    entidad:'dotacion-entrega',
    entidadId:entregaNuevaId,
    filename:'firma-entrega.jpg'
  });
  const res=registrarEntregaNueva({
    id:entregaNuevaId,
    empleado_id:emp.id,
    empleado_nombre:nombreEmpleado(emp),
    area:emp.area||'',
    motivo:'Dotación anual '+(dot.anio||''),
    autorizado_por:'',
    firma:firmaEvidence,
    firma_empleado:firmaEvidence,
    firma_recibe:firmaEvidence,
    quien_recibe:nombreEmpleado(emp),
    tipo_entrega:'personal',
    lineas:lineas.map(l=>({producto_id:l.producto_id,variante_id:l.variante_id||null,cantidad:l.cantidad,observaciones:'Dotación '+(dot.nombre||dot.anio)+' · talla '+l.talla})),
    observaciones:'Entrega masiva dotación '+(dot.nombre||dot.anio)
  });
  if(!res.ok){notify(res.error||'No se pudo registrar la entrega','error');return;}
  const now=new Date();
  const registroExistente=_entregaState.registroExistente;
  if(registroExistente){
    // Actualizar registro parcial existente
    lineas.forEach(l=>{
      const prod=(registroExistente.productos||[]).find(p=>p.producto_id===l.producto_id&&(p.talla||'Única')===(l.talla||'Única'));
      if(prod){
        if(prod.cantidad_entregada===undefined)prod.cantidad_entregada=Number(prod.surtido||0);
        if(prod.cantidad_asignada===undefined)prod.cantidad_asignada=Number(prod.cantidad||0);
        prod.cantidad_entregada+=l.cantidad;
        prod.surtido=prod.cantidad_entregada;
      }
    });
    // Recalcular pendientes
    registroExistente.pendientes=(registroExistente.productos||[]).filter(p=>{
      const asig=Number(p.cantidad_asignada||p.cantidad||0);
      const ent=Number(p.cantidad_entregada||p.surtido||0);
      return asig-ent>0;
    }).map(p=>{
      const asig=Number(p.cantidad_asignada||p.cantidad||0);
      const ent=Number(p.cantidad_entregada||p.surtido||0);
      return{producto_id:p.producto_id,nombre:p.nombre,talla:p.talla||'Única',cantidad:asig-ent,cantidad_pendiente:asig-ent};
    });
    registroExistente.estado=registroExistente.pendientes.length?'parcial':'entregada';
    registroExistente.fecha_ultima_entrega=today();
    if(!Array.isArray(registroExistente.eventos))registroExistente.eventos=[];
    registroExistente.eventos.push({
      fecha:today(),
      hora:now.toTimeString().slice(0,5),
      usuario:getEntregaUsuario(),
      entrega_nueva_id:entregaNuevaId,
      firma_evidence:firmaEvidence,
      lineas:lineas.map(l=>({producto_id:l.producto_id,nombre:l.nombre,talla:l.talla,cantidad:l.cantidad}))
    });
    saveDotacionEntregas();
    log('DOTACION_ENTREGA','Empleado #'+emp.id+' complementaria · '+(registroExistente.pendientes.length?'parcial':'completa'),'DOTACION');
    notify('Entrega complementaria registrada para #'+emp.id,'success');
  }else{
    // Crear registro nuevo
    const productos=_entregaState.productos.map(p=>{
      const delivered=lineas.find(l=>l.producto_id===p.producto_id&&String(l.variante_id||'')===String(p.variante_id||''));
      const cantEnt=Number(delivered?.cantidad||0);
      return{producto_id:p.producto_id,nombre:p.nombre,talla:p.talla,cantidad:p.cantidad,surtido:cantEnt,cantidad_asignada:p.cantidad,cantidad_entregada:cantEnt};
    });
    const pendientes=productos.filter(p=>p.cantidad_entregada<p.cantidad_asignada).map(p=>({
      producto_id:p.producto_id,nombre:p.nombre,talla:p.talla||'Única',
      cantidad:p.cantidad_asignada-p.cantidad_entregada,
      cantidad_pendiente:p.cantidad_asignada-p.cantidad_entregada
    }));
    const estado=pendientes.length?'parcial':'entregada';
    getDotacionEntregas().push({
      id:'dot-emp-'+dot.id+'-'+emp.id,
      dotacion_id:dot.id,
      dotacion_anio:dot.anio,
      empleado_id:emp.id,
      empleado_nombre:nombreEmpleado(emp),
      area:emp.area||'',
      tipo_dotacion:emp.tipo_dotacion,
      estado,
      productos,
      pendientes,
      eventos:[{
        fecha:today(),
        hora:now.toTimeString().slice(0,5),
        usuario:getEntregaUsuario(),
        entrega_nueva_id:entregaNuevaId,
        firma_evidence:firmaEvidence,
        lineas:lineas.map(l=>({producto_id:l.producto_id,nombre:l.nombre,talla:l.talla,cantidad:l.cantidad}))
      }],
      firma:firmaEvidence,
      fecha:today(),
      hora:now.toTimeString().slice(0,5),
      entregado_por:getEntregaUsuario(),
      fecha_primera_entrega:today(),
      fecha_ultima_entrega:today()
    });
    saveDotacionEntregas();
    log('DOTACION_ENTREGA','Empleado #'+emp.id+' · '+productos.length+' producto(s) · '+(pendientes.length?'parcial':'completa'),'DOTACION');
    notify('Entrega registrada'+(pendientes.length?' parcialmente':'')+' para #'+emp.id,'success');
  }
  resetEntregaEmpleado();
  renderTab('entrega');
}

function openStockInsuficiente(faltantes){
  let h='<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px 12px;color:#9a3412;font-size:13px;margin-bottom:12px"><strong>Stock insuficiente</strong><br>Revisa los productos con faltante antes de confirmar.</div>';
  h+='<table class="dt"><thead><tr><th>Producto</th><th>Talla</th><th>Solicitado</th><th>Stock</th></tr></thead><tbody>';
  faltantes.forEach(f=>{
    h+='<tr><td>'+esc(f.nombre)+'</td><td>'+esc(f.talla||'Única')+'</td><td style="text-align:right">'+f.cantidad+'</td><td style="text-align:right;color:#dc2626">'+f.stock_disp+'</td></tr>';
  });
  h+='</tbody></table>';
  modal.open('Stock insuficiente',h,'<button class="btn btn-ghost" id="entStockCancel">Cancelar</button><button class="btn btn-primary" id="entStockParcial">Entrega parcial</button>','md');
  document.getElementById('entStockCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('entStockParcial')?.addEventListener('click',()=>{modal.close();confirmarEntregaMasiva(true);});
}

function entregaExistente(dotacionId,empleadoId){
  const r=getDotacionEntregas().find(e=>e.dotacion_id===dotacionId&&String(e.empleado_id)===String(empleadoId)&&e.estado!=='cancelada');
  if(!r)return false;
  if((r.estado==='entregada'||r.estado==='completa')&&(!r.pendientes||!r.pendientes.length))return true;
  return false;
}

function getRegistroParcial(dotacionId,empleadoId){
  const r=getDotacionEntregas().find(e=>e.dotacion_id===dotacionId&&String(e.empleado_id)===String(empleadoId)&&e.estado!=='cancelada');
  if(!r)return null;
  if((r.estado==='entregada'||r.estado==='completa')&&(!r.pendientes||!r.pendientes.length))return null;
  if(r.estado==='parcial'||(r.pendientes&&r.pendientes.length>0))return r;
  return null;
}

function armarKitEntregaPendientes(kit,captura,registro){
  const productos=getProductos();
  const out=[];
  const pendientes=registro.pendientes||[];
  for(const pend of pendientes){
    const candPend=Number(pend.cantidad||pend.cantidad_pendiente||0);
    if(candPend<=0)continue;
    const prod=productos.find(p=>p.id===pend.producto_id);
    if(!prod)return{ok:false,error:'Producto pendiente no encontrado en inventario: '+(pend.nombre||pend.producto_id)};
    const talla=pend.talla||'Única';
    const stock=resolverStockEntrega(prod,talla);
    const prodBase=(registro.productos||[]).find(p=>p.producto_id===pend.producto_id&&(p.talla||'Única')===(pend.talla||'Única'));
    const cantAsignada=Number(prodBase?.cantidad_asignada||prodBase?.cantidad||candPend);
    const cantEntregada=Number(prodBase?.cantidad_entregada||prodBase?.surtido||0);
    out.push({
      producto_id:pend.producto_id,
      variante_id:stock.variante_id,
      nombre:pend.nombre||prod.nombre||'Producto',
      talla,
      cantidad:candPend,
      cantidad_asignada:cantAsignada,
      cantidad_entregada:cantEntregada,
      stock_disp:stock.stock,
      surtido:stock.stock>0,
      es_pendiente:true
    });
  }
  if(!out.length)return{ok:false,error:'No hay prendas pendientes para este empleado.'};
  return{ok:true,productos:out};
}

function statsEntregaMasiva(dotacionId){
  const total=empleadosActivos().length;
  const entregas=getDotacionEntregas().filter(e=>e.dotacion_id===dotacionId&&e.estado!=='cancelada');
  const completos=new Set(entregas.filter(e=>(e.estado==='entregada'||e.estado==='completa')&&(!e.pendientes||!e.pendientes.length)).map(e=>String(e.empleado_id)));
  const parciales=new Set(entregas.filter(e=>e.estado==='parcial'||(e.pendientes&&e.pendientes.length>0)).map(e=>String(e.empleado_id)));
  const hoy=today();
  const hoySet=new Set(entregas.filter(e=>e.fecha===hoy||(Array.isArray(e.eventos)&&e.eventos.some(ev=>ev.fecha===hoy))).map(e=>String(e.empleado_id)));
  return{entregados:completos.size,parciales:parciales.size,total,pendientes:Math.max(0,total-completos.size-parciales.size),hoy:hoySet.size};
}

function openEntregadosDotacion(){
  const dot=dotacionEntregaSeleccionada();
  if(!dot)return;
  const entregas=getDotacionEntregas().filter(e=>e.dotacion_id===dot.id&&e.estado!=='cancelada').slice().sort((a,b)=>String(a.empleado_id).localeCompare(String(b.empleado_id),undefined,{numeric:true}));
  let h='';
  if(!entregas.length)h='<div class="empty-state" style="padding:18px"><i class="fas fa-inbox"></i><p>Sin entregas registradas</p></div>';
  else{
    h='<table class="dt"><thead><tr><th>#</th><th>Empleado</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>';
    entregas.forEach(e=>{
      h+='<tr><td class="font-mono text-xs">'+esc(e.empleado_id)+'</td><td>'+esc(e.empleado_nombre||'')+'</td><td>'+esc((e.fecha||'')+' '+(e.hora||''))+'</td><td>'+esc(e.estado||'entregada')+'</td><td><button class="btn btn-ghost btn-sm ent-det" data-id="'+esc(e.id)+'"><i class="fas fa-eye"></i> Detalle</button></td></tr>';
    });
    h+='</tbody></table>';
  }
  modal.open('Entregados — '+esc(dot.nombre||dot.anio),h,'<button class="btn btn-ghost" id="entListaCerrar">Cerrar</button>','lg');
  document.getElementById('entListaCerrar')?.addEventListener('click',()=>modal.close());
  document.querySelectorAll('.ent-det').forEach(btn=>btn.addEventListener('click',()=>openDetalleDotacionEntrega(btn.dataset.id)));
}

function openDetalleDotacionEntrega(id){
  const ent=getDotacionEntregas().find(e=>e.id===id);
  if(!ent)return;
  let h='<div style="display:grid;gap:6px;font-size:13px">';
  h+='<div><strong>Empleado:</strong> #'+esc(ent.empleado_id)+' '+esc(ent.empleado_nombre||'')+'</div>';
  h+='<div><strong>Primera entrega:</strong> '+esc(ent.fecha_primera_entrega||ent.fecha||'—')+'</div>';
  if(ent.fecha_ultima_entrega&&ent.fecha_ultima_entrega!==ent.fecha_primera_entrega){
    h+='<div><strong>Última entrega:</strong> '+esc(ent.fecha_ultima_entrega)+'</div>';
  }
  h+='<div><strong>Estado:</strong> '+esc(ent.estado||'entregada')+'</div>';
  h+='</div>';
  h+='<table class="dt mt-3"><thead><tr><th>Producto</th><th>Talla</th><th>Asignado</th><th>Entregado</th></tr></thead><tbody>';
  (ent.productos||[]).forEach(p=>{
    const asig=Number(p.cantidad_asignada||p.cantidad||0);
    const ent2=Number(p.cantidad_entregada||p.surtido||0);
    const pend=Math.max(0,asig-ent2);
    h+='<tr><td>'+esc(p.nombre||'')+'</td><td>'+esc(p.talla||'Única')+'</td><td style="text-align:right">'+asig+'</td><td style="text-align:right;color:'+(pend>0?'#b45309':'#059669')+'">'+ent2+(pend>0?' <small>(pend. '+pend+')</small>':'')+'</td></tr>';
  });
  h+='</tbody></table>';
  if(Array.isArray(ent.eventos)&&ent.eventos.length>1){
    h+='<div class="mt-3"><strong>Eventos ('+ent.eventos.length+'):</strong></div>';
    h+='<div style="display:grid;gap:4px;margin-top:6px">';
    ent.eventos.forEach((ev,i)=>{
      h+='<div style="font-size:12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px">';
      h+='<strong>Entrega '+(i+1)+'</strong> · '+esc(ev.fecha||'')+(ev.hora?' '+esc(ev.hora):'');
      if(Array.isArray(ev.lineas)&&ev.lineas.length){
        h+=' · '+ev.lineas.map(l=>esc(l.nombre||l.producto_id)+(l.talla?' T:'+l.talla:'')+' x'+l.cantidad).join(', ');
      }
      h+='</div>';
    });
    h+='</div>';
  }
  const firmaSrc=getEvidenceSrc(ent.firma);
  if(firmaSrc)h+='<div class="mt-3"><strong>Firma:</strong><br><img class="evidence-thumb" src="'+esc(firmaSrc)+'" style="max-width:260px;border:1px solid #e5e7eb;border-radius:6px;background:#fff"></div>';
  else h+='<div class="mt-3"><strong>Firma:</strong> <span class="empty-signature">Sin firma registrada</span></div>';
  modal.open('Detalle entrega dotación',h,'<button class="btn btn-ghost" id="entDetCerrar">Cerrar</button>','lg');
  document.getElementById('entDetCerrar')?.addEventListener('click',()=>modal.close());
}

function openPendientesEntrega(){
  const dot=dotacionEntregaSeleccionada();
  if(!dot)return;
  const entregas=getDotacionEntregas().filter(e=>e.dotacion_id===dot.id&&e.estado!=='cancelada');
  const completos=new Set(entregas.filter(e=>(e.estado==='entregada'||e.estado==='completa')&&(!e.pendientes||!e.pendientes.length)).map(e=>String(e.empleado_id)));
  const parciales=new Set(entregas.filter(e=>e.estado==='parcial'||(e.pendientes&&e.pendientes.length>0)).map(e=>String(e.empleado_id)));
  const pendientes=empleadosActivos().filter(e=>!completos.has(String(e.id))).sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
  let h='';
  if(!pendientes.length)h='<div class="empty-state" style="padding:18px"><i class="fas fa-check-circle"></i><p>Sin pendientes</p></div>';
  else{
    h='<table class="dt"><thead><tr><th>#</th><th>Empleado</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>';
    pendientes.forEach(emp=>{
      const tipo=findTipo(emp.tipo_dotacion);
      const esParcial=parciales.has(String(emp.id));
      const estadoBadge=esParcial?'<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:700">Parcial</span>':'<span style="font-size:10px;background:#f1f5f9;color:#64748b;padding:2px 6px;border-radius:4px">Sin entrega</span>';
      h+='<tr><td class="font-mono text-xs">'+esc(emp.id)+'</td><td>'+esc(nombreEmpleado(emp))+'</td><td>'+esc(tipo?.nombre||emp.tipo_dotacion||'Sin tipo')+'</td><td>'+estadoBadge+'</td><td><button class="btn btn-ghost btn-sm ent-pend-go" data-id="'+esc(emp.id)+'"><i class="fas fa-hand-holding"></i> Entregar</button></td></tr>';
    });
    h+='</tbody></table>';
  }
  modal.open('Pendientes — '+esc(dot.nombre||dot.anio),h,'<button class="btn btn-ghost" id="entPendCerrar">Cerrar</button>','lg');
  document.getElementById('entPendCerrar')?.addEventListener('click',()=>modal.close());
  document.querySelectorAll('.ent-pend-go').forEach(btn=>btn.addEventListener('click',()=>{
    modal.close();
    const inp=document.getElementById('entEmpInput');if(inp)inp.value=btn.dataset.id;
    buscarEmpleadoEntrega(btn.dataset.id);
  }));
}

function initEntregaFirmaCanvas(){
  const c=document.getElementById('entSigCanvas');
  if(!c)return;
  c.width=400;
  c.height=200;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle='#0f172a';
  ctx.lineWidth=2;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  _entregaState.signatureCanvas=c;
  _entregaState.signatureCtx=ctx;
  _entregaState.signatureDrawing=false;
  _entregaState.signatureHasInk=false;
  function toCanvas(cx,cy){
    const r=c.getBoundingClientRect();
    return{x:(cx-r.left)*(c.width/r.width),y:(cy-r.top)*(c.height/r.height)};
  }
  function down(e){_entregaState.signatureDrawing=true;const p=toCanvas(e.clientX,e.clientY);_entregaState.signatureLastX=p.x;_entregaState.signatureLastY=p.y;}
  function move(e){
    if(!_entregaState.signatureDrawing)return;
    const p=toCanvas(e.clientX,e.clientY);
    ctx.beginPath();
    ctx.moveTo(_entregaState.signatureLastX,_entregaState.signatureLastY);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
    _entregaState.signatureLastX=p.x;_entregaState.signatureLastY=p.y;
    _entregaState.signatureHasInk=true;
  }
  function up(){_entregaState.signatureDrawing=false;}
  c.addEventListener('mousedown',down);
  c.addEventListener('mousemove',move);
  c.addEventListener('mouseup',up);
  c.addEventListener('mouseleave',up);
  c.addEventListener('touchstart',e=>{e.preventDefault();if(!e.touches[0])return;const t=e.touches[0];down({clientX:t.clientX,clientY:t.clientY});},{passive:false});
  c.addEventListener('touchmove',e=>{e.preventDefault();if(!e.touches[0])return;const t=e.touches[0];move({clientX:t.clientX,clientY:t.clientY});},{passive:false});
  c.addEventListener('touchend',e=>{e.preventDefault();up();},{passive:false});
}

function clearEntregaFirmaCanvas(){
  const c=_entregaState.signatureCanvas;
  const ctx=_entregaState.signatureCtx;
  if(!c||!ctx)return;
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,c.width,c.height);
  _entregaState.signatureHasInk=false;
}

function getEntregaFirmaJPEG(){
  const c=_entregaState.signatureCanvas;
  if(!c)return null;
  return c.toDataURL('image/jpeg',0.5);
}

function nombreEmpleado(emp){
  return[emp?.nombre||'',emp?.paterno||'',emp?.materno||''].join(' ').replace(/\s+/g,' ').trim();
}

function getEntregaUsuario(){
  try{const u=JSON.parse(localStorage.getItem('_user')||'{}');return u.name||u.id||'admin';}catch(e){return'admin';}
}

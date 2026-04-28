import{esc,fmtMoney}from'./utils.js';
import{getDotaciones,saveDotaciones,getDotacionTipos,saveDotacionTipos,getDotacionKits,saveDotacionKits,getStore}from'./storage.js';
import{notify,modal,confirm as confirmDialog,buildNav}from'./ui.js';
import{getProductos}from'./almacen-api.js';

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
  wrap.innerHTML='<div class="empty-state"><i class="fas fa-clock"></i><p>Próximamente</p></div>';
}

// ════════════════════════════════════════════════════════════════════════
// TAB DOTACIONES (sin cambios funcionales)
// ════════════════════════════════════════════════════════════════════════
function renderDotaciones(){
  const list=dotaciones().slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0));
  let h='<div class="flex justify-between items-center gap-3 mb-4"><div><h2 style="font-size:18px;margin:0">Dotaciones</h2><p class="text-sm text-muted">Control anual de dotaciones</p></div><button class="btn btn-primary" id="btnNuevaDotacion"><i class="fas fa-plus"></i> Nueva Dotación</button></div>';
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
    return '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Primero crea una dotación</p><p class="text-sm text-muted">Ve al tab "Dotaciones" para crear el año a configurar.</p></div>';
  }
  const sel=getAnioSel();
  let h='';
  // Encabezado
  h+='<div class="flex justify-between items-center gap-3 mb-4" style="flex-wrap:wrap">';
  h+='<div><h2 style="font-size:18px;margin:0">Tipos de Empleado y Kits</h2><p class="text-sm text-muted">Configura las prendas asignadas por tipo y año</p></div>';
  h+='<div class="flex gap-2" style="flex-wrap:wrap;align-items:center">';
  h+='<label class="form-label" style="margin:0">Año:</label>';
  h+='<select class="form-input" id="kitAnioSel" style="width:auto;min-width:110px">';
  lista.forEach(a=>{h+='<option value="'+a+'"'+(a===sel?' selected':'')+'>'+a+'</option>';});
  h+='</select>';
  h+='<button class="btn btn-primary" id="btnNuevoTipo"><i class="fas fa-plus"></i> Crear Tipo</button>';
  h+='<button class="btn btn-ghost" id="btnDuplicarKits"><i class="fas fa-copy"></i> Duplicar kits</button>';
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
  modal.open('Duplicar kits',body,'<button class="btn btn-ghost" id="dupCancel">Cancelar</button><button class="btn btn-primary" id="dupSave">Duplicar</button>','md');
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
  notify('Kits duplicados ('+origenKits.length+')','success');
}

/**
 * devolucion-sku.js — Módulo: Devoluciones de Uniformes (sistema SKU)
 * FASE 3.2: extraído de inventario-sku.js sin modificar lógica interna.
 * Lógica de negocio en sku-api.js — NO duplicar funciones aquí.
 */
import{getStore}from'./storage.js';
import{esc,fmtDate}from'./utils.js';
import{notify,modal}from'./ui.js';
import{getUserRole}from'./user-roles.js';
import{
  registrarDocumentoDevolucion,
  getDocumentosDevolucion,
  getAllSkusResumen,
}from'./sku-api.js';

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────────
export function render(){
  const docs=(getDocumentosDevolucion()||[]).slice().sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora));
  const hoy=new Date().toISOString().slice(0,10);
  const docHoy=docs.filter(d=>d.fecha_hora.startsWith(hoy));
  const totalPzs=docs.reduce((t,d)=>(d.lineas||[]).reduce((s,l)=>s+l.cantidad,t),0);

  let h='<div class="page-head"><div class="page-title"><h1>Devoluciones</h1><p>Devolución de uniformes al almacén · Sistema SKU</p></div>';
  h+='<div style="display:flex;gap:8px">';
  h+='<button class="btn btn-success" id="dvBtnNueva"><i class="fas fa-undo mr-1"></i>Nueva Devolución</button>';
  h+='</div></div>';

  // KPIs
  h+='<div class="kpi-grid">';
  h+='<div class="kpi"><div class="kpi-label">Total devoluciones</div><div class="kpi-value">'+docs.length+'</div></div>';
  h+='<div class="kpi success"><div class="kpi-label">Hoy</div><div class="kpi-value">'+docHoy.length+'</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Piezas devueltas</div><div class="kpi-value">'+totalPzs+'</div></div>';
  h+='</div>';

  // Filtros
  const areas=[...new Set((getStore().employees||[]).map(e=>e.area).filter(Boolean))].sort();
  h+='<div class="card mb-4"><div class="card-body"><div class="form-row c4">';
  h+='<div><label class="form-label">Empleado</label><input class="form-input" id="dvFEmp" placeholder="Buscar nombre..."></div>';
  h+='<div><label class="form-label">Área</label><select class="form-select" id="dvFArea"><option value="">Todas</option>'+areas.map(a=>'<option>'+esc(a)+'</option>').join('')+'</select></div>';
  h+='<div><label class="form-label">Desde</label><input class="form-input" type="date" id="dvFDesde"></div>';
  h+='<div><label class="form-label">Hasta</label><input class="form-input" type="date" id="dvFHasta"></div>';
  h+='</div></div></div>';

  // Tabla
  h+='<div class="card"><div class="card-head"><h3>Historial de devoluciones</h3><span class="text-sm text-muted" id="dvCount">'+docs.length+' documentos</span></div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr>';
  h+='<th>Número</th><th>Empleado</th><th>Área</th><th style="text-align:right">Arts.</th><th style="text-align:right">Piezas</th><th>Fecha</th><th style="text-align:center">Acciones</th>';
  h+='</tr></thead><tbody id="dvTB"></tbody></table></div></div>';
  return h;
}

// ─── MODAL: NUEVA DEVOLUCIÓN ──────────────────────────────────────────────────
// Movida desde inventario-sku.js — lógica interna SIN modificar.
function openNuevaDevolucion(){
  const skusAll=getAllSkusResumen();
  const emps=(getStore().employees||[]).filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
  let empSel={id:'',nombre:'',area:''};
  let lineas=[];

  function buildLineasHTML(){
    if(!lineas.length)return'<p class="text-xs text-muted" style="text-align:center;padding:12px 0">Sin artículos</p>';
    return lineas.map((l,i)=>
      '<div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border)">'
      +'<code style="font-size:12px;font-weight:800;color:#059669;min-width:110px">'+esc(l.sku_codigo)+'</code>'
      +'<span class="text-xs text-muted" style="flex:1">'+esc(l.sku_nombre)+' T'+esc(l.sku_talla)+'</span>'
      +'<button class="btn btn-ghost dv-minus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">−</button>'
      +'<span style="min-width:24px;text-align:center;font-weight:900;font-size:16px">'+l.cantidad+'</span>'
      +'<button class="btn btn-ghost dv-plus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">+</button>'
      +'<button class="btn btn-ghost dv-del" data-idx="'+i+'" style="color:#dc2626;padding:2px 6px"><i class="fas fa-times"></i></button>'
      +'</div>'
    ).join('');
  }
  function redrawLineas(){const el=document.getElementById('dvLineas');if(el){el.innerHTML=buildLineasHTML();attachLineasEvents();}}
  function attachLineasEvents(){
    document.querySelectorAll('.dv-minus').forEach(btn=>btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.idx,10);if(lineas[i]&&lineas[i].cantidad>1){lineas[i].cantidad--;redrawLineas();}}));
    document.querySelectorAll('.dv-plus').forEach(btn=>btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.idx,10);if(lineas[i]){lineas[i].cantidad++;redrawLineas();}}));
    document.querySelectorAll('.dv-del').forEach(btn=>btn.addEventListener('click',()=>{lineas.splice(parseInt(btn.dataset.idx,10),1);redrawLineas();}));
  }

  let h='<div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#065f46"><i class="fas fa-info-circle mr-2"></i>El empleado devuelve prendas al almacén. El stock de cada SKU <strong>aumenta</strong>.</div>';
  h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Empleado *</label>';
  h+='<input class="form-input" id="dvEmpQ" list="dvEmpL" placeholder="Nombre del empleado..." autocomplete="off">';
  h+='<datalist id="dvEmpL">'+emps.map(e=>'<option value="'+esc(e.nombre)+'">').join('')+'</datalist>';
  h+='<div id="dvEmpInfo" class="text-xs text-muted mt-1"></div></div>';
  h+='<div class="form-group"><label class="form-label">Área</label><input class="form-input" id="dvArea" value="" readonly></div></div>';
  h+='<div class="form-group mb-2"><label class="form-label">Agregar artículo devuelto</label>';
  h+='<div style="display:flex;gap:8px"><input class="form-input" id="dvSkuQ" list="dvSkuL" placeholder="Código SKU..." autocomplete="off" style="flex:1">';
  h+='<datalist id="dvSkuL">'+skusAll.map(s=>'<option value="'+esc(s.codigo)+'">'+esc(s.nombre)+' T'+esc(s.talla)+'</option>').join('')+'</datalist>';
  h+='<button class="btn btn-ghost" id="dvAgregar"><i class="fas fa-plus"></i></button></div></div>';
  h+='<div id="dvLineas" style="min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:12px"><p class="text-xs text-muted" style="text-align:center;padding:12px 0">Sin artículos</p></div>';
  h+='<div class="form-group"><label class="form-label">Observaciones</label><input class="form-input" id="dvObs" placeholder="Motivo de devolución..."></div>';

  modal.open('Devolución de Uniformes',h,'<button class="btn btn-ghost" id="dvCancel">Cancelar</button><button class="btn btn-success" id="dvGuardar"><i class="fas fa-undo mr-1"></i>Registrar Devolución</button>','lg');
  attachLineasEvents();

  document.getElementById('dvCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('dvEmpQ')?.addEventListener('input',function(){
    const q=(this.value||'').toLowerCase().trim();
    const emp=emps.find(e=>(e.nombre||'').toLowerCase()===q||(e.nombre||'').toLowerCase().startsWith(q));
    const info=document.getElementById('dvEmpInfo');const area=document.getElementById('dvArea');
    if(emp){empSel={id:emp.id||emp.numero||'',nombre:emp.nombre,area:emp.area||''};if(area)area.value=emp.area||'';if(info)info.textContent='#'+(emp.numero||'')+' · '+(emp.area||'');}
    else{empSel={id:'',nombre:this.value,area:''};if(area)area.value='';if(info)info.textContent='';}
  });
  document.getElementById('dvAgregar')?.addEventListener('click',()=>{
    const q=(document.getElementById('dvSkuQ')?.value||'').trim();
    if(!q){notify('Escribe un código SKU','warning');return;}
    const sku=skusAll.find(s=>s.codigo===q||s.codigo.toLowerCase()===q.toLowerCase());
    if(!sku){notify('SKU no encontrado: '+q,'warning');return;}
    const ya=lineas.find(l=>l.sku_id===sku.id);
    if(ya){ya.cantidad++;redrawLineas();}
    else lineas.push({sku_id:sku.id,sku_codigo:sku.codigo,sku_nombre:sku.nombre,sku_talla:sku.talla,cantidad:1});
    redrawLineas();
    const inp=document.getElementById('dvSkuQ');if(inp)inp.value='';
  });
  document.getElementById('dvGuardar')?.addEventListener('click',()=>{
    if(!empSel.nombre.trim()){notify('El empleado es obligatorio','warning');return;}
    if(!lineas.length){notify('Agrega al menos un artículo','warning');return;}
    const obs=document.getElementById('dvObs')?.value||'';
    const res=registrarDocumentoDevolucion({empleado_id:empSel.id,empleado_nombre:empSel.nombre,area:empSel.area,observaciones:obs,lineas:lineas.map(l=>({sku_id:l.sku_id,cantidad:l.cantidad}))});
    if(!res.ok){notify(res.error||'Error','error');return;}
    notify('Devolución '+res.documento.numero+' registrada — '+lineas.length+' artículo(s)','success');
    modal.close();
    const main=document.getElementById('mainContent');if(main){main.innerHTML=render();init();}
  });
}

// ─── MODAL: DETALLE DE DEVOLUCIÓN ─────────────────────────────────────────────
function openDetalleDevolucion(docId){
  const doc=(getStore().documentosDevolucion||[]).find(d=>d.id===docId);if(!doc)return;
  const skuMap={};(getStore().skus||[]).forEach(s=>{skuMap[s.id]=s;});
  const artMap={};(getStore().articulos||[]).forEach(a=>{artMap[a.id]=a;});
  let h='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px">';
  h+='<div class="form-row c2"><div><p class="text-xs text-muted">Número</p><code style="font-size:18px;font-weight:900;color:#059669">'+esc(doc.numero)+'</code></div>';
  h+='<div><p class="text-xs text-muted">Fecha</p><p class="font-bold">'+fmtDate((doc.fecha_hora||'').slice(0,10))+'</p></div></div>';
  h+='<div class="form-row c2 mt-2"><div><p class="text-xs text-muted">Empleado</p><p class="font-bold">'+esc(doc.empleado_nombre||'—')+'</p></div>';
  h+='<div><p class="text-xs text-muted">Área</p><p class="font-bold">'+esc(doc.area||'—')+'</p></div></div>';
  if(doc.observaciones)h+='<p class="text-xs text-muted mt-2">Obs: '+esc(doc.observaciones)+'</p>';
  h+='</div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr><th>SKU</th><th>Artículo</th><th>Talla</th><th style="text-align:right">Cant. devuelta</th></tr></thead><tbody>';
  (doc.lineas||[]).forEach(l=>{
    const s=skuMap[l.sku_id];const a=s?artMap[s.articulo_id]:null;
    h+='<tr><td><code style="font-weight:800;color:#059669">'+esc(s?.codigo||'?')+'</code></td>';
    h+='<td class="text-sm">'+esc(a?.nombre||'—')+'</td>';
    h+='<td class="text-sm">'+esc(a?.talla||'UNI')+'</td>';
    h+='<td style="text-align:right;font-weight:700;color:#059669">+'+l.cantidad+'</td></tr>';
  });
  h+='</tbody></table></div>';
  modal.open('Devolución — '+doc.numero,h,'<button class="btn btn-ghost" id="mClose">Cerrar</button>','md');
  document.getElementById('mClose')?.addEventListener('click',()=>modal.close());
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
export function init(){
  document.getElementById('dvBtnNueva')?.addEventListener('click',openNuevaDevolucion);
  document.getElementById('mainContent')?.addEventListener('click',e=>{
    const det=e.target.closest('.dv-det');if(det){openDetalleDevolucion(det.dataset.id);}
  });
}

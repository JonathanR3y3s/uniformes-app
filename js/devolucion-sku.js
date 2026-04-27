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

// ─── RENDER TABLA (con filtros) ───────────────────────────────────────────────
function renderTabla(){
  const tb=document.getElementById('dvTB');if(!tb)return;
  const fEmp=(document.getElementById('dvFEmp')?.value||'').toLowerCase().trim();
  const fArea=document.getElementById('dvFArea')?.value||'';
  const fDesde=document.getElementById('dvFDesde')?.value||'';
  const fHasta=document.getElementById('dvFHasta')?.value||'';

  let docs=(getDocumentosDevolucion()||[]).slice().sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora));
  if(fEmp)docs=docs.filter(d=>(d.empleado_nombre||'').toLowerCase().includes(fEmp));
  if(fArea)docs=docs.filter(d=>(d.area||'')===fArea);
  if(fDesde)docs=docs.filter(d=>d.fecha_hora.slice(0,10)>=fDesde);
  if(fHasta)docs=docs.filter(d=>d.fecha_hora.slice(0,10)<=fHasta);

  const cnt=document.getElementById('dvCount');if(cnt)cnt.textContent=docs.length+' documentos';

  if(!docs.length){
    tb.innerHTML='<tr><td colspan="7" class="empty-state" style="padding:24px"><i class="fas fa-undo"></i><p>Sin devoluciones con estos filtros</p></td></tr>';
    return;
  }
  tb.innerHTML=docs.map(d=>{
    const pzas=(d.lineas||[]).reduce((t,l)=>t+l.cantidad,0);
    return'<tr>'
      +'<td><code style="font-weight:800;font-size:12px;color:#059669">'+esc(d.numero)+'</code></td>'
      +'<td class="font-bold text-sm">'+esc(d.empleado_nombre||'—')+'</td>'
      +'<td class="text-sm text-muted">'+esc(d.area||'—')+'</td>'
      +'<td style="text-align:right;font-size:13px">'+((d.lineas||[]).length)+'</td>'
      +'<td style="text-align:right;font-weight:700;color:#059669">+'+pzas+'</td>'
      +'<td class="text-xs font-mono">'+fmtDate((d.fecha_hora||'').slice(0,10))+'</td>'
      +'<td style="text-align:center;white-space:nowrap">'
        +'<button class="btn btn-sm btn-ghost dv-det" data-id="'+d.id+'" title="Ver detalle"><i class="fas fa-eye"></i></button> '
        +'<button class="btn btn-sm btn-ghost dv-print" data-id="'+d.id+'" title="Imprimir comprobante" style="color:#059669"><i class="fas fa-print"></i></button>'
      +'</td>'
      +'</tr>';
  }).join('');
}

// ─── COMPROBANTE IMPRIMIBLE (FASE 5) ─────────────────────────────────────────
function imprimirComprobante(docId){
  const doc=(getStore().documentosDevolucion||[]).find(d=>d.id===docId);if(!doc)return;
  const skuMap={};(getStore().skus||[]).forEach(s=>{skuMap[s.id]=s;});
  const artMap={};(getStore().articulos||[]).forEach(a=>{artMap[a.id]=a;});

  const lineasHTML=(doc.lineas||[]).map((l,i)=>{
    const s=skuMap[l.sku_id];const a=s?artMap[s.articulo_id]:null;
    return`<tr>
      <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb">${i+1}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-weight:700;color:#059669">${esc(s?.codigo||'?')}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb">${esc(a?.nombre||'—')}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(a?.talla||'UNI')}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;color:#059669">+${l.cantidad}</td>
    </tr>`;
  }).join('');

  const totalPzas=(doc.lineas||[]).reduce((t,l)=>t+l.cantidad,0);
  const fechaFormato=new Date(doc.fecha_hora).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});

  const html=`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Devolución ${esc(doc.numero)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;background:#fff;padding:32px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #059669;padding-bottom:14px;margin-bottom:20px;}
  .logo-area{font-size:22px;font-weight:900;color:#059669;letter-spacing:-.5px;}
  .logo-sub{font-size:11px;font-weight:400;color:#64748b;margin-top:2px;}
  .doc-num{text-align:right;}
  .doc-num .num{font-size:20px;font-weight:900;color:#059669;font-family:monospace;}
  .doc-num .fecha{font-size:11px;color:#64748b;margin-top:4px;}
  .badge-dev{display:inline-block;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;margin-bottom:12px;}
  .info-box{display:flex;gap:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:20px;}
  .info-field label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:2px;}
  .info-field span{font-size:14px;font-weight:700;}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;}
  thead{background:#059669;color:#fff;}
  th{padding:10px 6px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.03em;}
  th:last-child,th:nth-child(4){text-align:center;}
  .total-row td{padding:10px 6px;font-weight:700;border-top:2px solid #059669;}
  .obs{font-size:11px;color:#64748b;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;margin-bottom:24px;}
  .firmas{display:flex;gap:40px;margin-top:32px;}
  .firma-box{flex:1;border-top:1.5px solid #374151;padding-top:6px;}
  .firma-box p{font-size:11px;color:#374151;text-align:center;margin-top:4px;}
  .footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:28px;border-top:1px solid #e2e8f0;padding-top:10px;}
  @media print{body{padding:16px;}@page{margin:12mm;}}
</style>
</head>
<body>
<div class="header">
  <div class="logo-area">ASSA ABLOY México<div class="logo-sub">Control de Uniformes · Sistema SKU</div></div>
  <div class="doc-num"><div>COMPROBANTE DE DEVOLUCIÓN</div><div class="num">${esc(doc.numero)}</div><div class="fecha">${fechaFormato}</div></div>
</div>
<div class="badge-dev"><i class="fas fa-undo"></i> El empleado devuelve prendas al almacén — stock aumentado</div>
<div class="info-box">
  <div class="info-field"><label>Empleado</label><span>${esc(doc.empleado_nombre||'—')}</span></div>
  <div class="info-field"><label>Área / Departamento</label><span>${esc(doc.area||'—')}</span></div>
  <div class="info-field"><label>Total piezas</label><span>+${totalPzas}</span></div>
  <div class="info-field"><label>Registrado por</label><span>${esc(doc.creado_por||'—')}</span></div>
</div>
<table>
  <thead><tr><th>#</th><th>Código SKU</th><th>Artículo</th><th>Talla</th><th>Cant.</th></tr></thead>
  <tbody>${lineasHTML}</tbody>
  <tfoot><tr class="total-row"><td colspan="4" style="padding:10px 6px">Total piezas devueltas:</td><td style="text-align:center;font-size:16px;font-weight:900;color:#059669;padding:10px 6px">+${totalPzas}</td></tr></tfoot>
</table>
${doc.observaciones?`<div class="obs"><strong>Motivo / Observaciones:</strong> ${esc(doc.observaciones)}</div>`:''}
<div class="firmas">
  <div class="firma-box"><p>Firma del empleado que devuelve</p><p style="margin-top:2px;font-weight:700">${esc(doc.empleado_nombre||'')}</p></div>
  <div class="firma-box"><p>Recibido por (almacén)</p><p style="margin-top:2px;font-weight:700">${esc(doc.creado_por||'')}</p></div>
</div>
<div class="footer">Documento generado el ${new Date().toLocaleString('es-MX')} · ${esc(doc.numero)} · ASSA ABLOY México — Control Store Pro</div>
</body></html>`;

  const win=window.open('','_blank','width=800,height=650');
  if(!win){notify('Activa los popups para imprimir','warning');return;}
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(),400);
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
  modal.open('Devolución — '+doc.numero,h,'<button class="btn btn-ghost" id="mClose">Cerrar</button><button class="btn btn-success" id="mPrint"><i class="fas fa-print mr-1"></i>Imprimir Comprobante</button>','md');
  document.getElementById('mClose')?.addEventListener('click',()=>modal.close());
  document.getElementById('mPrint')?.addEventListener('click',()=>{modal.close();imprimirComprobante(docId);});
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
export function init(){
  document.getElementById('dvBtnNueva')?.addEventListener('click',openNuevaDevolucion);
  document.getElementById('dvFEmp')?.addEventListener('input',renderTabla);
  document.getElementById('dvFArea')?.addEventListener('change',renderTabla);
  document.getElementById('dvFDesde')?.addEventListener('change',renderTabla);
  document.getElementById('dvFHasta')?.addEventListener('change',renderTabla);
  const main=document.getElementById('mainContent');
  if(main)main.onclick=e=>{
    const det=e.target.closest('.dv-det');if(det){openDetalleDevolucion(det.dataset.id);}
    const prnt=e.target.closest('.dv-print');if(prnt){imprimirComprobante(prnt.dataset.id);}
  };
  renderTabla();
}

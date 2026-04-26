/**
 * entrega-sku.js — Módulo: Entrega de Uniformes (sistema SKU)
 * FASE 3.2: extraído de inventario-sku.js sin modificar lógica interna.
 * Lógica de negocio en sku-api.js — NO duplicar funciones aquí.
 */
import{getStore}from'./storage.js';
import{esc,today,fmtDate}from'./utils.js';
import{notify,modal}from'./ui.js';
import{getUserRole}from'./user-roles.js';
import{
  registrarDocumentoEntrega,
  getDocumentosEntrega,
  getAllSkusResumen,
}from'./sku-api.js';

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────────
export function render(){
  const docs=(getDocumentosEntrega()||[]).slice().sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora));
  const hoy=new Date().toISOString().slice(0,10);
  const docHoy=docs.filter(d=>d.fecha_hora.startsWith(hoy));
  const totalPzs=docs.reduce((t,d)=>(d.lineas||[]).reduce((s,l)=>s+l.cantidad,t),0);

  let h='<div class="page-head"><div class="page-title"><h1>Entrega de Uniformes</h1><p>Documentos de entrega · Sistema SKU</p></div>';
  h+='<div style="display:flex;gap:8px">';
  h+='<button class="btn" style="background:#7c3aed;color:#fff" id="esBtnNueva"><i class="fas fa-hand-holding mr-1"></i>Nueva Entrega</button>';
  h+='</div></div>';

  // KPIs
  h+='<div class="kpi-grid">';
  h+='<div class="kpi"><div class="kpi-label">Total entregas</div><div class="kpi-value">'+docs.length+'</div></div>';
  h+='<div class="kpi success"><div class="kpi-label">Entregas hoy</div><div class="kpi-value">'+docHoy.length+'</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Piezas entregadas</div><div class="kpi-value">'+totalPzs+'</div></div>';
  h+='</div>';

  // Tabla
  h+='<div class="card"><div class="card-head"><h3>Historial de entregas</h3><span class="text-sm text-muted">'+docs.length+' documentos</span></div>';
  if(!docs.length){
    h+='<div class="empty-state" style="padding:30px"><i class="fas fa-hand-holding"></i><p>Sin entregas registradas</p><p class="text-sm text-muted">Usa "Nueva Entrega" para registrar la primera</p></div>';
  }else{
    const skuMap={};(getStore().skus||[]).forEach(s=>{skuMap[s.id]=s;});
    const artMap={};(getStore().articulos||[]).forEach(a=>{artMap[a.id]=a;});
    h+='<div class="table-wrap"><table class="dt"><thead><tr>';
    h+='<th>Número</th><th>Empleado</th><th>Área</th><th style="text-align:right">Arts.</th><th style="text-align:right">Piezas</th><th>Fecha</th><th style="text-align:center">Ver</th>';
    h+='</tr></thead><tbody>';
    docs.forEach(d=>{
      const pzas=(d.lineas||[]).reduce((t,l)=>t+l.cantidad,0);
      h+='<tr>'
        +'<td><code style="font-weight:800;font-size:12px;color:var(--primary)">'+esc(d.numero)+'</code></td>'
        +'<td class="font-bold text-sm">'+esc(d.empleado_nombre||'—')+'</td>'
        +'<td class="text-sm text-muted">'+esc(d.area||'—')+'</td>'
        +'<td style="text-align:right;font-size:13px">'+((d.lineas||[]).length)+'</td>'
        +'<td style="text-align:right;font-weight:700">'+pzas+'</td>'
        +'<td class="text-xs font-mono">'+fmtDate((d.fecha_hora||'').slice(0,10))+'</td>'
        +'<td style="text-align:center"><button class="btn btn-sm btn-ghost es-det" data-id="'+d.id+'" title="Ver detalle"><i class="fas fa-eye"></i></button></td>'
        +'</tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='</div>';
  return h;
}

// ─── MODAL: NUEVA ENTREGA ─────────────────────────────────────────────────────
// Movida desde inventario-sku.js — lógica interna SIN modificar.
function openNuevaEntrega(){
  const skus=getAllSkusResumen().filter(s=>s.stock_fisico>0);
  const emps=(getStore().employees||[]).filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
  let empSel={id:'',nombre:'',area:''};
  let lineas=[];

  function buildLineasHTML(){
    if(!lineas.length)return'<p class="text-xs text-muted" style="text-align:center;padding:12px 0">Sin artículos agregados</p>';
    return lineas.map((l,i)=>
      '<div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border)">'
      +'<code style="font-size:12px;font-weight:800;color:var(--primary);min-width:110px">'+esc(l.sku_codigo)+'</code>'
      +'<span class="text-xs text-muted" style="flex:1">'+esc(l.sku_nombre)+' T'+esc(l.sku_talla)+'</span>'
      +'<span class="text-xs" style="color:#94a3b8">Disp:'+l.stock_disp+'</span>'
      +'<button class="btn btn-ghost ne-minus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">−</button>'
      +'<span style="min-width:24px;text-align:center;font-weight:900;font-size:16px">'+l.cantidad+'</span>'
      +'<button class="btn btn-ghost ne-plus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">+</button>'
      +'<button class="btn btn-ghost ne-del" data-idx="'+i+'" style="color:#dc2626;padding:2px 6px" title="Quitar"><i class="fas fa-times"></i></button>'
      +'</div>'
    ).join('');
  }
  function redrawLineas(){const el=document.getElementById('neLineas');if(el){el.innerHTML=buildLineasHTML();attachLineasEvents();}}
  function attachLineasEvents(){
    document.querySelectorAll('.ne-minus').forEach(btn=>btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.idx,10);if(lineas[i]&&lineas[i].cantidad>1){lineas[i].cantidad--;redrawLineas();}}));
    document.querySelectorAll('.ne-plus').forEach(btn=>btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.idx,10);if(lineas[i]&&lineas[i].cantidad<lineas[i].stock_disp){lineas[i].cantidad++;redrawLineas();}}));
    document.querySelectorAll('.ne-del').forEach(btn=>btn.addEventListener('click',()=>{lineas.splice(parseInt(btn.dataset.idx,10),1);redrawLineas();}));
  }

  let h='<div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#5b21b6"><i class="fas fa-info-circle mr-2"></i>Crea un documento de entrega. El stock se descuenta inmediatamente de cada SKU. Operación <strong>irreversible</strong> (usa Devolución para revertir).</div>';
  h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Empleado *</label>';
  h+='<input class="form-input" id="neEmpQ" list="neEmpL" placeholder="Buscar por nombre..." autocomplete="off">';
  h+='<datalist id="neEmpL">'+emps.map(e=>'<option value="'+esc(e.nombre)+'">').join('')+'</datalist>';
  h+='<div id="neEmpInfo" class="text-xs text-muted mt-1"></div></div>';
  h+='<div class="form-group"><label class="form-label">Área</label><input class="form-input" id="neArea" value="" readonly></div></div>';
  h+='<div class="form-group mb-2"><label class="form-label">Agregar artículo</label>';
  h+='<div style="display:flex;gap:8px"><input class="form-input" id="neSkuQ" list="neSkuL" placeholder="Código SKU o nombre..." autocomplete="off" style="flex:1">';
  h+='<datalist id="neSkuL">'+skus.map(s=>'<option value="'+esc(s.codigo)+'">'+esc(s.nombre)+' T'+esc(s.talla)+'</option>').join('')+'</datalist>';
  h+='<button class="btn btn-ghost" id="neAgregar" title="Agregar a la lista"><i class="fas fa-plus"></i></button></div></div>';
  h+='<div id="neLineas" style="min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:12px"><p class="text-xs text-muted" style="text-align:center;padding:12px 0">Sin artículos agregados</p></div>';
  h+='<div class="form-group"><label class="form-label">Observaciones</label><input class="form-input" id="neObs" placeholder="Opcional..."></div>';

  modal.open('Nueva Entrega de Uniformes',h,'<button class="btn btn-ghost" id="neCancel">Cancelar</button><button class="btn" style="background:#7c3aed;color:#fff" id="neGuardar"><i class="fas fa-hand-holding mr-1"></i>Registrar Entrega</button>','lg');
  attachLineasEvents();

  document.getElementById('neCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('neEmpQ')?.addEventListener('input',function(){
    const q=(this.value||'').toLowerCase().trim();
    const emp=emps.find(e=>(e.nombre||'').toLowerCase()===q||(e.nombre||'').toLowerCase().startsWith(q));
    const info=document.getElementById('neEmpInfo');const area=document.getElementById('neArea');
    if(emp){empSel={id:emp.id||emp.numero||'',nombre:emp.nombre,area:emp.area||''};if(area)area.value=emp.area||'';if(info)info.textContent='#'+(emp.numero||'')+' · '+(emp.area||'')+' · '+(emp.puesto||'');}
    else{empSel={id:'',nombre:this.value,area:''};if(area)area.value='';if(info)info.textContent='';}
  });
  document.getElementById('neAgregar')?.addEventListener('click',()=>{
    const q=(document.getElementById('neSkuQ')?.value||'').trim();
    if(!q){notify('Escribe un código SKU o nombre','warning');return;}
    const sku=skus.find(s=>s.codigo===q||s.codigo.toLowerCase()===q.toLowerCase()||s.nombre.toLowerCase()===q.toLowerCase());
    if(!sku){notify('SKU no encontrado o sin stock: '+q,'warning');return;}
    const ya=lineas.find(l=>l.sku_id===sku.id);
    if(ya){if(ya.cantidad<ya.stock_disp){ya.cantidad++;redrawLineas();}else notify('Cantidad máxima alcanzada ('+ya.stock_disp+')','warning');const inp=document.getElementById('neSkuQ');if(inp)inp.value='';return;}
    lineas.push({sku_id:sku.id,sku_codigo:sku.codigo,sku_nombre:sku.nombre,sku_talla:sku.talla,stock_disp:sku.stock_fisico,cantidad:1});
    redrawLineas();
    const inp=document.getElementById('neSkuQ');if(inp)inp.value='';
  });
  document.getElementById('neGuardar')?.addEventListener('click',()=>{
    if(!empSel.nombre.trim()){notify('El empleado es obligatorio','warning');return;}
    if(!lineas.length){notify('Agrega al menos un artículo','warning');return;}
    const obs=document.getElementById('neObs')?.value||'';
    const res=registrarDocumentoEntrega({empleado_id:empSel.id,empleado_nombre:empSel.nombre,area:empSel.area,observaciones:obs,lineas:lineas.map(l=>({sku_id:l.sku_id,cantidad:l.cantidad}))});
    if(!res.ok){notify(res.error||'Error','error');return;}
    notify('Entrega '+res.documento.numero+' registrada — '+lineas.length+' artículo(s)','success');
    modal.close();
    const main=document.getElementById('mainContent');if(main){main.innerHTML=render();init();}
  });
}

// ─── MODAL: DETALLE DE ENTREGA ────────────────────────────────────────────────
function openDetalleEntrega(docId){
  const doc=(getStore().documentosEntrega||[]).find(d=>d.id===docId);if(!doc)return;
  const skuMap={};(getStore().skus||[]).forEach(s=>{skuMap[s.id]=s;});
  const artMap={};(getStore().articulos||[]).forEach(a=>{artMap[a.id]=a;});
  let h='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px">';
  h+='<div class="form-row c2"><div><p class="text-xs text-muted">Número</p><code style="font-size:18px;font-weight:900;color:var(--primary)">'+esc(doc.numero)+'</code></div>';
  h+='<div><p class="text-xs text-muted">Fecha</p><p class="font-bold">'+fmtDate((doc.fecha_hora||'').slice(0,10))+'</p></div></div>';
  h+='<div class="form-row c2 mt-2"><div><p class="text-xs text-muted">Empleado</p><p class="font-bold">'+esc(doc.empleado_nombre||'—')+'</p></div>';
  h+='<div><p class="text-xs text-muted">Área</p><p class="font-bold">'+esc(doc.area||'—')+'</p></div></div>';
  if(doc.observaciones)h+='<p class="text-xs text-muted mt-2">Obs: '+esc(doc.observaciones)+'</p>';
  h+='</div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr><th>SKU</th><th>Artículo</th><th>Talla</th><th style="text-align:right">Cant.</th></tr></thead><tbody>';
  (doc.lineas||[]).forEach(l=>{
    const s=skuMap[l.sku_id];const a=s?artMap[s.articulo_id]:null;
    h+='<tr><td><code style="font-weight:800;color:var(--primary)">'+esc(s?.codigo||'?')+'</code></td>';
    h+='<td class="text-sm">'+esc(a?.nombre||'—')+'</td>';
    h+='<td class="text-sm">'+esc(a?.talla||'UNI')+'</td>';
    h+='<td style="text-align:right;font-weight:700">'+l.cantidad+'</td></tr>';
  });
  h+='</tbody></table></div>';
  modal.open('Detalle — '+doc.numero,h,'<button class="btn btn-ghost" id="mClose">Cerrar</button>','md');
  document.getElementById('mClose')?.addEventListener('click',()=>modal.close());
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
export function init(){
  document.getElementById('esBtnNueva')?.addEventListener('click',openNuevaEntrega);
  document.getElementById('mainContent')?.addEventListener('click',e=>{
    const det=e.target.closest('.es-det');if(det){openDetalleEntrega(det.dataset.id);}
  });
}

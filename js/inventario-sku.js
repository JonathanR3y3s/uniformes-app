/**
 * inventario-sku.js — Módulo UI de Inventario (FASE 1+)
 * Pantalla: lista de SKUs, filtros, inventario inicial, detalle de SKU
 */
import{getStore,log}from'./storage.js';
import{esc,today,fmtDate,fmtMoney}from'./utils.js';
import{notify,modal}from'./ui.js';
import{getUserRole}from'./user-roles.js';
import{
  generateSKUCode,
  getAbrevNombre,
  registrarInventarioInicial,
  registrarEntradaCompra,
  registrarDocumentoEntrega,
  registrarDocumentoDevolucion,
  getDocumentosEntrega,
  getDocumentosDevolucion,
  getMovimientosPorSKU,
  getSkusConBajoStock,
  getSkuResumen,
  getAllSkusResumen,
  updateStockMinimo,
  findSkuByCodigo,
  getArticulos,
}from'./sku-api.js';

// ─── CONSTANTES ────────────────────────────────────────────────────────────────
const CATS={
  uniformes:{label:'Uniformes',icon:'fa-tshirt',color:'#1d4ed8',bg:'#dbeafe'},
  calzado:{label:'Calzado',icon:'fa-shoe-prints',color:'#7c3aed',bg:'#ede9fe'},
  accesorios:{label:'Accesorios',icon:'fa-glasses',color:'#059669',bg:'#d1fae5'},
  premios:{label:'Premios',icon:'fa-trophy',color:'#d97706',bg:'#fef3c7'}
};

const TALLAS_COMUNES=['S','M','L','XL','XXL','XXXL','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','43','44','UNI'];

const TIPO_MOV_LABEL={
  inventario_inicial:'Inventario inicial',
  entrada_compra:'Entrada proveedor',
  salida_entrega:'Entrega',
  entrada_devolucion:'Devolución',
  ajuste_positivo:'Ajuste +',
  ajuste_negativo:'Ajuste −'
};

let _f={cat:'',modelo:'',bajoStock:false,q:''};

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────────
export function render(){
  const isAdmin=getUserRole()==='admin';
  const bajos=getSkusConBajoStock();
  const skus=getAllSkusResumen();
  const modelos=[...new Set((getStore().articulos||[]).map(a=>a.modelo_anio).filter(Boolean))].sort().reverse();

  let h='<div class="page-head"><div class="page-title"><h1>Inventario de Uniformes</h1><p>Catálogo de SKUs · Stock físico · Movimientos</p></div>';
  if(isAdmin){
    h+='<div style="display:flex;gap:8px;flex-wrap:wrap">';
    h+='<button class="btn btn-success" id="skuBtnInicial"><i class="fas fa-layer-group mr-1"></i>Inventario Inicial</button>';
    h+='<button class="btn btn-primary" id="skuBtnEntrada"><i class="fas fa-truck mr-1"></i>Entrada de Proveedor</button>';
    h+='<button class="btn" style="background:#7c3aed;color:#fff" id="skuBtnEntrega"><i class="fas fa-hand-holding mr-1"></i>Nueva Entrega</button>';
    h+='<button class="btn btn-ghost" id="skuBtnDev"><i class="fas fa-undo mr-1"></i>Devolución</button>';
    h+='</div>';
  }
  h+='</div>';

  // Banner de stock bajo
  if(bajos.length){
    h+='<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px">';
    h+='<i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:18px;flex-shrink:0"></i>';
    h+='<div><span style="font-weight:700;color:#dc2626">'+bajos.length+' SKU'+(bajos.length===1?'':'s')+' con stock bajo</span>';
    h+='<span class="text-sm text-muted ml-2">'+bajos.map(s=>s.codigo).join(', ')+'</span></div></div>';
  }

  // KPIs
  const totalSkus=skus.length;
  const conStock=skus.filter(s=>s.stock_fisico>0).length;
  const sinStock=skus.filter(s=>s.stock_fisico===0).length;
  h+='<div class="kpi-grid">';
  h+='<div class="kpi"><div class="kpi-label">Total SKUs</div><div class="kpi-value">'+totalSkus+'</div></div>';
  h+='<div class="kpi success"><div class="kpi-label">Con Stock</div><div class="kpi-value">'+conStock+'</div></div>';
  if(bajos.length)h+='<div class="kpi warning"><div class="kpi-label"><i class="fas fa-exclamation-triangle mr-1"></i>Stock Bajo</div><div class="kpi-value" style="color:#d97706">'+bajos.length+'</div></div>';
  if(sinStock)h+='<div class="kpi"><div class="kpi-label">Sin Stock</div><div class="kpi-value" style="color:#94a3b8">'+sinStock+'</div></div>';
  h+='</div>';

  // Filtros
  h+='<div class="card mb-4"><div class="card-body"><div class="form-row c4">';
  h+='<div><label class="form-label">Categoría</label><select class="form-select" id="skuFCat"><option value="">Todas</option>'+Object.entries(CATS).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('')+'</select></div>';
  h+='<div><label class="form-label">Modelo / Año</label><select class="form-select" id="skuFMod"><option value="">Todos</option>'+modelos.map(m=>'<option>'+esc(m)+'</option>').join('')+'</select></div>';
  h+='<div><label class="form-label">Buscar</label><input class="form-input" id="skuFQ" placeholder="SKU, nombre, talla..."></div>';
  h+='<div style="display:flex;align-items:flex-end;gap:8px">';
  h+='<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;white-space:nowrap;padding-bottom:2px"><input type="checkbox" id="skuFBajo" style="accent-color:#dc2626;width:16px;height:16px"> Solo bajo</label>';
  h+='<button class="btn btn-ghost" id="skuFClear" title="Limpiar filtros"><i class="fas fa-times"></i></button>';
  h+='</div></div></div></div>';

  // Tabla SKUs
  h+='<div class="card"><div class="card-head"><h3>SKUs registrados</h3><span class="text-sm text-muted" id="skuCount"></span></div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr>';
  h+='<th>Código SKU</th><th>Prenda</th><th>Talla</th><th>Modelo</th><th>Cat.</th>';
  h+='<th style="text-align:right">Stock</th><th style="text-align:center">Estado</th>';
  h+='<th style="text-align:center">Acciones</th></tr></thead>';
  h+='<tbody id="skuTB"></tbody></table></div></div>';

  // Documentos recientes (entregas + devoluciones)
  if(isAdmin){
    const docsEnt=(getDocumentosEntrega()||[]).slice().sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora)).slice(0,10);
    const docsDev=(getDocumentosDevolucion()||[]).slice().sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora)).slice(0,10);
    const todosDoc=[...docsEnt.map(d=>({...d,_tipo:'entrega'})),...docsDev.map(d=>({...d,_tipo:'devolucion'}))].sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora)).slice(0,15);
    if(todosDoc.length){
      h+='<div class="card mt-4"><div class="card-head"><h3>Últimos movimientos documentados</h3><span class="text-sm text-muted">Entregas y devoluciones</span></div>';
      h+='<div class="table-wrap"><table class="dt"><thead><tr><th>Número</th><th>Tipo</th><th>Empleado / Área</th><th>Artículos</th><th>Fecha</th></tr></thead><tbody>';
      todosDoc.forEach(d=>{
        const esEnt=d._tipo==='entrega';
        const badge=esEnt
          ?'<span style="background:#ede9fe;color:#7c3aed;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px"><i class="fas fa-hand-holding mr-1"></i>Entrega</span>'
          :'<span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px"><i class="fas fa-undo mr-1"></i>Devolución</span>';
        h+='<tr>'
          +'<td><code style="font-weight:800;font-size:12px;color:var(--primary)">'+esc(d.numero)+'</code></td>'
          +'<td>'+badge+'</td>'
          +'<td class="text-sm"><strong>'+esc(d.empleado_nombre||'—')+'</strong><br><span class="text-muted text-xs">'+esc(d.area||'')+'</span></td>'
          +'<td class="text-xs text-muted">'+((d.lineas||[]).length)+' línea'+(d.lineas?.length===1?'':'s')+'</td>'
          +'<td class="text-xs font-mono">'+fmtDate((d.fecha_hora||'').slice(0,10))+'</td>'
          +'</tr>';
      });
      h+='</tbody></table></div></div>';
    }
  }
  return h;
}

// ─── RENDER ROWS ──────────────────────────────────────────────────────────────
function renderRows(){
  const isAdmin=getUserRole()==='admin';
  let list=getAllSkusResumen();
  if(_f.cat)list=list.filter(s=>s.categoria===_f.cat);
  if(_f.modelo)list=list.filter(s=>s.modelo_anio===_f.modelo);
  if(_f.bajoStock)list=list.filter(s=>s.bajoStock);
  if(_f.q){const q=_f.q.toLowerCase();list=list.filter(s=>(s.codigo||'').toLowerCase().includes(q)||(s.nombre||'').toLowerCase().includes(q)||(s.talla||'').toLowerCase().includes(q)||(s.modelo_anio||'').toLowerCase().includes(q));}
  // Orden: categoría → nombre → modelo → talla
  list.sort((a,b)=>{if(a.categoria!==b.categoria)return a.categoria.localeCompare(b.categoria);if(a.nombre!==b.nombre)return a.nombre.localeCompare(b.nombre);if(a.modelo_anio!==b.modelo_anio)return b.modelo_anio.localeCompare(a.modelo_anio);return(a.talla||'').localeCompare(b.talla||'');});
  const tb=document.getElementById('skuTB');if(!tb)return;
  const cc=document.getElementById('skuCount');if(cc)cc.textContent=list.length+' SKUs';
  if(!list.length){
    tb.innerHTML='<tr><td colspan="8" class="empty-state"><i class="fas fa-barcode"></i><p>Sin SKUs registrados</p><p class="text-sm text-muted">Usa "Inventario Inicial" para cargar el conteo físico del almacén</p></td></tr>';
    return;
  }
  tb.innerHTML=list.map(s=>{
    const cat=CATS[s.categoria]||CATS.uniformes;
    const estadoBadge=s.sinStock
      ?'<span style="background:#f1f5f9;color:#94a3b8;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">Sin stock</span>'
      :s.bajoStock
        ?'<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700"><i class="fas fa-exclamation-triangle mr-1"></i>Bajo</span>'
        :'<span style="background:#d1fae5;color:#059669;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700"><i class="fas fa-check mr-1"></i>OK</span>';
    const stockColor=s.sinStock?'#94a3b8':s.bajoStock?'#dc2626':'#059669';
    return'<tr>'
      +'<td><code style="font-size:13px;font-weight:800;color:var(--primary);letter-spacing:.02em">'+esc(s.codigo)+'</code></td>'
      +'<td class="font-bold text-sm">'+esc(s.nombre)+'</td>'
      +'<td><span style="font-weight:600">'+esc(s.talla)+'</span></td>'
      +'<td><span style="background:'+cat.bg+';color:'+cat.color+';font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px">'+esc(s.modelo_anio)+'</span></td>'
      +'<td><i class="fas '+cat.icon+'" style="color:'+cat.color+'" title="'+cat.label+'"></i></td>'
      +'<td style="text-align:right;font-size:22px;font-weight:900;color:'+stockColor+'">'+s.stock_fisico+'</td>'
      +'<td style="text-align:center">'+estadoBadge+'</td>'
      +'<td style="text-align:center"><div style="display:flex;gap:4px;justify-content:center">'
      +'<button class="btn btn-sm btn-ghost sku-det" data-id="'+s.id+'" title="Ver detalle y movimientos"><i class="fas fa-eye"></i></button>'
      +(isAdmin?'<button class="btn btn-sm btn-ghost sku-min" data-id="'+s.id+'" title="Editar stock mínimo" style="color:#7c3aed"><i class="fas fa-sliders-h"></i></button>':'')
      +'</div></td>'
      +'</tr>';
  }).join('');
}

// ─── MODAL: INVENTARIO INICIAL ────────────────────────────────────────────────
function openInventarioInicial(){
  const arts=getArticulos();
  const nombresExist=[...new Set(arts.map(a=>a.nombre))].sort();
  const modelosExist=[...new Set(arts.map(a=>a.modelo_anio).filter(Boolean))].sort().reverse();

  function buildH(){
    let h='';
    h+='<div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#1e40af"><i class="fas fa-info-circle mr-2"></i>Registra el conteo físico real del almacén. Cada registro genera un movimiento tipo <strong>inventario_inicial</strong>.</div>';
    h+='<div class="form-row c2 mb-3">';
    h+='<div class="form-group"><label class="form-label">Nombre del artículo *</label>';
    h+='<input class="form-input" id="iiNombre" list="iiNL" placeholder="Ej: Pantalón de vestir" autocomplete="off">';
    h+='<datalist id="iiNL">'+nombresExist.map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist></div>';
    h+='<div class="form-group"><label class="form-label">Categoría *</label>';
    h+='<select class="form-select" id="iiCat">'+Object.entries(CATS).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('')+'</select></div>';
    h+='</div>';
    h+='<div class="form-row c3 mb-3">';
    h+='<div class="form-group"><label class="form-label">Talla</label>';
    h+='<input class="form-input" id="iiTalla" list="iiTL" placeholder="34, M, UNI...">';
    h+='<datalist id="iiTL">'+TALLAS_COMUNES.map(t=>'<option value="'+t+'">').join('')+'</datalist></div>';
    h+='<div class="form-group"><label class="form-label">Modelo / Año *</label>';
    h+='<input class="form-input" id="iiModelo" list="iiML" placeholder="2026">';
    h+='<datalist id="iiML">'+modelosExist.map(m=>'<option value="'+m+'">').join('')+'</datalist></div>';
    h+='<div class="form-group"><label class="form-label">Unidad</label>';
    h+='<select class="form-select" id="iiUnidad"><option value="pieza">Pieza</option><option value="par">Par</option><option value="juego">Juego</option></select></div>';
    h+='</div>';
    h+='<div class="form-group mb-3"><label class="form-label">Descripción (opcional)</label>';
    h+='<input class="form-input" id="iiDesc" placeholder="Descripción adicional..."></div>';
    // Vista previa SKU
    h+='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">';
    h+='<span class="text-sm" style="color:var(--text-muted)">Código SKU generado:</span>';
    h+='<code id="iiSkuPrev" style="font-size:18px;font-weight:900;color:var(--primary);letter-spacing:.05em">—</code></div>';
    // Cantidad
    h+='<div class="form-row c2">';
    h+='<div class="form-group"><label class="form-label">Cantidad (conteo físico) *</label>';
    h+='<div class="flex gap-2"><button class="btn btn-ghost" id="iiMinus" style="min-width:48px;font-size:22px">−</button>';
    h+='<input class="form-input" type="number" id="iiCant" min="1" value="1" style="text-align:center;font-size:24px;font-weight:800;flex:1">';
    h+='<button class="btn btn-ghost" id="iiPlus" style="min-width:48px;font-size:22px">+</button></div></div>';
    h+='<div class="form-group"><label class="form-label">Observaciones</label>';
    h+='<input class="form-input" id="iiObs" placeholder="Ej: Conteo físico 26/04/2026"></div>';
    h+='</div>';
    return h;
  }

  modal.open('Registrar Inventario Inicial',buildH(),'<button class="btn btn-ghost" id="iiCancel">Cancelar</button><button class="btn btn-success" id="iiGuardar"><i class="fas fa-check mr-1"></i>Registrar</button>','lg');

  function updatePreview(){
    const n=(document.getElementById('iiNombre')?.value||'').trim();
    const t=(document.getElementById('iiTalla')?.value||'').trim();
    const m=(document.getElementById('iiModelo')?.value||'').trim();
    const el=document.getElementById('iiSkuPrev');
    if(el)el.textContent=(n&&m)?generateSKUCode(n,t||'UNI',m):'—';
  }

  document.getElementById('iiCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('iiMinus')?.addEventListener('click',()=>{const q=document.getElementById('iiCant');if(q)q.value=Math.max(1,parseInt(q.value||'1',10)-1);});
  document.getElementById('iiPlus')?.addEventListener('click',()=>{const q=document.getElementById('iiCant');if(q)q.value=parseInt(q.value||'0',10)+1;});
  ['iiNombre','iiTalla','iiModelo'].forEach(id=>document.getElementById(id)?.addEventListener('input',updatePreview));

  document.getElementById('iiGuardar')?.addEventListener('click',()=>{
    const nombre=(document.getElementById('iiNombre')?.value||'').trim();
    const categoria=document.getElementById('iiCat')?.value||'uniformes';
    const talla=(document.getElementById('iiTalla')?.value||'').trim()||null;
    const modelo_anio=(document.getElementById('iiModelo')?.value||'').trim();
    const unidad=document.getElementById('iiUnidad')?.value||'pieza';
    const descripcion=document.getElementById('iiDesc')?.value||'';
    const cantidad=parseInt(document.getElementById('iiCant')?.value||'0',10);
    const observaciones=(document.getElementById('iiObs')?.value||'').trim()||'Conteo físico '+today();
    if(!nombre){notify('El nombre del artículo es obligatorio','warning');return;}
    if(!modelo_anio){notify('El modelo/año es obligatorio','warning');return;}
    if(!cantidad||cantidad<=0){notify('La cantidad debe ser mayor a cero','warning');return;}
    const res=registrarInventarioInicial({nombre,categoria,unidad,talla,modelo_anio,descripcion,cantidad,observaciones});
    if(!res.ok){notify(res.error||'Error al registrar','error');return;}
    const msg=(res.ajuste?'Ajuste registrado':'Inventario inicial registrado')+': '+res.sku.codigo+' · '+cantidad+' pzs'+(res.ajuste?' (ajuste_positivo)':'');
    notify(msg,'success');
    modal.close();
    // Refrescar página
    const main=document.getElementById('mainContent');
    if(main){main.innerHTML=render();init();}
  });
}

// ─── MODAL: ENTRADA DE PROVEEDOR ─────────────────────────────────────────────
function openEntradaProveedor(){
  const arts=getArticulos();
  const nombresExist=[...new Set(arts.map(a=>a.nombre))].sort();
  const modelosExist=[...new Set(arts.map(a=>a.modelo_anio).filter(Boolean))].sort().reverse();

  let h='<div style="display:flex;gap:8px;margin-bottom:14px">';
  h+='<button id="epTabBuscar" class="btn btn-primary" style="flex:1"><i class="fas fa-search mr-1"></i>Buscar SKU existente</button>';
  h+='<button id="epTabNuevo" class="btn btn-ghost" style="flex:1"><i class="fas fa-plus mr-1"></i>Artículo nuevo</button>';
  h+='</div>';
  h+='<div id="epBuscarSec">';
  h+='<div class="form-group mb-3"><label class="form-label">Código SKU o nombre *</label>';
  h+='<input class="form-input" id="epSKUQ" placeholder="Ej: PANT-034-26" autocomplete="off">';
  h+='<div id="epSKURes" style="margin-top:6px"></div></div>';
  h+='</div>';
  h+='<div id="epNuevoSec" style="display:none">';
  h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Nombre *</label>';
  h+='<input class="form-input" id="epNombre" list="epNL" placeholder="Ej: Chamarra"><datalist id="epNL">'+nombresExist.map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist></div>';
  h+='<div class="form-group"><label class="form-label">Categoría</label>';
  h+='<select class="form-select" id="epCat">'+Object.entries(CATS).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('')+'</select></div></div>';
  h+='<div class="form-row c3 mb-3"><div class="form-group"><label class="form-label">Talla</label>';
  h+='<input class="form-input" id="epTalla" list="epTL" placeholder="34, M, UNI..."><datalist id="epTL">'+TALLAS_COMUNES.map(t=>'<option value="'+t+'">').join('')+'</datalist></div>';
  h+='<div class="form-group"><label class="form-label">Modelo / Año *</label>';
  h+='<input class="form-input" id="epModelo" list="epML" placeholder="2026"><datalist id="epML">'+modelosExist.map(m=>'<option value="'+m+'">').join('')+'</datalist></div>';
  h+='<div class="form-group"><label class="form-label">Unidad</label>';
  h+='<select class="form-select" id="epUnidad"><option value="pieza">Pieza</option><option value="par">Par</option></select></div></div>';
  h+='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 16px;margin-bottom:14px;display:flex;justify-content:space-between">';
  h+='<span class="text-sm text-muted">SKU generado:</span><code id="epSkuPrev" style="font-size:16px;font-weight:800;color:var(--primary)">—</code></div>';
  h+='</div>';
  h+='<div id="epSelectedBanner" style="display:none;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:14px">';
  h+='<span class="text-xs text-muted">SKU seleccionado:</span><code id="epSelectedCode" style="font-size:14px;font-weight:800;color:var(--primary);margin-left:8px">—</code>';
  h+='<span id="epSelectedStock" class="text-sm text-muted ml-2"></span></div>';
  h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Cantidad *</label>';
  h+='<div class="flex gap-2"><button class="btn btn-ghost" id="epMinus" style="min-width:44px;font-size:20px">−</button>';
  h+='<input class="form-input" type="number" id="epCant" min="1" value="1" style="text-align:center;font-size:22px;font-weight:800;flex:1">';
  h+='<button class="btn btn-ghost" id="epPlus" style="min-width:44px;font-size:20px">+</button></div></div>';
  h+='<div class="form-group"><label class="form-label">Costo unitario (opcional)</label>';
  h+='<input class="form-input" type="number" id="epCosto" min="0" step="0.01" placeholder="0.00"></div></div>';
  h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Proveedor *</label>';
  h+='<input class="form-input" id="epProv" placeholder="Nombre del proveedor"></div>';
  h+='<div class="form-group"><label class="form-label">No. Factura *</label>';
  h+='<input class="form-input" id="epFac" placeholder="F-001"></div></div>';
  h+='<div class="form-group"><label class="form-label">Observaciones</label>';
  h+='<input class="form-input" id="epObs" placeholder="Opcional..."></div>';

  let modoNuevo=false;
  let skuSeleccionadoId=null;

  modal.open('Entrada de Proveedor',h,'<button class="btn btn-ghost" id="epCancel">Cancelar</button><button class="btn btn-primary" id="epGuardar"><i class="fas fa-check mr-1"></i>Registrar Entrada</button>','lg');

  function toggleModo(nuevo){
    modoNuevo=nuevo;
    skuSeleccionadoId=null;
    document.getElementById('epSelectedBanner').style.display='none';
    document.getElementById('epBuscarSec').style.display=nuevo?'none':'block';
    document.getElementById('epNuevoSec').style.display=nuevo?'block':'none';
    document.getElementById('epTabBuscar').className='btn '+(nuevo?'btn-ghost':'btn-primary')+' ';
    document.getElementById('epTabNuevo').className='btn '+(nuevo?'btn-primary':'btn-ghost');
    document.getElementById('epTabBuscar').style.flex='1';
    document.getElementById('epTabNuevo').style.flex='1';
  }

  function updateSkuPreview(){
    const n=(document.getElementById('epNombre')?.value||'').trim();
    const t=(document.getElementById('epTalla')?.value||'').trim();
    const m=(document.getElementById('epModelo')?.value||'').trim();
    const el=document.getElementById('epSkuPrev');
    if(el)el.textContent=(n&&m)?generateSKUCode(n,t||'UNI',m):'—';
  }

  document.getElementById('epTabBuscar')?.addEventListener('click',()=>toggleModo(false));
  document.getElementById('epTabNuevo')?.addEventListener('click',()=>toggleModo(true));
  document.getElementById('epCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('epMinus')?.addEventListener('click',()=>{const q=document.getElementById('epCant');if(q)q.value=Math.max(1,parseInt(q.value||'1',10)-1);});
  document.getElementById('epPlus')?.addEventListener('click',()=>{const q=document.getElementById('epCant');if(q)q.value=parseInt(q.value||'0',10)+1;});
  ['epNombre','epTalla','epModelo'].forEach(id=>document.getElementById(id)?.addEventListener('input',updateSkuPreview));

  // Búsqueda en vivo de SKU
  document.getElementById('epSKUQ')?.addEventListener('input',function(){
    const q=(this.value||'').toLowerCase().trim();
    const res_el=document.getElementById('epSKURes');if(!res_el)return;
    if(!q){res_el.innerHTML='';return;}
    const matches=getAllSkusResumen().filter(s=>(s.codigo||'').toLowerCase().includes(q)||(s.nombre||'').toLowerCase().includes(q));
    if(!matches.length){res_el.innerHTML='<p class="text-xs text-muted mt-1">Sin resultados</p>';return;}
    res_el.innerHTML='<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:4px">'+matches.slice(0,8).map(s=>'<div class="sku-pick" data-id="'+s.id+'" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center"><div><code style="font-weight:800;color:var(--primary)">'+esc(s.codigo)+'</code><span class="text-xs text-muted ml-2">'+esc(s.nombre)+' · T'+esc(s.talla)+'</span></div><span style="font-weight:700;color:'+(s.stock_fisico>0?'#059669':'#94a3b8')+'">'+s.stock_fisico+' pzs</span></div>').join('')+'</div>';
    res_el.querySelectorAll('.sku-pick').forEach(el=>{
      el.addEventListener('mouseenter',()=>el.style.background='var(--surface-2)');
      el.addEventListener('mouseleave',()=>el.style.background='');
      el.addEventListener('click',()=>{
        const s=getAllSkusResumen().find(x=>x.id===el.dataset.id);if(!s)return;
        skuSeleccionadoId=s.id;
        document.getElementById('epSelectedBanner').style.display='block';
        document.getElementById('epSelectedCode').textContent=s.codigo;
        document.getElementById('epSelectedStock').textContent='Stock actual: '+s.stock_fisico+' pzs';
        res_el.innerHTML='';document.getElementById('epSKUQ').value=s.codigo;
      });
    });
  });

  document.getElementById('epGuardar')?.addEventListener('click',()=>{
    const cant=parseInt(document.getElementById('epCant')?.value||'0',10);
    const prov=(document.getElementById('epProv')?.value||'').trim();
    const fac=(document.getElementById('epFac')?.value||'').trim();
    const costo=parseFloat(document.getElementById('epCosto')?.value||'0')||0;
    const obs=document.getElementById('epObs')?.value||'';
    if(!prov){notify('El proveedor es obligatorio','warning');return;}
    if(!fac){notify('El número de factura es obligatorio','warning');return;}
    if(!cant||cant<=0){notify('La cantidad debe ser mayor a cero','warning');return;}
    let res;
    if(modoNuevo){
      const nombre=(document.getElementById('epNombre')?.value||'').trim();
      const categoria=document.getElementById('epCat')?.value||'uniformes';
      const talla=(document.getElementById('epTalla')?.value||'').trim()||null;
      const modelo_anio=(document.getElementById('epModelo')?.value||'').trim();
      const unidad=document.getElementById('epUnidad')?.value||'pieza';
      if(!nombre||!modelo_anio){notify('Nombre y modelo son obligatorios','warning');return;}
      res=registrarEntradaCompra({articuloData:{nombre,categoria,talla,modelo_anio,unidad},cantidad:cant,proveedor:prov,factura:fac,costo_unitario:costo,observaciones:obs});
    }else{
      if(!skuSeleccionadoId){notify('Selecciona un SKU de la lista','warning');return;}
      res=registrarEntradaCompra({skuId:skuSeleccionadoId,cantidad:cant,proveedor:prov,factura:fac,costo_unitario:costo,observaciones:obs});
    }
    if(!res.ok){notify(res.error||'Error al registrar','error');return;}
    notify('Entrada registrada: '+res.sku.codigo+' +'+cant+' pzs. Stock: '+res.sku.stock_fisico,'success');
    modal.close();
    const main=document.getElementById('mainContent');
    if(main){main.innerHTML=render();init();}
  });
}

// ─── MODAL: DETALLE DE SKU ────────────────────────────────────────────────────
function openDetalleSKU(skuId){
  const sku=(getStore().skus||[]).find(s=>s.id===skuId);if(!sku)return;
  const sr=getSkuResumen(sku);
  const cat=CATS[sr.categoria]||CATS.uniformes;
  const movs=getMovimientosPorSKU(skuId);
  let h='';
  // Header
  h+='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">';
  h+='<div><p style="font-size:11px;color:var(--text-muted);margin:0">'+esc(sr.nombre)+' · Talla '+esc(sr.talla)+' · Modelo '+esc(sr.modelo_anio)+'</p>';
  h+='<code style="font-size:24px;font-weight:900;color:var(--primary);letter-spacing:.04em">'+esc(sku.codigo)+'</code>';
  h+='<span style="margin-left:10px;background:'+cat.bg+';color:'+cat.color+';font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px">'+cat.label+'</span></div>';
  h+='<div style="text-align:right"><p style="font-size:11px;color:var(--text-muted);margin:0">Stock actual</p>';
  h+='<p style="font-size:40px;font-weight:900;margin:0;color:'+(sr.sinStock?'#94a3b8':sr.bajoStock?'#dc2626':'#059669')+'">'+sku.stock_fisico+'</p>';
  h+='<p style="font-size:11px;color:var(--text-muted);margin:0">Stock mínimo: '+sku.stock_minimo+'</p></div></div>';
  // Movimientos
  if(movs.length){
    h+='<p class="text-xs text-muted mb-2"><strong>Movimientos ('+movs.length+')</strong></p>';
    h+='<div class="table-wrap" style="max-height:280px"><table class="dt"><thead><tr><th>Fecha</th><th>Tipo</th><th style="text-align:right">Cant.</th><th style="text-align:right">Stock →</th><th>Referencia / Obs.</th></tr></thead><tbody>';
    movs.forEach(m=>{
      const esPos=m.cantidad>0;
      const tipoLabel=TIPO_MOV_LABEL[m.tipo]||m.tipo;
      h+='<tr>'
        +'<td class="text-xs font-mono">'+fmtDate((m.fecha_hora||'').slice(0,10))+'</td>'
        +'<td class="text-xs">'+tipoLabel+'</td>'
        +'<td style="text-align:right;font-weight:700;color:'+(esPos?'#059669':'#dc2626')+'">'+(esPos?'+':'')+m.cantidad+'</td>'
        +'<td style="text-align:right;font-weight:700">'+m.stock_despues+'</td>'
        +'<td class="text-xs text-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(m.documento_id||m.factura||m.observaciones||'—')+'</td>'
        +'</tr>';
    });
    h+='</tbody></table></div>';
  }else{
    h+='<div class="empty-state" style="padding:20px"><i class="fas fa-clock"></i><p>Sin movimientos registrados</p></div>';
  }
  modal.open('Detalle SKU — '+sku.codigo,h,'<button class="btn btn-ghost" id="mCancel">Cerrar</button>','lg');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
}

// ─── MODAL: EDITAR STOCK MÍNIMO ───────────────────────────────────────────────
function openEditMinimo(skuId){
  const sku=(getStore().skus||[]).find(s=>s.id===skuId);if(!sku)return;
  const art=(getStore().articulos||[]).find(a=>a.id===sku.articulo_id)||{};
  let h='<div style="text-align:center;margin-bottom:16px">';
  h+='<code style="font-size:20px;font-weight:900;color:var(--primary)">'+esc(sku.codigo)+'</code>';
  h+='<p class="text-sm text-muted mt-1">'+esc(art.nombre||'')+'</p></div>';
  h+='<div class="form-group"><label class="form-label">Stock mínimo (alerta cuando el stock llegue a este número o menos)</label>';
  h+='<div class="flex gap-2"><button class="btn btn-ghost" id="smMinus" style="min-width:48px;font-size:22px">−</button>';
  h+='<input class="form-input" type="number" id="smVal" min="0" value="'+sku.stock_minimo+'" style="text-align:center;font-size:26px;font-weight:900;flex:1">';
  h+='<button class="btn btn-ghost" id="smPlus" style="min-width:48px;font-size:22px">+</button></div>';
  h+='<p class="text-xs text-muted mt-2"><i class="fas fa-info-circle mr-1"></i>Valor 0 = sin alerta de stock bajo.</p></div>';
  modal.open('Stock mínimo — '+sku.codigo,h,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="smSave"><i class="fas fa-save mr-1"></i>Guardar</button>');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('smMinus')?.addEventListener('click',()=>{const v=document.getElementById('smVal');if(v)v.value=Math.max(0,parseInt(v.value||'0',10)-1);});
  document.getElementById('smPlus')?.addEventListener('click',()=>{const v=document.getElementById('smVal');if(v)v.value=parseInt(v.value||'0',10)+1;});
  document.getElementById('smSave')?.addEventListener('click',()=>{
    const val=parseInt(document.getElementById('smVal')?.value||'0',10);
    updateStockMinimo(skuId,Math.max(0,val));
    notify('Stock mínimo actualizado: '+val+' pzs','success');
    modal.close();
    renderRows();
  });
}

// ─── MODAL: NUEVA ENTREGA (FASE 2) ───────────────────────────────────────────
function openNuevaEntrega(){
  const skus=getAllSkusResumen().filter(s=>s.stock_fisico>0);
  const emps=(getStore().employees||[]).filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
  let empSel={id:'',nombre:'',area:''};
  let lineas=[]; // [{sku_id,sku_codigo,sku_nombre,sku_talla,stock_disp,cantidad}]

  function buildH(){
    let h='<div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#5b21b6"><i class="fas fa-info-circle mr-2"></i>Crea un documento de entrega. El stock se descuenta inmediatamente de cada SKU. Operación <strong>irreversible</strong> (usa Devolución para revertir).</div>';
    // Empleado
    h+='<div class="form-row c2 mb-3">';
    h+='<div class="form-group"><label class="form-label">Empleado *</label>';
    h+='<input class="form-input" id="neEmpQ" list="neEmpL" placeholder="Buscar por nombre..." autocomplete="off">';
    h+='<datalist id="neEmpL">'+emps.map(e=>'<option value="'+esc(e.nombre)+'">').join('')+'</datalist>';
    h+='<div id="neEmpInfo" class="text-xs text-muted mt-1"></div></div>';
    h+='<div class="form-group"><label class="form-label">Área</label>';
    h+='<input class="form-input" id="neArea" value="'+esc(empSel.area)+'" readonly></div>';
    h+='</div>';
    // Buscar SKU para agregar
    h+='<div class="form-group mb-2"><label class="form-label">Agregar artículo</label>';
    h+='<div style="display:flex;gap:8px">';
    h+='<input class="form-input" id="neSkuQ" list="neSkuL" placeholder="Código SKU o nombre..." autocomplete="off" style="flex:1">';
    h+='<datalist id="neSkuL">'+skus.map(s=>'<option value="'+esc(s.codigo)+'">'+esc(s.nombre)+' T'+esc(s.talla)+'</option>').join('')+'</datalist>';
    h+='<button class="btn btn-ghost" id="neAgregar" title="Agregar a la lista"><i class="fas fa-plus"></i></button>';
    h+='</div></div>';
    // Lista de líneas
    h+='<div id="neLineas" style="min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:12px">';
    if(!lineas.length){h+='<p class="text-xs text-muted" style="text-align:center;padding:12px 0">Sin artículos agregados</p>';}
    else{
      h+=lineas.map((l,i)=>'<div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border)">'
        +'<code style="font-size:12px;font-weight:800;color:var(--primary);min-width:110px">'+esc(l.sku_codigo)+'</code>'
        +'<span class="text-xs text-muted" style="flex:1">'+esc(l.sku_nombre)+' T'+esc(l.sku_talla)+'</span>'
        +'<span class="text-xs" style="color:#94a3b8">Disp:'+l.stock_disp+'</span>'
        +'<button class="btn btn-ghost ne-minus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">−</button>'
        +'<span style="min-width:24px;text-align:center;font-weight:900;font-size:16px">'+l.cantidad+'</span>'
        +'<button class="btn btn-ghost ne-plus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">+</button>'
        +'<button class="btn btn-ghost ne-del" data-idx="'+i+'" style="color:#dc2626;padding:2px 6px" title="Quitar"><i class="fas fa-times"></i></button>'
        +'</div>').join('');
    }
    h+='</div>';
    h+='<div class="form-group"><label class="form-label">Observaciones</label>';
    h+='<input class="form-input" id="neObs" placeholder="Opcional..."></div>';
    return h;
  }

  function renderLineas(){const el=document.getElementById('neLineas');if(el)el.outerHTML='<div id="neLineas" style="min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:12px">'+buildLineasHTML()+'</div>';attachLineasEvents();}
  function buildLineasHTML(){if(!lineas.length)return'<p class="text-xs text-muted" style="text-align:center;padding:12px 0">Sin artículos agregados</p>';return lineas.map((l,i)=>'<div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border)">'+'<code style="font-size:12px;font-weight:800;color:var(--primary);min-width:110px">'+esc(l.sku_codigo)+'</code>'+'<span class="text-xs text-muted" style="flex:1">'+esc(l.sku_nombre)+' T'+esc(l.sku_talla)+'</span>'+'<span class="text-xs" style="color:#94a3b8">Disp:'+l.stock_disp+'</span>'+'<button class="btn btn-ghost ne-minus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">−</button>'+'<span style="min-width:24px;text-align:center;font-weight:900;font-size:16px">'+l.cantidad+'</span>'+'<button class="btn btn-ghost ne-plus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">+</button>'+'<button class="btn btn-ghost ne-del" data-idx="'+i+'" style="color:#dc2626;padding:2px 6px" title="Quitar"><i class="fas fa-times"></i></button>'+'</div>').join('');}

  function redrawLineas(){const el=document.getElementById('neLineas');if(el){el.innerHTML=buildLineasHTML();attachLineasEvents();}}

  function attachLineasEvents(){
    document.querySelectorAll('.ne-minus').forEach(btn=>btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.idx,10);if(lineas[i]&&lineas[i].cantidad>1){lineas[i].cantidad--;redrawLineas();}}));
    document.querySelectorAll('.ne-plus').forEach(btn=>btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.idx,10);if(lineas[i]&&lineas[i].cantidad<lineas[i].stock_disp){lineas[i].cantidad++;redrawLineas();}}));
    document.querySelectorAll('.ne-del').forEach(btn=>btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.idx,10);lineas.splice(i,1);redrawLineas();}));
  }

  modal.open('Nueva Entrega de Uniformes',buildH(),'<button class="btn btn-ghost" id="neCancel">Cancelar</button><button class="btn" style="background:#7c3aed;color:#fff" id="neGuardar"><i class="fas fa-hand-holding mr-1"></i>Registrar Entrega</button>','lg');
  attachLineasEvents();

  document.getElementById('neCancel')?.addEventListener('click',()=>modal.close());

  // Autocompletar empleado
  document.getElementById('neEmpQ')?.addEventListener('input',function(){
    const q=(this.value||'').toLowerCase().trim();
    const emp=emps.find(e=>(e.nombre||'').toLowerCase()===q||(e.nombre||'').toLowerCase().startsWith(q));
    const info=document.getElementById('neEmpInfo');
    const area=document.getElementById('neArea');
    if(emp){empSel={id:emp.id||emp.numero||'',nombre:emp.nombre,area:emp.area||''};if(area)area.value=emp.area||'';if(info)info.textContent='#'+(emp.numero||'')+' · '+(emp.area||'')+' · '+(emp.puesto||'');}
    else{empSel={id:'',nombre:this.value,area:''};if(area)area.value='';if(info)info.textContent='';}
  });

  // Agregar SKU
  document.getElementById('neAgregar')?.addEventListener('click',()=>{
    const q=(document.getElementById('neSkuQ')?.value||'').trim();
    if(!q){notify('Escribe un código SKU o nombre','warning');return;}
    const sku=skus.find(s=>s.codigo===q||s.codigo.toLowerCase()===q.toLowerCase()||s.nombre.toLowerCase()===q.toLowerCase());
    if(!sku){notify('SKU no encontrado o sin stock: '+q,'warning');return;}
    const ya=lineas.find(l=>l.sku_id===sku.id);
    if(ya){if(ya.cantidad<ya.stock_disp){ya.cantidad++;redrawLineas();}else notify('Cantidad máxima alcanzada ('+ya.stock_disp+')','warning');const i=document.getElementById('neSkuQ');if(i)i.value='';return;}
    lineas.push({sku_id:sku.id,sku_codigo:sku.codigo,sku_nombre:sku.nombre,sku_talla:sku.talla,stock_disp:sku.stock_fisico,cantidad:1});
    redrawLineas();
    const i=document.getElementById('neSkuQ');if(i)i.value='';
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

// ─── MODAL: NUEVA DEVOLUCIÓN (FASE 2) ────────────────────────────────────────
function openNuevaDevolucion(){
  const skusAll=getAllSkusResumen();
  const emps=(getStore().employees||[]).filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
  let empSel={id:'',nombre:'',area:''};
  let lineas=[];

  function buildLineasHTML(){if(!lineas.length)return'<p class="text-xs text-muted" style="text-align:center;padding:12px 0">Sin artículos</p>';return lineas.map((l,i)=>'<div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border)">'+'<code style="font-size:12px;font-weight:800;color:#059669;min-width:110px">'+esc(l.sku_codigo)+'</code>'+'<span class="text-xs text-muted" style="flex:1">'+esc(l.sku_nombre)+' T'+esc(l.sku_talla)+'</span>'+'<button class="btn btn-ghost dv-minus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">−</button>'+'<span style="min-width:24px;text-align:center;font-weight:900;font-size:16px">'+l.cantidad+'</span>'+'<button class="btn btn-ghost dv-plus" data-idx="'+i+'" style="min-width:30px;padding:2px 6px">+</button>'+'<button class="btn btn-ghost dv-del" data-idx="'+i+'" style="color:#dc2626;padding:2px 6px"><i class="fas fa-times"></i></button>'+'</div>').join('');}
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
    const i=document.getElementById('dvSkuQ');if(i)i.value='';
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

// ─── INIT ─────────────────────────────────────────────────────────────────────
export function init(){
  document.getElementById('skuBtnInicial')?.addEventListener('click',openInventarioInicial);
  document.getElementById('skuBtnEntrada')?.addEventListener('click',openEntradaProveedor);
  document.getElementById('skuBtnEntrega')?.addEventListener('click',openNuevaEntrega);
  document.getElementById('skuBtnDev')?.addEventListener('click',openNuevaDevolucion);
  ['skuFCat','skuFMod'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{
    _f.cat=document.getElementById('skuFCat')?.value||'';
    _f.modelo=document.getElementById('skuFMod')?.value||'';
    renderRows();
  }));
  document.getElementById('skuFQ')?.addEventListener('input',function(){_f.q=this.value;renderRows();});
  document.getElementById('skuFBajo')?.addEventListener('change',function(){_f.bajoStock=this.checked;renderRows();});
  document.getElementById('skuFClear')?.addEventListener('click',()=>{
    _f={cat:'',modelo:'',bajoStock:false,q:''};
    ['skuFCat','skuFMod','skuFQ'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const cb=document.getElementById('skuFBajo');if(cb)cb.checked=false;
    renderRows();
  });
  document.getElementById('skuTB')?.addEventListener('click',e=>{
    const det=e.target.closest('.sku-det');if(det){openDetalleSKU(det.dataset.id);return;}
    const min=e.target.closest('.sku-min');if(min){openEditMinimo(min.dataset.id);return;}
  });
  renderRows();
}

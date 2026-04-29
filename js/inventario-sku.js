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
  registrarAjuste,
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
const PAGE_SIZE=50;
let skuVisibleLimit=PAGE_SIZE;
let movVisibleLimit=PAGE_SIZE;

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
  h+='<tbody id="skuTB"></tbody></table></div><div class="text-center mt-2 mb-3"><button class="btn btn-ghost btn-sm" id="skuVerMas" style="display:none">Ver más</button></div></div>';

  // Reporte de movimientos (FASE 3)
  if(isAdmin){
    h+='<div class="card mt-4">'
      +'<div class="card-head"><h3><i class="fas fa-history mr-2" style="color:#7c3aed"></i>Reporte de Movimientos</h3>'
      +'<span class="text-sm text-muted">Filtrable por SKU, tipo y fecha</span></div>'
      +'<div class="card-body pb-0">'
      +'<div class="form-row c4 mb-3">'
      +'<div><label class="form-label">SKU</label>'
      +'<input class="form-input" id="rmFSku" placeholder="Código SKU..." list="rmSkuL">'
      +'<datalist id="rmSkuL">'+getAllSkusResumen().map(s=>'<option value="'+esc(s.codigo)+'">').join('')+'</datalist></div>'
      +'<div><label class="form-label">Tipo</label>'
      +'<select class="form-select" id="rmFTipo">'
      +'<option value="">Todos</option>'
      +Object.entries(TIPO_MOV_LABEL).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')
      +'</select></div>'
      +'<div><label class="form-label">Desde</label><input class="form-input" type="date" id="rmFDesde"></div>'
      +'<div><label class="form-label">Hasta</label><input class="form-input" type="date" id="rmFHasta"></div>'
      +'</div></div>'
      +'<div class="table-wrap" id="rmTW"><table class="dt"><thead><tr>'
      +'<th>Fecha</th><th>SKU</th><th>Tipo</th>'
      +'<th style="text-align:right">Cant.</th>'
      +'<th style="text-align:right">Stock →</th>'
      +'<th>Referencia / Obs.</th>'
      +'<th>Usuario</th>'
      +'</tr></thead><tbody id="rmTB"></tbody></table></div>'
      +'<div class="text-center mt-2"><button class="btn btn-ghost btn-sm" id="rmVerMas" style="display:none">Ver más</button></div>'
      +'<div id="rmSummary" class="card-body text-xs text-muted pt-2 pb-3"></div>'
      +'</div>';
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
  const cc=document.getElementById('skuCount');if(cc)cc.textContent=Math.min(skuVisibleLimit,list.length)+' de '+list.length+' SKUs';
  if(!list.length){
    tb.innerHTML='<tr><td colspan="8" class="empty-state"><i class="fas fa-barcode"></i><p>Sin SKUs registrados</p><p class="text-sm text-muted">Usa "Inventario Inicial" para cargar el conteo físico del almacén</p></td></tr>';
    return;
  }
  tb.innerHTML=list.slice(0,skuVisibleLimit).map(s=>{
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
      +(isAdmin?'<button class="btn btn-sm btn-ghost sku-ajuste" data-id="'+s.id+'" title="Ajuste de inventario" style="color:#d97706"><i class="fas fa-balance-scale"></i></button>':'')
      +'</div></td>'
      +'</tr>';
  }).join('');
  const more=document.getElementById('skuVerMas');if(more)more.style.display=list.length>skuVisibleLimit?'inline-flex':'none';
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

// ─── REPORTE DE MOVIMIENTOS (FASE 3) ─────────────────────────────────────────
function renderReporte(){
  const tb=document.getElementById('rmTB');if(!tb)return;
  const fSku=(document.getElementById('rmFSku')?.value||'').trim().toLowerCase();
  const fTipo=(document.getElementById('rmFTipo')?.value||'');
  const fDesde=(document.getElementById('rmFDesde')?.value||'');
  const fHasta=(document.getElementById('rmFHasta')?.value||'');

  const skuMap={};(getStore().skus||[]).forEach(s=>{skuMap[s.id]=s;});
  let movs=(getStore().movimientosInventario||[]).slice().sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora));
  if(fSku){movs=movs.filter(m=>{const s=skuMap[m.sku_id];return s&&(s.codigo||'').toLowerCase().includes(fSku);});}
  if(fTipo)movs=movs.filter(m=>m.tipo===fTipo);
  if(fDesde)movs=movs.filter(m=>m.fecha_hora.slice(0,10)>=fDesde);
  if(fHasta)movs=movs.filter(m=>m.fecha_hora.slice(0,10)<=fHasta);
  if(!movs.length){
    tb.innerHTML='<tr><td colspan="7" class="empty-state" style="padding:20px"><i class="fas fa-history"></i><p>Sin movimientos con los filtros actuales</p></td></tr>';
    const s=document.getElementById('rmSummary');if(s)s.textContent='';
    return;
  }

  const visibles=movs.slice(0,movVisibleLimit);
  tb.innerHTML=visibles.map(m=>{
    const s=skuMap[m.sku_id];
    const tipoLabel=TIPO_MOV_LABEL[m.tipo]||m.tipo;
    const esPos=m.cantidad>0;
    const tipoColor=esPos?'#059669':'#dc2626';
    const tipoFondo=esPos?'#d1fae5':'#fef2f2';
    return'<tr>'
      +'<td class="text-xs font-mono" style="white-space:nowrap">'+fmtDate((m.fecha_hora||'').slice(0,10))+'</td>'
      +'<td><code style="font-weight:800;font-size:12px;color:var(--primary)">'+esc(s?.codigo||'?')+'</code></td>'
      +'<td><span style="background:'+tipoFondo+';color:'+tipoColor+';font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px">'+tipoLabel+'</span></td>'
      +'<td style="text-align:right;font-weight:700;color:'+tipoColor+'">'+(esPos?'+':'')+m.cantidad+'</td>'
      +'<td style="text-align:right;font-weight:700">'+m.stock_despues+'</td>'
      +'<td class="text-xs text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(m.documento_id||m.factura||m.observaciones||'—')+'">'+esc(m.documento_id||m.factura||m.observaciones||'—')+'</td>'
      +'<td class="text-xs text-muted">'+esc(m.creado_por||'—')+'</td>'
      +'</tr>';
  }).join('');

  // Resumen
  const totalPos=visibles.filter(m=>m.cantidad>0).reduce((t,m)=>t+m.cantidad,0);
  const totalNeg=visibles.filter(m=>m.cantidad<0).reduce((t,m)=>t+Math.abs(m.cantidad),0);
  const more=document.getElementById('rmVerMas');if(more)more.style.display=movs.length>movVisibleLimit?'inline-flex':'none';
  const sm=document.getElementById('rmSummary');
  if(sm)sm.innerHTML='<strong>'+Math.min(movVisibleLimit,movs.length)+' de '+movs.length+'</strong> movimientos · <span style="color:#059669">+'+totalPos+' entradas visibles</span> · <span style="color:#dc2626">−'+totalNeg+' salidas visibles</span>';
}

// ─── MODAL: AJUSTE DE INVENTARIO (FASE 3) ────────────────────────────────────
function openAjusteSKU(skuId){
  const sku=(getStore().skus||[]).find(s=>s.id===skuId);if(!sku)return;
  const art=(getStore().articulos||[]).find(a=>a.id===sku.articulo_id)||{};
  let h='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">';
  h+='<div><p class="text-xs text-muted" style="margin:0">'+esc(art.nombre||'')+'</p><code style="font-size:18px;font-weight:900;color:var(--primary)">'+esc(sku.codigo)+'</code></div>';
  h+='<div style="text-align:right"><p class="text-xs text-muted" style="margin:0">Stock actual</p><p style="font-size:32px;font-weight:900;margin:0;color:var(--primary)">'+sku.stock_fisico+'</p></div></div>';
  h+='<div class="form-group mb-3"><label class="form-label">Tipo de ajuste *</label>';
  h+='<div style="display:flex;gap:8px">';
  h+='<label style="flex:1;display:flex;align-items:center;gap:8px;border:2px solid var(--border);border-radius:8px;padding:10px 14px;cursor:pointer" id="ajPosLbl">';
  h+='<input type="radio" name="ajTipo" value="ajuste_positivo" id="ajPos" checked style="accent-color:#059669;width:16px;height:16px"><span style="font-weight:700;color:#059669"><i class="fas fa-plus mr-1"></i>Positivo</span><span class="text-xs text-muted ml-1">(suma stock)</span></label>';
  h+='<label style="flex:1;display:flex;align-items:center;gap:8px;border:2px solid var(--border);border-radius:8px;padding:10px 14px;cursor:pointer" id="ajNegLbl">';
  h+='<input type="radio" name="ajTipo" value="ajuste_negativo" id="ajNeg" style="accent-color:#dc2626;width:16px;height:16px"><span style="font-weight:700;color:#dc2626"><i class="fas fa-minus mr-1"></i>Negativo</span><span class="text-xs text-muted ml-1">(resta stock)</span></label>';
  h+='</div></div>';
  h+='<div class="form-group mb-3"><label class="form-label">Cantidad *</label>';
  h+='<div class="flex gap-2"><button class="btn btn-ghost" id="ajMinus" style="min-width:48px;font-size:22px">−</button>';
  h+='<input class="form-input" type="number" id="ajCant" min="1" value="1" style="text-align:center;font-size:26px;font-weight:900;flex:1">';
  h+='<button class="btn btn-ghost" id="ajPlus" style="min-width:48px;font-size:22px">+</button></div>';
  h+='<p class="text-xs text-muted mt-1" id="ajPreview">Nuevo stock estimado: <strong>'+(sku.stock_fisico+1)+'</strong></p></div>';
  h+='<div class="form-group"><label class="form-label">Motivo del ajuste *</label>';
  h+='<input class="form-input" id="ajMotivo" placeholder="Ej: Conteo físico 25/04/2026, pérdida, error de captura..." maxlength="200">';
  h+='<p class="text-xs text-muted mt-1"><i class="fas fa-lock mr-1"></i>Obligatorio. Queda registrado en el historial de movimientos.</p></div>';

  modal.open('Ajuste de Inventario — '+sku.codigo,h,'<button class="btn btn-ghost" id="ajCancel">Cancelar</button><button class="btn" style="background:#d97706;color:#fff" id="ajGuardar"><i class="fas fa-balance-scale mr-1"></i>Aplicar Ajuste</button>','md');

  function updatePreview(){
    const tipo=document.querySelector('input[name="ajTipo"]:checked')?.value||'ajuste_positivo';
    const cant=parseInt(document.getElementById('ajCant')?.value||'0',10)||0;
    const delta=tipo==='ajuste_negativo'?-cant:cant;
    const nuevo=sku.stock_fisico+delta;
    const el=document.getElementById('ajPreview');
    if(el)el.innerHTML='Nuevo stock estimado: <strong style="color:'+(nuevo<0?'#dc2626':nuevo===0?'#94a3b8':'#059669')+'">'+Math.max(0,nuevo)+'</strong>'+(nuevo<0?' <span style="color:#dc2626;font-size:11px">(stock insuficiente)</span>':'');
    // Highlight selected radio
    document.getElementById('ajPosLbl').style.borderColor=tipo==='ajuste_positivo'?'#059669':'var(--border)';
    document.getElementById('ajNegLbl').style.borderColor=tipo==='ajuste_negativo'?'#dc2626':'var(--border)';
  }

  document.getElementById('ajCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('ajMinus')?.addEventListener('click',()=>{const q=document.getElementById('ajCant');if(q)q.value=Math.max(1,parseInt(q.value||'1',10)-1);updatePreview();});
  document.getElementById('ajPlus')?.addEventListener('click',()=>{const q=document.getElementById('ajCant');if(q)q.value=parseInt(q.value||'0',10)+1;updatePreview();});
  document.getElementById('ajCant')?.addEventListener('input',updatePreview);
  document.querySelectorAll('input[name="ajTipo"]').forEach(r=>r.addEventListener('change',updatePreview));
  updatePreview();

  document.getElementById('ajGuardar')?.addEventListener('click',()=>{
    const tipo=document.querySelector('input[name="ajTipo"]:checked')?.value||'ajuste_positivo';
    const cant=parseInt(document.getElementById('ajCant')?.value||'0',10);
    const motivo=(document.getElementById('ajMotivo')?.value||'').trim();
    if(!motivo){notify('El motivo del ajuste es obligatorio','warning');return;}
    if(!cant||cant<=0){notify('La cantidad debe ser mayor a cero','warning');return;}
    const res=registrarAjuste({sku_id:skuId,cantidad:cant,tipo,motivo});
    if(!res.ok){notify(res.error||'Error al aplicar ajuste','error');return;}
    const delta=tipo==='ajuste_negativo'?-cant:cant;
    notify('Ajuste aplicado: '+(delta>0?'+':'')+delta+' en '+sku.codigo,'success');
    modal.close();
    renderRows();
  });
}

// ─── NOTA FASE 3.2: funciones movidas ────────────────────────────────────────
// openNuevaEntrega()    → entrega-sku.js
// openNuevaDevolucion() → devolucion-sku.js
// ─────────────────────────────────────────────────────────────────────────────

// ─── INIT ─────────────────────────────────────────────────────────────────────
export function init(){
  document.getElementById('skuBtnInicial')?.addEventListener('click',openInventarioInicial);
  document.getElementById('skuBtnEntrada')?.addEventListener('click',openEntradaProveedor);
  ['skuFCat','skuFMod'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{
    _f.cat=document.getElementById('skuFCat')?.value||'';
    _f.modelo=document.getElementById('skuFMod')?.value||'';
    skuVisibleLimit=PAGE_SIZE;
    renderRows();
  }));
  document.getElementById('skuFQ')?.addEventListener('input',function(){_f.q=this.value;skuVisibleLimit=PAGE_SIZE;renderRows();});
  document.getElementById('skuFBajo')?.addEventListener('change',function(){_f.bajoStock=this.checked;skuVisibleLimit=PAGE_SIZE;renderRows();});
  document.getElementById('skuFClear')?.addEventListener('click',()=>{
    _f={cat:'',modelo:'',bajoStock:false,q:''};
    skuVisibleLimit=PAGE_SIZE;
    ['skuFCat','skuFMod','skuFQ'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const cb=document.getElementById('skuFBajo');if(cb)cb.checked=false;
    renderRows();
  });
  document.getElementById('skuTB')?.addEventListener('click',e=>{
    const det=e.target.closest('.sku-det');if(det){openDetalleSKU(det.dataset.id);return;}
    const min=e.target.closest('.sku-min');if(min){openEditMinimo(min.dataset.id);return;}
    const aj=e.target.closest('.sku-ajuste');if(aj){openAjusteSKU(aj.dataset.id);return;}
  });
  document.getElementById('skuVerMas')?.addEventListener('click',()=>{skuVisibleLimit+=PAGE_SIZE;renderRows();});
  renderRows();
  // Reporte de movimientos (FASE 3)
  renderReporte();
  const resetReporte=()=>{movVisibleLimit=PAGE_SIZE;renderReporte();};
  ['rmFSku','rmFTipo','rmFDesde','rmFHasta'].forEach(id=>document.getElementById(id)?.addEventListener('input',resetReporte));
  ['rmFTipo'].forEach(id=>document.getElementById(id)?.addEventListener('change',resetReporte));
  document.getElementById('rmVerMas')?.addEventListener('click',()=>{movVisibleLimit+=PAGE_SIZE;renderReporte();});
}

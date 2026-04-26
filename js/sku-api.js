/**
 * sku-api.js — Lógica de negocio: Articulo, SKU, MovimientoInventario
 * FASE 1: Catálogo, generación de código SKU, inventario inicial
 * FASE 2+: entradas, salidas, devoluciones (se añaden aquí)
 */
import{getStore,saveArticulos,saveSkus,saveMovimientosInventario,saveDocumentosEntrega,saveDocumentosDevolucion,log}from'./storage.js';

// ─── MAPA DE ABREVIATURAS ──────────────────────────────────────────────────────
const ABREV={
  'PANTALON':'PANT','PANTALÓN':'PANT','PANTALON DE VESTIR':'PANT','PANTALÓN DE VESTIR':'PANT',
  'CAMISOLA':'CAM',
  'PLAYERA POLO TIPO A':'POL','PLAYERA POLO TIPO B':'POL','PLAYERA POLO':'POL',
  'PLAYERA PANTS':'PLY','PLAYERA':'PLY',
  'PANTS':'PNT',
  'CHAMARRA':'CHA','CHAMARA':'CHA',
  'CHALECO':'CHV',
  'BOTA':'BOTA','BOTAS':'BOTA',
  'CHOCLO':'CHO',
  'ZAPATO ESPECIAL':'ZAP','ZAPATO':'ZAP',
  'TENIS':'TEN',
  'SANDALIAS':'SAN','SANDALIA':'SAN',
  'GORRA':'GORR',
  'TOALLA':'TOA',
  'TERMO':'TER',
  'SOMBRILLA':'SOM',
  'CINTURON':'CINT','CINTURÓN':'CINT','CINTO':'CINT',
  'BUFANDA':'BUF',
  'PREMIO':'PREM',
};

export function getAbrevNombre(nombre){
  const n=(nombre||'').toUpperCase().trim();
  if(ABREV[n])return ABREV[n];
  // búsqueda parcial: la clave que más coincide
  let best='';let bestLen=0;
  for(const[k,v]of Object.entries(ABREV)){
    if(n.startsWith(k)&&k.length>bestLen){best=v;bestLen=k.length;}
    else if(k.startsWith(n)&&n.length>bestLen){best=v;bestLen=n.length;}
  }
  if(best)return best;
  // fallback: primeras 4 letras sin espacios
  return n.replace(/\s+/g,'').slice(0,4)||'ART';
}

function _fmtTalla(talla){
  if(!talla||['UNI','UNITALLA',''].includes((talla+'').trim().toUpperCase()))return'UNI';
  const t=(talla+'').trim().toUpperCase();
  const n=parseInt(t,10);
  if(!isNaN(n)&&String(n)===t)return String(n).padStart(3,'0'); // 34 → 034
  return t; // M, L, XL, XXL → tal cual
}

function _fmtModelo(modelo){
  const s=(modelo||'').toString().trim();
  if(!s)return'00';
  if(s.length>=4)return s.slice(-2); // "2026" → "26"
  return s.padStart(2,'0');
}

/**
 * Genera el código SKU.
 * Formato: ABBREV-TALLA-MODELO
 * Ejemplo: PANT-034-26
 */
export function generateSKUCode(nombre,talla,modelo_anio){
  const abrev=getAbrevNombre(nombre);
  const t=_fmtTalla(talla);
  const m=_fmtModelo(modelo_anio);
  return`${abrev}-${t}-${m}`;
}

// ─── CONSECUTIVOS ─────────────────────────────────────────────────────────────
export function nextNumeroEntrega(){
  const docs=getStore().documentosEntrega||[];
  const max=docs.reduce((m,d)=>{const n=parseInt((d.numero||'').replace(/\D/g,''),10)||0;return n>m?n:m;},0);
  return'ENT-'+String(max+1).padStart(5,'0');
}
export function nextNumeroDevolucion(){
  const docs=getStore().documentosDevolucion||[];
  const max=docs.reduce((m,d)=>{const n=parseInt((d.numero||'').replace(/\D/g,''),10)||0;return n>m?n:m;},0);
  return'DEV-'+String(max+1).padStart(5,'0');
}

// ─── ARTICULO ─────────────────────────────────────────────────────────────────
export function getArticulos(){return getStore().articulos||[];}

export function createArticulo({nombre,categoria,unidad,talla,modelo_anio,descripcion}){
  const s=getStore();
  if(!s.articulos)s.articulos=[];
  const art={
    id:'art_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    nombre:(nombre||'').trim(),
    categoria:categoria||'uniformes',
    unidad:unidad||'pieza',
    talla:(talla||'').trim()||null,
    modelo_anio:(modelo_anio||'').toString().trim(),
    descripcion:descripcion||'',
    activo:true,
    fecha_creacion:new Date().toISOString(),
    creado_por:_getUser()
  };
  s.articulos.push(art);
  saveArticulos();
  log('ART_CREATE',art.nombre+' '+art.modelo_anio,'INVENTARIO-SKU');
  return art;
}

// ─── SKU ──────────────────────────────────────────────────────────────────────
export function getSkus(){return getStore().skus||[];}
export function getSkuById(id){return(getStore().skus||[]).find(s=>s.id===id)||null;}
export function findSkuByCodigo(codigo){return(getStore().skus||[]).find(s=>s.codigo===codigo&&s.activo)||null;}

/**
 * Busca el SKU por código.
 * Si no existe → lo crea.
 * Si ya existe → lo devuelve sin crear duplicado.
 * Returns: {sku, created:boolean}
 */
export function createOrGetSKU(articuloId,{stock_minimo=5}={}){
  const s=getStore();
  if(!s.skus)s.skus=[];
  const art=(s.articulos||[]).find(a=>a.id===articuloId);
  if(!art)throw new Error('Artículo no encontrado: '+articuloId);
  const codigo=generateSKUCode(art.nombre,art.talla,art.modelo_anio);
  // ¿Ya existe un SKU activo con ese código?
  const existing=s.skus.find(k=>k.codigo===codigo&&k.activo);
  if(existing)return{sku:existing,created:false};
  // Crear nuevo SKU
  const sku={
    id:'sku_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    codigo,
    articulo_id:articuloId,
    stock_fisico:0,
    stock_minimo,
    activo:true,
    fecha_creacion:new Date().toISOString(),
    creado_por:_getUser()
  };
  s.skus.push(sku);
  saveSkus();
  log('SKU_CREATE',codigo,'INVENTARIO-SKU');
  return{sku,created:true};
}

export function updateStockMinimo(skuId,minimo){
  const s=getStore();
  const sku=(s.skus||[]).find(k=>k.id===skuId);
  if(!sku)return;
  sku.stock_minimo=Math.max(0,parseInt(minimo,10)||0);
  saveSkus();
  log('SKU_MIN_UPDATE',sku.codigo+' min='+sku.stock_minimo,'INVENTARIO-SKU');
}

// ─── MOVIMIENTO DE INVENTARIO (REGLA CARDINAL) ────────────────────────────────
/**
 * Todo cambio en stock_fisico DEBE pasar por esta función.
 * Registra stock_antes y stock_despues.
 * Lanza Error si la operación deja stock negativo.
 */
export function registrarMovimiento({tipo,sku_id,cantidad,documento_id=null,proveedor='',factura='',costo_unitario=0,foto_factura=null,observaciones=''}){
  const s=getStore();
  if(!s.movimientosInventario)s.movimientosInventario=[];
  const sku=(s.skus||[]).find(k=>k.id===sku_id);
  if(!sku)throw new Error('SKU no encontrado: '+sku_id);
  const stock_antes=sku.stock_fisico;
  const stock_despues=stock_antes+cantidad;
  if(stock_despues<0)throw new Error('Stock insuficiente. Disponible: '+stock_antes+'. Solicitado: '+Math.abs(cantidad));
  sku.stock_fisico=stock_despues;
  const id_mov='mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const mov={
    id:id_mov,
    fecha_hora:new Date().toISOString(),
    tipo,
    sku_id,
    cantidad,
    stock_antes,
    stock_despues,
    documento_id,
    proveedor:proveedor||'',
    factura:factura||'',
    costo_unitario:costo_unitario||0,
    foto_factura:foto_factura||null,
    observaciones:observaciones||'',
    creado_por:_getUser(),
    fecha_creacion:new Date().toISOString()
  };
  s.movimientosInventario.push(mov);
  saveSkus();
  saveMovimientosInventario();
  return mov;
}

// ─── INVENTARIO INICIAL ────────────────────────────────────────────────────────
/**
 * Carga el conteo físico del almacén como inventario_inicial.
 * Si el SKU ya tiene inventario_inicial → registra como ajuste_positivo.
 * Returns: {ok, sku, mov, ajuste?, error?}
 */
export function registrarInventarioInicial({nombre,categoria,unidad,talla,modelo_anio,descripcion,cantidad,observaciones}){
  const s=getStore();
  if(!s.articulos)s.articulos=[];
  if(!s.skus)s.skus=[];
  if(!s.movimientosInventario)s.movimientosInventario=[];
  const cant=parseInt(cantidad,10);
  if(isNaN(cant)||cant<=0)return{ok:false,error:'La cantidad debe ser mayor a cero'};
  if(!(nombre||'').trim())return{ok:false,error:'El nombre del artículo es obligatorio'};
  if(!(modelo_anio||'').toString().trim())return{ok:false,error:'El modelo/año es obligatorio'};
  // Buscar o crear artículo
  let art=(s.articulos).find(a=>
    a.nombre.toUpperCase().trim()===(nombre||'').toUpperCase().trim()&&
    (a.talla||'').trim()===(talla||'').trim()&&
    (a.modelo_anio||'').toString().trim()===(modelo_anio||'').toString().trim()
  );
  if(!art)art=createArticulo({nombre,categoria,unidad,talla,modelo_anio,descripcion});
  // Buscar o crear SKU (nunca duplica)
  const{sku}=createOrGetSKU(art.id);
  // ¿Ya existe inventario_inicial para este SKU?
  const yaInicial=(s.movimientosInventario).some(m=>m.sku_id===sku.id&&m.tipo==='inventario_inicial');
  const tipo=yaInicial?'ajuste_positivo':'inventario_inicial';
  try{
    const mov=registrarMovimiento({tipo,sku_id:sku.id,cantidad:cant,observaciones:observaciones||'Conteo físico '+new Date().toLocaleDateString('es-MX')});
    log('INV_'+tipo.toUpperCase(),sku.codigo+' +'+cant,'INVENTARIO-SKU');
    return{ok:true,sku,mov,ajuste:yaInicial};
  }catch(e){
    return{ok:false,error:e.message};
  }
}

// ─── ENTRADAS DE PROVEEDOR (FASE 3) ───────────────────────────────────────────
export function registrarEntradaCompra({skuId,articuloData=null,cantidad,proveedor,factura,costo_unitario=0,foto_factura=null,observaciones=''}){
  const s=getStore();
  if(!s.skus)s.skus=[];
  const cant=parseInt(cantidad,10);
  if(isNaN(cant)||cant<=0)return{ok:false,error:'Cantidad inválida'};
  let sku=null;
  if(skuId){
    sku=(s.skus).find(k=>k.id===skuId&&k.activo);
    if(!sku)return{ok:false,error:'SKU no encontrado'};
  }else if(articuloData){
    // Crear artículo y SKU si no existen
    let art=(s.articulos||[]).find(a=>
      a.nombre.toUpperCase().trim()===(articuloData.nombre||'').toUpperCase().trim()&&
      (a.talla||'').trim()===(articuloData.talla||'').trim()&&
      (a.modelo_anio||'').toString()===(articuloData.modelo_anio||'').toString()
    );
    if(!art)art=createArticulo(articuloData);
    const res=createOrGetSKU(art.id);
    sku=res.sku;
  }else{return{ok:false,error:'Proporciona skuId o articuloData'};}
  try{
    const mov=registrarMovimiento({tipo:'entrada_compra',sku_id:sku.id,cantidad:cant,proveedor,factura,costo_unitario,foto_factura,observaciones});
    log('ENTRADA_COMPRA',sku.codigo+' +'+cant+' Fac:'+factura,'INVENTARIO-SKU');
    return{ok:true,sku,mov};
  }catch(e){return{ok:false,error:e.message};}
}

// ─── DOCUMENTOS DE ENTREGA (FASE 2) ───────────────────────────────────────────
/**
 * Crea un DocumentoEntrega y descuenta stock de cada SKU.
 * Política todo-o-nada: valida stock de TODAS las líneas antes de tocar nada.
 * Cada línea genera un MovimientoInventario tipo 'salida_entrega' (cantidad negativa).
 */
export function registrarDocumentoEntrega({empleado_id='',empleado_nombre='',area='',observaciones='',lineas=[]}){
  const s=getStore();
  if(!s.documentosEntrega)s.documentosEntrega=[];
  if(!lineas.length)return{ok:false,error:'Agrega al menos un artículo'};
  for(const l of lineas){
    const sku=(s.skus||[]).find(k=>k.id===l.sku_id&&k.activo);
    if(!sku)return{ok:false,error:'SKU no encontrado: '+l.sku_id};
    if(sku.stock_fisico<l.cantidad)return{ok:false,error:'Stock insuficiente en '+sku.codigo+'. Disponible: '+sku.stock_fisico+'. Solicitado: '+l.cantidad};
  }
  const numero=nextNumeroEntrega();
  const doc_id='doc_ent_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const lineasCreadas=[];
  try{
    for(const l of lineas){
      const mov=registrarMovimiento({tipo:'salida_entrega',sku_id:l.sku_id,cantidad:-(l.cantidad),documento_id:doc_id,observaciones:observaciones||''});
      lineasCreadas.push({sku_id:l.sku_id,cantidad:l.cantidad,movimiento_id:mov.id});
    }
  }catch(e){return{ok:false,error:e.message};}
  const doc={id:doc_id,numero,empleado_id:empleado_id||null,empleado_nombre:empleado_nombre||'',area:area||'',observaciones:observaciones||'',lineas:lineasCreadas,fecha_hora:new Date().toISOString(),creado_por:_getUser()};
  s.documentosEntrega.push(doc);
  saveDocumentosEntrega();
  log('ENTREGA_CREATE',numero+' emp='+empleado_nombre+' lineas='+lineas.length,'INVENTARIO-SKU');
  return{ok:true,documento:doc};
}

/**
 * Crea un DocumentoDevolucion y suma stock a cada SKU.
 * Empleado devuelve prenda → stock_fisico sube.
 */
export function registrarDocumentoDevolucion({empleado_id='',empleado_nombre='',area='',observaciones='',lineas=[]}){
  const s=getStore();
  if(!s.documentosDevolucion)s.documentosDevolucion=[];
  if(!lineas.length)return{ok:false,error:'Agrega al menos un artículo'};
  const numero=nextNumeroDevolucion();
  const doc_id='doc_dev_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const lineasCreadas=[];
  try{
    for(const l of lineas){
      const sku=(s.skus||[]).find(k=>k.id===l.sku_id&&k.activo);
      if(!sku)return{ok:false,error:'SKU no encontrado: '+l.sku_id};
      const mov=registrarMovimiento({tipo:'entrada_devolucion',sku_id:l.sku_id,cantidad:l.cantidad,documento_id:doc_id,observaciones:observaciones||''});
      lineasCreadas.push({sku_id:l.sku_id,cantidad:l.cantidad,movimiento_id:mov.id});
    }
  }catch(e){return{ok:false,error:e.message};}
  const doc={id:doc_id,numero,empleado_id:empleado_id||null,empleado_nombre:empleado_nombre||'',area:area||'',observaciones:observaciones||'',lineas:lineasCreadas,fecha_hora:new Date().toISOString(),creado_por:_getUser()};
  s.documentosDevolucion.push(doc);
  saveDocumentosDevolucion();
  log('DEVOLUCION_CREATE',numero+' emp='+empleado_nombre+' lineas='+lineas.length,'INVENTARIO-SKU');
  return{ok:true,documento:doc};
}

export function getDocumentosEntrega(){return getStore().documentosEntrega||[];}
export function getDocumentosDevolucion(){return getStore().documentosDevolucion||[];}
export function getDocumentosEntregaByEmpleado(empleadoId){return(getStore().documentosEntrega||[]).filter(d=>d.empleado_id===empleadoId);}

// ─── CONSULTAS ────────────────────────────────────────────────────────────────
export function getMovimientosPorSKU(skuId){
  return(getStore().movimientosInventario||[]).filter(m=>m.sku_id===skuId).sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora));
}

export function getSkusConBajoStock(){
  return(getStore().skus||[]).filter(s=>s.activo&&s.stock_minimo>0&&s.stock_fisico<=s.stock_minimo);
}

/**
 * Devuelve un objeto SKU enriquecido con datos del artículo.
 */
export function getSkuResumen(sku){
  const art=(getStore().articulos||[]).find(a=>a.id===sku.articulo_id)||{};
  return{
    ...sku,
    nombre:art.nombre||'—',
    categoria:art.categoria||'uniformes',
    talla:art.talla||'UNI',
    modelo_anio:art.modelo_anio||'—',
    descripcion:art.descripcion||'',
    unidad:art.unidad||'pieza',
    bajoStock:sku.stock_minimo>0&&sku.stock_fisico<=sku.stock_minimo,
    sinStock:sku.stock_fisico===0
  };
}

export function getAllSkusResumen(){
  return(getStore().skus||[]).filter(s=>s.activo).map(getSkuResumen);
}

// ─── HELPER PRIVADO ───────────────────────────────────────────────────────────
function _getUser(){
  try{return JSON.parse(localStorage.getItem('_user')||'{}').name||'Sistema';}catch{return'Sistema';}
}

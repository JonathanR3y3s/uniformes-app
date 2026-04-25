import{STORAGE_KEY,VERSION}from'./config.js';import{normTalla}from'./utils.js';

// ─── Sync helper (carga diferida para evitar dependencias circulares) ─────────
let _syncEngine=null;
async function _getSync(){
  if(_syncEngine)return _syncEngine;
  try{_syncEngine=await import('./sync-engine.js');}catch(e){}
  return _syncEngine;
}
/** Push asíncrono a Supabase sin bloquear. */
function _push(collection,items){
  _getSync().then(s=>{
    if(s&&typeof s.queueCollectionPush==='function')s.queueCollectionPush(collection,items);
  }).catch(()=>{});
}
function _pushKV(key,value){
  _getSync().then(s=>{
    if(s&&typeof s.queueCollectionPush==='function')
      import('./supabase-client.js').then(c=>c.upsertKV(key,value)).catch(()=>{});
  }).catch(()=>{});
}
const store={employees:[],proveedores:[],inventario:[],entregas:[],salidas:[],areas:[],stockExtra:{},auditLog:[],comprasAlmacen:[],campanias:[],stockUniformes:[],encuestas:[]};
function key(s){return STORAGE_KEY+(s||'');}
function load(s,d){try{const r=localStorage.getItem(key(s));return r?JSON.parse(r):d;}catch(e){return d;}}
function save(s,v){try{localStorage.setItem(key(s),JSON.stringify(v));return true;}catch(e){console.error('[STORAGE] No se pudo guardar',s,e);notify_storage_warn();return false;}}
function notify_storage_warn(){/* silencioso — UI notifica si necesario */}
export function getStorageUsageKB(){try{let t=0;for(const k of Object.keys(localStorage))t+=localStorage.getItem(k)?.length||0;return Math.round(t/1024);}catch{return 0;}}
export function init(REGLAS){
  store.employees=load('',[]);
  store.employees.forEach(emp=>{if(!emp||!emp.tallas)return;const fixed={};Object.entries(emp.tallas).forEach(([k,v])=>{const tt=normTalla(v);if(tt)fixed[k]=tt;});emp.tallas=fixed;});
  store.proveedores=load('_proveedores',[]);
  store.inventario=load('_inventario',[]);
  store.entregas=load('_entregas',[]);
  store.salidas=load('_salidas',[]);
  store.areas=load('_areas',[]);
  store.auditLog=load('_log',[]);
  store.stockExtra=load('_stock',{});
  store.comprasAlmacen=load('_compras_almacen',[]);
  store.campanias=load('_campanias',[]);
  store.stockUniformes=load('_stock_uniformes',[]);
  store.encuestas=load('_encuestas',[]);
  const fixed={};Object.entries(store.stockExtra).forEach(([prenda,tallas])=>{fixed[prenda]=fixed[prenda]||{};Object.entries(tallas||{}).forEach(([t,c])=>{const tt=normTalla(t);const n=Math.max(0,parseInt(c,10)||0);if(tt&&n>0)fixed[prenda][tt]=(fixed[prenda][tt]||0)+n;});if(!Object.keys(fixed[prenda]).length)delete fixed[prenda];});store.stockExtra=fixed;
  if(!store.areas.length&&REGLAS){store.areas=Object.keys(REGLAS).map(n=>({nombre:n,activa:true}));saveAreas();}
  let changed=false;store.employees.forEach(emp=>{if(emp.area==='SUPERVISORES'&&emp.tallas&&Object.keys(emp.tallas).length>0&&!emp.capturadoManual){emp.capturadoManual=true;changed=true;}});if(changed)saveEmployees();
}
export function getStore(){return store;}
export function saveEmployees(){save('',store.employees);_push('employees',store.employees);}
export function saveProveedores(){save('_proveedores',store.proveedores);_push('proveedores',store.proveedores);}
export function saveInventario(){save('_inventario',store.inventario);_push('inventario',store.inventario);}
export function saveEntregas(){save('_entregas',store.entregas);_push('entregas',store.entregas);}
export function saveSalidas(){save('_salidas',store.salidas);_push('salidas',store.salidas);}
export function saveAreas(){save('_areas',store.areas);_push('areas',store.areas);}
export function saveStockExtra(){save('_stock',store.stockExtra);_pushKV('stockExtra',store.stockExtra);}
export function saveComprasAlmacen(){save('_compras_almacen',store.comprasAlmacen);_push('comprasAlmacen',store.comprasAlmacen);}
export function saveAuditLog(){save('_log',store.auditLog.slice(-1000));}  // audit log: no sync (voluminoso)
export function saveCampanias(){save('_campanias',store.campanias);_push('campanias',store.campanias);}
export function saveStockUniformes(){save('_stock_uniformes',store.stockUniformes);_push('stockUniformes',store.stockUniformes);}
export function saveEncuestas(){save('_encuestas',store.encuestas);_push('encuestas',store.encuestas);}
export function log(action,det,modulo){store.auditLog.push({ts:new Date().toISOString(),action,det:det||'',modulo:modulo||'',user:_getCurrentUser()});saveAuditLog();}
function _getCurrentUser(){try{const u=JSON.parse(localStorage.getItem('_user')||'{}');return u.name||u.id||'—';}catch{return'—';}}
export function getStockExtra(prenda,talla){return parseInt((store.stockExtra[prenda]||{})[normTalla(talla)]||0,10);}
export function setStockExtra(prenda,talla,cantidad){if(!store.stockExtra[prenda])store.stockExtra[prenda]={};const tt=normTalla(talla);const n=Math.max(0,parseInt(cantidad,10)||0);if(n>0)store.stockExtra[prenda][tt]=n;else delete store.stockExtra[prenda][tt];if(!Object.keys(store.stockExtra[prenda]).length)delete store.stockExtra[prenda];saveStockExtra();}
/** Genera snapshot completo para backup */
export function buildBackup(){
  const s=store;
  return{
    _meta:{version:VERSION,exportedAt:new Date().toISOString(),counts:{employees:s.employees.length,entregas:s.entregas.length,proveedores:s.proveedores.length,inventario:s.inventario.length,salidas:s.salidas.length,comprasAlmacen:s.comprasAlmacen.length,campanias:s.campanias.length,stockUniformes:s.stockUniformes.length,encuestas:s.encuestas.length,auditLog:s.auditLog.length}},
    employees:s.employees,proveedores:s.proveedores,inventario:s.inventario,
    entregas:s.entregas,salidas:s.salidas,stockExtra:s.stockExtra,areas:s.areas,
    auditLog:s.auditLog,comprasAlmacen:s.comprasAlmacen,campanias:s.campanias,
    stockUniformes:s.stockUniformes,encuestas:s.encuestas,
    users:JSON.parse(localStorage.getItem('_users_store')||'[]'),
    areasRules:JSON.parse(localStorage.getItem('_areas_rules')||'{}'),
    catalogoProveedores:JSON.parse(localStorage.getItem('_cats_provs')||'[]'),
  };
}
/** Restaura desde backup validado — retorna {ok,errors[]} */
export function restoreBackup(bk){
  const errors=[];
  if(!bk||typeof bk!=='object'){return{ok:false,errors:['Archivo inválido']};}
  if(!bk.employees||!Array.isArray(bk.employees))errors.push('Falta employees');
  if(!bk.entregas||!Array.isArray(bk.entregas))errors.push('Falta entregas');
  if(errors.length)return{ok:false,errors};
  // Aplicar
  store.employees=bk.employees||[];store.proveedores=bk.proveedores||[];
  store.inventario=bk.inventario||[];store.entregas=bk.entregas||[];
  store.salidas=bk.salidas||[];store.stockExtra=bk.stockExtra||{};
  store.areas=bk.areas||[];store.auditLog=bk.auditLog||[];
  store.comprasAlmacen=bk.comprasAlmacen||[];store.campanias=bk.campanias||[];
  store.stockUniformes=bk.stockUniformes||[];store.encuestas=bk.encuestas||[];
  saveEmployees();saveProveedores();saveInventario();saveEntregas();saveSalidas();
  saveStockExtra();saveAreas();saveAuditLog();saveComprasAlmacen();
  saveCampanias();saveStockUniformes();saveEncuestas();
  if(bk.users)localStorage.setItem('_users_store',JSON.stringify(bk.users));
  if(bk.areasRules)localStorage.setItem('_areas_rules',JSON.stringify(bk.areasRules));
  if(bk.catalogoProveedores)localStorage.setItem('_cats_provs',JSON.stringify(bk.catalogoProveedores));
  log('RESTORE','Backup restaurado — v'+(bk._meta?.version||'?')+' exportado '+( bk._meta?.exportedAt||'?'),'CONFIG');
  return{ok:true,errors:[]};
}

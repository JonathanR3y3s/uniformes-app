import{STORAGE_KEY}from'./config.js';import{normTalla}from'./utils.js';
const store={employees:[],proveedores:[],inventario:[],entregas:[],salidas:[],areas:[],stockExtra:{},auditLog:[],comprasAlmacen:[]};
function key(s){return STORAGE_KEY+(s||'');}
function load(s,d){try{const r=localStorage.getItem(key(s));return r?JSON.parse(r):d;}catch(e){return d;}}
function save(s,v){try{localStorage.setItem(key(s),JSON.stringify(v));return true;}catch(e){return false;}}
export function init(REGLAS){store.employees=load('',[]);store.employees.forEach(emp=>{if(!emp||!emp.tallas)return;const fixed={};Object.entries(emp.tallas).forEach(([k,v])=>{const tt=normTalla(v);if(tt)fixed[k]=tt;});emp.tallas=fixed;});store.proveedores=load('_proveedores',[]);store.inventario=load('_inventario',[]);store.entregas=load('_entregas',[]);store.salidas=load('_salidas',[]);store.areas=load('_areas',[]);store.auditLog=load('_log',[]);store.stockExtra=load('_stock',{});store.comprasAlmacen=load('_compras_almacen',[]);const fixed={};Object.entries(store.stockExtra).forEach(([prenda,tallas])=>{fixed[prenda]=fixed[prenda]||{};Object.entries(tallas||{}).forEach(([t,c])=>{const tt=normTalla(t);const n=Math.max(0,parseInt(c,10)||0);if(tt&&n>0)fixed[prenda][tt]=(fixed[prenda][tt]||0)+n;});if(!Object.keys(fixed[prenda]).length)delete fixed[prenda];});store.stockExtra=fixed;if(!store.areas.length&&REGLAS){store.areas=Object.keys(REGLAS).map(n=>({nombre:n,activa:true}));saveAreas();}let changed=false;store.employees.forEach(emp=>{if(emp.area==='SUPERVISORES'&&emp.tallas&&Object.keys(emp.tallas).length>0&&!emp.capturadoManual){emp.capturadoManual=true;changed=true;}});if(changed)saveEmployees();}
export function getStore(){return store;}
export function saveEmployees(){save('',store.employees);}
export function saveProveedores(){save('_proveedores',store.proveedores);}
export function saveInventario(){save('_inventario',store.inventario);}
export function saveEntregas(){save('_entregas',store.entregas);}
export function saveSalidas(){save('_salidas',store.salidas);}
export function saveAreas(){save('_areas',store.areas);}
export function saveStockExtra(){save('_stock',store.stockExtra);}
export function saveComprasAlmacen(){save('_compras_almacen',store.comprasAlmacen);}
export function saveAuditLog(){save('_log',store.auditLog.slice(-500));}
export function log(action,det){store.auditLog.push({ts:new Date().toISOString(),action,det:det||''});saveAuditLog();}
export function getStockExtra(prenda,talla){return parseInt((store.stockExtra[prenda]||{})[normTalla(talla)]||0,10);}
export function setStockExtra(prenda,talla,cantidad){if(!store.stockExtra[prenda])store.stockExtra[prenda]={};const tt=normTalla(talla);const n=Math.max(0,parseInt(cantidad,10)||0);if(n>0)store.stockExtra[prenda][tt]=n;else delete store.stockExtra[prenda][tt];if(!Object.keys(store.stockExtra[prenda]).length)delete store.stockExtra[prenda];saveStockExtra();}

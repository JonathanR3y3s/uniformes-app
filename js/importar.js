import{getStore,saveEmployees,saveProveedores,saveEntregas,saveSalidas,saveStockExtra,saveAreas,saveAuditLog,saveInventario,saveComprasAlmacen,log}from'./storage.js';import{STORAGE_KEY}from'./config.js';
import{esc}from'./utils.js';
import{notify,confirm}from'./ui.js';
import{getAreaNames}from'./areas-config.js';

let importData=null;
let currentTab='excel';

// ── Render ──────────────────────────────────────────────────────────────────
export function render(){
  let h='<div class="page-head"><div class="page-title"><h1>Importar / Restaurar</h1><p>Carga empleados desde Excel o restaura un respaldo completo</p></div></div>';
  h+='<div class="tabs mb-4">';
  h+='<button class="tab-btn'+(currentTab==='excel'?' active':'')+'" id="tabExcel">📊 Importar desde Excel</button>';
  h+='<button class="tab-btn'+(currentTab==='restore'?' active':'')+'" id="tabRestore">💾 Restaurar respaldo JSON</button>';
  h+='</div>';
  h+='<div id="impTabContent">'+renderTab()+'</div>';
  return h;
}

function renderTab(){
  return currentTab==='excel'?renderExcel():renderRestore();
}

// ── Tab Excel ────────────────────────────────────────────────────────────────
function renderExcel(){
  let h='<div class="card"><div class="card-body">';
  h+='<div class="dropzone" id="dropZ"><i class="fas fa-file-excel" style="color:#22c55e"></i>';
  h+='<p class="font-bold" style="font-size:16px">Arrastra tu archivo aquí</p>';
  h+='<p class="text-sm text-muted">o toca para seleccionar (.xlsx, .csv)</p>';
  h+='<input type="file" id="fileI" accept=".xlsx,.xls,.csv" style="display:none"></div>';
  h+='<div class="mt-4"><h3 class="mb-3">Columnas esperadas en el archivo:</h3>';
  h+='<div class="card" style="background:var(--surface-2)"><div class="card-body"><table class="dt"><thead><tr><th>Columna</th><th>Descripción</th><th>Requerido</th></tr></thead><tbody>';
  [['ID','Número de empleado','Sí'],['NOMBRE','Nombre(s)','Sí'],['PATERNO','Apellido paterno','No'],['MATERNO','Apellido materno','No'],['AREA','Área de trabajo','Sí'],['ESTADO','activo / baja / movimiento','No']].forEach(r=>{
    h+='<tr><td class="font-bold">'+r[0]+'</td><td>'+r[1]+'</td><td>'+(r[2]==='Sí'?'<span class="badge badge-success">Sí</span>':'—')+'</td></tr>';
  });
  h+='</tbody></table></div></div></div>';
  h+='<div id="impP" class="mt-4"></div></div></div>';
  return h;
}

function handleExcelFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{defval:''});
      if(!data.length){notify('Archivo vacío','warning');return;}
      previewExcel(data);
    }catch(err){notify('Error al leer archivo: '+err.message,'error');}
  };
  reader.readAsArrayBuffer(file);
}

function previewExcel(data){
  const cols=Object.keys(data[0]||{});
  const hasID=cols.some(c=>c.toUpperCase()==='ID');
  const hasNom=cols.some(c=>c.toUpperCase()==='NOMBRE');
  const hasArea=cols.some(c=>c.toUpperCase()==='AREA');
  let h='<h3 class="mb-3">'+data.length+' registros encontrados</h3>';
  if(!hasID||!hasNom||!hasArea){
    h+='<div class="card mb-4" style="background:var(--danger-light);border-color:var(--danger)"><div class="card-body"><p class="font-bold" style="color:var(--danger)"><i class="fas fa-exclamation-triangle"></i> Columnas faltantes</p><p class="text-sm mt-1">Necesita: ID, NOMBRE, AREA — Encontradas: '+cols.join(', ')+'</p></div></div>';
  } else {
    h+='<div class="card mb-4" style="background:var(--success-light);border-color:var(--success)"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div><p class="font-bold" style="color:var(--success)"><i class="fas fa-check-circle"></i> Formato válido</p><p class="text-sm">'+data.length+' empleados listos para importar</p></div><button class="btn btn-success" id="execImp"><i class="fas fa-download"></i> Importar '+data.length+' empleados</button></div></div>';
    h+='<div class="table-wrap" style="max-height:280px"><table class="dt"><thead><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>';
    data.slice(0,10).forEach(r=>{h+='<tr>'+cols.map(c=>'<td class="text-xs">'+esc(String(r[c]||''))+'</td>').join('')+'</tr>';});
    h+='</tbody></table></div><p class="text-xs text-muted mt-2">Mostrando primeros 10 de '+data.length+'</p>';
  }
  importData=data;
  document.getElementById('impP').innerHTML=h;
  document.getElementById('execImp')?.addEventListener('click',execExcelImport);
}

function execExcelImport(){
  if(!importData||!importData.length)return;
  const validAreas=new Set(getAreaNames());
  let count=0,skipped=0,areaWarn=[];
  importData.forEach(r=>{
    const cols=Object.keys(r);
    const get=c=>{const k=cols.find(x=>x.toUpperCase()===c.toUpperCase());return k?(r[k]||'').toString().trim():'';};
    const id=get('ID');const nom=get('NOMBRE');
    if(!id||!nom){skipped++;return;}
    const area=get('AREA')||'PLANTA';
    if(area&&!validAreas.has(area))areaWarn.push(id+' ('+area+')');
    const ex=getStore().employees.find(e=>e.id===id);
    if(ex){ex.nombre=nom;ex.paterno=get('PATERNO');ex.materno=get('MATERNO');if(area)ex.area=area;const est=get('ESTADO');if(est)ex.estado=est.toLowerCase();}
    else{getStore().employees.push({id,nombre:nom,paterno:get('PATERNO'),materno:get('MATERNO'),area,estado:(get('ESTADO')||'activo').toLowerCase(),tallas:{},perfilDotacion:'AUTO'});}
    count++;
  });
  saveEmployees();
  log('IMPORTAR_EXCEL',count+' empleados ('+skipped+' omitidos)');
  let msg=count+' empleados importados';
  if(skipped)msg+=' · '+skipped+' omitidos sin ID/Nombre';
  notify(msg,'success');
  if(areaWarn.length)notify('Áreas desconocidas en: '+areaWarn.slice(0,3).join(', ')+(areaWarn.length>3?' y '+(areaWarn.length-3)+' más':''),'warning');
  importData=null;
  document.getElementById('impP').innerHTML='<div class="card" style="background:var(--success-light);border-color:var(--success)"><div class="card-body"><p class="font-bold" style="color:var(--success)"><i class="fas fa-check-circle"></i> Importación completada</p><p class="text-sm">'+count+' registros procesados.</p></div></div>';
}

// ── Tab Restaurar JSON ───────────────────────────────────────────────────────
function renderRestore(){
  let h='<div class="card mb-4"><div class="card-body">';
  h+='<div class="dropzone" id="dropRZ"><i class="fas fa-file-code" style="color:#6366f1"></i>';
  h+='<p class="font-bold" style="font-size:16px">Arrastra el archivo de respaldo</p>';
  h+='<p class="text-sm text-muted">o toca para seleccionar (.json)</p>';
  h+='<input type="file" id="fileR" accept=".json" style="display:none"></div>';
  h+='</div></div>';
  h+='<div id="restP"></div>';
  h+='<div class="card mt-4" style="background:var(--warning-bg);border-color:var(--warning)"><div class="card-body">';
  h+='<p class="text-sm font-bold" style="color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> Importante</p>';
  h+='<p class="text-xs text-muted mt-2">Restaurar un respaldo <strong>reemplaza</strong> todos los datos actuales. Haz un respaldo del estado actual antes de restaurar. Solo se aceptan respaldos generados por esta aplicación (versión 5.0 o superior).</p>';
  h+='</div></div>';
  return h;
}

function handleRestoreFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const bk=JSON.parse(e.target.result);
      previewRestore(bk);
    }catch(err){notify('Archivo inválido o corrupto: '+err.message,'error');}
  };
  reader.readAsText(file);
}

function previewRestore(bk){
  const ver=bk._meta?.version||bk.version||'';
  const VERSIONES_VALIDAS=['5.0','6.0','6.1','6.2','6.3','6.4','6.5','6.6','6.7','6.8','6.9','7.0'];
  if(!ver||!VERSIONES_VALIDAS.includes(ver)){
    document.getElementById('restP').innerHTML='<div class="card" style="background:var(--danger-light);border-color:var(--danger)"><div class="card-body"><p class="font-bold" style="color:var(--danger)"><i class="fas fa-times-circle"></i> Archivo incompatible</p><p class="text-sm mt-1">Este archivo no es un respaldo válido de Control Store Pro (versión '+(ver||'desconocida')+').</p></div></div>';
    return;
  }
  const emps=(bk.employees||[]).length;
  const ents=(bk.entregas||[]).length;
  const provs=(bk.proveedores||[]).length;
  const inv=(bk.inventario||[]).length;
  const users=(bk.users||[]).length;
  const areas=Object.keys(bk.areasRules||{}).length;
  const exportedAt=bk._meta?.exportedAt||bk.exportedAt||'';
  const fecha=exportedAt?new Date(exportedAt).toLocaleString('es-MX'):'Desconocida';

  let h='<div class="card" style="background:var(--info-bg);border-color:var(--info)"><div class="card-body">';
  h+='<p class="font-bold mb-3" style="color:var(--info)"><i class="fas fa-database"></i> Respaldo v'+ver+' — '+fecha+'</p>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:16px">';
  [[emps,'fa-users','Empleados'],[ents,'fa-hand-holding','Entregas'],[provs,'fa-truck','Compras'],[inv,'fa-boxes','Inventario'],[users,'fa-user-shield','Usuarios'],[areas,'fa-layer-group','Áreas']].forEach(([n,ic,lab])=>{
    h+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;text-align:center">';
    h+='<i class="fas '+ic+'" style="font-size:18px;color:var(--info);margin-bottom:4px;display:block"></i>';
    h+='<div style="font-size:20px;font-weight:700">'+n+'</div>';
    h+='<div style="font-size:10px;color:var(--text-muted)">'+lab+'</div></div>';
  });
  h+='</div>';
  h+='<button class="btn btn-danger" id="execRestore" style="width:100%"><i class="fas fa-undo"></i> Restaurar este respaldo (reemplaza todo)</button>';
  h+='</div></div>';
  document.getElementById('restP').innerHTML=h;
  document.getElementById('execRestore')?.addEventListener('click',()=>execRestore(bk));
}

function execRestore(bk){
  if(!confirm('⚠️ ¿Restaurar el respaldo?\n\nEsto reemplazará TODOS los datos actuales:\n· Empleados, entregas, proveedores, inventario\n· Usuarios y reglas de áreas\n\nEsta acción no se puede deshacer.'))return;
  const store=getStore();
  // Datos del store principal
  store.employees=bk.employees||[];
  store.proveedores=bk.proveedores||[];
  store.inventario=bk.inventario||[];
  store.entregas=bk.entregas||[];
  store.salidas=bk.salidas||[];
  store.stockExtra=bk.stockExtra||{};
  store.areas=bk.areas||[];
  store.auditLog=bk.auditLog||[];store.comprasAlmacen=bk.comprasAlmacen||[];
  saveEmployees();saveProveedores();saveInventario();saveEntregas();saveSalidas();saveStockExtra();saveAreas();saveAuditLog();saveComprasAlmacen();
  // Datos externos
  if(bk.users&&bk.users.length)localStorage.setItem('_users_store',JSON.stringify(bk.users));
  if(bk.areasRules&&Object.keys(bk.areasRules).length)localStorage.setItem('_areas_rules',JSON.stringify(bk.areasRules));
  if(bk.catalogoProveedores&&bk.catalogoProveedores.length)localStorage.setItem('_cats_provs',JSON.stringify(bk.catalogoProveedores));
  const _ver=bk._meta?.version||bk.version||'?';const _at=bk._meta?.exportedAt||bk.exportedAt||'?';
  log('RESTAURAR','Respaldo v'+_ver+' — '+_at);
  notify('Respaldo restaurado correctamente — recargando...','success');
  setTimeout(()=>location.reload(),1500);
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function init(){
  // Tabs
  document.getElementById('tabExcel')?.addEventListener('click',()=>{currentTab='excel';document.getElementById('impTabContent').innerHTML=renderTab();initTabListeners();});
  document.getElementById('tabRestore')?.addEventListener('click',()=>{currentTab='restore';document.getElementById('impTabContent').innerHTML=renderTab();initTabListeners();});
  initTabListeners();
}

function initTabListeners(){
  if(currentTab==='excel'){
    const dz=document.getElementById('dropZ');const fi=document.getElementById('fileI');
    if(dz){
      dz.addEventListener('click',()=>fi.click());
      dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover');});
      dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));
      dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');if(e.dataTransfer.files.length)handleExcelFile(e.dataTransfer.files[0]);});
    }
    fi?.addEventListener('change',function(){if(this.files.length)handleExcelFile(this.files[0]);});
  } else {
    const dz=document.getElementById('dropRZ');const fi=document.getElementById('fileR');
    if(dz){
      dz.addEventListener('click',()=>fi.click());
      dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover');});
      dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));
      dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');if(e.dataTransfer.files.length)handleRestoreFile(e.dataTransfer.files[0]);});
    }
    fi?.addEventListener('change',function(){if(this.files.length)handleRestoreFile(this.files[0]);});
  }
}

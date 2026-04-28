import{getStore,saveEmployees,saveProveedores,saveEntregas,saveSalidas,saveStockExtra,saveAreas,saveAuditLog,saveInventario,saveComprasAlmacen,log}from'./storage.js';import{STORAGE_KEY}from'./config.js';
import{esc}from'./utils.js';
import{notify,confirm}from'./ui.js';
import{getAreaNames}from'./areas-config.js';

let importData=null;
let flexImport=null;
let currentTab='excel';

// ── Render ──────────────────────────────────────────────────────────────────
export function render(){
  let h='<div class="page-head"><div class="page-title"><h1>Importar / Restaurar</h1><p>Carga empleados desde Excel o restaura un respaldo completo</p></div></div>';
  h+='<div class="tabs mb-4">';
  h+='<button class="tab-btn'+(currentTab==='excel'?' active':'')+'" id="tabExcel">📊 Importar desde Excel</button>';
  h+='<button class="tab-btn'+(currentTab==='flex-employees'?' active':'')+'" id="tabFlexEmp">👥 Empleados con Tallas</button>';
  h+='<button class="tab-btn'+(currentTab==='restore'?' active':'')+'" id="tabRestore">💾 Restaurar respaldo JSON</button>';
  h+='</div>';
  h+='<div id="impTabContent">'+renderTab()+'</div>';
  return h;
}

function renderTab(){
  if(currentTab==='excel')return renderExcel();
  if(currentTab==='flex-employees')return renderFlexibleEmployees();
  return renderRestore();
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

// ── Tab Empleados con Tallas flexible ───────────────────────────────────────
const FLEX_FIELDS=[
  ['','Ignorar columna'],['id','No.Empleado'],['nombre','Nombre'],['paterno','Apellido paterno'],['materno','Apellido materno'],['area','Área'],['estado','Estado'],
  ['talla_camisa','Talla camisa'],['talla_pantalon','Talla pantalón'],['talla_zapato','Talla zapato'],['talla_chamarra','Talla chamarra'],['talla_playera','Talla playera'],['talla_sudadera','Talla sudadera'],['talla_overol','Talla overol'],['talla_bata','Talla bata'],['talla_guantes','Talla guantes'],['talla_lentes','Talla lentes'],['talla_casco','Talla casco']
];
function renderFlexibleEmployees(){
  let h='<div class="card"><div class="card-body">';
  h+='<div class="dropzone" id="flexDropZ"><i class="fas fa-users" style="color:#2563eb"></i>';
  h+='<p class="font-bold" style="font-size:16px">Importar Empleados con Tallas</p>';
  h+='<p class="text-sm text-muted">Acepta cualquier encabezado: primero cargas, luego mapeas manualmente.</p>';
  h+='<input type="file" id="flexFileI" accept=".xlsx,.xls,.csv" style="display:none"></div>';
  h+='<div class="mt-4 card" style="background:var(--surface-2)"><div class="card-body"><p class="font-bold mb-2">Campos internos disponibles</p>';
  h+='<p class="text-sm text-muted">No.Empleado, Nombre, Apellidos, Área, Estado y tallas por prenda. Las columnas no mapeadas se ignoran y las celdas vacías se toman como “Sin talla”.</p></div></div>';
  h+='<div id="flexP" class="mt-4"></div></div></div>';
  return h;
}
function normalizeCol(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s._-]+/g,'').toLowerCase();}
function guessFlexField(col){const n=normalizeCol(col);if(['id','numeroempleado','noempleado','numempleado','empleado','codigo','nomina'].includes(n))return'id';if(['nombre','nombres','name'].includes(n))return'nombre';if(['paterno','apellidopaterno','apaterno'].includes(n))return'paterno';if(['materno','apellidomaterno','amaterno'].includes(n))return'materno';if(['area','departamento','depto'].includes(n))return'area';if(['estado','estatus','status'].includes(n))return'estado';if(n.includes('camisa'))return'talla_camisa';if(n.includes('pantalon'))return'talla_pantalon';if(n.includes('zapato')||n.includes('calzado'))return'talla_zapato';if(n.includes('chamarra'))return'talla_chamarra';if(n.includes('playera'))return'talla_playera';if(n.includes('sudadera'))return'talla_sudadera';if(n.includes('overol'))return'talla_overol';if(n.includes('bata'))return'talla_bata';if(n.includes('guante'))return'talla_guantes';if(n.includes('lente'))return'talla_lentes';if(n.includes('casco'))return'talla_casco';return'';}
function handleFlexibleEmployeesFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const headers=(rows[0]||[]).map(x=>String(x||'').trim());
      const body=rows.slice(1).filter(r=>(r||[]).some(c=>String(c||'').trim()));
      if(!headers.some(Boolean)||!body.length){document.getElementById('flexP').innerHTML='<div class="card" style="background:var(--warning-bg);border-color:var(--warning)"><div class="card-body"><p class="font-bold" style="color:var(--warning)">Archivo sin datos</p></div></div>';notify('Archivo sin datos','warning');return;}
      flexImport={headers,rows:body,analysis:null};
      renderFlexibleMapping();
    }catch(err){notify('Error al leer archivo: '+err.message,'error');}
  };
  reader.readAsArrayBuffer(file);
}
function renderFlexibleMapping(){
  if(!flexImport)return;
  let h='<h3 class="mb-3">'+flexImport.rows.length+' filas encontradas</h3>';
  h+='<div class="card mb-4"><div class="card-head"><h3>Mapeo manual de columnas</h3></div><div class="card-body">';
  h+='<p class="text-sm text-muted mb-3">Columnas encontradas: '+flexImport.headers.map(c=>'<span class="badge badge-neutral">'+esc(c||'Columna vacía')+'</span>').join(' ')+'</p>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr><th>Columna del Excel</th><th>Mapear a</th></tr></thead><tbody>';
  flexImport.headers.forEach((c,i)=>{const g=guessFlexField(c);h+='<tr><td class="font-bold">'+esc(c||('Columna '+(i+1)))+'</td><td><select class="form-select flex-map" data-col="'+i+'">'+FLEX_FIELDS.map(([v,l])=>'<option value="'+v+'"'+(v===g?' selected':'')+'>'+l+'</option>').join('')+'</select></td></tr>';});
  h+='</tbody></table></div><button class="btn btn-success mt-4" id="flexAnalyze"><i class="fas fa-search"></i> Analizar archivo</button></div></div>';
  h+='<div id="flexAnalysis"></div>';
  document.getElementById('flexP').innerHTML=h;
  document.getElementById('flexAnalyze')?.addEventListener('click',analyzeFlexibleEmployees);
}
function collectFlexMap(){const map={};document.querySelectorAll('.flex-map').forEach(s=>{if(s.value)map[parseInt(s.dataset.col,10)]=s.value;});return map;}
function buildFlexParsed(map){
  const rows=[];const errors=[];const excelById={};
  flexImport.rows.forEach((r,idx)=>{const rowNum=idx+2;const emp={id:'',nombre:'',paterno:'',materno:'',area:'',estado:'activo',tallas:{},_row:rowNum};Object.entries(map).forEach(([col,field])=>{const val=String(r[Number(col)]??'').trim();if(field.startsWith('talla_'))emp.tallas[field.replace('talla_','')]=val;else emp[field]=val;});if(!emp.id)errors.push('Fila '+rowNum+': número de empleado vacío');if(!emp.nombre)errors.push('Fila '+rowNum+': nombre vacío');if(emp.id){excelById[emp.id]=excelById[emp.id]||[];excelById[emp.id].push(emp);}rows.push(emp);});
  const excelDuplicates=Object.entries(excelById).filter(([,list])=>list.length>1).map(([id,list])=>({id,rows:list}));
  return{rows,errors,excelDuplicates};
}
function renderFlexResolution(){
  const a=flexImport.analysis;if(!a)return;
  const store=getStore();const existingIds=new Set(store.employees.map(e=>e.id));let h='';
  if(a.errors.length){h+='<div class="card mb-4" style="background:var(--warning-bg);border-color:var(--warning)"><div class="card-body"><p class="font-bold" style="color:var(--warning)">Errores por fila</p><ul class="text-sm mt-2">'+a.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul><p class="text-xs text-muted mt-2">Puedes continuar; esas filas se ignorarán.</p></div></div>';}
  if(a.excelDuplicates.length){h+='<div class="card mb-4"><div class="card-head"><h3>Duplicados dentro del Excel</h3></div><div class="card-body">';a.excelDuplicates.forEach(d=>{h+='<div class="mb-3"><label class="form-label">Duplicado en filas '+d.rows.map(r=>r._row).join(' e ')+'. ¿Cuál usar?</label><select class="form-select flex-dup-excel" data-id="'+esc(d.id)+'">'+d.rows.map(r=>'<option value="'+r._row+'">Usar fila '+r._row+' — '+esc(r.nombre||'Sin nombre')+'</option>').join('')+'<option value="">Ignorar empleado '+esc(d.id)+'</option></select></div>';});h+='</div></div>';}
  const existing=a.rows.filter(r=>r.id&&r.nombre&&existingIds.has(r.id));if(existing.length){h+='<div class="card mb-4"><div class="card-head"><h3>Empleados existentes</h3></div><div class="card-body">';[...new Map(existing.map(r=>[r.id,r])).values()].forEach(r=>{h+='<div class="mb-3"><label class="form-label">Empleado '+esc(r.id)+' ya existe. ¿Actualizar? ¿Ignorar?</label><select class="form-select flex-dup-existing" data-id="'+esc(r.id)+'"><option value="update">Actualizar</option><option value="ignore">Ignorar</option></select></div>';});h+='</div></div>';}
  h+='<div id="flexSummary"></div>';
  document.getElementById('flexAnalysis').innerHTML=h;
  document.querySelectorAll('.flex-dup-excel,.flex-dup-existing').forEach(el=>el.addEventListener('change',renderFlexSummary));
  renderFlexSummary();
}
function getFlexFinalRows(){
  const a=flexImport.analysis;if(!a)return[];
  const errorRows=new Set(a.errors.map(e=>parseInt((e.match(/Fila (\d+)/)||[])[1],10)).filter(Boolean));
  const dupChoice={};document.querySelectorAll('.flex-dup-excel').forEach(s=>{dupChoice[s.dataset.id]=s.value?parseInt(s.value,10):null;});
  const duplicateIds=new Set(a.excelDuplicates.map(d=>d.id));
  return a.rows.filter(r=>{if(errorRows.has(r._row))return false;if(duplicateIds.has(r.id))return dupChoice[r.id]===r._row;return true;});
}
function renderFlexSummary(){
  const rows=getFlexFinalRows();const store=getStore();const existingMap=new Map(store.employees.map(e=>[e.id,e]));let nuevos=0,updates=0,tallas=0;const existingChoice={};document.querySelectorAll('.flex-dup-existing').forEach(s=>existingChoice[s.dataset.id]=s.value);
  rows.forEach(r=>{const exists=existingMap.has(r.id);if(exists&&existingChoice[r.id]==='ignore')return;if(exists)updates++;else nuevos++;tallas+=Object.values(r.tallas||{}).filter(Boolean).length;});
  document.getElementById('flexSummary').innerHTML='<div class="card" style="background:var(--info-bg);border-color:var(--info)"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><p class="font-bold" style="color:var(--info)">Resumen previo</p><p class="text-sm">'+nuevos+' empleados nuevos, '+updates+' actualizaciones, '+tallas+' tallas asignadas. ¿Confirmar?</p></div><button class="btn btn-success" id="flexConfirm"><i class="fas fa-check"></i> Confirmar importación</button></div></div>';
  document.getElementById('flexConfirm')?.addEventListener('click',execFlexibleEmployeesImport);
}
function analyzeFlexibleEmployees(){
  if(!flexImport)return;const map=collectFlexMap();flexImport.analysis=buildFlexParsed(map);renderFlexResolution();
}
function execFlexibleEmployeesImport(){
  const rows=getFlexFinalRows();const store=getStore();const existingMap=new Map(store.employees.map(e=>[e.id,e]));const existingChoice={};document.querySelectorAll('.flex-dup-existing').forEach(s=>existingChoice[s.dataset.id]=s.value);let nuevos=0,updates=0,tallas=0;
  rows.forEach(r=>{const existing=existingMap.get(r.id);if(existing&&existingChoice[r.id]==='ignore')return;const data={id:r.id,nombre:r.nombre,paterno:r.paterno||'',materno:r.materno||'',area:r.area||'PLANTA',estado:(r.estado||'activo').toLowerCase(),tallas:{...(existing?.tallas||{})},perfilDotacion:existing?.perfilDotacion||'AUTO'};Object.entries(r.tallas||{}).forEach(([k,v])=>{data.tallas[k]=v||'';if(v)tallas++;});if(existing){Object.assign(existing,data);updates++;}else{store.employees.push(data);existingMap.set(data.id,data);nuevos++;}});
  saveEmployees();log('IMPORTAR_EMPLEADOS_TALLAS',nuevos+' nuevos, '+updates+' actualizaciones, '+tallas+' tallas');notify('Importación completada','success');flexImport=null;document.getElementById('flexP').innerHTML='<div class="card" style="background:var(--success-light);border-color:var(--success)"><div class="card-body"><p class="font-bold" style="color:var(--success)"><i class="fas fa-check-circle"></i> Importación completada</p><p class="text-sm">'+nuevos+' empleados nuevos, '+updates+' actualizaciones, '+tallas+' tallas asignadas.</p></div></div>';
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
  document.getElementById('tabFlexEmp')?.addEventListener('click',()=>{currentTab='flex-employees';document.getElementById('impTabContent').innerHTML=renderTab();initTabListeners();});
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
  } else if(currentTab==='flex-employees'){
    const dz=document.getElementById('flexDropZ');const fi=document.getElementById('flexFileI');
    if(dz){
      dz.addEventListener('click',()=>fi.click());
      dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover');});
      dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));
      dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');if(e.dataTransfer.files.length)handleFlexibleEmployeesFile(e.dataTransfer.files[0]);});
    }
    fi?.addEventListener('change',function(){if(this.files.length)handleFlexibleEmployeesFile(this.files[0]);});
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

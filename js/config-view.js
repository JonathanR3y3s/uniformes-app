import{VERSION,STORAGE_KEY}from'./config.js';
import{getStore,saveEmployees,saveProveedores,saveEntregas,saveSalidas,saveStockExtra,saveAuditLog,buildBackup,restoreBackup,getStorageUsageKB,log,resetDatosOperativos}from'./storage.js';
import{calcStats}from'./rules.js';
import{notify,confirm,modal}from'./ui.js';
import{isAdmin}from'./user-roles.js';
// Supabase sync (importado con try/catch para no romper si no está disponible)
let _sync=null;async function getSync(){if(_sync)return _sync;try{_sync=await import('./sync-engine.js');}catch(e){}return _sync;}

function storageBar(){
  const used=getStorageUsageKB();
  const max=5000;const pct=Math.min(100,Math.round(used/max*100));
  const col=pct>85?'#dc2626':pct>65?'#d97706':'#059669';
  return`<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px"><span>Almacenamiento local</span><span style="font-weight:700;color:${col}">${used} KB / ~${max} KB</span></div><div style="height:6px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col};border-radius:999px;transition:width .4s"></div></div>${pct>85?'<p style="font-size:11px;color:#dc2626;margin-top:4px"><i class="fas fa-exclamation-triangle mr-1"></i>Almacenamiento casi lleno. Exporta un backup y considera limpiar bitácora.</p>':''}</div>`;
}

function renderPage(){
  const s=calcStats();const st=getStore();
  const kb=getStorageUsageKB();
  let h='<div class="page-head"><div class="page-title"><h1>Configuración</h1><p>Sistema y respaldos</p></div></div>';
  // Dos columnas top
  h+='<div class="grid-2 mb-4">';
  // Info sistema
  h+='<div class="card"><div class="card-head"><h3><i class="fas fa-info-circle mr-2" style="color:#004B87"></i>Información del Sistema</h3></div><div class="card-body">';
  h+=row('Versión',`<span class="badge badge-info">v${VERSION}</span>`);
  h+=row('Empleados',st.employees.length);
  h+=row('Entregas',st.entregas.length);
  h+=row('Compras uniforme',st.proveedores.length);
  h+=row('Compras almacén',(st.comprasAlmacen||[]).length);
  h+=row('Inventario general',(st.inventario||[]).length);
  h+=row('Campañas',(st.campanias||[]).length);
  h+=row('Encuestas',(st.encuestas||[]).length);
  h+=row('Bitácora',st.auditLog.length+' eventos');
  h+=row('Clave storage',`<span class="font-mono text-xs">${STORAGE_KEY}</span>`);
  h+=storageBar();
  h+='</div></div>';
  // Placeholder para que grid-2 tenga 2 items
  h+='<div class="card"><div class="card-head"><h3><i class="fas fa-shield-alt mr-2" style="color:#059669"></i>Respaldo y Restauración</h3></div><div class="card-body">';
  h+='<p class="text-sm text-sec mb-4">Exporta un respaldo antes de cualquier cambio importante. El archivo JSON incluye todos los datos del sistema.</p>';
  h+='<button class="btn btn-success mb-3" style="width:100%" id="cfgBackup"><i class="fas fa-download mr-2"></i>Exportar Respaldo Completo</button>';
  h+='<div style="border:2px dashed var(--border);border-radius:var(--radius);padding:16px;text-align:center;cursor:pointer;transition:border-color .15s" id="dropRestore"><i class="fas fa-upload" style="font-size:24px;color:var(--text-muted);display:block;margin-bottom:8px"></i><p class="text-sm font-bold">Restaurar desde backup</p><p class="text-xs text-muted">Arrastra el archivo .json o haz clic para seleccionar</p><input type="file" id="fileRestore" accept=".json" style="display:none"></div>';
  h+='<div id="restoreInfo" style="margin-top:12px"></div>';
  h+='</div></div>';
  h+='</div>';
  // Control de módulos
  h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-sliders-h mr-2" style="color:#7c3aed"></i>Control de Módulos</h3></div><div class="card-body">';
  h+='<p class="text-sm text-sec mb-4">Controla qué módulos son visibles para los operadores:</p>';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">';
  h+='<div><span class="font-bold text-sm">Módulo Dotación</span><p class="text-xs text-muted" style="margin:4px 0 0">Mostrar módulo de gestión de dotaciones a operadores</p></div>';
  h+='<div style="display:flex;align-items:center;gap:8px">';
  h+='<input type="checkbox" id="toggleDotacionVisible" style="cursor:pointer;width:20px;height:20px">';
  h+='</div></div>';
  h+='<p class="text-xs text-muted" style="margin-top:12px"><i class="fas fa-info-circle mr-1" style="color:#0891b2"></i><strong>Nota:</strong> Los administradores siempre ven este módulo. Este toggle solo afecta a operadores.</p>';
  h+='</div></div>';
  // Supabase / Nube
  h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-cloud mr-2" style="color:#7c3aed"></i>Sincronización Cloud (Supabase)</h3></div><div class="card-body">';
  h+='<div id="supabaseStatus" style="margin-bottom:14px"><p class="text-sm text-muted">Verificando conexión…</p></div>';
  h+='<p class="text-sm text-sec mb-3">Los datos se guardan localmente y se sincronizan automáticamente con Supabase en segundo plano. Si aún no tienes datos en la nube, haz la migración inicial.</p>';
  h+='<button class="btn btn-primary" style="width:100%;margin-bottom:10px" id="cfgMigrate"><i class="fas fa-cloud-upload-alt mr-2"></i>Migrar todos los datos a Supabase</button>';
  h+='<button class="btn btn-ghost" style="width:100%;margin-bottom:10px" id="cfgPull"><i class="fas fa-cloud-download-alt mr-2"></i>Traer datos actualizados de Supabase</button>';
  h+='<button class="btn btn-ghost" style="width:100%" id="cfgV2Backup"><i class="fas fa-cloud-upload-alt mr-2"></i>Respaldar modelo V2</button>';
  h+='<div id="migrationLog" style="margin-top:12px"></div>';
  h+='</div></div>';
  // Actualización PWA
  h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-sync-alt mr-2" style="color:#0891b2"></i>Actualización de App</h3></div><div class="card-body">';
  h+='<p class="text-sm text-sec mb-3">Si la aplicación no muestra los últimos cambios después de un deploy, usa este botón para forzar la actualización del caché.</p>';
  h+='<button class="btn btn-primary" style="width:100%" id="cfgUpdatePWA"><i class="fas fa-sync-alt mr-2"></i>Actualizar app</button>';
  h+='<p class="text-xs text-muted mt-2"><i class="fas fa-info-circle mr-1"></i>No borra datos. Solo actualiza archivos de la aplicación.</p>';
  h+='</div></div>';
  // Zona peligrosa
  h+='<div class="card" style="border-color:#dc2626"><div class="card-head" style="background:#fef2f2"><h3 style="color:#dc2626"><i class="fas fa-exclamation-triangle mr-2"></i>Zona de Riesgo</h3></div><div class="card-body"><div class="flex gap-3 flex-wrap">';
  // Bitácora no debe eliminarse en operación real. Solo exportar/archivar.
  h+='<button class="btn btn-danger" id="cfgClear"><i class="fas fa-trash-alt mr-1"></i> Borrar todos los datos</button>';
  h+='</div><p class="text-xs text-muted mt-3"><i class="fas fa-info-circle mr-1"></i>El borrado de datos no se puede deshacer. Exporta un respaldo primero.</p></div></div>';
  if(isAdmin()){
    h+='<div class="card mt-4" style="border-color:#dc2626"><div class="card-head" style="background:#fef2f2"><h3 style="color:#dc2626"><i class="fas fa-flask mr-2"></i>Zona de Pruebas</h3></div><div class="card-body">';
    h+='<p class="text-sm text-sec mb-3">Borra inventario, recepciones, entregas, devoluciones, mermas y movimientos locales. <strong>No borra empleados, usuarios ni configuración.</strong></p>';
    h+='<button class="btn btn-danger" id="cfgResetPruebas" style="width:100%"><i class="fas fa-rotate-left mr-2"></i>Reiniciar datos operativos de prueba</button>';
    h+='<p class="text-xs text-muted mt-2"><i class="fas fa-info-circle mr-1"></i>Genera un respaldo automático antes de borrar. Solo visible para administradores. Si tienes sync activo, revisa Supabase antes de sincronizar después del reset.</p>';
    h+='</div></div>';
  }
  return h;
}

function row(label,val){return`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)"><span class="text-sec text-sm">${label}</span><span class="font-bold text-sm">${val}</span></div>`;}

export function render(){return renderPage();}

function _confirmTextoModal(titulo,mensaje,palabra){
  return new Promise(resolve=>{
    const body='<div style="padding:6px 0"><p class="text-sm" style="margin-bottom:12px">'+mensaje+'</p>'
      +'<p class="text-xs text-muted" style="margin-bottom:8px">Para confirmar, escribe <strong>'+palabra+'</strong> en el campo:</p>'
      +'<input type="text" id="confirmTxtInput" class="form-input" autocomplete="off" placeholder="'+palabra+'" style="font-size:16px;letter-spacing:.05em">'
      +'</div>';
    const foot='<button class="btn btn-ghost" id="confirmTxtCancel">Cancelar</button>'
      +'<button class="btn btn-danger" id="confirmTxtOk"><i class="fas fa-check mr-1"></i>Confirmar</button>';
    modal.open(titulo,body,foot);
    setTimeout(()=>document.getElementById('confirmTxtInput')?.focus(),120);
    const finish=(ok)=>{modal.close();resolve(ok);};
    document.getElementById('confirmTxtCancel')?.addEventListener('click',()=>finish(false));
    document.getElementById('confirmTxtOk')?.addEventListener('click',()=>{
      const v=(document.getElementById('confirmTxtInput')?.value||'').trim();
      if(v!==palabra){notify('Texto incorrecto. Operación cancelada.','warning');finish(false);return;}
      finish(true);
    });
    document.getElementById('confirmTxtInput')?.addEventListener('keypress',e=>{if(e.key==='Enter')document.getElementById('confirmTxtOk')?.click();});
  });
}

async function doResetPruebas(){
  const ok=await _confirmTextoModal('Reiniciar datos operativos','Esta acción borra inventario, recepciones, entregas, devoluciones, mermas y movimientos locales. NO borra empleados, usuarios ni configuración. Genera un respaldo automático antes de borrar.','BORRAR');
  if(!ok){notify('Operación cancelada','info');return;}
  const s=getStore();
  const ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
  const backup={
    _meta:{type:'reset-operativo',version:VERSION,exportedAt:new Date().toISOString(),nota:'Backup automático antes de reset de datos operativos'},
    inventario:s.inventario,entregas:s.entregas,salidas:s.salidas,
    stockExtra:s.stockExtra,comprasAlmacen:s.comprasAlmacen,
    campanias:s.campanias,stockUniformes:s.stockUniformes,encuestas:s.encuestas,
    articulos:s.articulos,skus:s.skus,movimientosInventario:s.movimientosInventario,
    documentosEntrega:s.documentosEntrega,documentosDevolucion:s.documentosDevolucion,
    productos:s.productos,categorias:s.categorias,
    entradas:s.entradas,lineasEntrada:s.lineasEntrada,
    entregasNuevas:s.entregasNuevas,lineasEntrega:s.lineasEntrega,
    salidasNuevas:s.salidasNuevas,lineasSalida:s.lineasSalida,
    devolucionesNuevas:s.devolucionesNuevas,lineasDevolucion:s.lineasDevolucion,
    movimientos:s.movimientos
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`backup-reset-${ts}.json`;a.click();
  resetDatosOperativos();
  log('RESET_OPERATIVO','Datos operativos de prueba reiniciados','CONFIG');
  notify('Datos reiniciados. Si tienes sync activo, revisa Supabase antes de sincronizar.','warning');
  setTimeout(()=>location.reload(),1500);
}
function doBackup(){
  const bk=buildBackup();
  const counts=bk._meta.counts;
  const summary=Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join(', ');
  const blob=new Blob([JSON.stringify(bk,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`backup_CSP_v${VERSION}_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  log('BACKUP_EXPORT','Registros: '+summary,'CONFIG');
  notify('Respaldo exportado correctamente','success');
}

async function doV2Backup(){
  const sync=await getSync();
  if(!sync?.pushV2BackupOnly){notify('Backup V2 no disponible','error');return;}
  const logBox=document.getElementById('migrationLog');
  if(logBox)logBox.innerHTML='<div style="background:var(--surface-2);border-radius:8px;padding:12px;font-size:12px;font-family:monospace;max-height:180px;overflow-y:auto" id="migLog"></div>';
  const addLine=(msg)=>{const el=document.getElementById('migLog');if(el){const line=document.createElement('div');line.textContent=msg;el.appendChild(line);el.scrollTop=el.scrollHeight;}};
  addLine('Iniciando backup V2 push-only…');
  const result=await sync.pushV2BackupOnly();
  (result?.summaries||[]).forEach(r=>addLine(`${r.collection}: total ${r.total}, subidos ${r.uploaded}, omitidos ${r.skipped}, errores ${r.errors.length}`));
  if(result?.ok){
    addLine('✓ Backup V2 completado.');
    notify('Backup V2 completado','success');
    log('SUPABASE_V2_BACKUP','Backup V2 push-only completado','CONFIG');
  } else {
    addLine('✗ Backup V2 con errores.');
    notify('Backup V2 con errores','error');
  }
  const statusLine=document.getElementById('v2BackupStatusLine');
  if(statusLine&&result){
    statusLine.textContent=`Backup V2: último respaldo ${result.ok?'OK':'error'} (${new Date(result.at).toLocaleString('es-MX')})`;
    statusLine.style.color=result.ok?'#059669':'#dc2626';
  }
}

function showRestorePreview(bk){
  const box=document.getElementById('restoreInfo');if(!box)return;
  if(!bk._meta){box.innerHTML='<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;color:#dc2626;font-size:13px"><i class="fas fa-times-circle mr-2"></i>Archivo no reconocido como backup de Control Store Pro</div>';return;}
  const m=bk._meta;const c=m.counts||{};
  box.innerHTML=`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px">
    <p class="font-bold text-sm mb-2" style="color:#059669"><i class="fas fa-check-circle mr-2"></i>Backup válido — listo para restaurar</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;margin-bottom:12px">
      <span class="text-sec">Versión exportada:</span><span class="font-bold">v${m.version||'?'}</span>
      <span class="text-sec">Fecha del backup:</span><span class="font-bold">${m.exportedAt?new Date(m.exportedAt).toLocaleString('es-MX'):'?'}</span>
      ${Object.entries(c).map(([k,v])=>`<span class="text-sec">${k}:</span><span class="font-bold">${v}</span>`).join('')}
    </div>
    <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:10px;font-size:12px;margin-bottom:12px"><i class="fas fa-exclamation-triangle mr-1" style="color:#d97706"></i><strong>Atención:</strong> Restaurar sobrescribirá TODOS los datos actuales del sistema.</div>
    <button class="btn btn-danger" style="width:100%" id="btnConfirmRestore"><i class="fas fa-history mr-2"></i>Confirmar Restauración</button>
  </div>`;
  document.getElementById('btnConfirmRestore')?.addEventListener('click',()=>{
    if(!confirm('¿Restaurar el backup?\nEsto sobrescribirá todos los datos actuales.'))return;
    const result=restoreBackup(bk);
    if(result.ok){notify('Backup restaurado correctamente. Recargando...','success');setTimeout(()=>location.reload(),1500);}
    else{notify('Error al restaurar: '+result.errors.join(', '),'error');}
  });
}

async function updatePWA(){
  notify('Actualizando aplicación…','info');
  try{
    if('serviceWorker'in navigator){
      const reg=await navigator.serviceWorker.getRegistration('./sw.js');
      if(reg){
        await reg.update();
        if(reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'});}
      }
    }
    if('caches'in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>!k.includes('icons')).map(k=>caches.delete(k)));
    }
    notify('Caché limpiado. Recargando…','success');
    setTimeout(()=>location.reload(),800);
  }catch(err){
    notify('Error al actualizar: '+err.message,'error');
    console.error('[PWA Update]',err);
  }
}

async function _doFullClear(){
  const ok=await _confirmTextoModal('Borrar TODOS los datos','Esta acción no se puede deshacer. Exporta un respaldo primero. Borrará empleados, proveedores, inventario, entregas, salidas, compras y todo el sistema.','CONFIRMAR');
  if(!ok){notify('Cancelado','info');return;}
  const s=getStore();
  s.employees=[];s.proveedores=[];s.inventario=[];s.entregas=[];s.salidas=[];s.stockExtra={};s.comprasAlmacen=[];s.campanias=[];s.stockUniformes=[];s.encuestas=[];
  saveEmployees();saveProveedores();saveEntregas();saveSalidas();saveStockExtra();
  import('./storage.js').then(m=>{m.saveCampanias?.();m.saveStockUniformes?.();m.saveEncuestas?.();});
  log('RESET','Todos los datos eliminados','CONFIG');
  notify('Todos los datos han sido eliminados','warning');
  setTimeout(()=>location.reload(),800);
}

function handleConfigClick(e){
  if(e.target.closest('#cfgUpdatePWA')){updatePWA();return;}
  if(e.target.closest('#cfgClear')){_doFullClear();return;}
  if(e.target.closest('#cfgBackup'))doBackup();
  if(e.target.closest('#cfgResetPruebas')){doResetPruebas();return;}
  if(e.target.closest('#cfgV2Backup')){doV2Backup();return;}
  if(e.target.closest('#dropRestore')||e.target.closest('#fileRestore')){
    document.getElementById('fileRestore')?.click();
  }
}

async function initSupabaseSection(){
  const box=document.getElementById('supabaseStatus');
  if(!box)return;
  const sync=await getSync();
  if(!sync){box.innerHTML='<p class="text-sm" style="color:#dc2626"><i class="fas fa-times-circle mr-1"></i>Módulo de sync no disponible</p>';return;}
  const status=sync.getSupabaseStatus?.()|| 'desconocido';
  const lastSync=sync.getLastSyncAt?.();
  const v2Backup=sync.getLastV2BackupStatus?.();
  const colors={connected:'#059669',error:'#dc2626',connecting:'#d97706',disconnected:'#64748b'};
  const labels={connected:'Conectado',error:'Error de conexión',connecting:'Conectando…',disconnected:'Sin conexión'};
  const col=colors[status]||'#64748b';
  const lbl=labels[status]||status;
  const v2Text=v2Backup?`Backup V2: último respaldo ${v2Backup.ok?'OK':'error'} (${new Date(v2Backup.at).toLocaleString('es-MX')})`:'Backup V2: sin respaldo registrado';
  const v2Color=v2Backup?(v2Backup.ok?'#059669':'#dc2626'):'#64748b';
  box.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;padding:10px 14px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0"></span>
      <span style="font-weight:700;font-size:13px;color:${col}">${lbl}</span>
      ${lastSync?`<span class="text-xs text-muted" style="margin-left:auto">Última sync: ${new Date(lastSync).toLocaleString('es-MX')}</span>`:''}
    </div>
    <div id="v2BackupStatusLine" class="text-xs" style="color:${v2Color};font-weight:700">${v2Text}</div>
  </div>`;

  // Migrate button
  document.getElementById('cfgMigrate')?.addEventListener('click',async()=>{
    if(!confirm('¿Migrar todos los datos de localStorage a Supabase?\nEsto no borra datos locales.'))return;
    const logBox=document.getElementById('migrationLog');
    if(logBox)logBox.innerHTML='<div style="background:var(--surface-2);border-radius:8px;padding:12px;font-size:12px;font-family:monospace;max-height:180px;overflow-y:auto" id="migLog"></div>';
    const addLine=(msg)=>{const el=document.getElementById('migLog');if(el){const line=document.createElement('div');line.textContent=msg;el.appendChild(line);el.scrollTop=el.scrollHeight;}};
    addLine('Iniciando migración…');
    const result=await sync.migrateLocalToSupabase((msg)=>addLine(msg));
    if(result?.ok){
      addLine('✓ Migración completada.');
      notify('Datos migrados a Supabase','success');
      log('SUPABASE_MIGRATE','Migración completa','CONFIG');
    } else {
      addLine('✗ Error en la migración.');
      notify('Error al migrar','error');
    }
  });

  // Pull button
  document.getElementById('cfgPull')?.addEventListener('click',async()=>{
    notify('Descargando datos de Supabase…','info');
    await sync.pullFromSupabase?.();
    notify('Datos actualizados desde Supabase','success');
    document.getElementById('mainContent').innerHTML=renderPage();
    init();
  });
}

export function init(){
  const mc=document.getElementById('mainContent');
  if(!mc)return;
  mc.removeEventListener('click',handleConfigClick);
  mc.addEventListener('click',handleConfigClick);
  // Manejo del toggle de Dotación
  const toggleDotacion=document.getElementById('toggleDotacionVisible');
  if(toggleDotacion){
    try{
      const cfg=JSON.parse(localStorage.getItem('uniformes_assa_abloy_2026_v4_config')||'{}');
      toggleDotacion.checked=cfg.dotacionVisible!==false;
    }catch(e){}
    toggleDotacion.addEventListener('change',()=>{
      try{
        const cfg=JSON.parse(localStorage.getItem('uniformes_assa_abloy_2026_v4_config')||'{}');
        cfg.dotacionVisible=toggleDotacion.checked;
        localStorage.setItem('uniformes_assa_abloy_2026_v4_config',JSON.stringify(cfg));
        notify(toggleDotacion.checked?'Dotación ahora visible para operadores':'Dotación ocultada para operadores','success');
        import('./ui.js').then(ui=>{if(ui.buildNav)ui.buildNav('config');});
      }catch(e){
        notify('Error al guardar configuración','error');
      }
    });
  }
  initSupabaseSection();
  // File input for restore
  const fi=document.getElementById('fileRestore');
  fi?.addEventListener('change',function(){
    const f=this.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{try{const bk=JSON.parse(ev.target.result);showRestorePreview(bk);}catch{document.getElementById('restoreInfo').innerHTML='<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;color:#dc2626;font-size:13px"><i class="fas fa-times-circle mr-2"></i>No se pudo leer el archivo. Asegúrate de seleccionar un archivo JSON válido.</div>';}};
    r.readAsText(f);
  });
  // Drag & drop
  const drop=document.getElementById('dropRestore');
  if(drop){
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.style.borderColor='#004B87';drop.style.background='var(--info-bg)';});
    drop.addEventListener('dragleave',()=>{drop.style.borderColor='';drop.style.background='';});
    drop.addEventListener('drop',e=>{
      e.preventDefault();drop.style.borderColor='';drop.style.background='';
      const f=e.dataTransfer.files[0];if(!f)return;
      const r=new FileReader();r.onload=ev=>{try{const bk=JSON.parse(ev.target.result);showRestorePreview(bk);}catch{notify('Archivo no válido','error');}};r.readAsText(f);
    });
  }
}

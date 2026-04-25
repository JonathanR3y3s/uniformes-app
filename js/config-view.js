import{VERSION,STORAGE_KEY}from'./config.js';
import{getStore,saveEmployees,saveProveedores,saveEntregas,saveSalidas,saveStockExtra,saveAuditLog,buildBackup,restoreBackup,getStorageUsageKB,log}from'./storage.js';
import{calcStats}from'./rules.js';
import{notify,confirm,modal}from'./ui.js';
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
  // Backup & Restore
  h+='<div class="card"><div class="card-head"><h3><i class="fas fa-shield-alt mr-2" style="color:#059669"></i>Respaldo y Restauración</h3></div><div class="card-body">';
  h+='<p class="text-sm text-sec mb-4">Exporta un respaldo antes de cualquier cambio importante. El archivo JSON incluye todos los datos del sistema.</p>';
  h+='<button class="btn btn-success mb-3" style="width:100%" id="cfgBackup"><i class="fas fa-download mr-2"></i>Exportar Respaldo Completo</button>';
  h+='<div style="border:2px dashed var(--border);border-radius:var(--radius);padding:16px;text-align:center;cursor:pointer;transition:border-color .15s" id="dropRestore"><i class="fas fa-upload" style="font-size:24px;color:var(--text-muted);display:block;margin-bottom:8px"></i><p class="text-sm font-bold">Restaurar desde backup</p><p class="text-xs text-muted">Arrastra el archivo .json o haz clic para seleccionar</p><input type="file" id="fileRestore" accept=".json" style="display:none"></div>';
  h+='<div id="restoreInfo" style="margin-top:12px"></div>';
  h+='</div></div>';
  h+='</div>';
  // Supabase / Nube
  h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-cloud mr-2" style="color:#7c3aed"></i>Sincronización Cloud (Supabase)</h3></div><div class="card-body">';
  h+='<div id="supabaseStatus" style="margin-bottom:14px"><p class="text-sm text-muted">Verificando conexión…</p></div>';
  h+='<p class="text-sm text-sec mb-3">Los datos se guardan localmente y se sincronizan automáticamente con Supabase en segundo plano. Si aún no tienes datos en la nube, haz la migración inicial.</p>';
  h+='<button class="btn btn-primary" style="width:100%;margin-bottom:10px" id="cfgMigrate"><i class="fas fa-cloud-upload-alt mr-2"></i>Migrar todos los datos a Supabase</button>';
  h+='<button class="btn btn-ghost" style="width:100%" id="cfgPull"><i class="fas fa-cloud-download-alt mr-2"></i>Traer datos actualizados de Supabase</button>';
  h+='<div id="migrationLog" style="margin-top:12px"></div>';
  h+='</div></div>';
  // Zona peligrosa
  h+='<div class="card" style="border-color:#dc2626"><div class="card-head" style="background:#fef2f2"><h3 style="color:#dc2626"><i class="fas fa-exclamation-triangle mr-2"></i>Zona de Riesgo</h3></div><div class="card-body"><div class="flex gap-3 flex-wrap">';
  h+='<button class="btn btn-ghost" id="cfgLog"><i class="fas fa-eraser mr-1"></i> Limpiar bitácora</button>';
  h+='<button class="btn btn-danger" id="cfgClear"><i class="fas fa-trash-alt mr-1"></i> Borrar todos los datos</button>';
  h+='</div><p class="text-xs text-muted mt-3"><i class="fas fa-info-circle mr-1"></i>El borrado de datos no se puede deshacer. Exporta un respaldo primero.</p></div></div>';
  return h;
}

function row(label,val){return`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)"><span class="text-sec text-sm">${label}</span><span class="font-bold text-sm">${val}</span></div>`;}

export function render(){return renderPage();}

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

function handleConfigClick(e){
  if(e.target.closest('#cfgClear')){
    if(!confirm('¿Borrar TODOS los datos?\nNo se puede deshacer.\nExporta un respaldo primero.'))return;
    if(window.prompt('Escribe CONFIRMAR para continuar')!=='CONFIRMAR'){notify('Cancelado','info');return;}
    const s=getStore();
    s.employees=[];s.proveedores=[];s.inventario=[];s.entregas=[];s.salidas=[];s.stockExtra={};s.comprasAlmacen=[];s.campanias=[];s.stockUniformes=[];s.encuestas=[];
    saveEmployees();saveProveedores();saveEntregas();saveSalidas();saveStockExtra();
    import('./storage.js').then(m=>{m.saveCampanias?.();m.saveStockUniformes?.();m.saveEncuestas?.();});
    log('RESET','Todos los datos eliminados','CONFIG');
    notify('Todos los datos han sido eliminados','warning');
    location.reload();
  }
  if(e.target.closest('#cfgLog')){
    if(!confirm('¿Limpiar la bitácora de eventos?'))return;
    getStore().auditLog=[];saveAuditLog();
    notify('Bitácora limpiada','success');
    document.getElementById('mainContent').innerHTML=renderPage();init();
  }
  if(e.target.closest('#cfgBackup'))doBackup();
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
  const colors={connected:'#059669',error:'#dc2626',connecting:'#d97706',disconnected:'#64748b'};
  const labels={connected:'Conectado',error:'Error de conexión',connecting:'Conectando…',disconnected:'Sin conexión'};
  const col=colors[status]||'#64748b';
  const lbl=labels[status]||status;
  box.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
    <span style="width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0"></span>
    <span style="font-weight:700;font-size:13px;color:${col}">${lbl}</span>
    ${lastSync?`<span class="text-xs text-muted" style="margin-left:auto">Última sync: ${new Date(lastSync).toLocaleString('es-MX')}</span>`:''}
  </div>`;

  // Migrate button
  document.getElementById('cfgMigrate')?.addEventListener('click',async()=>{
    if(!confirm('¿Migrar todos los datos de localStorage a Supabase?\nEsto no borra datos locales.'))return;
    const log=document.getElementById('migrationLog');
    if(log)log.innerHTML='<div style="background:var(--surface-2);border-radius:8px;padding:12px;font-size:12px;font-family:monospace;max-height:180px;overflow-y:auto" id="migLog"></div>';
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
  mc.addEventListener('click',handleConfigClick);
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

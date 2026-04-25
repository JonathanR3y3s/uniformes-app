import{getStore,saveEntregas,log}from'./storage.js';import{esc,fmtDate,today}from'./utils.js';import{buildAreaBadge,notify,modal}from'./ui.js';import{initSignatureCapture,getSignatureData}from'./signature-capture.js';import{getUser,getUserRole}from'./user-roles.js';
const TIPOS={DOTACION_ANUAL:{label:'Dotación Anual',color:'#059669',bg:'#d1fae5',icon:'fa-boxes'},NUEVO_INGRESO:{label:'Nuevo Ingreso',color:'#2563eb',bg:'#dbeafe',icon:'fa-user-plus'},SUSTITUCION:{label:'Sustitución',color:'#d97706',bg:'#fef3c7',icon:'fa-exchange-alt'}};
function badgeTipo(t,custom){if(t==='OTRO')return'<span style="background:#f3f4f6;color:#6b7280;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap"><i class="fas fa-tag mr-1"></i>'+esc(custom||'Otro')+'</span>';const x=TIPOS[t]||{label:t||'—',color:'#6b7280',bg:'#f3f4f6',icon:'fa-tag'};return'<span style="background:'+x.bg+';color:'+x.color+';padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap"><i class="fas '+x.icon+' mr-1"></i>'+x.label+'</span>';}

export function render(){
  const s=getStore();
  const tot=s.entregas.length;
  const da=s.entregas.filter(e=>e.tipo==='DOTACION_ANUAL').length;
  const ni=s.entregas.filter(e=>e.tipo==='NUEVO_INGRESO').length;
  const su=s.entregas.filter(e=>e.tipo==='SUSTITUCION').length;
  const cf=s.entregas.filter(e=>e.firma).length;
  // Cobertura: empleados activos con al menos una entrega este año
  const thisYear=new Date().getFullYear().toString();
  const empConEntrega=new Set(s.entregas.filter(e=>e.fecha&&e.fecha.startsWith(thisYear)).map(e=>e.empleadoId));
  const activos=s.employees.filter(e=>e.estado==='activo');
  const cobertura=activos.length?Math.round(empConEntrega.size/activos.length*100):0;

  let h='<div class="page-head"><div class="page-title"><h1>Entregas de Uniformes</h1><p>Dotación anual · Nuevos ingresos · Sustituciones</p></div></div>';
  h+='<div class="kpi-grid">';
  h+='<div class="kpi"><div class="kpi-label">Total Entregas</div><div class="kpi-value">'+tot+'</div></div>';
  h+='<div class="kpi success"><div class="kpi-label">Dotación Anual</div><div class="kpi-value">'+da+'</div><div class="kpi-sub">'+TIPOS.DOTACION_ANUAL.label+'</div></div>';
  h+='<div class="kpi info"><div class="kpi-label">Nuevo Ingreso</div><div class="kpi-value">'+ni+'</div><div class="kpi-sub">'+TIPOS.NUEVO_INGRESO.label+'</div></div>';
  h+='<div class="kpi warning"><div class="kpi-label">Sustituciones</div><div class="kpi-value">'+su+'</div><div class="kpi-sub">Reposición</div></div>';
  h+='<div class="kpi" style="border-top:3px solid #7c3aed"><div class="kpi-label"><i class="fas fa-percent mr-1" style="color:#7c3aed"></i>Cobertura '+(thisYear)+'</div><div class="kpi-value" style="color:#7c3aed">'+cobertura+'%</div><div class="kpi-sub">'+empConEntrega.size+' de '+activos.length+' empleados</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Con Firma</div><div class="kpi-value">'+cf+'</div><div class="kpi-sub">'+(tot?Math.round(cf/tot*100):0)+'% firmadas</div></div>';
  h+='</div>';

  // Filtros
  h+='<div class="card mb-4"><div class="card-body"><div class="form-row c4">';
  h+='<div><label class="form-label">Tipo</label><select class="form-select" id="entFT"><option value="">Todos los tipos</option>'+Object.entries(TIPOS).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('')+'<option value="OTRO">Otro</option></select></div>';
  h+='<div><label class="form-label">Área</label><select class="form-select" id="entFA"><option value="">Todas las áreas</option>'+[...new Set(s.employees.map(e=>e.area))].sort().map(a=>'<option>'+esc(a)+'</option>').join('')+'</select></div>';
  h+='<div><label class="form-label">Buscar empleado</label><input class="form-input" id="entFS" placeholder="Nombre o número..."></div>';
  h+='<div class="flex items-center" style="align-items:flex-end"><button class="btn btn-ghost" style="width:100%" id="entFClear"><i class="fas fa-times"></i> Limpiar</button></div>';
  h+='</div>';
  // Segunda fila filtros: fecha
  h+='<div class="form-row c4" style="margin-top:10px">';
  h+='<div><label class="form-label">Fecha desde</label><input type="date" class="form-input" id="entFD"></div>';
  h+='<div><label class="form-label">Fecha hasta</label><input type="date" class="form-input" id="entFH"></div>';
  h+='<div><label class="form-label">Campaña</label><select class="form-select" id="entFCamp"><option value="">Todas</option>'+((s.campanias||[]).map(c=>'<option value="'+c.id+'">'+esc(c.nombre)+'</option>')).join('')+'</select></div>';
  h+='<div></div>';
  h+='</div></div></div>';

  // Tabla
  const isAdmin=getUserRole()==='admin';
  h+='<div class="card"><div class="card-head"><h3>Historial de Entregas</h3><span class="text-sm text-muted" id="entCount"></span></div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr><th>Fecha</th><th>Empleado</th><th>Área</th><th>Tipo</th><th style="text-align:center">Prendas</th><th style="text-align:center">Firma</th><th>Obs</th><th style="text-align:center">Acciones</th></tr></thead><tbody id="entTB"></tbody></table></div></div>';
  return h;
}

function renderRows(){
  const s=getStore();
  const ft=document.getElementById('entFT')?.value||'';
  const fa=document.getElementById('entFA')?.value||'';
  const fs=(document.getElementById('entFS')?.value||'').toLowerCase();
  const fd=document.getElementById('entFD')?.value||'';
  const fh=document.getElementById('entFH')?.value||'';
  const fc=document.getElementById('entFCamp')?.value||'';
  let list=s.entregas.slice().reverse();
  if(ft)list=list.filter(e=>e.tipo===ft);
  if(fa){list=list.filter(e=>{const eA=e.area||(s.employees.find(x=>x.id===e.empleadoId)?.area)||'';return eA===fa;});}
  if(fs){list=list.filter(e=>{const emp=s.employees.find(x=>x.id===e.empleadoId);const nom=emp?(emp.nombre+' '+(emp.paterno||'')).toLowerCase():'';return nom.includes(fs)||(e.empleadoId||'').includes(fs);});}
  if(fd)list=list.filter(e=>e.fecha&&e.fecha>=fd);
  if(fh)list=list.filter(e=>e.fecha&&e.fecha<=fh);
  if(fc)list=list.filter(e=>e.campaniaId===fc);
  const isAdmin=getUserRole()==='admin';
  const tb=document.getElementById('entTB');if(!tb)return;
  const cc=document.getElementById('entCount');if(cc)cc.textContent=list.length+' registros';
  if(!list.length){tb.innerHTML='<tr><td colspan="8" class="empty-state"><i class="fas fa-hand-holding"></i><p>Sin entregas registradas</p></td></tr>';return;}
  tb.innerHTML=list.map(ent=>{
    const emp=s.employees.find(x=>x.id===ent.empleadoId);
    const nom=emp?esc(emp.nombre+' '+(emp.paterno||'')):esc(ent.empleadoId||'—');
    const areaStr=ent.area||emp?.area||'';
    const area=areaStr?buildAreaBadge(areaStr):'—';
    const pc=(ent.prendas||[]).length;
    const firma=ent.firma?'<img src="'+ent.firma+'" style="height:30px;max-width:90px;object-fit:contain;border:1px solid var(--border);border-radius:4px;cursor:pointer" class="sig-preview" data-id="'+ent.id+'" title="Ver firma">':'<span style="color:var(--text-muted);font-size:12px">—</span>';
    const acciones='<div style="display:flex;gap:4px;justify-content:center">'
      +'<button class="btn btn-ghost ent-detail" data-id="'+ent.id+'" style="padding:4px 8px;font-size:11px" title="Ver detalle"><i class="fas fa-eye"></i></button>'
      +(isAdmin?'<button class="btn btn-danger ent-del" data-id="'+ent.id+'" style="padding:4px 8px;font-size:11px;background:transparent;color:#dc2626;border:1px solid #dc2626" title="Eliminar"><i class="fas fa-trash-alt"></i></button>':'')
      +'</div>';
    return'<tr>'
      +'<td class="text-xs font-mono">'+fmtDate(ent.fecha)+'</td>'
      +'<td class="font-bold">'+nom+'</td>'
      +'<td>'+area+'</td>'
      +'<td>'+badgeTipo(ent.tipo,ent.tipoCustom)+'</td>'
      +'<td style="text-align:center"><span class="badge badge-info">'+pc+' pzs</span></td>'
      +'<td style="text-align:center">'+firma+'</td>'
      +'<td class="text-xs text-sec" style="max-width:120px">'+esc(ent.observaciones||'—')+'</td>'
      +'<td>'+acciones+'</td>'
      +'</tr>';
  }).join('');
}

function viewDetail(id){
  const s=getStore();
  const ent=s.entregas.find(e=>e.id===id);if(!ent)return;
  const emp=s.employees.find(x=>x.id===ent.empleadoId);
  const nom=emp?emp.nombre+' '+(emp.paterno||''):ent.empleadoId;
  const camp=ent.campaniaId?(s.campanias||[]).find(c=>c.id===ent.campaniaId):null;
  let h='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
  h+='<div><p class="text-xs text-muted mb-1">Empleado</p><p class="font-bold">'+esc(nom)+'</p></div>';
  h+='<div><p class="text-xs text-muted mb-1">Área</p><p>'+buildAreaBadge(ent.area||emp?.area||'—')+'</p></div>';
  h+='<div><p class="text-xs text-muted mb-1">Tipo</p><p>'+badgeTipo(ent.tipo,ent.tipoCustom)+'</p></div>';
  h+='<div><p class="text-xs text-muted mb-1">Fecha</p><p class="font-bold">'+fmtDate(ent.fecha)+'</p></div>';
  h+='<div><p class="text-xs text-muted mb-1">Registrado por</p><p>'+esc(ent.registradoPor||'—')+'</p></div>';
  h+='<div><p class="text-xs text-muted mb-1">Campaña</p><p>'+(camp?esc(camp.nombre):'<span class="text-muted">Sin campaña</span>')+'</p></div>';
  h+='</div>';
  // Prendas
  const prendas=ent.prendas||[];
  if(prendas.length){
    h+='<p class="text-xs text-muted mb-2"><strong>Prendas entregadas ('+prendas.length+')</strong></p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:16px">';
    prendas.forEach(p=>{h+='<div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px"><p style="font-weight:700;font-size:12px;margin:0">'+esc(p.prenda)+'</p><p style="font-size:11px;color:var(--text-muted);margin:0">Talla: <strong>'+esc(p.talla||'—')+'</strong></p></div>';});
    h+='</div>';
  }
  // Observaciones
  if(ent.observaciones){h+='<p class="text-xs text-muted mb-1"><strong>Observaciones</strong></p><p class="text-sm" style="background:var(--surface-2);padding:10px 12px;border-radius:8px;margin-bottom:16px">'+esc(ent.observaciones)+'</p>';}
  // Firma
  if(ent.firma){h+='<p class="text-xs text-muted mb-2"><strong>Firma del empleado</strong></p><div style="text-align:center;padding:12px;background:var(--surface-2);border-radius:8px"><img src="'+ent.firma+'" style="max-width:100%;max-height:160px;object-fit:contain;border-radius:4px"></div>';}
  else{h+='<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;font-size:13px;color:#dc2626;text-align:center"><i class="fas fa-signature mr-2"></i>Sin firma registrada</div>';}
  modal.open('Detalle de Entrega',h,'<button class="btn btn-ghost" id="mCancel">Cerrar</button>','lg');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
}

function deleteEntrega(id){
  const s=getStore();
  const ent=s.entregas.find(e=>e.id===id);if(!ent)return;
  const emp=s.employees.find(x=>x.id===ent.empleadoId);
  const nom=emp?emp.nombre+' '+(emp.paterno||''):ent.empleadoId;
  if(!confirm('¿Eliminar la entrega de '+nom+' ('+fmtDate(ent.fecha)+')?\nEsta acción no se puede deshacer.'))return;
  s.entregas=s.entregas.filter(e=>e.id!==id);
  saveEntregas();
  log('ENTREGA_DELETE','Eliminada entrega de emp#'+ent.empleadoId+' ('+ent.tipo+', '+fmtDate(ent.fecha)+')','ENTREGAS');
  notify('Entrega eliminada','warning');
  renderRows();
}

function showEmpCard(emp){
  const card=document.getElementById('entEmpCard');if(!card)return;
  if(!emp){card.innerHTML='';return;}
  const colors=['#004B87','#16a34a','#ca8a04','#7c3aed','#dc2626'];
  const ci=Math.abs((emp.id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%colors.length;
  const av=emp.foto?'<img src="'+emp.foto+'" style="width:100%;height:100%;object-fit:cover">':'<span style="font-size:22px;font-weight:700;color:#fff">'+((emp.nombre||'?')[0]).toUpperCase()+'</span>';
  const nTallas=Object.values(emp.tallas||{}).filter(Boolean).length;
  card.innerHTML='<div style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:4px"><div style="width:52px;height:52px;border-radius:50%;background:'+colors[ci]+';display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">'+av+'</div><div style="flex:1;min-width:0"><p style="font-weight:700;font-size:15px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(emp.nombre+' '+(emp.paterno||''))+'</p><p style="font-size:12px;color:var(--text-muted);margin:0">'+esc(emp.area)+' · Empleado #'+esc(emp.id)+' · '+nTallas+' talla'+(nTallas!==1?'s':'')+' capturada'+(nTallas!==1?'s':'')+'</p></div><span class="badge badge-'+(emp.estado==='activo'?'success':'neutral')+'">'+emp.estado.toUpperCase()+'</span></div>';
}

function loadPrendas(emp){
  const box=document.getElementById('entPB');if(!box)return;
  if(!emp){box.innerHTML='';return;}
  const entries=Object.entries(emp.tallas||{}).filter(p=>p[1]);
  if(!entries.length){box.innerHTML='<div style="background:var(--warning-light);border:1px solid var(--warning);border-radius:8px;padding:12px 16px"><i class="fas fa-exclamation-triangle mr-2" style="color:var(--warning)"></i><span class="text-sm">Sin tallas capturadas — se puede registrar la entrega pero sin detalle de tallas</span></div>';return;}
  box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><label class="form-label" style="margin:0">Prendas a entregar — desactiva las que NO se entregan esta vez:</label><span class="badge badge-info">'+entries.length+' prendas</span></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">'+entries.map(p=>'<label style="display:flex;align-items:center;gap:10px;padding:14px;border-radius:var(--radius);cursor:pointer;border:2px solid var(--border);background:var(--surface-2);min-height:64px;transition:border-color .15s"><input type="checkbox" value="'+esc(p[0])+'" class="entC" checked style="width:22px;height:22px;flex-shrink:0;accent-color:#004B87;cursor:pointer"><div style="flex:1;min-width:0"><p style="font-weight:700;font-size:13px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p[0])+'</p><p style="font-size:12px;color:var(--text-muted);margin:0">Talla: <strong>'+esc(p[1])+'</strong></p></div></label>').join('')+'</div>';
}

function newEntrega(){
  const act=getStore().employees.filter(e=>e.estado==='activo');
  let h='<div class="form-row c2 mb-4">';
  h+='<div class="form-group" style="position:relative"><label class="form-label">Empleado *</label>';
  h+='<input class="form-input" id="entESearch" placeholder="Escribe nombre o número de empleado..." autocomplete="off">';
  h+='<input type="hidden" id="entE" value="">';
  h+='<div id="entEDrop" style="display:none;position:absolute;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:300;max-height:230px;overflow-y:auto;top:calc(100% + 2px)"></div>';
  h+='</div>';
  h+='<div class="form-group"><label class="form-label">Tipo de Entrega *</label>';
  h+='<select class="form-select" id="entT"><option value="">— Seleccionar —</option>';
  h+=Object.entries(TIPOS).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('');
  h+='<option value="OTRO">Otro...</option></select>';
  h+='<input class="form-input mt-2" id="entTOtro" placeholder="Describe el tipo de entrega..." style="display:none">';
  h+='</div></div>';
  const camps=(getStore().campanias||[]).filter(c=>c.estado==='activa'||c.estado==='planificacion');
  h+='<div class="form-row c3 mb-4">';
  h+='<div class="form-group"><label class="form-label">Área</label><input class="form-input" id="entArea" placeholder="Se llena al seleccionar empleado"></div>';
  h+='<div class="form-group"><label class="form-label">Campaña</label><select class="form-select" id="entCamp"><option value="">— Sin campaña —</option>'+camps.map(c=>'<option value="'+c.id+'">'+esc(c.nombre)+'</option>').join('')+'</select></div>';
  h+='<div class="form-group"><label class="form-label">Fecha</label><input type="date" class="form-input" id="entF" value="'+today()+'"></div>';
  h+='</div>';
  h+='<div id="entEmpCard" class="mb-3"></div>';
  h+='<div id="entPB" class="mb-4"></div>';
  h+='<div class="mb-4"><label class="form-label" style="font-size:13px;margin-bottom:8px"><i class="fas fa-pen-fancy mr-1"></i>Firma del empleado — dibuja con el dedo en el área blanca</label><div id="sigContainer"></div><p class="text-xs text-muted mt-2"><i class="fas fa-info-circle mr-1"></i>La firma queda guardada como evidencia de la entrega</p></div>';
  h+='<div class="form-group"><label class="form-label">Observaciones</label><textarea class="form-input" id="entO" rows="2" placeholder="Notas opcionales..."></textarea></div>';
  modal.open('Registrar Entrega',h,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-success" id="mSaveEnt"><i class="fas fa-check"></i> Confirmar Entrega</button>','xl');
  setTimeout(()=>initSignatureCapture('sigContainer'),300);
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('mSaveEnt')?.addEventListener('click',saveEntrega);
  document.getElementById('entT')?.addEventListener('change',function(){const b=document.getElementById('entTOtro');if(b)b.style.display=this.value==='OTRO'?'':'none';});
  const srch=document.getElementById('entESearch');const drop=document.getElementById('entEDrop');
  function doSearch(q){
    const ql=q.toLowerCase().trim();
    if(!ql){drop.style.display='none';return;}
    const res=act.filter(e=>{const n=((e.nombre||'')+' '+(e.paterno||'')+' '+(e.materno||'')).toLowerCase();return n.includes(ql)||(e.id||'').toLowerCase().includes(ql);}).slice(0,15);
    if(!res.length){drop.innerHTML='<div style="padding:12px 16px;font-size:13px;color:var(--text-muted)">Sin resultados para "'+esc(q)+'"</div>';drop.style.display='block';return;}
    drop.innerHTML=res.map(e=>'<div class="eRes" data-id="'+e.id+'" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0"><p style="font-weight:700;font-size:13px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(e.nombre+' '+(e.paterno||''))+'</p><p style="font-size:11px;color:var(--text-muted);margin:0">Empleado #'+esc(e.id)+' · '+esc(e.area)+'</p></div><span class="badge badge-'+(e.estado==='activo'?'success':'neutral')+'" style="font-size:10px">'+esc(e.id)+'</span></div>').join('');
    drop.style.display='block';
  }
  srch?.addEventListener('input',function(){doSearch(this.value);});
  srch?.addEventListener('focus',function(){if(this.value)doSearch(this.value);});
  srch?.addEventListener('blur',()=>{setTimeout(()=>{if(drop)drop.style.display='none';},160);});
  drop?.addEventListener('mousedown',e=>e.preventDefault());
  drop?.addEventListener('click',function(e){
    const item=e.target.closest('.eRes');if(!item)return;
    const empId=item.dataset.id;const emp=act.find(x=>x.id===empId);if(!emp)return;
    document.getElementById('entE').value=empId;
    srch.value=emp.nombre+' '+(emp.paterno||'')+' (#'+emp.id+')';
    drop.style.display='none';
    const aI=document.getElementById('entArea');if(aI)aI.value=emp.area||'';
    loadPrendas(emp);showEmpCard(emp);
  });
  drop?.addEventListener('mouseover',function(e){const item=e.target.closest('.eRes');this.querySelectorAll('.eRes').forEach(el=>el.style.background='');if(item)item.style.background='var(--surface-2)';});
  drop?.addEventListener('mouseout',function(){this.querySelectorAll('.eRes').forEach(el=>el.style.background='');});
}

function saveEntrega(){
  const empId=document.getElementById('entE')?.value;
  const tipo=document.getElementById('entT')?.value;
  if(!empId){notify('Busca y selecciona un empleado','warning');return;}
  if(!tipo){notify('Selecciona el tipo de entrega','warning');return;}
  const tipoCustom=tipo==='OTRO'?(document.getElementById('entTOtro')?.value||'').trim():'';
  if(tipo==='OTRO'&&!tipoCustom){notify('Describe el tipo de entrega','warning');return;}
  const emp=getStore().employees.find(e=>e.id===empId);
  const area=document.getElementById('entArea')?.value||emp?.area||'';
  const prendas=Array.from(document.querySelectorAll('.entC:checked')).map(c=>({prenda:c.value,talla:emp?.tallas?.[c.value]||''}));
  const firma=getSignatureData();
  const usuario=getUser();
  const campaniaId=document.getElementById('entCamp')?.value||'';
  const ent={id:Date.now().toString(),empleadoId:empId,tipo,tipoCustom,area,fecha:document.getElementById('entF')?.value||today(),prendas,firma:firma||null,observaciones:document.getElementById('entO')?.value||'',campaniaId,registradoPor:usuario?.name||'Sistema',registradoPorId:usuario?.id||''};
  getStore().entregas.push(ent);
  saveEntregas();
  log('ENTREGA_'+tipo,(prendas.length||0)+' prendas — emp#'+empId+(firma?' CON FIRMA':''));
  modal.close();
  notify('Entrega registrada'+(firma?' ✓ con firma':''),'success');
  renderRows();
}

function viewSig(id){
  const ent=getStore().entregas.find(e=>e.id===id);if(!ent||!ent.firma)return;
  const emp=getStore().employees.find(x=>x.id===ent.empleadoId);
  modal.open('Firma — '+(emp?emp.nombre+' '+(emp.paterno||''):ent.empleadoId),'<div style="text-align:center;padding:16px"><img src="'+ent.firma+'" style="max-width:100%;border:1px solid var(--border);border-radius:8px"><p class="text-xs text-muted mt-2">Fecha: '+fmtDate(ent.fecha)+' · '+badgeTipo(ent.tipo,ent.tipoCustom)+'</p></div>','<button class="btn btn-ghost" id="mCancel">Cerrar</button>');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
}

function attachEvents(){
  const ta=document.getElementById('topbarActions');
  if(ta){ta.innerHTML='<button class="btn btn-success topbar-action-btn" id="btnTopNuevaEnt"><i class="fas fa-plus"></i> Nueva Entrega</button>';document.getElementById('btnTopNuevaEnt')?.addEventListener('click',newEntrega);}
  document.getElementById('entNew')?.addEventListener('click',newEntrega);
  ['entFT','entFA','entFD','entFH','entFCamp'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderRows));
  document.getElementById('entFS')?.addEventListener('input',renderRows);
  document.getElementById('entFClear')?.addEventListener('click',()=>{
    ['entFT','entFA','entFD','entFH','entFCamp'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('entFS').value='';
    renderRows();
  });
  document.getElementById('entTB')?.addEventListener('click',e=>{
    const sp=e.target.closest('.sig-preview');if(sp){viewSig(sp.dataset.id);return;}
    const det=e.target.closest('.ent-detail');if(det){viewDetail(det.dataset.id);return;}
    const del=e.target.closest('.ent-del');if(del){deleteEntrega(del.dataset.id);return;}
  });
}

export function init(){attachEvents();renderRows();}

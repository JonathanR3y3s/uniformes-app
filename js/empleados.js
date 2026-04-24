import{REGLAS,PERFILES}from'./config.js';import{getAreaNames}from'./areas-config.js';
import{getStore,saveEmployees,log}from'./storage.js';
import{getReglas,verificarCaptura}from'./rules.js';
import{esc,genId,getTallasOpts,normTalla,fmtDate,fmt}from'./utils.js';
import{buildAreaBadge,buildStatusBadge,notify,modal,confirm}from'./ui.js';

function avatarHTML(emp,size){
  size=size||36;
  if(emp.foto)return'<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;overflow:hidden;flex-shrink:0"><img src="'+emp.foto+'" style="width:100%;height:100%;object-fit:cover"></div>';
  const initials=((emp.nombre||'?')[0]+(emp.paterno?emp.paterno[0]:emp.nombre&&emp.nombre[1]?emp.nombre[1]:'?')).toUpperCase();
  const colors=['#004B87','#16a34a','#ca8a04','#7c3aed','#dc2626'];
  const ci=Math.abs((emp.id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%colors.length;
  const fs=Math.round(size*.38);
  return'<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+colors[ci]+';display:flex;align-items:center;justify-content:center;font-size:'+fs+'px;font-weight:700;color:#fff;flex-shrink:0">'+initials+'</div>';
}

export function render(){
  const areas=getAreaNames();
  let h='';
  h+='<div class="page-head"><div class="page-title"><h1>Empleados</h1><p>'+getStore().employees.length+' registros</p></div>';
  h+='<div class="flex gap-2"><button class="btn btn-ghost btn-sm" id="btnImpEmp"><i class="fas fa-file-import"></i> Importar</button><button class="btn btn-primary" id="btnNewEmp"><i class="fas fa-user-plus"></i> Nuevo</button></div></div>';
  h+='<div class="card mb-4"><div class="card-body"><div class="form-row c4">';
  h+='<div><label class="form-label">Buscar</label><input class="form-input" id="empS" placeholder="Nombre, apellido o #"></div>';
  h+='<div><label class="form-label">Área</label><select class="form-select" id="empFA"><option value="">Todas las áreas</option>'+areas.map(a=>'<option>'+a+'</option>').join('')+'</select></div>';
  h+='<div><label class="form-label">Estado</label><select class="form-select" id="empFE"><option value="">Todos</option><option value="activo">Activos</option><option value="baja">Baja</option><option value="movimiento">Movimiento</option><option value="incapacidad">Incapacidad</option></select></div>';
  h+='<div><label class="form-label">Captura</label><select class="form-select" id="empFC"><option value="">Todas</option><option value="capturado">Capturados</option><option value="pendiente">Pendientes</option></select></div>';
  h+='</div></div></div>';
  h+='<div class="card"><div class="table-wrap"><table class="dt"><thead><tr><th style="width:44px"></th><th>#</th><th>Nombre</th><th>Área</th><th>Estado</th><th>Captura</th><th>Acciones</th></tr></thead><tbody id="empT"></tbody></table></div></div>';
  h+='<p class="text-xs text-muted mt-3 text-center"><span id="empCount">0</span> empleados mostrados</p>';
  return h;
}

function filterEmp(){
  const q=(document.getElementById('empS')?.value||'').toLowerCase();
  const fa=document.getElementById('empFA')?.value||'';
  const fe=document.getElementById('empFE')?.value||'';
  const fc=document.getElementById('empFC')?.value||'';
  const list=getStore().employees.filter(e=>{
    if(fa&&e.area!==fa)return false;
    if(fe&&e.estado!==fe)return false;
    if(q&&!((e.nombre||'').toLowerCase().includes(q)||(e.paterno||'').toLowerCase().includes(q)||e.id.includes(q)))return false;
    const cap=verificarCaptura(e);
    const baja=['baja','movimiento','incapacidad'].includes(e.estado);
    if(fc==='capturado'&&!cap)return false;
    if(fc==='pendiente'&&(cap||baja))return false;
    return true;
  });
  const tb=document.getElementById('empT');
  if(!tb)return;
  const cnt=document.getElementById('empCount');
  if(cnt)cnt.textContent=list.length;
  if(!list.length){tb.innerHTML='<tr><td colspan="7" class="empty-state"><i class="fas fa-users"></i><p>No hay empleados con esos filtros</p></td></tr>';return;}
  tb.innerHTML=list.map(e=>{
    const baja=['baja','movimiento','incapacidad'].includes(e.estado);
    const rc=baja?'inactive':(verificarCaptura(e)?'capturado':'');
    return'<tr class="'+rc+'">'
      +'<td>'+avatarHTML(e,34)+'</td>'
      +'<td class="font-mono text-xs">'+esc(e.id)+'</td>'
      +'<td><span class="font-bold">'+esc(e.nombre)+' '+esc(e.paterno||'')+' '+esc(e.materno||'')+'</span></td>'
      +'<td>'+buildAreaBadge(e.area)+'</td>'
      +'<td><span class="badge '+(baja?'badge-neutral':e.estado==='activo'?'badge-success':'badge-warning')+'">'+e.estado.toUpperCase()+'</span></td>'
      +'<td>'+buildStatusBadge(e)+'</td>'
      +'<td><div class="flex gap-2">'
      +'<button class="btn btn-ghost btn-sm view-emp" data-id="'+e.id+'" title="Ver ficha"><i class="fas fa-eye"></i></button>'
      +'<button class="btn btn-accent btn-sm edit-emp" data-id="'+e.id+'" title="Editar"><i class="fas fa-edit"></i></button>'
      +'<button class="btn btn-ghost btn-sm del-emp" data-id="'+e.id+'" title="Eliminar"><i class="fas fa-trash"></i></button>'
      +'</div></td></tr>';
  }).join('');
}

export function openNewEmp(){
  const areas=getAreaNames();
  const body='<div class="form-row c2">'
    +'<div class="form-group"><label class="form-label">ID (opcional)</label><input class="form-input" id="neId" placeholder="Se genera automáticamente"></div>'
    +'<div class="form-group"><label class="form-label">Área *</label><select class="form-select" id="neArea">'+areas.map(a=>'<option>'+a+'</option>').join('')+'</select></div>'
    +'<div class="form-group"><label class="form-label">Nombre(s) *</label><input class="form-input" id="neNom" placeholder="Nombre(s)"></div>'
    +'<div class="form-group"><label class="form-label">Apellido Paterno</label><input class="form-input" id="nePat"></div>'
    +'<div class="form-group"><label class="form-label">Apellido Materno</label><input class="form-input" id="neMat"></div>'
    +'<div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="neEst"><option value="activo">Activo</option><option value="baja">Baja</option><option value="movimiento">Movimiento</option><option value="incapacidad">Incapacidad</option></select></div>'
    +'</div>';
  modal.open('Nuevo empleado',body,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveNew"><i class="fas fa-save"></i> Guardar</button>');
  document.getElementById('mCancel').addEventListener('click',()=>modal.close());
  document.getElementById('mSaveNew').addEventListener('click',saveNewEmp);
  setTimeout(()=>document.getElementById('neNom')?.focus(),100);
}

function saveNewEmp(){
  const nom=(document.getElementById('neNom')?.value||'').trim();
  if(!nom){notify('El nombre es obligatorio','warning');return;}
  const id=(document.getElementById('neId')?.value||'').trim()||genId();
  if(getStore().employees.some(e=>e.id===id)){notify('Ese ID ya existe','error');return;}
  getStore().employees.push({id,nombre:nom,paterno:(document.getElementById('nePat')?.value||'').trim(),materno:(document.getElementById('neMat')?.value||'').trim(),area:document.getElementById('neArea')?.value||'PLANTA',estado:document.getElementById('neEst')?.value||'activo',tallas:{},perfilDotacion:'AUTO',foto:null});
  saveEmployees();
  log('ALTA',nom+' (#'+id+')');
  modal.close();
  notify('Empleado registrado','success');
  filterEmp();
}

function delEmp(id){
  const e=getStore().employees.find(x=>x.id===id);
  if(!e)return;
  if(!confirm('¿Eliminar a '+e.nombre+' (#'+e.id+')?\nEsta acción no se puede deshacer.'))return;
  getStore().employees=getStore().employees.filter(x=>x.id!==id);
  saveEmployees();
  log('ELIMINAR',e.nombre+' (#'+e.id+')');
  notify('Empleado eliminado','success');
  filterEmp();
}

export function openEditEmp(id){
  const emp=getStore().employees.find(e=>e.id===id);
  if(!emp)return;
  const r=getReglas(emp);
  if(!r){notify('Área sin reglas','error');return;}

  let h='<div class="card mb-4" style="background:var(--surface-2)"><div class="card-body">';
  h+='<div class="flex items-center gap-4">';
  h+='<div id="empAvatarPreview" style="width:72px;height:72px;border-radius:50%;background:var(--border);border:2px solid var(--border-2);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0">';
  h+=emp.foto?'<img src="'+emp.foto+'" style="width:100%;height:100%;object-fit:cover">':'<span style="font-size:22px;font-weight:700;color:var(--text-muted)">'+((emp.nombre||'?')[0]).toUpperCase()+'</span>';
  h+='</div>';
  h+='<div><p class="font-bold">'+esc(emp.nombre)+' '+esc(emp.paterno||'')+' '+esc(emp.materno||'')+'</p>';
  h+='<p class="text-xs text-muted mb-3">#'+esc(emp.id)+' — '+esc(emp.area)+'</p>';
  h+='<div class="flex gap-2 flex-wrap">';
  h+='<label class="btn btn-ghost btn-sm" style="cursor:pointer"><i class="fas fa-camera"></i> Cámara<input type="file" id="fotoCapture" accept="image/*" capture="user" style="display:none"></label>';
  h+='<label class="btn btn-ghost btn-sm" style="cursor:pointer"><i class="fas fa-image"></i> Galería<input type="file" id="fotoUpload" accept="image/*" style="display:none"></label>';
  if(emp.foto)h+='<button class="btn btn-ghost btn-sm" id="fotoRemove"><i class="fas fa-trash"></i></button>';
  h+='</div></div></div></div></div>';

  h+='<div class="form-row c2 mb-4">';
  h+='<div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="eeEst">';
  ['activo','baja','movimiento','incapacidad'].forEach(s=>{h+='<option value="'+s+'"'+(emp.estado===s?' selected':'')+'>'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>';});
  h+='</select></div>';
  h+='<div class="form-group"><label class="form-label">Perfil dotación</label><select class="form-select" id="eePer">';
  h+='<option value="AUTO"'+((emp.perfilDotacion||'AUTO')==='AUTO'?' selected':'')+'>AUTO (por área)</option>';
  h+='<option value="PLANTA_SINDICALIZADO"'+(emp.perfilDotacion==='PLANTA_SINDICALIZADO'?' selected':'')+'>Planta Sindicalizado</option>';
  h+='</select></div></div>';
  h+='<div class="divider-label">Tallas requeridas</div>';

  if(r.esFlexible){
    h+='<div class="form-row c3">';
    r.prendasDisponibles.forEach(p=>{
      const opts=getTallasOpts(p);const val=(emp.tallas||{})[p]||'';
      h+='<div class="form-group"><label class="form-label">'+esc(p)+'</label><select class="form-select" id="et_'+p.replace(/ /g,'_')+'"><option value="">— No aplica —</option>'+opts.map(t=>'<option'+(val===t?' selected':'')+'>'+t+'</option>').join('')+'</select></div>';
    });
    h+='</div>';
    const mk=emp.capturadoManual||(emp.tallas&&Object.keys(emp.tallas).length>0);
    h+='<div class="card mt-4" style="background:var(--warning-bg);border-color:var(--warning)"><div class="card-body"><label class="flex items-center gap-3" style="cursor:pointer"><input type="checkbox" id="eeMan" '+(mk?'checked':'')+' style="width:18px;height:18px"><div><p class="font-bold text-sm">Marcar como capturado</p><p class="text-xs text-muted">Aunque no tenga todas las tallas</p></div></label></div></div>';
  } else {
    // Separar prendas: opciones (BOTA_O_CHOCLO etc.), UNITALLA auto, normales
    const prendasNorm=[];const prendasOpt=[];const prendasUT=[];
    r.prendas.forEach(p=>{
      if(r.opciones&&r.opciones[p])prendasOpt.push(p);
      else{const opts=getTallasOpts(p);if(opts.length===1&&opts[0]==='UNITALLA')prendasUT.push(p);else prendasNorm.push(p);}
    });
    // Grid de prendas normales
    if(prendasNorm.length){
      h+='<div class="form-row c3 mb-4">';
      prendasNorm.forEach(prenda=>{
        const opts=getTallasOpts(prenda);const val=(emp.tallas||{})[prenda]||'';
        h+='<div class="form-group"><label class="form-label">'+esc(prenda)+'</label><select class="form-select" id="et_'+prenda.replace(/ /g,'_')+'"><option value="">Seleccionar</option>'+opts.map(t=>'<option'+(val===t?' selected':'')+'>'+t+'</option>').join('')+'</select></div>';
      });
      h+='</div>';
    }
    // Opciones "elige uno" (BOTA_O_CHOCLO, CHALECO_O_CHAMARRA) — tarjetas separadas
    prendasOpt.forEach(prenda=>{
      h+='<div class="card mb-3"><div class="card-body"><p class="font-bold text-sm mb-3" style="color:var(--info)"><i class="fas fa-exchange-alt"></i> '+prenda.replace(/_/g,' ')+' — elige uno:</p><div class="form-row c3">';
      r.opciones[prenda].forEach(op=>{
        const opts=getTallasOpts(op);const val=(emp.tallas||{})[op]||'';
        h+='<div class="form-group"><label class="form-label">'+esc(op)+'</label><select class="form-select" id="et_'+op.replace(/ /g,'_')+'"><option value="">— No —</option>'+opts.map(t=>'<option'+(val===t?' selected':'')+'>'+t+'</option>').join('')+'</select></div>';
      });
      h+='</div></div></div>';
    });
    // UNITALLA: automático, no requiere selección
    if(prendasUT.length){
      h+='<div class="card mb-3" style="background:var(--success-light);border-color:var(--success)"><div class="card-body"><p class="font-bold text-sm mb-3" style="color:var(--success)"><i class="fas fa-tag"></i> Talla única — seleccionadas automáticamente</p><div class="form-row c4">';
      prendasUT.forEach(p=>{
        h+='<div class="form-group"><label class="form-label">'+esc(p)+'</label><input type="hidden" id="et_'+p.replace(/ /g,'_')+'" value="UNITALLA"><div style="padding:10px 13px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;color:var(--success);font-weight:600"><i class="fas fa-check-circle"></i> UNITALLA</div></div>';
      });
      h+='</div></div></div>';
    }
  }

  modal.open('Editar — '+emp.nombre,h,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveEdit"><i class="fas fa-save"></i> Guardar cambios</button>','lg');

  let fotoB64=emp.foto||null;
  function setPreview(src){
    fotoB64=src;
    const p=document.getElementById('empAvatarPreview');
    if(p)p.innerHTML=src?'<img src="'+src+'" style="width:100%;height:100%;object-fit:cover">':'<span style="font-size:22px;font-weight:700;color:var(--text-muted)">'+((emp.nombre||'?')[0]).toUpperCase()+'</span>';
  }
  // Galería — sin voltear
  function loadFile(file){if(!file)return;const r=new FileReader();r.onload=e=>setPreview(e.target.result);r.readAsDataURL(file);}
  // Cámara frontal — voltear horizontalmente (corrección espejo)
  function loadFileFront(file){
    if(!file)return;
    const r=new FileReader();
    r.onload=function(ev){
      const img=new Image();
      img.onload=function(){
        const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
        const ctx=c.getContext('2d');ctx.translate(img.width,0);ctx.scale(-1,1);ctx.drawImage(img,0,0);
        setPreview(c.toDataURL('image/jpeg',0.88));
      };
      img.src=ev.target.result;
    };
    r.readAsDataURL(file);
  }
  document.getElementById('fotoCapture')?.addEventListener('change',function(){loadFileFront(this.files[0]);});
  document.getElementById('fotoUpload')?.addEventListener('change',function(){loadFile(this.files[0]);});
  document.getElementById('fotoRemove')?.addEventListener('click',()=>setPreview(null));
  document.getElementById('mCancel').addEventListener('click',()=>modal.close());
  document.getElementById('mSaveEdit').addEventListener('click',()=>saveEditEmp(id,fotoB64,()=>fotoB64));
}

function openFichaEmp(id){
  const emp=getStore().employees.find(e=>e.id===id);
  if(!emp)return;
  const entregas=getStore().entregas.filter(e=>e.empleadoId===id);
  const lastEnt=entregas.slice(-1)[0];
  const colors=['#004B87','#16a34a','#ca8a04','#7c3aed','#dc2626'];
  const ci=Math.abs((emp.id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%colors.length;
  const stBadge=emp.estado==='activo'?'badge-success':['baja','movimiento','incapacidad'].includes(emp.estado)?'badge-neutral':'badge-warning';

  let h='<div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;margin-bottom:20px">';
  // Foto grande
  h+='<div style="flex-shrink:0">';
  if(emp.foto){
    h+='<div style="width:108px;height:108px;border-radius:14px;overflow:hidden;border:2px solid var(--border);box-shadow:var(--shadow-lg)"><img src="'+emp.foto+'" style="width:100%;height:100%;object-fit:cover"></div>';
  } else {
    h+='<div style="width:108px;height:108px;border-radius:14px;background:'+colors[ci]+';display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;color:#fff;box-shadow:var(--shadow-lg)">'+((emp.nombre||'?')[0]).toUpperCase()+'</div>';
  }
  h+='</div>';
  // Info
  h+='<div style="flex:1;min-width:0">';
  h+='<h2 style="font-size:18px;font-weight:700;margin-bottom:6px">'+esc((emp.nombre||'')+' '+(emp.paterno||'')+' '+(emp.materno||''))+'</h2>';
  h+='<div class="flex gap-2 flex-wrap" style="margin-bottom:10px">';
  h+='<span class="badge badge-neutral" style="font-family:monospace"># '+esc(emp.id)+'</span>';
  h+='<span class="area-badge">'+esc(emp.area)+'</span>';
  h+='<span class="badge '+stBadge+'">'+emp.estado.toUpperCase()+'</span>';
  h+='</div>';
  h+='<div class="flex gap-4" style="font-size:12px;color:var(--text-muted)">';
  h+='<span><i class="fas fa-hand-holding mr-1"></i>'+entregas.length+' entrega'+(entregas.length!==1?'s':'')+'</span>';
  if(lastEnt)h+='<span><i class="fas fa-calendar-check mr-1"></i>Última: '+fmtDate(lastEnt.fecha)+'</span>';
  h+='</div></div></div>';

  // Tallas
  const tallas=Object.entries(emp.tallas||{}).filter(([,v])=>v);
  if(tallas.length){
    h+='<div class="divider-label">Tallas capturadas</div>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:10px">';
    tallas.forEach(([p,t])=>{
      h+='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px">';
      h+='<div style="font-size:9px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">'+esc(p)+'</div>';
      h+='<div style="font-size:20px;font-weight:700;color:var(--text)">'+esc(t)+'</div></div>';
    });
    h+='</div>';
  } else {
    h+='<div class="empty-state" style="padding:24px"><i class="fas fa-ruler"></i><p>Sin tallas capturadas todavía</p></div>';
  }

  // Última entrega
  if(lastEnt){
    const pc=(lastEnt.prendas||[]).length;
    h+='<div class="divider-label mt-4">Última entrega</div>';
    h+='<div class="card mt-2" style="background:var(--surface-2)"><div class="card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
    h+='<div><p class="font-bold">'+fmtDate(lastEnt.fecha)+'</p>';
    h+='<p class="text-xs text-muted">'+pc+' pieza'+(pc!==1?'s':'')+' · '+esc(lastEnt.tipo||'')+(lastEnt.firma?' · <span style="color:var(--success)"><i class="fas fa-signature"></i> Firmada</span>':'')+'</p></div>';
    if(lastEnt.firma)h+='<img src="'+lastEnt.firma+'" style="height:44px;max-width:140px;object-fit:contain;border:1px solid var(--border);border-radius:6px">';
    h+='</div></div>';
  }

  modal.open(esc((emp.nombre||'')+' '+(emp.paterno||'')),h,
    '<button class="btn btn-ghost" id="mCancel">Cerrar</button><button class="btn btn-accent" id="mFichaEdit"><i class="fas fa-edit"></i> Editar tallas</button>','md');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('mFichaEdit')?.addEventListener('click',()=>{modal.close();openEditEmp(id);});
}

function saveEditEmp(id,_foto,getFoto){
  const emp=getStore().employees.find(e=>e.id===id);
  if(!emp)return;
  emp.estado=document.getElementById('eeEst')?.value||emp.estado;
  emp.perfilDotacion=document.getElementById('eePer')?.value||'AUTO';
  emp.foto=getFoto();
  const r=getReglas(emp);
  if(r.esFlexible){
    const tallas={};
    r.prendasDisponibles.forEach(p=>{const v=document.getElementById('et_'+p.replace(/ /g,'_'));if(v&&v.value)tallas[p]=normTalla(v.value);});
    emp.tallas=tallas;
    const chk=document.getElementById('eeMan');
    emp.capturadoManual=Object.keys(tallas).length>0||(chk&&chk.checked);
  } else {
    const tallas={};const falt=[];
    r.prendas.forEach(prenda=>{
      if(r.opciones&&r.opciones[prenda]){
        let tiene=false;
        r.opciones[prenda].forEach(op=>{const v=document.getElementById('et_'+op.replace(/ /g,'_'));if(v&&v.value){tallas[op]=normTalla(v.value);tiene=true;}});
        if(emp.estado==='activo'&&!tiene)falt.push(prenda.replace(/_/g,' '));
      } else {
        const v=document.getElementById('et_'+prenda.replace(/ /g,'_'));
        if(v&&v.value)tallas[prenda]=normTalla(v.value);
        if(emp.estado==='activo'&&!(v&&v.value))falt.push(prenda);
      }
    });
    if(emp.estado==='activo'&&falt.length){notify('Faltan tallas: '+falt.join(', '),'warning');return;}
    emp.tallas=tallas;
  }
  saveEmployees();
  log('EDITAR',emp.nombre+' (#'+emp.id+')');
  modal.close();
  notify('Cambios guardados','success');
  filterEmp();
}

export function init(){
  document.getElementById('empS')?.addEventListener('input',filterEmp);
  ['empFA','empFE','empFC'].forEach(id=>document.getElementById(id)?.addEventListener('change',filterEmp));
  document.getElementById('btnNewEmp')?.addEventListener('click',openNewEmp);
  document.getElementById('btnImpEmp')?.addEventListener('click',()=>{
    window.location.hash='importar';window.dispatchEvent(new PopStateEvent('popstate',{state:{v:'importar'}}));
  });
  document.getElementById('empT')?.addEventListener('click',function(e){
    const vb=e.target.closest('.view-emp');const eb=e.target.closest('.edit-emp');const db=e.target.closest('.del-emp');
    if(vb)openFichaEmp(vb.dataset.id);
    if(eb)openEditEmp(eb.dataset.id);
    if(db)delEmp(db.dataset.id);
  });
  filterEmp();
}

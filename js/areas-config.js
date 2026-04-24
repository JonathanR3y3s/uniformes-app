/**
 * ÁREAS Y DOTACIONES — Configuración dinámica de áreas y reglas de prendas
 * Store: localStorage '_areas_rules'  { NOMBRE: { prendas, cantidades, opciones, esFlexible, ... } }
 */
import{REGLAS,TIPO_TALLA}from'./config.js';
import{esc,getTallasOpts}from'./utils.js';
import{notify,modal,confirm}from'./ui.js';
import{getStore,saveAreas,log}from'./storage.js';

const KEY='_areas_rules';

// ── Store helpers ────────────────────────────────────────────────────────────
export function initAreasRules(){
  if(!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify(REGLAS));
}
export function getAreasRules(){
  initAreasRules();
  try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return REGLAS;}
}
function saveAreasRules(rules){
  localStorage.setItem(KEY,JSON.stringify(rules));
  // Mantener store.areas sincronizado
  const store=getStore();
  store.areas=Object.keys(rules).map(n=>({nombre:n,activa:true}));
  saveAreas();
}
export function getAreaRule(nombre){return getAreasRules()[nombre]||null;}
export function getAreaNames(){return Object.keys(getAreasRules());}

// Catálogo de prendas "reales" (no grupos BOTA_O_CHOCLO)
const CATALOG=Object.keys(TIPO_TALLA);

// ── Render página ────────────────────────────────────────────────────────────
export function render(){
  const rules=getAreasRules();
  const store=getStore();
  let h='<div class="page-head"><div class="page-title"><h1>Áreas y Dotaciones</h1><p>Define qué prendas y cuántas piezas corresponden a cada área</p></div>';
  h+='<button class="btn btn-primary" id="btnNewArea"><i class="fas fa-plus"></i> Nueva Área</button></div>';
  h+='<div class="card"><div class="table-wrap"><table class="dt"><thead><tr>';
  h+='<th>Área</th><th>Tipo</th><th>Prendas</th><th>Empleados</th><th>Acciones</th>';
  h+='</tr></thead><tbody>';
  if(!Object.keys(rules).length){h+='<tr><td colspan="5" class="empty-state"><i class="fas fa-layer-group"></i><p>Sin áreas configuradas</p></td></tr>';}
  Object.entries(rules).forEach(([nombre,regla])=>{
    const emps=store.employees.filter(e=>e.area===nombre).length;
    const tipo=regla.esFlexible?'Flexible':'Estándar';
    const lista=regla.esFlexible?(regla.prendasDisponibles||[]):(regla.prendas||[]);
    const nP=lista.length;
    h+='<tr>';
    h+='<td class="font-bold">'+esc(nombre)+'</td>';
    h+='<td><span class="badge '+(regla.esFlexible?'badge-warning':'badge-info')+'">'+tipo+'</span></td>';
    h+='<td><span class="badge badge-neutral">'+nP+' prenda'+(nP!==1?'s':'')+'</span></td>';
    h+='<td>'+emps+' empleado'+(emps!==1?'s':'')+'</td>';
    h+='<td><div class="flex gap-2">';
    h+='<button class="btn btn-ghost btn-sm edit-area" data-n="'+esc(nombre)+'" title="Editar dotación"><i class="fas fa-edit"></i> Editar</button>';
    if(!emps)h+='<button class="btn btn-ghost btn-sm del-area" data-n="'+esc(nombre)+'" title="Eliminar"><i class="fas fa-trash"></i></button>';
    else h+='<span class="text-xs text-muted" style="padding:6px 8px" title="Tiene empleados — no se puede eliminar"><i class="fas fa-lock"></i></span>';
    h+='</div></td>';
    h+='</tr>';
  });
  h+='</tbody></table></div></div>';
  // Nota informativa
  h+='<div class="card mt-4" style="background:var(--info-bg);border-color:var(--info)"><div class="card-body"><p class="text-sm font-bold" style="color:var(--info)"><i class="fas fa-info-circle"></i> ¿Cómo funciona?</p><p class="text-xs text-muted mt-2">Cada área define cuántas piezas de cada prenda recibe un empleado al año. Puedes ajustar cantidades o agregar nuevas áreas. Las prendas marcadas como UNITALLA (Termo, Toalla, Gorra, Sombrilla) no requieren selección de talla.</p></div></div>';
  return h;
}

// ── Modal editar área ────────────────────────────────────────────────────────
function buildEditBody(nombre,regla){
  // Construir tabla editable de prendas
  const prendas=regla.prendas||regla.prendasDisponibles||[];
  const cantidades=regla.cantidades||{};
  const opciones=regla.opciones||{};

  // Clasificar prendas
  const rows=[];
  prendas.forEach(p=>{
    if(opciones[p]){
      // Grupo de opción (ej: BOTA_O_CHOCLO)
      rows.push({tipo:'opcion',key:p,label:opciones[p].join(' ó '),cant:cantidades[p]||1});
    } else {
      const opts=getTallasOpts(p);
      const isUT=opts.length===1&&opts[0]==='UNITALLA';
      rows.push({tipo:isUT?'unitalla':'normal',key:p,label:p,cant:cantidades[p]||1});
    }
  });

  let body=regla.esFlexible
    ?'<div class="card mb-4" style="background:var(--warning-bg);border-color:var(--warning)"><div class="card-body"><p class="text-sm font-bold" style="color:var(--warning)"><i class="fas fa-info-circle"></i> Área Flexible (tipo Supervisores)</p><p class="text-xs text-muted mt-1">En áreas flexibles el empleado elige sus prendas — edita el catálogo disponible abajo.</p></div></div>'
    :'';

  body+='<table class="dt" style="margin-bottom:16px"><thead><tr><th>Prenda</th><th>Tipo</th><th style="width:100px;text-align:center">Piezas/año</th><th style="width:60px"></th></tr></thead><tbody id="arPrendasTB">';

  rows.forEach((r,i)=>{
    const badge=r.tipo==='opcion'?'badge-warning':r.tipo==='unitalla'?'badge-success':'badge-neutral';
    const label=r.tipo==='opcion'?'Opción':'UNITALLA'===r.tipo.toUpperCase()?'Talla única':'Por talla';
    body+='<tr data-key="'+esc(r.key)+'">';
    body+='<td class="font-bold">'+esc(r.label)+(r.tipo==='opcion'?' <span class="badge badge-warning" style="font-size:9px">ELIGE UNO</span>':'')+'</td>';
    body+='<td><span class="badge '+badge+'">'+label+'</span></td>';
    body+='<td style="text-align:center"><input type="number" class="form-input ar-cant" data-key="'+esc(r.key)+'" value="'+r.cant+'" min="1" max="20" style="width:70px;text-align:center;padding:6px 8px"></td>';
    body+='<td>'+(r.tipo!=='opcion'?'<button class="btn btn-ghost btn-sm rm-prenda" data-key="'+esc(r.key)+'" title="Quitar"><i class="fas fa-times"></i></button>':'<span style="opacity:.3"><i class="fas fa-lock"></i></span>')+'</td>';
    body+='</tr>';
  });
  body+='</tbody></table>';

  // Agregar prenda desde catálogo
  const yaIncluidas=new Set(prendas.flatMap(p=>opciones[p]?opciones[p]:[p]));
  const disponibles=CATALOG.filter(p=>!yaIncluidas.has(p));
  if(disponibles.length){
    body+='<div class="flex gap-2 items-center"><select class="form-select" id="arAddSel"><option value="">+ Agregar prenda al área...</option>';
    disponibles.forEach(p=>{
      const opts=getTallasOpts(p);const t=opts.length===1&&opts[0]==='UNITALLA'?'(UNITALLA)':'('+opts[0]+'...)';
      body+='<option value="'+esc(p)+'">'+esc(p)+' '+t+'</option>';
    });
    body+='</select><button class="btn btn-ghost btn-sm" id="arAddBtn" style="white-space:nowrap"><i class="fas fa-plus"></i> Agregar</button></div>';
  }
  return body;
}

function openEditArea(nombre){
  const rules=getAreasRules();
  const regla=rules[nombre];
  if(!regla)return;

  const body=buildEditBody(nombre,regla);
  modal.open('Dotación — '+nombre,body,
    '<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveArea"><i class="fas fa-save"></i> Guardar cambios</button>','lg');

  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());

  // Quitar prenda
  document.getElementById('modalBody')?.addEventListener('click',e=>{
    const rm=e.target.closest('.rm-prenda');
    if(rm){
      const k=rm.dataset.key;
      const row=rm.closest('tr');
      if(row)row.remove();
    }
    // Agregar prenda
    const add=e.target.closest('#arAddBtn');
    if(add){
      const sel=document.getElementById('arAddSel');
      const p=sel?.value;if(!p)return;
      const opts=getTallasOpts(p);const isUT=opts.length===1&&opts[0]==='UNITALLA';
      const badge=isUT?'badge-success':'badge-neutral';
      const label=isUT?'Talla única':'Por talla';
      const tb=document.getElementById('arPrendasTB');
      if(tb){
        const tr=document.createElement('tr');tr.dataset.key=p;
        tr.innerHTML='<td class="font-bold">'+esc(p)+'</td><td><span class="badge '+badge+'">'+label+'</span></td><td style="text-align:center"><input type="number" class="form-input ar-cant" data-key="'+esc(p)+'" value="1" min="1" max="20" style="width:70px;text-align:center;padding:6px 8px"></td><td><button class="btn btn-ghost btn-sm rm-prenda" data-key="'+esc(p)+'" title="Quitar"><i class="fas fa-times"></i></button></td>';
        tb.appendChild(tr);
        sel.value='';
        // Quitar del selector
        const opt=sel.querySelector('option[value="'+p+'"]');if(opt)opt.remove();
      }
    }
  });

  // Guardar
  document.getElementById('mSaveArea')?.addEventListener('click',()=>{
    const rules2=getAreasRules();
    const regla2=rules2[nombre];
    // Leer filas actuales
    const rows=[...document.querySelectorAll('#arPrendasTB tr')];
    const nuevasPrendas=rows.map(r=>r.dataset.key).filter(Boolean);
    const nuevasCants={...regla2.cantidades};
    rows.forEach(r=>{
      const k=r.dataset.key;
      const inp=r.querySelector('.ar-cant');
      if(k&&inp)nuevasCants[k]=Math.max(1,parseInt(inp.value,10)||1);
    });
    // Eliminar cantidades de prendas quitadas
    Object.keys(nuevasCants).forEach(k=>{
      const esOpcion=Object.values(regla2.opciones||{}).some(arr=>arr.includes(k));
      if(!nuevasPrendas.includes(k)&&!nuevasPrendas.some(p=>(regla2.opciones||{})[p]&&(regla2.opciones[p]||[]).includes(k))&&!esOpcion){
        delete nuevasCants[k];
      }
    });
    if(regla2.esFlexible){regla2.prendasDisponibles=nuevasPrendas;}
    else{regla2.prendas=nuevasPrendas;}
    regla2.cantidades=nuevasCants;
    rules2[nombre]=regla2;
    saveAreasRules(rules2);
    log('AREA_EDITAR',nombre);
    modal.close();
    notify('Dotación de '+nombre+' actualizada','success');
    document.getElementById('mainContent').innerHTML=render();
    init();
  });
}

// ── Modal nueva área ─────────────────────────────────────────────────────────
function openNewArea(){
  // Primera pantalla: nombre + tipo
  const body=`
    <div class="form-group mb-4"><label class="form-label">Nombre del área *</label><input class="form-input" id="naName" placeholder="Ej. LOGÍSTICA, OFICINAS, SEGURIDAD..." style="font-size:15px"></div>
    <div class="form-group mb-4"><label class="form-label">Tipo de área</label>
      <select class="form-select" id="naTipo">
        <option value="normal">Estándar — dotación fija (mismas prendas para todos)</option>
        <option value="flexible">Flexible — dotación a elección (como Supervisores)</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Prendas del área</label>
      <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;max-height:300px;overflow-y:auto">
        <table class="dt" style="margin:0"><thead><tr><th style="width:40px"></th><th>Prenda</th><th style="width:80px;text-align:center">Piezas</th></tr></thead>
        <tbody>`;

  let bodyEnd=`</tbody></table></div></div>`;

  let rows='';
  CATALOG.forEach(p=>{
    const opts=getTallasOpts(p);const isUT=opts.length===1&&opts[0]==='UNITALLA';
    const badge=isUT?'<span class="badge badge-success" style="font-size:9px">UNITALLA</span>':'';
    rows+=`<tr>
      <td style="text-align:center"><input type="checkbox" class="na-chk" value="${esc(p)}" style="width:18px;height:18px"></td>
      <td class="text-sm font-bold">${esc(p)} ${badge}</td>
      <td><input type="number" class="form-input na-qty" data-p="${esc(p)}" value="1" min="1" max="20" style="width:60px;text-align:center;padding:5px 6px;font-size:12px"></td>
    </tr>`;
  });

  modal.open('Nueva Área',body+rows+bodyEnd,
    '<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveNa"><i class="fas fa-save"></i> Crear área</button>','md');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
  setTimeout(()=>document.getElementById('naName')?.focus(),80);

  document.getElementById('mSaveNa')?.addEventListener('click',()=>{
    const nombre=(document.getElementById('naName')?.value||'').trim().toUpperCase();
    if(!nombre){notify('El nombre del área es obligatorio','warning');return;}
    if(!/^[A-ZÁÉÍÓÚÑ0-9 _\-]{2,40}$/.test(nombre)){notify('Solo letras, números, espacios y guiones','warning');return;}
    const rules=getAreasRules();
    if(rules[nombre]){notify('Ya existe un área con ese nombre','error');return;}
    const tipo=document.getElementById('naTipo')?.value||'normal';
    const selPrendas=[...document.querySelectorAll('.na-chk:checked')].map(c=>c.value);
    if(!selPrendas.length&&tipo==='normal'){notify('Selecciona al menos una prenda','warning');return;}
    const cantidades={};
    selPrendas.forEach(p=>{
      const inp=document.querySelector('.na-qty[data-p="'+p+'"]');
      cantidades[p]=Math.max(1,parseInt(inp?.value,10)||1);
    });
    const nuevaRegla=tipo==='flexible'
      ?{prendasDisponibles:selPrendas,cantidades,esFlexible:true}
      :{prendas:selPrendas,cantidades,opciones:{}};
    rules[nombre]=nuevaRegla;
    saveAreasRules(rules);
    log('AREA_ALTA',nombre);
    modal.close();
    notify('Área '+nombre+' creada','success');
    document.getElementById('mainContent').innerHTML=render();
    init();
  });
}

// ── Eliminar área ────────────────────────────────────────────────────────────
function delArea(nombre){
  const store=getStore();
  const emps=store.employees.filter(e=>e.area===nombre).length;
  if(emps){notify('No se puede eliminar — hay '+emps+' empleado'+(emps!==1?'s':'')+' en esta área','error');return;}
  if(!confirm('¿Eliminar el área "'+nombre+'"?\nEsta acción no se puede deshacer.'))return;
  const rules=getAreasRules();
  delete rules[nombre];
  saveAreasRules(rules);
  log('AREA_BAJA',nombre);
  notify('Área '+nombre+' eliminada','success');
  document.getElementById('mainContent').innerHTML=render();
  init();
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function init(){
  document.getElementById('btnNewArea')?.addEventListener('click',openNewArea);
  document.getElementById('mainContent')?.addEventListener('click',function(e){
    const ed=e.target.closest('.edit-area');const dl=e.target.closest('.del-area');
    if(ed)openEditArea(ed.dataset.n);
    if(dl)delArea(dl.dataset.n);
  });
}

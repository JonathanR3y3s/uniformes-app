import{calcTotalesDetallados}from'./rules.js';import{getStore,saveInventario,saveComprasAlmacen,saveStockUniformes,saveSalidas,log}from'./storage.js';import{esc,today,fmtMoney,fmtDate,getTallasOpts}from'./utils.js';import{notify,modal}from'./ui.js';import{getUserRole}from'./user-roles.js';
const CATS={BEBIDAS:{icon:'☕',label:'Bebidas',color:'#92400e',bg:'#fef3c7'},PAPELERIA:{icon:'📄',label:'Papelería',color:'#1d4ed8',bg:'#dbeafe'},SOUVENIRS:{icon:'🎁',label:'Souvenirs',color:'#7c3aed',bg:'#ede9fe'},LIMPIEZA:{icon:'🧹',label:'Limpieza',color:'#065f46',bg:'#d1fae5'},ALIMENTOS:{icon:'🍽️',label:'Alimentos',color:'#b45309',bg:'#fef3c7'},OTROS:{icon:'📦',label:'Otros',color:'#374151',bg:'#f3f4f6'}};
const PRENDAS_UNIFORME=['PLAYERA POLO TIPO A','PLAYERA POLO TIPO B','CAMISOLA','PLAYERA PANTS','PANTS','PANTALON','BOTA','CHOCLO','ZAPATO ESPECIAL','TENIS','SANDALIAS','CHALECO','CHAMARRA','GORRA','TOALLA','TERMO','SOMBRILLA'];
let currentTab='uniformes';
export function render(){let h='<div class="page-head"><div class="page-title"><h1>Inventario</h1><p>Uniformes y Almacén General</p></div><button class="btn btn-success" id="invNewBtn" style="display:none"><i class="fas fa-plus"></i> Nuevo Artículo</button><button class="btn btn-primary" id="recepcionBtn" style="display:none"><i class="fas fa-truck mr-1"></i> Recibir Mercancía</button><button class="btn btn-danger" id="salidaAlmBtn" style="display:none"><i class="fas fa-sign-out-alt mr-1"></i> Registrar Salida</button></div>';h+='<div class="tabs mb-4"><button class="tab-btn active" data-tab="uniformes"><i class="fas fa-tshirt mr-2"></i>Uniformes</button><button class="tab-btn" data-tab="almacen"><i class="fas fa-boxes mr-2"></i>Almacén General</button></div>';h+='<div id="tabContent"></div>';return h;}
function renderUniformes(){const det=calcTotalesDetallados();const rows=[];Object.entries(det).forEach(([prenda,tallas])=>{Object.entries(tallas).forEach(([talla,obj])=>{rows.push({prenda,talla,base:obj.base,stock:obj.stock,total:obj.total});});});const totalPiezas=rows.reduce((s,r)=>s+r.total,0);let h='<div class="kpi-grid"><div class="kpi info"><div class="kpi-label">Total Piezas Requeridas</div><div class="kpi-value">'+totalPiezas.toLocaleString('es-MX')+'</div></div></div>';h+='<div class="card"><div class="table-wrap"><table class="dt"><thead><tr><th>Prenda</th><th>Talla</th><th style="text-align:right">Empleados</th><th style="text-align:right">Stock Extra</th><th style="text-align:right">Total</th></tr></thead><tbody>';if(rows.length){rows.forEach(r=>{h+='<tr><td class="font-bold">'+esc(r.prenda)+'</td><td>'+r.talla+'</td><td style="text-align:right">'+r.base+'</td><td style="text-align:right">'+(r.stock?'<span class="badge badge-info">+'+r.stock+'</span>':'—')+'</td><td style="text-align:right;font-weight:700;color:var(--success)">'+r.total+'</td></tr>';}); }else{h+='<tr><td colspan="5" class="empty-state"><i class="fas fa-tshirt"></i><p>Sin datos de uniformes</p></td></tr>';}h+='</tbody></table></div></div>';document.getElementById('tabContent').innerHTML=h;document.getElementById('invNewBtn').style.display='none';}
function renderAlmacen(){const items=getStore().inventario||[];const totalItems=items.length;const conStock=items.filter(i=>i.cantidad>0).length;const alertas=items.filter(i=>i.cantidad<=(i.minStock||0)).length;let h='<div class="kpi-grid"><div class="kpi"><div class="kpi-label">Total Artículos</div><div class="kpi-value">'+totalItems+'</div></div><div class="kpi success"><div class="kpi-label">Con Stock</div><div class="kpi-value">'+conStock+'</div></div>';if(alertas){h+='<div class="kpi warning"><div class="kpi-label"><i class="fas fa-exclamation-triangle mr-1"></i>Stock Bajo</div><div class="kpi-value" style="color:#d97706">'+alertas+'</div><div class="kpi-sub">Requieren reposición</div></div>';}h+='</div>';h+='<div class="card mb-4"><div class="card-body"><div class="form-row c3"><div><label class="form-label">Categoría</label><select class="form-select" id="almCat"><option value="">Todas</option>'+Object.entries(CATS).map(([k,v])=>'<option value="'+k+'">'+v.icon+' '+v.label+'</option>').join('')+'</select></div><div><label class="form-label">Buscar</label><input class="form-input" id="almSearch" placeholder="Nombre del artículo..."></div><div class="flex items-center" style="align-items:flex-end"><button class="btn btn-ghost" style="width:100%" id="almClear"><i class="fas fa-times"></i> Limpiar</button></div></div></div></div>';h+='<div id="almGrid" class="form-row c3" style="align-items:start"></div>';document.getElementById('tabContent').innerHTML=h;document.getElementById('invNewBtn').style.display='';attachAlmacenEvents();renderAlmacenGrid();}
function renderAlmacenGrid(){const items=getStore().inventario||[];const cat=document.getElementById('almCat')?.value||'';const q=(document.getElementById('almSearch')?.value||'').toLowerCase();let list=items;if(cat)list=list.filter(i=>i.categoria===cat);if(q)list=list.filter(i=>(i.nombre||'').toLowerCase().includes(q));const grid=document.getElementById('almGrid');if(!grid)return;if(!list.length){grid.innerHTML='<div style="grid-column:1/-1" class="empty-state"><i class="fas fa-boxes"></i><p>'+(items.length?'Sin resultados':'Sin artículos en almacén')+'</p></div>';return;}grid.innerHTML=list.map(item=>{const c=CATS[item.categoria]||CATS.OTROS;const alerta=item.cantidad<=(item.minStock||0);const img=item.foto?'<img src="'+item.foto+'" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-bottom:8px">':'<div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:8px">'+c.icon+'</div>';return'<div class="card" style="cursor:default'+(alerta?';border:1px solid #fbbf24':'')+'"><div class="card-body" style="padding:16px">'+img+'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><span class="font-bold text-sm">'+esc(item.nombre)+'</span><span style="background:'+c.bg+';color:'+c.color+';font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px">'+c.label+'</span></div>'+(item.descripcion?'<p class="text-xs text-muted mb-2">'+esc(item.descripcion)+'</p>':'')+'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><span class="text-xs text-muted">Existencia:</span><span style="font-size:22px;font-weight:800;color:'+(alerta?'#d97706':'#059669')+'">'+item.cantidad+'<span class="text-xs text-muted font-normal ml-1">'+(item.unidad||'pzs')+'</span></span></div>'+(alerta?'<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:6px 10px;font-size:11px;color:#92400e;margin-bottom:8px"><i class="fas fa-exclamation-triangle mr-1"></i>Stock bajo (mín: '+(item.minStock||0)+')</div>':'')+'<div class="flex gap-2"><button class="btn btn-sm btn-ghost alm-hist" data-id="'+item.id+'" title="Ver historial" style="color:#7c3aed"><i class="fas fa-history"></i></button><button class="btn btn-sm btn-ghost alm-edit" data-id="'+item.id+'" style="flex:1"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-ghost alm-stock" data-id="'+item.id+'" style="flex:1;color:#059669"><i class="fas fa-plus"></i></button><button class="btn btn-sm btn-ghost alm-del" data-id="'+item.id+'" style="flex:1;color:#dc2626"><i class="fas fa-trash"></i></button></div></div></div>';}).join('');}
function openItemModal(id){const item=id?getStore().inventario.find(i=>i.id===id):null;const foto=item?.foto||null;let fotoData=foto;let h='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="itmN" value="'+esc(item?.nombre||'')+'" placeholder="Ej: Agua embotellada"></div><div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="itmC"><option value="">Sin categoría</option>'+Object.entries(CATS).map(([k,v])=>'<option value="'+k+'"'+(item?.categoria===k?' selected':'')+'>'+v.icon+' '+v.label+'</option>').join('')+'</select></div></div><div class="form-row c3 mb-3"><div class="form-group"><label class="form-label">Cantidad</label><input class="form-input" type="number" id="itmQ" min="0" value="'+(item?.cantidad||0)+'" placeholder="0"></div><div class="form-group"><label class="form-label">Mín. Stock</label><input class="form-input" type="number" id="itmMin" min="0" value="'+(item?.minStock||0)+'" placeholder="0"></div><div class="form-group"><label class="form-label">Unidad</label><select class="form-select" id="itmU"><option value="piezas">Piezas</option><option value="cajas"'+(item?.unidad==='cajas'?' selected':'')+'>Cajas</option><option value="kg"'+(item?.unidad==='kg'?' selected':'')+'>Kg</option><option value="litros"'+(item?.unidad==='litros'?' selected':'')+'>Litros</option></select></div></div><div class="form-group mb-3"><label class="form-label">Descripción</label><input class="form-input" id="itmD" value="'+esc(item?.descripcion||'')+'" placeholder="Descripción opcional"></div>';h+='<div class="form-group"><label class="form-label">Imagen (opcional)</label><div id="itmFotoBox" style="margin-top:8px">';if(fotoData){h+='<img id="itmFotoPreview" src="'+fotoData+'" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px"><button class="btn btn-sm btn-ghost" id="itmFotoRm" style="color:#dc2626"><i class="fas fa-trash"></i> Quitar foto</button>';}else{h+='<label style="display:block;border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer;color:var(--text-muted)"><i class="fas fa-image fa-2x mb-2"></i><p class="text-sm">Toca para subir imagen</p><input type="file" id="itmFotoIn" accept="image/*" capture="environment" style="display:none"></label>';}h+='</div></div>';modal.open(id?'Editar Artículo':'Nuevo Artículo',h,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-success" id="mSaveItm"><i class="fas fa-save"></i> Guardar</button>');document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());document.getElementById('itmFotoIn')?.addEventListener('change',function(){const f=this.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{fotoData=ev.target.result;const box=document.getElementById('itmFotoBox');if(box){box.innerHTML='<img id="itmFotoPreview" src="'+fotoData+'" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px"><button class="btn btn-sm btn-ghost" id="itmFotoRm2" style="color:#dc2626"><i class="fas fa-trash"></i> Quitar foto</button>';box.querySelector('#itmFotoRm2')?.addEventListener('click',()=>{fotoData=null;box.innerHTML='<label style="display:block;border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer;color:var(--text-muted)"><i class="fas fa-image fa-2x mb-2"></i><p class="text-sm">Toca para subir imagen</p><input type="file" id="itmFotoIn2" accept="image/*" capture="environment" style="display:none"></label>';box.querySelector('#itmFotoIn2')?.addEventListener('change',function(){const r2=new FileReader();r2.onload=e2=>{fotoData=e2.target.result;box.innerHTML='<img src="'+fotoData+'" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px">';};r2.readAsDataURL(this.files[0]);});});}};r.readAsDataURL(f);});document.getElementById('itmFotoRm')?.addEventListener('click',()=>{fotoData=null;const box=document.getElementById('itmFotoBox');if(box)box.innerHTML='<label style="display:block;border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer;color:var(--text-muted)"><i class="fas fa-image fa-2x mb-2"></i><p class="text-sm">Toca para subir imagen</p><input type="file" id="itmFotoIn" accept="image/*" capture="environment" style="display:none"></label>';});document.getElementById('mSaveItm')?.addEventListener('click',()=>saveItem(id,()=>fotoData));}
function saveItem(id,getFoto){const nom=(document.getElementById('itmN')?.value||'').trim();if(!nom){notify('Escribe un nombre','warning');return;}const items=getStore().inventario;if(id){const it=items.find(i=>i.id===id);if(it){it.nombre=nom;it.categoria=document.getElementById('itmC')?.value||'OTROS';it.cantidad=parseInt(document.getElementById('itmQ')?.value||'0',10);it.minStock=parseInt(document.getElementById('itmMin')?.value||'0',10);it.unidad=document.getElementById('itmU')?.value||'piezas';it.descripcion=document.getElementById('itmD')?.value||'';it.foto=getFoto();it.updatedAt=new Date().toISOString();}}else{items.push({id:Date.now().toString(),nombre:nom,categoria:document.getElementById('itmC')?.value||'OTROS',cantidad:parseInt(document.getElementById('itmQ')?.value||'0',10),minStock:parseInt(document.getElementById('itmMin')?.value||'0',10),unidad:document.getElementById('itmU')?.value||'piezas',descripcion:document.getElementById('itmD')?.value||'',foto:getFoto()||null,updatedAt:new Date().toISOString()});}saveInventario();log(id?'EDIT_ITEM':'NEW_ITEM',nom);modal.close();notify('Artículo guardado','success');renderAlmacenGrid();}
function addStock(id){
  const it=getStore().inventario.find(i=>i.id===id);if(!it)return;
  const cur=it.cantidad;const isOp=getUserRole()==='operador';
  let h='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center"><span class="text-sec text-sm">Existencia actual</span><span style="font-size:22px;font-weight:800;color:var(--success)">'+cur+' <span style="font-size:13px;font-weight:400">'+esc(it.unidad||'pzs')+'</span></span></div>';
  if(!isOp){
    // Admin: permite entradas y salidas
    h+='<div class="form-group mb-3"><label class="form-label">Movimiento (positivo=entrada, negativo=salida)</label><div class="flex gap-2"><button class="btn btn-ghost" id="stkM" style="min-width:48px;font-size:20px">−</button><input class="form-input" type="number" id="stkQ" value="1" style="text-align:center;font-size:22px;font-weight:700;flex:1"><button class="btn btn-ghost" id="stkP" style="min-width:48px;font-size:20px">+</button></div></div>';
  } else {
    // Operador: solo entradas positivas, campos obligatorios
    h+='<div class="form-group mb-3"><label class="form-label">Cantidad a ingresar *</label><div class="flex gap-2"><button class="btn btn-ghost" id="stkM" style="min-width:48px;font-size:20px">−</button><input class="form-input" type="number" id="stkQ" value="1" min="1" style="text-align:center;font-size:22px;font-weight:700;flex:1"><button class="btn btn-ghost" id="stkP" style="min-width:48px;font-size:20px">+</button></div><p class="text-xs" style="color:#059669;margin-top:4px"><i class="fas fa-info-circle mr-1"></i>Solo entradas. Para salidas o ajustes contacta al administrador.</p></div>';
  }
  h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Proveedor'+(isOp?' *':'')+'</label><input class="form-input" id="stkProv" placeholder="Nombre del proveedor"></div><div class="form-group"><label class="form-label">Fecha *</label><input class="form-input" type="date" id="stkFecha" value="'+today()+'"></div></div>';
  h+='<div class="form-group mb-2"><label class="form-label">Precio unitario (opcional)</label><input class="form-input" type="number" id="stkPU" min="0" step="0.01" placeholder="0.00"></div>';
  modal.open((isOp?'Registrar Entrada — ':'Entrada/Salida — ')+esc(it.nombre),h,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-success" id="stkSave"><i class="fas fa-check"></i> Aplicar</button>');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('stkM')?.addEventListener('click',()=>{const q=document.getElementById('stkQ');const v=parseInt(q.value||'0',10)-1;q.value=isOp?Math.max(1,v):v;});
  document.getElementById('stkP')?.addEventListener('click',()=>{const q=document.getElementById('stkQ');q.value=parseInt(q.value||'0',10)+1;});
  document.getElementById('stkSave')?.addEventListener('click',()=>{
    const delta=parseInt(document.getElementById('stkQ')?.value||'0',10);
    const pu=parseFloat(document.getElementById('stkPU')?.value||'0')||0;
    const prov=(document.getElementById('stkProv')?.value||'').trim();
    const fecha=document.getElementById('stkFecha')?.value||today();
    // Validaciones
    if(isOp&&delta<=0){notify('La cantidad debe ser mayor a cero','warning');return;}
    if(!fecha){notify('La fecha es obligatoria','warning');return;}
    if(isOp&&!prov){notify('El proveedor es obligatorio para registrar una entrada','warning');return;}
    if(delta<0&&(cur+delta)<0){notify('No se puede registrar una salida mayor al stock actual ('+cur+' '+( it.unidad||'pzs')+')','error');return;}
    const anterior=it.cantidad;
    it.cantidad=Math.max(0,cur+delta);
    saveInventario();
    log('STOCK_ADJ','[ALMACÉN] '+it.nombre+' '+( delta>=0?'+':'')+delta+' (anterior:'+anterior+' nuevo:'+it.cantidad+') proveedor:'+(prov||'—'),'INVENTARIO');
    if(delta>0&&pu>0){
      const s=getStore();
      if(!s.comprasAlmacen)s.comprasAlmacen=[];
      s.comprasAlmacen.push({id:Date.now().toString(),fecha,articulo:it.nombre,categoria:it.categoria||'OTROS',cantidad:delta,precioUnitario:pu,proveedor:prov||'—',referencia:''});
      saveComprasAlmacen();
      log('COMPRA_ALMACEN',delta+'x '+it.nombre+' $'+pu+(prov?' de '+prov:''),'INVENTARIO');
    }
    modal.close();
    notify('Stock actualizado: '+anterior+' → '+it.cantidad+' '+(it.unidad||'pzs')+(delta>0&&pu>0?' · Costo registrado':''),'success');
    renderAlmacenGrid();
  });
}
function delItem(id){const it=getStore().inventario.find(i=>i.id===id);if(!it)return;if(!confirm('¿Eliminar "'+it.nombre+'"?'))return;getStore().inventario.splice(getStore().inventario.indexOf(it),1);saveInventario();log('DEL_ITEM',it.nombre);notify('Artículo eliminado','success');renderAlmacenGrid();}

function verHistorial(id){
  const it=getStore().inventario.find(i=>i.id===id);if(!it)return;
  const nombre=it.nombre;
  const auditLog=getStore().auditLog||[];
  const compras=(getStore().comprasAlmacen||[]).filter(c=>c.articulo===nombre).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  const movs=auditLog.filter(e=>e.det&&e.det.includes(nombre)&&(e.action||'').includes('STOCK')).slice().reverse();
  let h='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center"><span class="text-sec text-sm">Existencia actual</span><span style="font-size:22px;font-weight:800;color:var(--success)">'+it.cantidad+' <span style="font-size:13px;font-weight:400">'+(it.unidad||'pzs')+'</span></span></div>';
  if(compras.length){
    h+='<p class="text-xs text-muted mb-2"><strong>Compras registradas ('+compras.length+')</strong></p>';
    h+='<div class="table-wrap mb-4"><table class="dt"><thead><tr><th>Fecha</th><th style="text-align:right">Cant</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th><th>Proveedor</th></tr></thead><tbody>';
    compras.forEach(c=>{h+='<tr><td class="text-xs font-mono">'+fmtDate(c.fecha)+'</td><td style="text-align:right;font-weight:700;color:#059669">+'+c.cantidad+'</td><td style="text-align:right">'+fmtMoney(c.precioUnitario)+'</td><td style="text-align:right;font-weight:700">'+fmtMoney(c.cantidad*c.precioUnitario)+'</td><td class="text-xs">'+esc(c.proveedor||'—')+'</td></tr>';});
    h+='</tbody></table></div>';
  }
  if(movs.length){
    h+='<p class="text-xs text-muted mb-2"><strong>Movimientos de stock ('+movs.length+')</strong></p>';
    h+='<div style="max-height:160px;overflow-y:auto">';
    movs.forEach(m=>{const dt=m.ts?new Date(m.ts).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';h+='<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)"><span class="text-xs font-mono" style="color:var(--text-muted);white-space:nowrap">'+esc(dt)+'</span><span class="text-xs" style="flex:1">'+esc(m.det||'—')+'</span><span class="text-xs text-muted">'+esc(m.user||'—')+'</span></div>';});
    h+='</div>';
  }
  if(!compras.length&&!movs.length){h+='<p class="text-sm text-muted text-center" style="padding:20px">Sin historial de movimientos registrado</p>';}
  modal.open('Historial — '+esc(nombre),h,'<button class="btn btn-ghost" id="mCancel">Cerrar</button>','lg');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());
}
function openRecepcionModal(){
  let tipo='uniforme';
  let fotoData=null;
  function _getUser(){try{return JSON.parse(localStorage.getItem('_user')||'{}').name||'Operador';}catch{return'Operador';}}
  function buildForm(){
    let h='';
    // Selector de tipo
    h+='<div style="display:flex;gap:8px;margin-bottom:16px">';
    h+='<button id="rcpBtnUnif" class="btn '+(tipo==='uniforme'?'btn-primary':'btn-ghost')+'" style="flex:1"><i class="fas fa-tshirt mr-1"></i>Uniforme</button>';
    h+='<button id="rcpBtnAlm" class="btn '+(tipo==='almacen'?'btn-primary':'btn-ghost')+'" style="flex:1"><i class="fas fa-boxes mr-1"></i>Almacén General</button>';
    h+='</div>';
    // Sección uniformes
    h+='<div id="rcpUnifSection" style="display:'+(tipo==='uniforme'?'block':'none')+'">';
    h+='<div class="form-row c2 mb-3">';
    h+='<div class="form-group"><label class="form-label">Prenda *</label><select class="form-select" id="rcpPrenda">';
    h+=PRENDAS_UNIFORME.map(p=>'<option>'+esc(p)+'</option>').join('');
    h+='</select></div>';
    h+='<div class="form-group"><label class="form-label">Talla *</label><select class="form-select" id="rcpTalla"></select></div>';
    h+='</div></div>';
    // Sección almacén
    const items=getStore().inventario||[];
    h+='<div id="rcpAlmSection" style="display:'+(tipo==='almacen'?'block':'none')+'">';
    h+='<div class="form-group mb-3"><label class="form-label">Artículo *</label><select class="form-select" id="rcpArticulo">';
    h+='<option value="">-- Selecciona artículo --</option>';
    h+=items.map(i=>'<option value="'+i.id+'">'+esc(i.nombre)+'</option>').join('');
    h+='<option value="__nuevo__">＋ Artículo nuevo...</option>';
    h+='</select></div>';
    h+='<div id="rcpNuevoWrap" style="display:none">';
    h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Nombre del artículo nuevo *</label><input class="form-input" id="rcpNuevoNom" placeholder="Ej: Guantes de trabajo"></div>';
    h+='<div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="rcpCat"><option value="">Sin categoría</option>'+Object.entries(CATS).map(([k,v])=>'<option value="'+k+'">'+v.icon+' '+v.label+'</option>').join('')+'</select></div></div>';
    h+='<div class="form-row c2 mb-3"><div class="form-group"><label class="form-label">Unidad</label><select class="form-select" id="rcpUnidad"><option value="piezas">Piezas</option><option value="cajas">Cajas</option><option value="kg">Kg</option><option value="litros">Litros</option></select></div>';
    h+='<div class="form-group"><label class="form-label">Stock mínimo</label><input class="form-input" type="number" id="rcpMinStock" min="0" value="0"></div></div>';
    h+='</div></div>';
    // Campos comunes
    h+='<div class="form-row c3 mb-3">';
    h+='<div class="form-group"><label class="form-label">Cantidad *</label><input class="form-input" type="number" id="rcpCantidad" min="1" value="1"></div>';
    h+='<div class="form-group"><label class="form-label">Proveedor *</label><input class="form-input" id="rcpProv" placeholder="Nombre del proveedor"></div>';
    h+='<div class="form-group"><label class="form-label">No. Factura *</label><input class="form-input" id="rcpFactura" placeholder="FAC-2026-001"></div>';
    h+='</div>';
    h+='<div class="form-row c2 mb-3">';
    h+='<div class="form-group"><label class="form-label">Fecha *</label><input class="form-input" type="date" id="rcpFecha" value="'+today()+'"></div>';
    h+='<div class="form-group"><label class="form-label">Precio unitario (opcional)</label><input class="form-input" type="number" id="rcpPrecio" min="0" step="0.01" placeholder="0.00"></div>';
    h+='</div>';
    h+='<div class="form-group"><label class="form-label">Foto de factura o mercancía (opcional)</label>';
    if(fotoData){h+='<div id="rcpFotoBox"><img src="'+fotoData+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:6px"><button class="btn btn-sm btn-ghost" id="rcpFotoRm" style="color:#dc2626"><i class="fas fa-trash"></i> Quitar</button></div>';}
    else{h+='<div id="rcpFotoBox"><label style="display:block;border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;cursor:pointer;color:var(--text-muted)"><i class="fas fa-camera fa-lg"></i><p class="text-xs mt-1">Toca para tomar foto</p><input type="file" id="rcpFotoIn" accept="image/*" capture="environment" style="display:none"></label></div>';}
    h+='</div>';
    return h;
  }
  function updateTallas(){
    const prenda=document.getElementById('rcpPrenda')?.value||'';
    const opts=getTallasOpts(prenda)||['UNITALLA'];
    const sel=document.getElementById('rcpTalla');
    if(sel)sel.innerHTML=opts.map(t=>'<option>'+t+'</option>').join('');
  }
  function guardarRecepcion(){
    const prov=(document.getElementById('rcpProv')?.value||'').trim();
    const factura=(document.getElementById('rcpFactura')?.value||'').trim();
    const fecha=document.getElementById('rcpFecha')?.value||today();
    const cant=parseInt(document.getElementById('rcpCantidad')?.value||'0',10);
    const precio=parseFloat(document.getElementById('rcpPrecio')?.value||'0')||0;
    if(!prov){notify('El proveedor es obligatorio','warning');return;}
    if(!factura){notify('El número de factura es obligatorio','warning');return;}
    if(!fecha){notify('La fecha es obligatoria','warning');return;}
    if(cant<=0){notify('La cantidad debe ser mayor a cero','warning');return;}
    if(tipo==='uniforme'){
      const prenda=document.getElementById('rcpPrenda')?.value||'';
      const talla=document.getElementById('rcpTalla')?.value||'';
      if(!prenda||!talla){notify('Selecciona prenda y talla','warning');return;}
      const s=getStore();
      if(!s.stockUniformes)s.stockUniformes=[];
      s.stockUniformes.push({id:'rcpu_'+Date.now(),prenda,talla,cantidad:cant,costoUnit:precio,fecha,proveedor:prov,factura,foto:fotoData,observaciones:'',registradoPor:_getUser()});
      saveStockUniformes();
      log('RCP_UNIFORME',prenda+' T'+talla+' ×'+cant+' Fac:'+factura+' Prov:'+prov,'RECEPCIÓN');
      notify('Entrada registrada: '+prenda+' '+talla+' ×'+cant,'success');
      modal.close();
    } else {
      const artId=document.getElementById('rcpArticulo')?.value||'';
      if(!artId){notify('Selecciona un artículo','warning');return;}
      const s=getStore();
      if(artId==='__nuevo__'){
        const nom=(document.getElementById('rcpNuevoNom')?.value||'').trim();
        if(!nom){notify('Escribe el nombre del artículo','warning');return;}
        const cat=document.getElementById('rcpCat')?.value||'OTROS';
        const unidad=document.getElementById('rcpUnidad')?.value||'piezas';
        const minStock=parseInt(document.getElementById('rcpMinStock')?.value||'0',10);
        if(!s.inventario)s.inventario=[];
        s.inventario.push({id:'alm_'+Date.now(),nombre:nom,categoria:cat,cantidad:cant,unidad,minStock,descripcion:'',foto:fotoData,updatedAt:new Date().toISOString()});
        saveInventario();
        if(precio>0){if(!s.comprasAlmacen)s.comprasAlmacen=[];s.comprasAlmacen.push({id:'ca_'+Date.now(),fecha,articulo:nom,categoria:cat,cantidad:cant,precioUnitario:precio,proveedor:prov,referencia:factura});saveComprasAlmacen();}
        log('RCP_ALMACEN_NUEVO',nom+' ×'+cant+' Fac:'+factura+' Prov:'+prov,'RECEPCIÓN');
        notify('Artículo nuevo creado con '+cant+' unidades','success');
      } else {
        const item=s.inventario?.find(i=>i.id===artId);
        if(!item){notify('Artículo no encontrado','error');return;}
        const anterior=item.cantidad;
        item.cantidad=anterior+cant;
        item.updatedAt=new Date().toISOString();
        saveInventario();
        if(precio>0){if(!s.comprasAlmacen)s.comprasAlmacen=[];s.comprasAlmacen.push({id:'ca_'+Date.now(),fecha,articulo:item.nombre,categoria:item.categoria||'OTROS',cantidad:cant,precioUnitario:precio,proveedor:prov,referencia:factura});saveComprasAlmacen();}
        log('RCP_ALMACEN',item.nombre+' +'+cant+' ('+anterior+'→'+item.cantidad+') Fac:'+factura+' Prov:'+prov,'RECEPCIÓN');
        notify('Stock actualizado: '+anterior+' → '+item.cantidad+' '+(item.unidad||'pzs'),'success');
      }
      modal.close();
      renderAlmacenGrid();
    }
  }
  function attachModalEvents(){
    document.getElementById('rcpCancel')?.addEventListener('click',()=>modal.close());
    document.getElementById('rcpBtnUnif')?.addEventListener('click',()=>{tipo='uniforme';openModal();});
    document.getElementById('rcpBtnAlm')?.addEventListener('click',()=>{tipo='almacen';openModal();});
    document.getElementById('rcpPrenda')?.addEventListener('change',updateTallas);
    document.getElementById('rcpArticulo')?.addEventListener('change',function(){const w=document.getElementById('rcpNuevoWrap');if(w)w.style.display=this.value==='__nuevo__'?'block':'none';});
    document.getElementById('rcpFotoIn')?.addEventListener('change',function(){const f=this.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{fotoData=ev.target.result;const box=document.getElementById('rcpFotoBox');if(box){box.innerHTML='<img src="'+fotoData+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:6px"><button class="btn btn-sm btn-ghost" id="rcpFotoRm2" style="color:#dc2626"><i class="fas fa-trash"></i> Quitar</button>';document.getElementById('rcpFotoRm2')?.addEventListener('click',()=>{fotoData=null;const b=document.getElementById('rcpFotoBox');if(b)b.innerHTML='<label style="display:block;border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;cursor:pointer;color:var(--text-muted)"><i class="fas fa-camera fa-lg"></i><p class="text-xs mt-1">Toca para tomar foto</p><input type="file" id="rcpFotoIn" accept="image/*" capture="environment" style="display:none"></label>';document.getElementById('rcpFotoIn')?.addEventListener('change',function(){const r2=new FileReader();r2.onload=e2=>{fotoData=e2.target.result;const bx=document.getElementById('rcpFotoBox');if(bx)bx.innerHTML='<img src="'+fotoData+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">';};r2.readAsDataURL(this.files[0]);});}); }};r.readAsDataURL(f);});
    document.getElementById('rcpFotoRm')?.addEventListener('click',()=>{fotoData=null;const b=document.getElementById('rcpFotoBox');if(b)b.innerHTML='<label style="display:block;border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;cursor:pointer;color:var(--text-muted)"><i class="fas fa-camera fa-lg"></i><p class="text-xs mt-1">Toca para tomar foto</p><input type="file" id="rcpFotoIn" accept="image/*" capture="environment" style="display:none"></label>';document.getElementById('rcpFotoIn')?.addEventListener('change',function(){const r2=new FileReader();r2.onload=e2=>{fotoData=e2.target.result;const bx=document.getElementById('rcpFotoBox');if(bx)bx.innerHTML='<img src="'+fotoData+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">';};r2.readAsDataURL(this.files[0]);});});
    document.getElementById('rcpGuardar')?.addEventListener('click',guardarRecepcion);
  }
  function openModal(){
    modal.open('Recibir Mercancía',buildForm(),'<button class="btn btn-ghost" id="rcpCancel">Cancelar</button><button class="btn btn-primary" id="rcpGuardar"><i class="fas fa-check mr-1"></i>Registrar Entrada</button>','lg');
    attachModalEvents();
    if(tipo==='uniforme')updateTallas();
  }
  openModal();
}
function openSalidaAlmacenModal(){
  const items=(getStore().inventario||[]).filter(i=>i.cantidad>0);
  if(!items.length){
    modal.open('Registrar Salida','<div class="empty-state"><i class="fas fa-boxes"></i><p>No hay artículos con stock disponible</p><p class="text-sm text-muted">Registra entradas primero</p></div>','<button class="btn btn-ghost" id="slClose">Cerrar</button>');
    document.getElementById('slClose')?.addEventListener('click',()=>modal.close());
    return;
  }
  let h='';
  h+='<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#f87171"><i class="fas fa-exclamation-triangle mr-1"></i>Una salida descuenta el stock permanentemente. Solo para mermas, daños o ajustes autorizados.</div>';
  h+='<div class="form-group mb-3"><label class="form-label">Artículo *</label><select class="form-select" id="slArt"><option value="">-- Selecciona artículo --</option>';
  h+=items.map(i=>'<option value="'+i.id+'" data-cant="'+i.cantidad+'" data-uni="'+esc(i.unidad||'pzs')+'">'+esc(i.nombre)+' — '+i.cantidad+' '+esc(i.unidad||'pzs')+'</option>').join('');
  h+='</select></div>';
  h+='<div id="slStockBox" style="display:none;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;justify-content:space-between;align-items:center"><span class="text-sec text-sm">Stock actual</span><span id="slStockVal" style="font-size:20px;font-weight:800;color:var(--success)">—</span></div>';
  h+='<div class="form-row c2 mb-3">';
  h+='<div class="form-group"><label class="form-label">Cantidad a retirar *</label><div class="flex gap-2"><button class="btn btn-ghost" id="slMinus" style="min-width:44px;font-size:20px">−</button><input class="form-input" type="number" id="slCant" min="1" value="1" style="text-align:center;font-size:20px;font-weight:700;flex:1"><button class="btn btn-ghost" id="slPlus" style="min-width:44px;font-size:20px">+</button></div></div>';
  h+='<div class="form-group"><label class="form-label">Fecha *</label><input class="form-input" type="date" id="slFecha" value="'+today()+'"></div>';
  h+='</div>';
  h+='<div class="form-row c2 mb-3">';
  h+='<div class="form-group"><label class="form-label">Motivo *</label><select class="form-select" id="slMotivo"><option>Merma</option><option>Daño</option><option>Devolución</option><option>Ajuste de inventario</option><option>Uso interno</option><option>Otro</option></select></div>';
  h+='<div class="form-group"><label class="form-label">Observaciones</label><input class="form-input" id="slObs" placeholder="Detalle adicional..."></div>';
  h+='</div>';
  modal.open('Registrar Salida de Almacén',h,'<button class="btn btn-ghost" id="slCancel">Cancelar</button><button class="btn btn-danger" id="slGuardar"><i class="fas fa-sign-out-alt mr-1"></i>Registrar Salida</button>','md');
  document.getElementById('slCancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('slArt')?.addEventListener('change',function(){
    const opt=this.options[this.selectedIndex];
    const box=document.getElementById('slStockBox');
    const val=document.getElementById('slStockVal');
    if(this.value&&opt.value){
      if(box)box.style.display='flex';
      const cant=parseInt(opt.dataset.cant||'0',10);
      const uni=opt.dataset.uni||'pzs';
      if(val)val.textContent=cant+' '+uni;
      const cantIn=document.getElementById('slCant');
      if(cantIn){cantIn.max=cant;cantIn.value=Math.min(parseInt(cantIn.value||'1',10),cant);}
    }else{if(box)box.style.display='none';}
  });
  document.getElementById('slMinus')?.addEventListener('click',()=>{const q=document.getElementById('slCant');if(q)q.value=Math.max(1,parseInt(q.value||'1',10)-1);});
  document.getElementById('slPlus')?.addEventListener('click',()=>{const q=document.getElementById('slCant');const art=document.getElementById('slArt');const opt=art?.options[art.selectedIndex];const mx=opt?parseInt(opt.dataset.cant||'0',10):9999;if(q)q.value=Math.min(mx,parseInt(q.value||'1',10)+1);});
  document.getElementById('slGuardar')?.addEventListener('click',()=>{
    const artId=document.getElementById('slArt')?.value||'';
    const cant=parseInt(document.getElementById('slCant')?.value||'0',10);
    const fecha=document.getElementById('slFecha')?.value||today();
    const motivo=document.getElementById('slMotivo')?.value||'Merma';
    const obs=document.getElementById('slObs')?.value||'';
    if(!artId){notify('Selecciona un artículo','warning');return;}
    if(cant<=0){notify('La cantidad debe ser mayor a cero','warning');return;}
    const s=getStore();
    const item=s.inventario?.find(i=>i.id===artId);
    if(!item){notify('Artículo no encontrado','error');return;}
    if(cant>item.cantidad){notify('Stock insuficiente. Disponible: '+item.cantidad+' '+(item.unidad||'pzs'),'error');return;}
    const anterior=item.cantidad;
    item.cantidad=anterior-cant;
    item.updatedAt=new Date().toISOString();
    saveInventario();
    if(!s.salidas)s.salidas=[];
    s.salidas.push({id:'sal_alm_'+Date.now(),tipo:'almacen',articuloId:artId,articuloNombre:item.nombre,prenda:item.nombre,talla:'—',cantidad:cant,fecha,motivo,observaciones:obs,stockAnterior:anterior,stockNuevo:item.cantidad});
    saveSalidas();
    log('SALIDA_ALMACEN',item.nombre+' −'+cant+' ('+anterior+'→'+item.cantidad+') '+motivo,'SALIDAS');
    modal.close();
    notify('Salida registrada: '+item.nombre+' −'+cant+' '+(item.unidad||'pzs')+' (quedan '+item.cantidad+')','success');
    renderAlmacenGrid();
  });
}
function attachAlmacenEvents(){const isOp=getUserRole()==='operador';if(!isOp){document.getElementById('invNewBtn')?.addEventListener('click',()=>openItemModal(null));}else{const nb=document.getElementById('invNewBtn');if(nb)nb.style.display='none';}['almCat'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderAlmacenGrid));document.getElementById('almSearch')?.addEventListener('input',renderAlmacenGrid);document.getElementById('almClear')?.addEventListener('click',()=>{document.getElementById('almCat').value='';document.getElementById('almSearch').value='';renderAlmacenGrid();});document.getElementById('almGrid')?.addEventListener('click',e=>{const ed=e.target.closest('.alm-edit');const st=e.target.closest('.alm-stock');const dl=e.target.closest('.alm-del');const hs=e.target.closest('.alm-hist');if(hs)verHistorial(hs.dataset.id);if(ed)openItemModal(ed.dataset.id);if(st)addStock(st.dataset.id);if(dl){if(getUserRole()==='operador'){notify('Se requiere autorización del administrador','warning');return;}delItem(dl.dataset.id);}});}
function attachTabEvents(){document.querySelectorAll('.tab-btn').forEach(btn=>{btn.addEventListener('click',function(){currentTab=this.dataset.tab;document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');if(currentTab==='uniformes')renderUniformes();else renderAlmacen();});});}
export function init(){
  attachTabEvents();
  if(currentTab==='uniformes')renderUniformes();else renderAlmacen();
  // Botón Recibir Mercancía: solo visible para operador
  const isOp=getUserRole()==='operador';
  const recBtn=document.getElementById('recepcionBtn');
  if(recBtn){
    if(isOp){recBtn.style.display='';recBtn.addEventListener('click',()=>openRecepcionModal());}
    else{recBtn.style.display='none';}
  }
  const salBtn=document.getElementById('salidaAlmBtn');
  if(salBtn){
    if(isOp){salBtn.style.display='';salBtn.addEventListener('click',()=>openSalidaAlmacenModal());}
    else{salBtn.style.display='none';}
  }
}

/**
 * STOCK DE UNIFORMES
 * Inventario físico real de uniformes por prenda y talla.
 * Separado del cálculo de requerimientos (calcTotalesDetallados).
 * Permite registrar entradas (compras) y ver diferencia vs requerido.
 */
import{getStore,saveStockUniformes,log}from'./storage.js';import{esc,fmtDate,fmtMoney,fmt,sortTallas,getTallasOpts}from'./utils.js';import{notify,modal,confirm}from'./ui.js';import{getUserRole}from'./user-roles.js';import{calcTotalesDetallados}from'./rules.js';import{CATEGORIAS}from'./config.js';

const PRENDAS=['PLAYERA POLO TIPO A','PLAYERA POLO TIPO B','CAMISOLA','PLAYERA PANTS','PANTS','PANTALON','BOTA','CHOCLO','ZAPATO ESPECIAL','TENIS','SANDALIAS','CHALECO','CHAMARRA','GORRA','TOALLA','TERMO','SOMBRILLA'];

// ─── Helpers de datos ────────────────────────────────────────────────────────
function getStock(){
  const s=getStore();
  if(!s.stockUniformes)s.stockUniformes=[];
  return s.stockUniformes;
}

// Suma entradas de stockUniformes por prenda/talla
function calcStockFisico(){
  const fisico={};
  getStock().forEach(mov=>{
    if(!fisico[mov.prenda])fisico[mov.prenda]={};
    if(!fisico[mov.prenda][mov.talla])fisico[mov.prenda][mov.talla]=0;
    fisico[mov.prenda][mov.talla]+=mov.cantidad||0;
  });
  return fisico;
}

// Calcula diff: requerido - fisico (negativo = falta, 0 = ok, positivo = sobra)
function calcDiff(requerido,fisico,prenda,talla){
  const req=(requerido[prenda]||{})[talla]||0;
  const dis=(fisico[prenda]||{})[talla]||0;
  return{req,dis,diff:dis-req};
}

// ─── Render ──────────────────────────────────────────────────────────────────
export function render(){
  const isOp=getUserRole()==='operador';
  const requerido=calcTotalesDetallados();
  const fisico=calcStockFisico();
  const stock=getStock();

  // KPIs
  let totalReq=0,totalDis=0,prendasFalta=0,prendasOk=0;
  Object.entries(requerido).forEach(([prenda,tallas])=>{
    Object.entries(tallas).forEach(([talla,obj])=>{
      const req=obj.total||0;
      const dis=(fisico[prenda]||{})[talla]||0;
      totalReq+=req;totalDis+=dis;
      if(dis>=req)prendasOk++;else prendasFalta++;
    });
  });
  const pctCobert=totalReq>0?Math.min(100,Math.round(totalDis/totalReq*100)):0;
  const pctColor=pctCobert>=90?'#059669':pctCobert>=70?'#d97706':'#dc2626';

  let h='<div class="page-head"><div class="page-title"><h1>Stock de Uniformes</h1><p>Inventario físico vs requerimiento por empleados</p></div>';
  if(!isOp)h+='<button class="btn btn-primary" id="btnEntradaUnif"><i class="fas fa-plus mr-2"></i>Registrar Entrada</button>';
  h+='</div>';

  h+='<div class="kpi-grid">';
  h+=`<div class="kpi" style="border-top:3px solid ${pctColor}"><div class="kpi-label">Cobertura</div><div class="kpi-value" style="color:${pctColor}">${pctCobert}%</div><div class="kpi-sub">del requerimiento cubierto</div></div>`;
  h+=`<div class="kpi info"><div class="kpi-label">Disponible</div><div class="kpi-value">${fmt(totalDis)}</div><div class="kpi-sub">piezas en stock</div></div>`;
  h+=`<div class="kpi warning"><div class="kpi-label">Requerido</div><div class="kpi-value">${fmt(totalReq)}</div><div class="kpi-sub">piezas necesarias</div></div>`;
  h+=`<div class="kpi ${prendasFalta>0?'danger':'success'}"><div class="kpi-label">${prendasFalta>0?'Combinaciones faltantes':'Todo cubierto'}</div><div class="kpi-value">${prendasFalta>0?prendasFalta:prendasOk}</div><div class="kpi-sub">${prendasFalta>0?'prenda/talla sin cubrir':'combinaciones con stock'}</div></div>`;
  h+='</div>';

  // Alerta de faltantes
  if(prendasFalta>0){
    h+='<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px"><i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:18px"></i><span style="font-size:13px;color:#991b1b"><strong>'+prendasFalta+' combinaciones</strong> de prenda/talla con stock insuficiente. Registra entradas para cubrir el requerimiento.</span></div>';
  }

  // Tabs
  h+='<div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:0">';
  h+='<button class="su-tab active" data-tab="resumen" style="padding:8px 18px;border:none;background:none;font-weight:700;font-size:13px;cursor:pointer;border-bottom:3px solid var(--primary);margin-bottom:-2px;color:var(--primary)">Resumen por Prenda</button>';
  h+='<button class="su-tab" data-tab="movimientos" style="padding:8px 18px;border:none;background:none;font-weight:600;font-size:13px;cursor:pointer;color:var(--text-muted)">Historial Entradas</button>';
  h+='</div>';

  h+='<div id="suTabContent">';
  h+=renderResumen(requerido,fisico);
  h+='</div>';

  return h;
}

function renderResumen(requerido,fisico){
  if(!Object.keys(requerido).length){
    return'<div class="card"><div class="card-body"><div class="empty-state"><i class="fas fa-tshirt"></i><p>Sin datos de requerimiento</p><p class="text-sm text-muted">Captura las tallas de los empleados para ver el requerimiento</p></div></div></div>';
  }
  let h='';
  const byCateg={};
  Object.entries(requerido).forEach(([prenda,tallas])=>{
    const cat=CATEGORIAS[prenda]||'OTROS';
    if(!byCateg[cat])byCateg[cat]=[];
    byCateg[cat].push({prenda,tallas});
  });
  Object.entries(byCateg).forEach(([cat,items])=>{
    h+=`<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-layer-group mr-2" style="color:#004B87"></i>${cat}</h3></div><div class="card-body" style="padding:0">`;
    items.forEach(({prenda,tallas})=>{
      const totalReq=Object.values(tallas).reduce((t,o)=>t+o.total,0);
      const totalDis=Object.values(tallas).reduce((t,o)=>t+(fisico[prenda]?.[o.talla||Object.keys(o)[0]]||0),0);
      // Compute correctly
      const allTallas=Object.keys(tallas);
      const totDis=allTallas.reduce((t,talla)=>t+((fisico[prenda]||{})[talla]||0),0);
      const totReq=allTallas.reduce((t,talla)=>t+(tallas[talla]?.total||0),0);
      const pct=totReq>0?Math.min(100,Math.round(totDis/totReq*100)):100;
      const barColor=pct>=90?'#059669':pct>=70?'#d97706':'#dc2626';
      h+=`<div style="border-bottom:1px solid var(--border);padding:12px 16px">`;
      h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">`;
      h+=`<span style="font-weight:700;font-size:13px">${esc(prenda)}</span>`;
      h+=`<div style="display:flex;align-items:center;gap:10px">`;
      h+=`<span class="text-xs text-muted">Req: <strong>${fmt(totReq)}</strong> / Dis: <strong style="color:${barColor}">${fmt(totDis)}</strong></span>`;
      h+=`<div style="width:80px;height:6px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:999px"></div></div>`;
      h+=`<span style="font-size:11px;font-weight:800;color:${barColor}">${pct}%</span>`;
      h+='</div></div>';
      // Tallas grid
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px">';
      sortTallas(prenda,Object.entries(tallas)).forEach(([talla,obj])=>{
        const req=obj.total||0;
        const dis=(fisico[prenda]||{})[talla]||0;
        const diff=dis-req;
        const col=diff>=0?'#059669':diff>=-3?'#d97706':'#dc2626';
        const bg=diff>=0?'#f0fdf4':diff>=-3?'#fffbeb':'#fef2f2';
        h+=`<div style="background:${bg};border:1px solid ${col}30;border-radius:8px;padding:8px 12px;text-align:center;min-width:70px">`;
        h+=`<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:2px">${esc(talla==='UNITALLA'?'Sin talla':talla)}</div>`;
        h+=`<div style="font-size:18px;font-weight:800;color:${col}">${dis}</div>`;
        h+=`<div style="font-size:10px;color:var(--text-muted)">/ ${req} req</div>`;
        if(diff!==0)h+=`<div style="font-size:10px;font-weight:700;color:${col}">${diff>0?'+':''}${diff}</div>`;
        h+='</div>';
      });
      h+='</div></div>';
    });
    h+='</div></div>';
  });
  return h;
}

function renderMovimientos(){
  const stock=getStock();
  if(!stock.length){
    return'<div class="card"><div class="card-body"><div class="empty-state"><i class="fas fa-box-open"></i><p>Sin entradas registradas</p><p class="text-sm text-muted">Registra entradas de uniformes al stock físico</p></div></div></div>';
  }
  let h='<div class="card"><div class="card-head"><h3>Historial de Entradas</h3><span class="text-sm text-muted">'+stock.length+' registros</span></div><div class="table-wrap"><table class="dt"><thead><tr><th>Fecha</th><th>Prenda</th><th>Talla</th><th style="text-align:center">Cantidad</th><th>Proveedor / Ref</th><th>Costo Unit.</th><th>Registrado por</th></tr></thead><tbody>';
  stock.slice().reverse().forEach(mov=>{
    h+=`<tr><td class="text-xs font-mono">${fmtDate(mov.fecha)}</td><td class="font-bold">${esc(mov.prenda)}</td><td><span class="badge badge-info">${esc(mov.talla)}</span></td><td style="text-align:center;font-weight:700;color:var(--primary)">${fmt(mov.cantidad)}</td><td class="text-sm">${esc(mov.proveedor||'—')}</td><td class="text-sm">${mov.costoUnit?fmtMoney(mov.costoUnit):'—'}</td><td class="text-xs text-muted">${esc(mov.registradoPor||'—')}</td></tr>`;
  });
  h+='</tbody></table></div></div>';
  return h;
}

// ─── Events ──────────────────────────────────────────────────────────────────
export function init(){
  const isOp=getUserRole()==='operador';

  // Tab switching
  document.querySelectorAll('.su-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.su-tab').forEach(b=>{
        b.style.borderBottomColor='transparent';b.style.color='var(--text-muted)';b.style.fontWeight='600';b.classList.remove('active');
      });
      btn.style.borderBottomColor='var(--primary)';btn.style.color='var(--primary)';btn.style.fontWeight='700';btn.classList.add('active');
      const tab=btn.dataset.tab;
      const content=document.getElementById('suTabContent');
      if(!content)return;
      if(tab==='resumen'){const req=calcTotalesDetallados();const fis=calcStockFisico();content.innerHTML=renderResumen(req,fis);}
      else if(tab==='movimientos'){content.innerHTML=renderMovimientos();}
    });
  });

  if(!isOp){
    document.getElementById('btnEntradaUnif')?.addEventListener('click',()=>openEntradaModal());
  }
}

function openEntradaModal(){
  const {today:td}=(() => ({today:new Date().toISOString().split('T')[0]}))();
  let h=`<div class="form-row c2">
    <div class="form-group"><label class="form-label">Prenda *</label><select class="form-select" id="suPrenda">
      ${PRENDAS.map(p=>'<option>'+esc(p)+'</option>').join('')}
    </select></div>
    <div class="form-group"><label class="form-label">Talla *</label><select class="form-select" id="suTalla"></select></div>
  </div>
  <div class="form-row c3">
    <div class="form-group"><label class="form-label">Cantidad *</label><input type="number" class="form-input" id="suCant" min="1" value="1"></div>
    <div class="form-group"><label class="form-label">Costo unitario</label><input type="number" class="form-input" id="suCosto" min="0" placeholder="0.00" step="0.01"></div>
    <div class="form-group"><label class="form-label">Fecha</label><input type="date" class="form-input" id="suFecha" value="${new Date().toISOString().split('T')[0]}"></div>
  </div>
  <div class="form-row c2">
    <div class="form-group"><label class="form-label">Proveedor / Referencia</label><input class="form-input" id="suProv" placeholder="Nombre del proveedor o referencia..."></div>
    <div class="form-group"><label class="form-label">Número de factura</label><input class="form-input" id="suFactura" placeholder="Opcional..."></div>
  </div>
  <div class="form-group"><label class="form-label">Observaciones</label><textarea class="form-input" id="suObs" rows="2" placeholder="Notas opcionales..."></textarea></div>`;

  modal.open('Registrar Entrada de Uniformes',h,'<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveUnif"><i class="fas fa-check mr-1"></i>Registrar</button>','lg');
  document.getElementById('mCancel')?.addEventListener('click',()=>modal.close());

  // Dynamic talla options
  const prendaSel=document.getElementById('suPrenda');
  const tallaSel=document.getElementById('suTalla');
  function updateTallas(){
    const p=prendaSel.value;
    const opts=getTallasOpts(p)||['UNITALLA'];
    tallaSel.innerHTML=opts.map(t=>'<option>'+t+'</option>').join('');
  }
  updateTallas();
  prendaSel.addEventListener('change',updateTallas);

  document.getElementById('mSaveUnif')?.addEventListener('click',()=>{
    const prenda=prendaSel.value;
    const talla=tallaSel.value;
    const cant=parseInt(document.getElementById('suCant')?.value,10)||0;
    if(!prenda){notify('Selecciona una prenda','warning');return;}
    if(!talla){notify('Selecciona una talla','warning');return;}
    if(cant<=0){notify('La cantidad debe ser mayor a cero','warning');return;}
    const mov={
      id:'su_'+Date.now(),
      prenda,talla,cantidad:cant,
      costoUnit:parseFloat(document.getElementById('suCosto')?.value)||0,
      fecha:document.getElementById('suFecha')?.value||new Date().toISOString().split('T')[0],
      proveedor:document.getElementById('suProv')?.value||'',
      factura:document.getElementById('suFactura')?.value||'',
      observaciones:document.getElementById('suObs')?.value||'',
      registradoPor:(() => {try{return JSON.parse(localStorage.getItem('_user')||'{}').name||'Sistema';}catch{return'Sistema';}})(),
    };
    const s=getStore();
    if(!s.stockUniformes)s.stockUniformes=[];
    s.stockUniformes.push(mov);
    saveStockUniformes();
    log('STOCK_UNIF_ENTRADA',`${prenda} T${talla} ×${cant}`,'STOCK UNIFORMES');
    notify('Entrada registrada','success');
    modal.close();
    document.getElementById('mainContent').innerHTML=render();
    init();
  });
}

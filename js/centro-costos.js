import{getStore}from'./storage.js';import{getAreaNames}from'./areas-config.js';import{esc,fmt,fmtMoney,fmtDate}from'./utils.js';import{createChart}from'./ui.js';import{getMovimientos,getProductos}from'./almacen-api.js';
let currentYear=new Date().getFullYear().toString();

// ── Data helpers ─────────────────────────────────────────────────────────────
function getGastos(){
  const s=getStore();const g=[];
  s.proveedores.forEach(p=>{g.push({id:p.id,fecha:p.fecha||'',tipo:'UNIFORME',descripcion:p.prenda+(p.talla?' T:'+p.talla:''),cantidad:p.cantidad||0,precioUnitario:p.precioUnitario||0,total:(p.cantidad||0)*(p.precioUnitario||0),proveedor:p.proveedor||'—',referencia:p.referencia||'',categoria:'Uniformes'});});
  (s.comprasAlmacen||[]).forEach(c=>{g.push({id:c.id,fecha:c.fecha||'',tipo:'ALMACEN',descripcion:c.articulo||'',cantidad:c.cantidad||0,precioUnitario:c.precioUnitario||0,total:(c.cantidad||0)*(c.precioUnitario||0),proveedor:c.proveedor||'—',referencia:c.referencia||'',categoria:c.categoria||'Almacén'});});
  return g.sort((a,b)=>b.fecha.localeCompare(a.fecha));
}
function byYear(g,y){return y==='todos'?g:g.filter(x=>(x.fecha||'').startsWith(y));}
function years(g){const s=new Set(g.map(x=>(x.fecha||'').slice(0,4)).filter(Boolean));return[...s].sort().reverse();}
function getPrecioProveedor(prenda,talla){
  const prov=getStore().proveedores.find(p=>p.prenda===prenda&&p.talla===talla);
  return prov?(parseFloat(prov.precioUnitario)||0):0;
}
function calcCostosPorEmpleado(){
  const costos={};
  getStore().employees.forEach(emp=>{
    let total=0;
    Object.entries(emp.tallas||{}).forEach(([prenda,talla])=>{total+=getPrecioProveedor(prenda,talla);});
    costos[emp.id]={empleadoId:emp.id,nombre:emp.nombre,area:emp.area,totalPrendas:Object.keys(emp.tallas||{}).length,costoPrendas:total,estado:'calculado'};
  });
  return costos;
}
function calcCostoAcumulado(){
  return Object.values(calcCostosPorEmpleado()).reduce((sum,item)=>sum+item.costoPrendas,0);
}
function calcGastoTotal(){
  return getStore().proveedores.reduce((sum,prov)=>{
    const cantidad=parseInt(prov.cantidad,10)||0;
    const precio=parseFloat(prov.precioUnitario)||0;
    return sum+(cantidad*precio);
  },0);
}
function generateCostosReport(){
  const porEmpleado=calcCostosPorEmpleado();
  const costoAcumulado=calcCostoAcumulado();
  const gastoTotal=calcGastoTotal();
  const empleados=Object.keys(porEmpleado).length;
  const prendasTotales=Object.values(porEmpleado).reduce((sum,e)=>sum+e.totalPrendas,0);
  return{timestamp:new Date().toISOString(),porEmpleado,costoAcumulado,gastoTotal,diferencia:gastoTotal-costoAcumulado,resumen:{empleados,prendasTotales,costoPromedioPorEmpleado:empleados?costoAcumulado/empleados:0}};
}
function buildCostosBaseSection(report){
  const rows=Object.values(report.porEmpleado).sort((a,b)=>b.costoPrendas-a.costoPrendas).slice(0,8);
  return '<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-calculator mr-2" style="color:#059669"></i>Base de Calculo de Costos</h3><button class="btn btn-ghost btn-sm" id="ccExportCostos"><i class="fas fa-file-csv"></i> Exportar CSV</button></div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;padding:0 16px 12px">'
    +'<div class="kpi"><div class="kpi-label">Costo acumulado prendas</div><div class="kpi-value" style="font-size:18px;color:#059669">'+fmtMoney(report.costoAcumulado)+'</div></div>'
    +'<div class="kpi"><div class="kpi-label">Gasto proveedores</div><div class="kpi-value" style="font-size:18px;color:#004B87">'+fmtMoney(report.gastoTotal)+'</div></div>'
    +'<div class="kpi"><div class="kpi-label">Diferencia</div><div class="kpi-value" style="font-size:18px;color:'+(report.diferencia>=0?'#d97706':'#059669')+'">'+fmtMoney(report.diferencia)+'</div></div>'
    +'<div class="kpi"><div class="kpi-label">Promedio empleado</div><div class="kpi-value" style="font-size:18px;color:#7c3aed">'+fmtMoney(report.resumen.costoPromedioPorEmpleado)+'</div></div>'
    +'</div><div class="table-wrap"><table class="dt"><thead><tr><th>Empleado</th><th>Area</th><th style="text-align:center">Prendas</th><th style="text-align:right">Costo</th></tr></thead><tbody>'
    +(rows.length?rows.map(r=>'<tr><td class="font-bold">'+esc(r.nombre||r.empleadoId)+'</td><td>'+esc(r.area||'—')+'</td><td style="text-align:center">'+fmt(r.totalPrendas)+'</td><td style="text-align:right;font-weight:700;color:var(--success)">'+fmtMoney(r.costoPrendas)+'</td></tr>').join(''):'<tr><td colspan="4" class="empty-state"><i class="fas fa-calculator"></i><p>Sin costos calculados</p></td></tr>')
    +'</tbody></table></div></div>';
}
function exportCostosCSV(){
  const report=generateCostosReport();
  const rows=[['REPORTE DE COSTOS'],['Fecha',report.timestamp],[],['POR EMPLEADO'],['Empleado ID','Nombre','Area','Prendas','Costo Prendas']];
  Object.values(report.porEmpleado).forEach(item=>rows.push([item.empleadoId,item.nombre,item.area,item.totalPrendas,item.costoPrendas.toFixed(2)]));
  rows.push([],['RESUMEN'],['Concepto','Valor'],['Total Empleados',report.resumen.empleados],['Total Prendas',report.resumen.prendasTotales],['Costo Acumulado Prendas',report.costoAcumulado.toFixed(2)],['Gasto Total Proveedores',report.gastoTotal.toFixed(2)],['Diferencia',report.diferencia.toFixed(2)],['Costo Promedio Empleado',report.resumen.costoPromedioPorEmpleado.toFixed(2)]);
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='reporte-costos.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Render ───────────────────────────────────────────────────────────────────
function legacyRender(){
  const all=getGastos();const yrs=years(all);
  if(yrs.length&&!yrs.includes(currentYear))currentYear=yrs[0];
  const g=byYear(all,currentYear);
  const s=getStore();
  const activos=s.employees.filter(e=>e.estado==='activo');
  const totalActivos=activos.length;

  // KPI base
  const totU=g.filter(x=>x.tipo==='UNIFORME').reduce((t,x)=>t+x.total,0);
  const totA=g.filter(x=>x.tipo==='ALMACEN').reduce((t,x)=>t+x.total,0);
  const totG=totU+totA;
  const invEmp=totalActivos>0?totG/totalActivos:0;
  const pzasCompradas=g.reduce((t,x)=>t+x.cantidad,0);
  const pzasEntregadas=(s.entregas||[]).filter(e=>currentYear==='todos'||(e.fecha||'').startsWith(currentYear)).reduce((t,e)=>t+(e.prendas||[]).length,0);
  const provMap={};g.forEach(x=>{if(x.proveedor&&x.proveedor!=='—')provMap[x.proveedor]=(provMap[x.proveedor]||0)+x.total;});
  const topProv=Object.entries(provMap).sort((a,b)=>b[1]-a[1])[0];
  const yearOpts=[...new Set([...(yrs.length?yrs:[]),'todos',new Date().getFullYear().toString()])].sort().reverse();

  let h='';
  h+='<div class="page-head"><div class="page-title"><h1>Control Financiero</h1><p>Análisis de inversión · Métricas por área · Comparativas</p></div>';
  h+='<select class="form-select" id="ccYear" style="width:auto;min-width:120px"><option value="todos">Todos los años</option>'+yearOpts.filter(y=>y!=='todos').map(y=>'<option value="'+y+'"'+(y===currentYear?' selected':'')+'>'+y+'</option>').join('')+'</select>';
  h+='</div>';

  // ── KPIs principales ──────────────────────────────────────────────────────
  h+='<div class="kpi-grid">';
  h+='<div class="kpi" style="border-top:3px solid #059669"><div class="kpi-label"><i class="fas fa-chart-line mr-1" style="color:#059669"></i>Inversión Total</div><div class="kpi-value" style="color:#059669;font-size:'+(totG>=1000000?'16px':'20px')+'">'+fmtMoney(totG)+'</div><div class="kpi-sub">'+(currentYear==='todos'?'Historial completo':currentYear)+'</div></div>';
  h+='<div class="kpi" style="border-top:3px solid #004B87"><div class="kpi-label"><i class="fas fa-tshirt mr-1" style="color:#004B87"></i>Uniformes</div><div class="kpi-value" style="color:#004B87;font-size:20px">'+fmtMoney(totU)+'</div><div class="kpi-sub">'+(totG>0?Math.round(totU/totG*100):0)+'% del total</div></div>';
  h+='<div class="kpi" style="border-top:3px solid #7c3aed"><div class="kpi-label"><i class="fas fa-boxes mr-1" style="color:#7c3aed"></i>Almacén / Otros</div><div class="kpi-value" style="color:#7c3aed;font-size:20px">'+fmtMoney(totA)+'</div><div class="kpi-sub">'+(totG>0?Math.round(totA/totG*100):0)+'% del total</div></div>';
  h+='<div class="kpi" style="border-top:3px solid #d97706"><div class="kpi-label"><i class="fas fa-user-circle mr-1" style="color:#d97706"></i>Inversión / Empleado</div><div class="kpi-value" style="color:#d97706;font-size:18px">'+fmtMoney(invEmp)+'</div><div class="kpi-sub">'+totalActivos+' empleados activos</div></div>';
  h+='<div class="kpi" style="border-top:3px solid #0891b2"><div class="kpi-label"><i class="fas fa-cubes mr-1" style="color:#0891b2"></i>Piezas Compradas</div><div class="kpi-value" style="color:#0891b2">'+fmt(pzasCompradas)+'</div><div class="kpi-sub">'+fmtMoney(pzasCompradas>0?totG/pzasCompradas:0)+' promedio/pza</div></div>';
  h+='<div class="kpi" style="border-top:3px solid #475569"><div class="kpi-label"><i class="fas fa-hand-holding mr-1" style="color:#475569"></i>Piezas Entregadas</div><div class="kpi-value" style="color:#475569">'+fmt(pzasEntregadas)+'</div><div class="kpi-sub">'+(s.entregas||[]).filter(e=>currentYear==='todos'||(e.fecha||'').startsWith(currentYear)).length+' entregas realizadas</div></div>';
  if(topProv)h+='<div class="kpi" style="border-top:3px solid #dc2626"><div class="kpi-label"><i class="fas fa-star mr-1" style="color:#dc2626"></i>Proveedor Principal</div><div class="kpi-value" style="font-size:12px;line-height:1.3;font-weight:700">'+esc(topProv[0])+'</div><div class="kpi-sub">'+fmtMoney(topProv[1])+'</div></div>';
  h+='</div>';

  h+=buildCostosBaseSection(generateCostosReport());

  // ── Comparativo Anual ─────────────────────────────────────────────────────
  if(yrs.length>=2){
    h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-exchange-alt mr-2" style="color:#059669"></i>Comparativo Anual</h3><span class="text-xs text-muted">Evolución de la inversión año a año</span></div>';
    h+='<div style="padding:8px 16px 16px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:16px">';
    yrs.forEach((yr,i)=>{
      const gYr=byYear(all,yr);const totYr=gYr.reduce((t,x)=>t+x.total,0);
      const pctU=totYr>0?Math.round(gYr.filter(x=>x.tipo==='UNIFORME').reduce((t,x)=>t+x.total,0)/totYr*100):0;
      const prev=yrs[i+1];let delta=null;
      if(prev){const gPrev=byYear(all,prev);const totPrev=gPrev.reduce((t,x)=>t+x.total,0);if(totPrev>0)delta=Math.round((totYr-totPrev)/totPrev*100);}
      const isActive=yr===currentYear;
      h+='<div style="background:'+(isActive?'var(--surface-2)':'var(--surface)')+';border:2px solid '+(isActive?'#059669':'var(--border)')+';border-radius:var(--radius);padding:14px">';
      h+='<p style="font-size:12px;color:var(--text-muted);margin:0">'+yr+'</p>';
      h+='<p style="font-size:20px;font-weight:800;color:'+(isActive?'#059669':'var(--text)')+';margin:4px 0">'+fmtMoney(totYr)+'</p>';
      if(delta!==null)h+='<p style="font-size:11px;margin:0;color:'+(delta>=0?'#dc2626':'#059669')+';font-weight:700"><i class="fas fa-arrow-'+(delta>=0?'up':'down')+'"></i> '+Math.abs(delta)+'% vs '+prev+'</p>';
      h+='<p style="font-size:10px;color:var(--text-muted);margin-top:4px">'+pctU+'% uniformes · '+gYr.length+' registros</p>';
      h+='</div>';
    });
    h+='</div>';
    h+='<div style="height:200px;position:relative"><canvas id="ccAnual"></canvas></div>';
    h+='</div></div>';
  }

  // ── Gráficas (mensual + dist) ─────────────────────────────────────────────
  if(g.length){
    h+='<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:20px">';
    h+='<div class="chart-box"><div class="card-head"><h3><i class="fas fa-chart-bar mr-2" style="color:#004B87"></i>Gasto Mensual</h3><span class="text-xs text-muted">Uniformes vs. Almacén</span></div><div style="height:220px;position:relative"><canvas id="ccMensual"></canvas></div></div>';
    h+='<div class="chart-box"><div class="card-head"><h3><i class="fas fa-chart-pie mr-2" style="color:#7c3aed"></i>Por Categoría</h3></div><div style="height:220px;position:relative"><canvas id="ccDist"></canvas></div></div>';
    h+='</div>';
  }

  // ── Métricas por Área ─────────────────────────────────────────────────────
  const areas=getAreaNames();
  const entregasFilt=(s.entregas||[]).filter(e=>currentYear==='todos'||(e.fecha||'').startsWith(currentYear));
  const areaData=areas.map(area=>{
    const emps=activos.filter(e=>e.area===area);
    const cnt=emps.length;
    const pctHead=totalActivos>0?cnt/totalActivos:0;
    const estUnif=totU*pctHead;
    const estTotal=totG*pctHead;
    const ents=entregasFilt.filter(e=>e.area===area||(s.employees.find(x=>x.id===e.empleadoId)?.area===area));
    const pzas=ents.reduce((t,e)=>t+(e.prendas||[]).length,0);
    const invEmpArea=cnt>0?estUnif/cnt:0;
    return{area,cnt,estUnif,estTotal,ents:ents.length,pzas,invEmpArea};
  }).filter(x=>x.cnt>0).sort((a,b)=>b.estTotal-a.estTotal);
  const maxAreaCost=areaData.length?areaData[0].estTotal:1;

  if(areaData.length){
    h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-layer-group mr-2" style="color:#2563eb"></i>Inversión Estimada por Área</h3><span class="text-xs text-muted">Proporcional al número de empleados · '+currentYear+'</span></div>';
    h+='<div style="padding:4px 16px 16px">';
    areaData.forEach((d,i)=>{
      const pct=Math.round(d.estTotal/maxAreaCost*100);
      const barColor=i===0?'#2563eb':i===1?'#7c3aed':i===2?'#059669':'#0891b2';
      h+='<div style="margin:12px 0">';
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">';
      h+='<div style="display:flex;align-items:center;gap:8px">';
      h+='<span style="font-weight:700;font-size:13px">'+esc(d.area)+'</span>';
      h+='<span style="font-size:11px;color:var(--text-muted)">'+d.cnt+' emp.</span>';
      h+='</div>';
      h+='<div style="display:flex;gap:16px;align-items:center">';
      h+='<span style="font-size:11px;color:var(--text-muted)"><i class="fas fa-hand-holding mr-1"></i>'+d.pzas+' pzas · '+d.ents+' entr.</span>';
      h+='<span style="font-weight:800;font-size:13px;color:'+barColor+'">'+fmtMoney(d.estTotal)+'</span>';
      h+='<span style="font-size:11px;color:var(--text-muted);min-width:80px;text-align:right">'+fmtMoney(d.invEmpArea)+'/emp</span>';
      h+='</div></div>';
      h+='<div style="height:8px;background:var(--border);border-radius:999px;overflow:hidden">';
      h+='<div style="height:100%;width:'+pct+'%;background:'+barColor+';border-radius:999px;transition:width .6s ease"></div>';
      h+='</div></div>';
    });
    h+='<p class="text-xs text-muted" style="margin-top:8px"><i class="fas fa-info-circle mr-1"></i>Estimación basada en distribución proporcional de empleados activos por área.</p>';
    h+='</div></div>';
  }

  // ── Piezas vs Dinero ──────────────────────────────────────────────────────
  if(g.length){
    const prendaMap={};
    g.filter(x=>x.tipo==='UNIFORME').forEach(x=>{
      const k=(x.descripcion||'').split(' T:')[0];
      if(!prendaMap[k])prendaMap[k]={pzas:0,total:0,tallas:{}};
      prendaMap[k].pzas+=x.cantidad;prendaMap[k].total+=x.total;
      const t=(x.descripcion||'').split(' T:')[1];if(t)(prendaMap[k].tallas[t]=(prendaMap[k].tallas[t]||0)+x.cantidad);
    });
    const prendaList=Object.entries(prendaMap).sort((a,b)=>b[1].total-a[1].total);
    if(prendaList.length){
      h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-tshirt mr-2" style="color:#004B87"></i>Desglose por Prenda</h3><span class="text-xs text-muted">Piezas · costo · tallas</span></div>';
      h+='<div class="table-wrap"><table class="dt"><thead><tr><th>Prenda</th><th style="text-align:center">Piezas</th><th style="text-align:right">Total MXN</th><th style="text-align:right">Precio/pza</th><th>Tallas más solicitadas</th></tr></thead><tbody>';
      prendaList.forEach(([nombre,d])=>{
        const avg=d.pzas>0?d.total/d.pzas:0;
        const topTallas=Object.entries(d.tallas).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t,n])=>'<span style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700">'+t+' ('+n+')</span>').join(' ');
        h+='<tr><td class="font-bold">'+esc(nombre)+'</td><td style="text-align:center;font-weight:700;color:#0891b2">'+fmt(d.pzas)+'</td><td style="text-align:right;font-weight:700;color:var(--success)">'+fmtMoney(d.total)+'</td><td style="text-align:right;color:var(--text-muted)">'+fmtMoney(avg)+'</td><td style="max-width:220px">'+topTallas+'</td></tr>';
      });
      h+='</tbody></table></div></div>';
    }
  }

  // ── Ranking artículos ─────────────────────────────────────────────────────
  if(g.length){
    const topMap={};g.forEach(x=>{const k=x.descripcion;if(!topMap[k])topMap[k]={total:0,qty:0,tipo:x.tipo,cat:x.categoria};topMap[k].total+=x.total;topMap[k].qty+=x.cantidad;});
    const topList=Object.entries(topMap).sort((a,b)=>b[1].total-a[1].total).slice(0,12);
    const maxVal=topList.length?topList[0][1].total:1;
    const COLORS=['#004B87','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#ea580c','#0f766e','#9333ea','#475569','#b45309','#1d4ed8'];
    h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-trophy mr-2" style="color:#d97706"></i>Top '+topList.length+' por Inversión</h3><span class="text-xs text-muted">Artículos y prendas con mayor gasto</span></div><div style="padding:8px 16px 16px">';
    topList.forEach(([nombre,data],i)=>{
      const pct=Math.round(data.total/maxVal*100);const c=COLORS[i]||'#64748b';
      const badge=data.tipo==='UNIFORME'?'<span style="background:#dbeafe;color:#1d4ed8;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:6px">UNIF</span>':'<span style="background:#ede9fe;color:#7c3aed;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:6px">ALM</span>';
      h+='<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><div><span style="font-size:11px;font-weight:700;color:var(--text-sec);margin-right:6px">#'+(i+1)+'</span><span class="font-bold text-sm">'+esc(nombre)+'</span>'+badge+'</div><div style="display:flex;gap:12px;align-items:center"><span style="font-size:11px;color:var(--text-muted)">'+fmt(data.qty)+' pzs</span><span class="font-bold text-sm" style="color:'+c+'">'+fmtMoney(data.total)+'</span></div></div>';
      h+='<div style="height:6px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+c+';border-radius:999px;transition:width .6s ease"></div></div></div>';
    });
    h+='</div></div>';
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  h+='<div class="card"><div class="card-head"><h3><i class="fas fa-list mr-2" style="color:#64748b"></i>Historial Completo</h3><span class="text-sm text-muted" id="ccCount">'+g.length+' registros</span></div>';
  h+='<div class="table-wrap"><table class="dt"><thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo / Prenda</th><th>Categoría</th><th>Proveedor</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Total</th></tr></thead><tbody id="ccTB"></tbody></table></div></div>';
  return h;
}

// ── Row render ───────────────────────────────────────────────────────────────
function renderRows(g){
  const tb=document.getElementById('ccTB');if(!tb)return;
  const cc=document.getElementById('ccCount');if(cc)cc.textContent=g.length+' registros';
  if(!g.length){tb.innerHTML='<tr><td colspan="8" class="empty-state"><i class="fas fa-chart-line"></i><p>Sin registros de gasto para este período</p></td></tr>';return;}
  const TM={UNIFORME:{c:'#1d4ed8',bg:'#dbeafe',l:'Uniforme'},ALMACEN:{c:'#7c3aed',bg:'#ede9fe',l:'Almacén'}};
  tb.innerHTML=g.map(x=>{const t=TM[x.tipo]||{c:'#64748b',bg:'#f3f4f6',l:x.tipo};return'<tr><td class="text-xs font-mono">'+fmtDate(x.fecha)+'</td><td><span style="background:'+t.bg+';color:'+t.c+';font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">'+t.l+'</span></td><td class="font-bold">'+esc(x.descripcion)+'</td><td class="text-xs text-muted">'+esc(x.categoria)+'</td><td class="text-xs">'+esc(x.proveedor)+'</td><td style="text-align:center">'+fmt(x.cantidad)+'</td><td style="text-align:right">'+fmtMoney(x.precioUnitario)+'</td><td style="text-align:right;font-weight:700;color:var(--success)">'+fmtMoney(x.total)+'</td></tr>';}).join('');
}

// ── Charts ───────────────────────────────────────────────────────────────────
function buildCharts(g,all,yrs){
  // Mensual
  const meses={};g.forEach(x=>{const m=(x.fecha||'').slice(0,7);if(!m)return;if(!meses[m])meses[m]={u:0,a:0};if(x.tipo==='UNIFORME')meses[m].u+=x.total;else meses[m].a+=x.total;});
  const mk=Object.keys(meses).sort();
  const ml=mk.map(m=>{const[y,mo]=m.split('-');return new Date(+y,+mo-1).toLocaleDateString('es-MX',{month:'short',year:'2-digit'}).toUpperCase();});
  if(mk.length)createChart('ccMensual',{type:'bar',data:{labels:ml,datasets:[{label:'Uniformes',data:mk.map(m=>meses[m].u),backgroundColor:'#004B87',borderRadius:5,borderSkipped:false},{label:'Almacén',data:mk.map(m=>meses[m].a),backgroundColor:'#7c3aed',borderRadius:5,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{padding:14,usePointStyle:true,font:{size:11},color:'#374151'}}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#94a3b8',callback:v=>'$'+fmt(v)},grid:{color:'rgba(0,0,0,.05)'}}}}});
  // Distribución
  const catM={};g.forEach(x=>{catM[x.categoria]=(catM[x.categoria]||0)+x.total;});
  const ce=Object.entries(catM).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const COL=['#93c5fd','#c4b5fd','#6ee7b7','#fde68a','#fca5a5','#7dd3fc','#fdba74','#86efac','#d8b4fe'];
  if(ce.length)createChart('ccDist',{type:'doughnut',data:{labels:ce.map(([k])=>k),datasets:[{data:ce.map(([,v])=>v),backgroundColor:COL.slice(0,ce.length),borderWidth:3,borderColor:'var(--surface)',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{position:'bottom',labels:{padding:10,usePointStyle:true,pointStyle:'rect',font:{size:10},color:'#374151'}}}}});
  // Comparativo anual
  if(yrs&&yrs.length>=2&&document.getElementById('ccAnual')){
    const yrLabels=yrs.slice().reverse();
    const yrU=yrLabels.map(y=>byYear(all,y).filter(x=>x.tipo==='UNIFORME').reduce((t,x)=>t+x.total,0));
    const yrA=yrLabels.map(y=>byYear(all,y).filter(x=>x.tipo==='ALMACEN').reduce((t,x)=>t+x.total,0));
    createChart('ccAnual',{type:'bar',data:{labels:yrLabels,datasets:[{label:'Uniformes',data:yrU,backgroundColor:'#004B87',borderRadius:6,borderSkipped:false},{label:'Almacén',data:yrA,backgroundColor:'#7c3aed',borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{padding:14,usePointStyle:true,font:{size:11},color:'#374151'}}},scales:{x:{ticks:{color:'#374151',font:{size:11}},grid:{display:false}},y:{beginAtZero:true,stacked:false,ticks:{color:'#94a3b8',callback:v=>'$'+fmt(v)},grid:{color:'rgba(0,0,0,.05)'}}}}});
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
function legacyInit(){
  const all=getGastos();const yrs=years(all);
  let g=byYear(all,currentYear);
  renderRows(g);buildCharts(g,all,yrs);
  document.getElementById('ccYear')?.addEventListener('change',function(){
    currentYear=this.value;
    const filtered=byYear(all,this.value);
    renderRows(filtered);buildCharts(filtered,all,yrs);
  });
  document.getElementById('ccExportCostos')?.addEventListener('click',exportCostosCSV);
}

const FIN_NOW=new Date();
const FIN_MERMA_TYPES=new Set(['merma','salida_merma']);
const FIN_OUTPUT_TYPES=new Set(['salida_entrega','entrega','salida_colocacion','salida_uso_interno','salida','salida_merma','merma','salida_ajuste','ajuste_negativo']);
const FIN_TYPE_LABELS={
  compra:'Compra',
  entrega:'Entrega',
  salida:'Salida',
  merma:'Merma',
  legacy:'Compra legacy'
};
let finFilters={desde:'',hasta:'',area:'',categoria:'',proveedor:''};
let finDrill={type:'resumen',value:''};

function finDateValue(x){return String(x?.fecha_hora||x?.fecha||x?.fecha_creacion||'');}
function finDateKey(x){return finDateValue(x).slice(0,10);}
function finMonthKey(x){return finDateValue(x).slice(0,7);}
function finCurrentMonth(){return FIN_NOW.getFullYear()+'-'+String(FIN_NOW.getMonth()+1).padStart(2,'0');}
function finPrevMonth(){const d=new Date(FIN_NOW.getFullYear(),FIN_NOW.getMonth()-1,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function finAbsQty(x){return Math.abs(Number(x?.cantidad)||0);}
function finStock(p){return p?.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(Number(v.stock_actual)||0),0):(Number(p?.stock_actual)||0);}
function finUnitCost(p,varianteId=null){
  const variante=(p?.variantes||[]).find(v=>v.id===varianteId);
  return Number(variante?.ultimo_costo||variante?.costo_promedio||p?.costo_promedio||p?.ultimo_costo||0);
}
function finInventoryValue(p){
  if(!p)return 0;
  if(p.es_por_variante)return(p.variantes||[]).reduce((s,v)=>s+(Number(v.stock_actual)||0)*finUnitCost(p,v.id),0);
  return finStock(p)*finUnitCost(p);
}
function finHasCost(p){return finUnitCost(p)>0||(p?.variantes||[]).some(v=>finUnitCost(p,v.id)>0);}
function finCategoryName(p,categorias){return categorias.get(p?.categoria_id)?.nombre||p?.categoria_nombre||p?.categoria||'Sin categoría';}
function finProviderName(p){return(p?.proveedor_frecuente||p?.proveedor||p?.proveedor_nombre||'').trim();}
function finLowStock(p){
  if(!p)return false;
  if(p.es_por_variante&&(p.variantes||[]).length)return p.variantes.some(v=>Number(v.stock_minimo||p.stock_minimo)>0&&(Number(v.stock_actual)||0)<=Number(v.stock_minimo||p.stock_minimo));
  return Number(p.stock_minimo)>0&&finStock(p)<=Number(p.stock_minimo);
}
function finEmployee(store,id){return(store.employees||[]).find(e=>String(e.id)===String(id));}
function finDocArea(store,doc){return doc?.area||finEmployee(store,doc?.empleado_id||doc?.empleadoId)?.area||'';}
function finDocSitio(store,doc){return doc?.sitio||finEmployee(store,doc?.empleado_id||doc?.empleadoId)?.sitio||'';}
function finSafeProvider(v){return(v&&v!=='—')?v:'No disponible';}
function finPush(map,key,label,total,extra={}){
  if(!key)return;
  const item=map.get(key)||{key,label,total:0,cantidad:0,count:0,...extra};
  item.total+=Number(total)||0;
  item.cantidad+=Number(extra.cantidad)||0;
  item.count+=1;
  map.set(key,item);
}
function finBuildRows(){
  const store=getStore();
  const productos=getProductos();
  const productosMap=new Map(productos.map(p=>[p.id,p]));
  const categorias=new Map((store.categorias||[]).map(c=>[c.id,c]));
  const purchaseRows=[];
  const consumptionRows=[];
  (store.entradas||[]).forEach(doc=>{
    (store.lineasEntrada||[]).filter(l=>l.entrada_id===doc.id).forEach(l=>{
      const p=productosMap.get(l.producto_id);
      const total=Number(l.costo_total)||((Number(l.cantidad)||0)*(Number(l.costo_unitario)||0));
      purchaseRows.push({fecha:finDateKey(doc),mes:finMonthKey(doc),origen:'Compra',tipo:'compra',documento:doc.numero||doc.id,area:'No disponible',empleado:'No disponible',producto:p?.nombre||l.producto_id,producto_id:l.producto_id,categoria:finCategoryName(p,categorias),categoria_id:p?.categoria_id||'',proveedor:finSafeProvider(doc.proveedor||finProviderName(p)),cantidad:Number(l.cantidad)||0,unitario:Number(l.costo_unitario)||0,total});
    });
  });
  (store.proveedores||[]).forEach(p=>{
    const total=(Number(p.cantidad)||0)*(Number(p.precioUnitario)||0);
    purchaseRows.push({fecha:p.fecha||'',mes:String(p.fecha||'').slice(0,7),origen:'Compra legacy',tipo:'legacy',documento:p.referencia||p.id,area:'No disponible',empleado:'No disponible',producto:[p.prenda,p.talla].filter(Boolean).join(' '),producto_id:'',categoria:'Uniformes',categoria_id:'Uniformes',proveedor:finSafeProvider(p.proveedor),cantidad:Number(p.cantidad)||0,unitario:Number(p.precioUnitario)||0,total});
  });
  (store.comprasAlmacen||[]).forEach(c=>{
    const total=(Number(c.cantidad)||0)*(Number(c.precioUnitario)||0);
    purchaseRows.push({fecha:c.fecha||'',mes:String(c.fecha||'').slice(0,7),origen:'Compra almacén',tipo:'legacy',documento:c.referencia||c.id,area:'No disponible',empleado:'No disponible',producto:c.articulo||'Artículo',producto_id:'',categoria:c.categoria||'Almacén',categoria_id:c.categoria||'Almacén',proveedor:finSafeProvider(c.proveedor),cantidad:Number(c.cantidad)||0,unitario:Number(c.precioUnitario)||0,total});
  });
  (store.entregasNuevas||[]).forEach(doc=>{
    (store.lineasEntrega||[]).filter(l=>l.entrega_id===doc.id).forEach(l=>{
      const p=productosMap.get(l.producto_id);
      const unit=finUnitCost(p,l.variante_id||null);
      consumptionRows.push({fecha:finDateKey(doc),mes:finMonthKey(doc),origen:'Entrega',tipo:'entrega',documento:doc.numero||doc.id,area:finDocArea(store,doc)||'No disponible',empleado:doc.quien_recibe||doc.empleado_nombre||'No disponible',producto:p?.nombre||l.producto_id,producto_id:l.producto_id,categoria:finCategoryName(p,categorias),categoria_id:p?.categoria_id||'',proveedor:finSafeProvider(finProviderName(p)),cantidad:Number(l.cantidad)||0,unitario:unit,total:(Number(l.cantidad)||0)*unit});
    });
  });
  const salidaTipo={colocacion:'Salida colocación',merma:'Merma',ajuste:'Salida ajuste',devolucion_proveedor:'Devolución proveedor',uso_interno:'Uso interno'};
  (store.salidasNuevas||[]).forEach(doc=>{
    (store.lineasSalida||[]).filter(l=>l.salida_id===doc.id).forEach(l=>{
      const p=productosMap.get(l.producto_id);
      const unit=finUnitCost(p,l.variante_id||null);
      consumptionRows.push({fecha:finDateKey(doc),mes:finMonthKey(doc),origen:salidaTipo[doc.tipo]||'Salida',tipo:doc.tipo==='merma'?'merma':'salida',documento:doc.numero||doc.id,area:'No disponible',empleado:doc.autorizado_por||'No disponible',producto:p?.nombre||l.producto_id,producto_id:l.producto_id,categoria:finCategoryName(p,categorias),categoria_id:p?.categoria_id||'',proveedor:finSafeProvider(finProviderName(p)),cantidad:Number(l.cantidad)||0,unitario:unit,total:(Number(l.cantidad)||0)*unit});
    });
  });
  const mermaMovs=getMovimientos().filter(m=>FIN_MERMA_TYPES.has(m.tipo));
  const movementMermaRows=mermaMovs.map(m=>{
    const p=productosMap.get(m.producto_id);
    const unit=Number(m.costo_unitario)||finUnitCost(p,m.variante_id||null);
    return{fecha:finDateKey(m),mes:finMonthKey(m),origen:'Merma',tipo:'merma',documento:m.documento_id||m.id,area:'No disponible',empleado:m.usuario||'No disponible',producto:p?.nombre||m.producto_nombre||m.producto_id,producto_id:m.producto_id,categoria:finCategoryName(p,categorias),categoria_id:p?.categoria_id||'',proveedor:finSafeProvider(finProviderName(p)),cantidad:finAbsQty(m),unitario:unit,total:finAbsQty(m)*unit};
  });
  const mermaRows=movementMermaRows.length?movementMermaRows:consumptionRows.filter(r=>r.tipo==='merma');
  const movimientoRows=getMovimientos().filter(m=>FIN_OUTPUT_TYPES.has(m.tipo)).map(m=>{
    const p=productosMap.get(m.producto_id);
    const unit=Number(m.costo_unitario)||finUnitCost(p,m.variante_id||null);
    return{fecha:finDateKey(m),mes:finMonthKey(m),origen:FIN_MERMA_TYPES.has(m.tipo)?'Merma':'Movimiento',tipo:FIN_MERMA_TYPES.has(m.tipo)?'merma':'salida',documento:m.documento_id||m.id,area:'No disponible',empleado:m.usuario||'No disponible',producto:p?.nombre||m.producto_nombre||m.producto_id,producto_id:m.producto_id,categoria:finCategoryName(p,categorias),categoria_id:p?.categoria_id||'',proveedor:finSafeProvider(finProviderName(p)),cantidad:finAbsQty(m),unitario:unit,total:finAbsQty(m)*unit};
  });
  return{store,productos,productosMap,categorias,purchaseRows,consumptionRows,mermaRows,movimientoRows};
}
function finRowMatches(row,filters=finFilters){
  if(filters.desde&&row.fecha&&row.fecha<filters.desde)return false;
  if(filters.hasta&&row.fecha&&row.fecha>filters.hasta)return false;
  if(filters.area&&row.area!==filters.area)return false;
  if(filters.categoria&&String(row.categoria_id)!==String(filters.categoria)&&row.categoria!==filters.categoria)return false;
  if(filters.proveedor&&row.proveedor!==filters.proveedor)return false;
  return true;
}
function finFilteredRows(data){
  const purchases=data.purchaseRows.filter(r=>finRowMatches(r));
  const consumption=data.consumptionRows.filter(r=>finRowMatches(r));
  const mermas=data.mermaRows.filter(r=>finRowMatches(r));
  const movimientos=data.movimientoRows.filter(r=>finRowMatches(r));
  return{purchases,consumption,mermas,movimientos,combined:purchases.concat(consumption).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)))};
}
function finTotal(rows){return rows.reduce((s,r)=>s+(Number(r.total)||0),0);}
function finTop(rows,keyFn,labelFn,limit=5){
  const map=new Map();
  rows.forEach(r=>finPush(map,keyFn(r),labelFn(r),r.total,{cantidad:r.cantidad}));
  return Array.from(map.values()).sort((a,b)=>b.total-a.total).slice(0,limit);
}
function finVariation(rows){
  const cur=finTotal(rows.filter(r=>r.mes===finCurrentMonth()));
  const prev=finTotal(rows.filter(r=>r.mes===finPrevMonth()));
  if(!prev)return{available:false,cur,prev,pct:0};
  return{available:true,cur,prev,pct:Math.round(((cur-prev)/prev)*100)};
}
function finPareto(rows){
  const top=finTop(rows,r=>r.producto_id||r.producto,r=>r.producto,50);
  const total=top.reduce((s,x)=>s+x.total,0);
  let acc=0,count=0;
  for(const item of top){if(total&&acc/total>=.8)break;acc+=item.total;count++;}
  return{items:top,total,count,share:total?Math.round(acc/total*100):0};
}
function finBuildData(){
  const data=finBuildRows();
  const filtered=finFilteredRows(data);
  const activeEmployees=(data.store.employees||[]).filter(e=>e.estado==='activo').length;
  const employeesWithCost=new Set(filtered.consumption.filter(r=>r.empleado!=='No disponible'&&r.total>0).map(r=>r.empleado));
  const entregaDocs=new Set(filtered.consumption.filter(r=>r.tipo==='entrega').map(r=>r.documento));
  const monthlyVariation=finVariation(data.purchaseRows);
  const productsNoCost=data.productos.filter(p=>!finHasCost(p));
  const inventoryValue=data.productos.reduce((s,p)=>s+finInventoryValue(p),0);
  const lowStockHighCost=data.productos.filter(p=>finLowStock(p)&&finInventoryValue(p)>0).sort((a,b)=>finInventoryValue(b)-finInventoryValue(a)).slice(0,10);
  const pareto=finPareto(filtered.consumption.concat(filtered.mermas));
  return{...data,filtered,activeEmployees,employeesWithCost,entregaDocs,monthlyVariation,productsNoCost,inventoryValue,lowStockHighCost,pareto,topAreas:finTop(filtered.consumption,r=>r.area,r=>r.area,7).filter(x=>x.key!=='No disponible'),topEmployees:finTop(filtered.consumption,r=>r.empleado,r=>r.empleado,7).filter(x=>x.key!=='No disponible'),topCategories:finTop(filtered.purchases,r=>r.categoria_id||r.categoria,r=>r.categoria,7),topProviders:finTop(filtered.purchases,r=>r.proveedor,r=>r.proveedor,7).filter(x=>x.key!=='No disponible'),topProducts:finTop(filtered.consumption.concat(filtered.mermas),r=>r.producto_id||r.producto,r=>r.producto,8)};
}
function finOptions(values,selected){return values.map(v=>'<option value="'+esc(v.value)+'"'+(String(v.value)===String(selected)?' selected':'')+'>'+esc(v.label)+'</option>').join('');}
function finFilterOptions(data){
  const areas=Array.from(new Set(getAreaNames().concat(data.consumptionRows.map(r=>r.area)).filter(x=>x&&x!=='No disponible'))).sort();
  const categorias=(data.store.categorias||[]).map(c=>({value:c.id,label:c.nombre}));
  const proveedores=Array.from(new Set(data.purchaseRows.map(r=>r.proveedor).concat(data.consumptionRows.map(r=>r.proveedor)).filter(x=>x&&x!=='No disponible'))).sort();
  return{areas,categorias,proveedores};
}
function finKpi({label,value,available=true,sub,note,status='info',drill,icon='fa-chart-line'}){
  const cls=status==='danger'?'badge-danger':status==='warning'?'badge-warning':status==='success'?'badge-success':'badge-info';
  const tag=status==='danger'?'Alerta':status==='warning'?'Atención':status==='success'?'OK':'Info';
  const detailBtn=drill?'<button class="exec-link" data-fin-drill="'+esc(drill.type)+'" data-fin-value="'+esc(drill.value||'')+'">Ver detalle</button>':'';
  return'<div class="fin-kpi '+(drill?'is-clickable':'')+'" '+(drill?'data-fin-drill="'+esc(drill.type)+'" data-fin-value="'+esc(drill.value||'')+'"':'')+'><div class="fin-kpi-top"><span class="fin-kpi-icon '+status+'"><i class="fas '+icon+'"></i></span><span class="badge '+cls+'">'+tag+'</span></div><div class="fin-kpi-label">'+esc(label)+'</div><div class="fin-kpi-value '+(!available?'is-na':'')+'">'+(available?value:'No disponible')+'</div><div class="fin-kpi-sub">'+esc(sub||'')+'</div><div class="fin-note">Qué significa: '+esc(note?.meaning||'Indicador calculado con datos reales disponibles')+'</div><div class="fin-note">Por qué importa: '+esc(note?.why||'Ayuda a priorizar decisiones financieras y operativas')+'</div>'+detailBtn+'</div>';
}
function finRenderFilters(data){
  const opts=finFilterOptions(data);
  return'<div class="fin-filterbar"><div class="form-group"><label class="form-label">Desde</label><input type="date" class="form-input" id="finDesde" value="'+esc(finFilters.desde)+'"></div><div class="form-group"><label class="form-label">Hasta</label><input type="date" class="form-input" id="finHasta" value="'+esc(finFilters.hasta)+'"></div><div class="form-group"><label class="form-label">Área</label><select class="form-select" id="finArea"><option value="">Todas</option>'+finOptions(opts.areas.map(a=>({value:a,label:a})),finFilters.area)+'</select></div><div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="finCategoria"><option value="">Todas</option>'+finOptions(opts.categorias,finFilters.categoria)+'</select></div><div class="form-group"><label class="form-label">Proveedor</label><select class="form-select" id="finProveedor"><option value="">Todos</option>'+finOptions(opts.proveedores.map(p=>({value:p,label:p})),finFilters.proveedor)+'</select></div><button class="btn btn-ghost" id="finClear"><i class="fas fa-filter-circle-xmark"></i> Limpiar</button><button class="btn btn-primary" id="finExport"><i class="fas fa-file-csv"></i> CSV</button></div>';
}
function finRankRows(items,type){
  if(!items.length)return'<div class="fin-empty-inline">Sin datos</div>';
  const max=Math.max(...items.map(i=>i.total),1);
  return items.map((x,i)=>'<button class="fin-rank-row" data-fin-drill="'+esc(type)+'" data-fin-value="'+esc(x.key)+'"><span class="fin-rank-pos">'+(i+1)+'</span><span class="fin-rank-main"><strong>'+esc(x.label)+'</strong><span>'+fmtMoney(x.total)+'</span></span><span class="fin-rank-bar"><i style="width:'+Math.max(4,Math.round(x.total/max*100))+'%"></i></span></button>').join('');
}
function finSemaphore(data){
  const spend=data.monthlyVariation;
  const mermaCost=finTotal(data.filtered.mermas);
  const monthSpend=finTotal(data.purchaseRows.filter(r=>r.mes===finCurrentMonth()));
  const mermaPct=monthSpend?Math.round(mermaCost/monthSpend*100):0;
  const highSpendStatus=spend.available?(spend.pct>20?'danger':spend.pct>5?'warning':'success'):'warning';
  const mermaStatus=mermaCost>0?(mermaPct>10?'danger':'warning'):'success';
  return'<div class="fin-panel"><div class="fin-panel-head"><div><h3>Semáforo financiero</h3><p>Alertas de lectura rápida</p></div></div><div class="fin-semaphore-grid"><div class="fin-semaphore"><span class="fin-dot '+highSpendStatus+'"></span><div><strong>Alto gasto</strong><span>'+(spend.available?((spend.pct>=0?'+':'')+spend.pct+'% vs mes anterior'):'No disponible: requiere histórico mensual')+'</span></div></div><div class="fin-semaphore"><span class="fin-dot '+(data.productsNoCost.length?'warning':'success')+'"></span><div><strong>Sin precio</strong><span>'+data.productsNoCost.length+' productos sin costo configurado</span></div></div><div class="fin-semaphore"><span class="fin-dot '+(data.lowStockHighCost.length?'danger':'success')+'"></span><div><strong>Bajo stock con alto costo</strong><span>'+data.lowStockHighCost.length+' productos con valor financiero en riesgo</span></div></div><div class="fin-semaphore"><span class="fin-dot '+mermaStatus+'"></span><div><strong>Merma relevante</strong><span>'+(mermaCost>0?fmtMoney(mermaCost)+' · '+mermaPct+'% del gasto mensual':'Sin costo de merma en el filtro')+'</span></div></div></div></div>';
}
function finRowsTable(rows){
  if(!rows.length)return'<tr><td colspan="9" class="empty-state"><i class="fas fa-chart-line"></i><p>Sin datos</p></td></tr>';
  return rows.slice(0,120).map(r=>'<tr><td class="text-xs">'+fmtDate(r.fecha)+'</td><td>'+esc(r.origen)+'</td><td>'+esc(r.area)+'</td><td>'+esc(r.empleado)+'</td><td><button class="fin-table-link" data-fin-drill="producto" data-fin-value="'+esc(r.producto_id||r.producto)+'">'+esc(r.producto)+'</button></td><td>'+esc(r.categoria)+'</td><td>'+esc(r.proveedor)+'</td><td class="text-right">'+fmt(r.cantidad)+'</td><td class="text-right">'+(r.total>0?fmtMoney(r.total):'No disponible')+'</td></tr>').join('');
}
function finDetailRows(data){
  const rows=data.filtered.combined.concat(data.filtered.mermas).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  if(finDrill.type==='area')return rows.filter(r=>r.area===finDrill.value);
  if(finDrill.type==='proveedor')return rows.filter(r=>r.proveedor===finDrill.value);
  if(finDrill.type==='producto')return rows.filter(r=>String(r.producto_id||r.producto)===String(finDrill.value));
  if(finDrill.type==='categoria')return rows.filter(r=>String(r.categoria_id||r.categoria)===String(finDrill.value));
  if(finDrill.type==='empleado')return rows.filter(r=>r.empleado===finDrill.value);
  if(finDrill.type==='merma')return data.filtered.mermas;
  if(finDrill.type==='sinPrecio')return data.productsNoCost.map(p=>({fecha:'',origen:'Producto sin precio',area:'No disponible',empleado:'No disponible',producto:p.nombre,producto_id:p.id,categoria:finCategoryName(p,data.categorias),categoria_id:p.categoria_id||'',proveedor:finSafeProvider(finProviderName(p)),cantidad:finStock(p),unitario:0,total:0}));
  return rows;
}
function finRenderDetail(data){
  const titleMap={resumen:'Detalle financiero filtrado',merma:'Detalle de mermas',sinPrecio:'Productos sin precio configurado'};
  const title=titleMap[finDrill.type]||(finDrill.type.charAt(0).toUpperCase()+finDrill.type.slice(1)+' · '+finDrill.value);
  const rows=finDetailRows(data);
  return'<div class="fin-panel fin-detail"><div class="fin-panel-head"><div><h3>'+esc(title)+'</h3><p>Compras reales y consumos valorizados con costos existentes</p></div><button class="btn btn-ghost btn-sm" data-fin-drill="resumen" data-fin-value=""><i class="fas fa-rotate-left"></i> Resumen</button></div><div class="table-wrap"><table class="dt"><thead><tr><th>Fecha</th><th>Origen</th><th>Área</th><th>Empleado</th><th>Producto</th><th>Categoría</th><th>Proveedor</th><th class="text-right">Cantidad</th><th class="text-right">Total</th></tr></thead><tbody>'+finRowsTable(rows)+'</tbody></table></div></div>';
}
function finRenderCharts(data){
  return'<div class="fin-chart-grid"><div class="fin-panel"><div class="fin-panel-head"><div><h3>Tendencia mensual</h3><p>Compras reales históricas</p></div></div><canvas id="finMonthly"></canvas></div><div class="fin-panel"><div class="fin-panel-head"><div><h3>Ranking por área</h3><p>Consumo valorizado</p></div></div><canvas id="finAreas"></canvas></div><div class="fin-panel"><div class="fin-panel-head"><div><h3>Pareto 80/20</h3><p>Concentración por producto</p></div></div><canvas id="finPareto"></canvas></div></div>';
}
function finRenderContent(){
  const data=finBuildData();
  const purchaseTotal=finTotal(data.purchaseRows);
  const monthSpend=finTotal(data.purchaseRows.filter(r=>r.mes===finCurrentMonth()));
  const filteredPurchases=finTotal(data.filtered.purchases);
  const areaTop=data.topAreas[0];
  const empTop=data.topEmployees[0];
  const catTop=data.topCategories[0];
  const provTop=data.topProviders[0];
  const avgEmployee=data.employeesWithCost.size?finTotal(data.filtered.consumption)/data.employeesWithCost.size:0;
  const avgDelivery=data.entregaDocs.size?finTotal(data.filtered.consumption.filter(r=>r.tipo==='entrega'))/data.entregaDocs.size:0;
  const mermaCost=finTotal(data.filtered.mermas);
  const variation=data.monthlyVariation;
  let h='<div class="fin-exec"><div class="fin-hero"><div><span class="fin-eyebrow">Reporte Financiero Ejecutivo</span><h1>Gasto, consumo e impacto financiero</h1><p>Compras, entregas, mermas, proveedores y productos calculados con datos reales existentes.</p></div><div class="fin-hero-meta"><strong>'+fmt(data.filtered.combined.length)+'</strong><span>registros filtrados</span></div></div>';
  h+=finRenderFilters(data);
  h+='<div class="fin-kpi-grid">';
  h+=finKpi({label:'Gasto total histórico',value:fmtMoney(purchaseTotal),available:purchaseTotal>0,sub:'Compras registradas en entradas y compras legacy',status:purchaseTotal>0?'success':'warning',icon:'fa-sack-dollar',note:{meaning:'Total acumulado de compras con importe disponible.',why:'Mide el desembolso histórico real capturado.'}});
  h+=finKpi({label:'Gasto del mes',value:fmtMoney(monthSpend),available:monthSpend>0,sub:'Mes calendario actual',status:monthSpend>0?'info':'warning',icon:'fa-calendar-days',note:{meaning:'Compras registradas durante el mes actual.',why:'Permite vigilar presión de gasto reciente.'}});
  h+=finKpi({label:'Gasto filtrado',value:fmtMoney(filteredPurchases),available:filteredPurchases>0,sub:'Compras bajo filtros activos',status:filteredPurchases>0?'info':'warning',icon:'fa-filter',note:{meaning:'Importe de compras que coincide con fecha/categoría/proveedor.',why:'Aísla una vista ejecutiva para análisis puntual.'}});
  h+=finKpi({label:'Gasto por área',value:areaTop?fmtMoney(areaTop.total):'',available:!!areaTop,sub:areaTop?areaTop.label:'Sin datos de área',status:areaTop?'info':'warning',drill:areaTop?{type:'area',value:areaTop.key}:null,icon:'fa-layer-group',note:{meaning:'Área con mayor consumo valorizado.',why:'Ayuda a priorizar revisión por centro de costo.'}});
  h+=finKpi({label:'Gasto por empleado',value:empTop?fmtMoney(empTop.total):'',available:!!empTop,sub:empTop?empTop.label:'Sin empleado asociado',status:empTop?'info':'warning',icon:'fa-user-tie',note:{meaning:'Empleado con mayor consumo valorizado.',why:'Detecta concentración de costo individual.'}});
  h+=finKpi({label:'Gasto por categoría',value:catTop?fmtMoney(catTop.total):'',available:!!catTop,sub:catTop?catTop.label:'Sin categoría',status:catTop?'info':'warning',drill:catTop?{type:'categoria',value:catTop.key}:null,icon:'fa-tags',note:{meaning:'Categoría con mayor compra capturada.',why:'Ordena decisiones de abastecimiento por familia.'}});
  h+=finKpi({label:'Gasto por proveedor',value:provTop?fmtMoney(provTop.total):'',available:!!provTop,sub:provTop?provTop.label:'Sin proveedor capturado',status:provTop?'info':'warning',drill:provTop?{type:'proveedor',value:provTop.key}:null,icon:'fa-truck-field',note:{meaning:'Proveedor con mayor monto histórico filtrado.',why:'Revela concentración y dependencia de compra.'}});
  h+=finKpi({label:'Costo promedio por empleado',value:fmtMoney(avgEmployee),available:avgEmployee>0,sub:data.employeesWithCost.size+' empleados con costo',status:avgEmployee>0?'success':'warning',icon:'fa-users',note:{meaning:'Consumo valorizado dividido entre empleados con registros.',why:'Normaliza gasto por persona atendida.'}});
  h+=finKpi({label:'Costo promedio por entrega',value:fmtMoney(avgDelivery),available:avgDelivery>0,sub:data.entregaDocs.size+' entregas con costo',status:avgDelivery>0?'success':'warning',icon:'fa-hand-holding-dollar',note:{meaning:'Costo estimado por documento de entrega.',why:'Permite comparar eficiencia de entrega.'}});
  h+=finKpi({label:'Costo de mermas',value:fmtMoney(mermaCost),available:mermaCost>0||!data.filtered.mermas.length,sub:data.filtered.mermas.length+' registros de merma',status:mermaCost>0?'danger':'success',drill:{type:'merma',value:''},icon:'fa-circle-minus',note:{meaning:'Costo valorizado de mermas con precios existentes.',why:'Cuantifica pérdida operativa.'}});
  h+=finKpi({label:'Valor actual inventario',value:fmtMoney(data.inventoryValue),available:data.inventoryValue>0,sub:'Stock actual x costo configurado',status:data.inventoryValue>0?'success':'warning',icon:'fa-warehouse',note:{meaning:'Valor financiero del inventario disponible.',why:'Indica capital inmovilizado en almacén.'}});
  h+=finKpi({label:'Variación mensual',value:(variation.pct>=0?'+':'')+variation.pct+'%',available:variation.available,sub:variation.available?fmtMoney(variation.cur)+' vs '+fmtMoney(variation.prev):'No disponible',status:variation.available?(variation.pct>20?'danger':variation.pct>5?'warning':'success'):'warning',icon:'fa-arrow-trend-up',note:{meaning:'Cambio del gasto actual contra mes anterior.',why:'Señala aceleraciones anormales de gasto.'}});
  h+=finKpi({label:'Pareto 80/20',value:data.pareto.count+' productos',available:data.pareto.total>0,sub:data.pareto.share+'% del impacto valorizado',status:data.pareto.count?'info':'warning',icon:'fa-ranking-star',note:{meaning:'Cantidad de productos que explica cerca del 80% del costo.',why:'Enfoca acciones sobre pocos productos críticos.'}});
  h+=finKpi({label:'Productos sin precio',value:fmt(data.productsNoCost.length),available:true,sub:'Requieren costo/precio configurado',status:data.productsNoCost.length?'warning':'success',drill:{type:'sinPrecio',value:''},icon:'fa-tag',note:{meaning:'Productos sin costo usable en el cálculo.',why:'Evita reportes financieros incompletos.'}});
  h+='</div>';
  h+='<div class="fin-two-col"><div class="fin-panel"><div class="fin-panel-head"><div><h3>Top áreas por gasto</h3><p>Click para detalle por empleado/producto</p></div></div>'+finRankRows(data.topAreas,'area')+'</div><div class="fin-panel"><div class="fin-panel-head"><div><h3>Top proveedores</h3><p>Click para productos asociados</p></div></div>'+finRankRows(data.topProviders,'proveedor')+'</div></div>';
  h+='<div class="fin-two-col"><div class="fin-panel"><div class="fin-panel-head"><div><h3>Top empleados por costo</h3><p>Consumo valorizado</p></div></div>'+finRankRows(data.topEmployees,'empleado')+'</div><div class="fin-panel"><div class="fin-panel-head"><div><h3>Productos con mayor impacto financiero</h3><p>Click para movimientos y costo</p></div></div>'+finRankRows(data.topProducts,'producto')+'</div></div>';
  h+=finSemaphore(data);
  h+=finRenderCharts(data);
  h+=finRenderDetail(data);
  h+='</div>';
  return h;
}
function finChartBase(){
  return{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#cbd5e1',usePointStyle:true,font:{size:11}}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#94a3b8',callback:v=>'$'+fmt(v)},grid:{color:'rgba(148,163,184,.14)'}}}};
}
function finInitCharts(data){
  if(typeof Chart==='undefined')return;
  const months={};
  data.purchaseRows.forEach(r=>{if(!r.mes)return;months[r.mes]=(months[r.mes]||0)+r.total;});
  const keys=Object.keys(months).sort().slice(-12);
  createChart('finMonthly',{type:'line',data:{labels:keys.map(k=>new Date(Number(k.slice(0,4)),Number(k.slice(5,7))-1,1).toLocaleDateString('es-MX',{month:'short',year:'2-digit'})),datasets:[{label:'Compras',data:keys.map(k=>months[k]),borderColor:'#38bdf8',backgroundColor:'rgba(56,189,248,.12)',tension:.3,fill:true}]},options:finChartBase()});
  createChart('finAreas',{type:'bar',data:{labels:data.topAreas.map(x=>x.label),datasets:[{label:'Costo',data:data.topAreas.map(x=>x.total),backgroundColor:'#22c55e',borderRadius:6,borderSkipped:false}]},options:{...finChartBase(),indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{color:'#94a3b8',callback:v=>'$'+fmt(v)},grid:{color:'rgba(148,163,184,.14)'}},y:{ticks:{color:'#cbd5e1'},grid:{display:false}}}}});
  createChart('finPareto',{type:'bar',data:{labels:data.pareto.items.slice(0,8).map(x=>x.label),datasets:[{label:'Impacto',data:data.pareto.items.slice(0,8).map(x=>x.total),backgroundColor:'#818cf8',borderRadius:6,borderSkipped:false}]},options:{...finChartBase(),plugins:{legend:{display:false}}}});
}
function finSyncFilters(){
  finFilters={desde:document.getElementById('finDesde')?.value||'',hasta:document.getElementById('finHasta')?.value||'',area:document.getElementById('finArea')?.value||'',categoria:document.getElementById('finCategoria')?.value||'',proveedor:document.getElementById('finProveedor')?.value||''};
}
function finRefresh(){
  const root=document.getElementById('finExecRoot');
  if(!root)return;
  root.innerHTML=finRenderContent();
  finBind();
}
function finExportCSV(){
  const data=finBuildData();
  const rows=finDetailRows(data);
  const csv=[['Fecha','Origen','Area','Empleado','Producto','Categoria','Proveedor','Cantidad','Total']].concat(rows.map(r=>[r.fecha,r.origen,r.area,r.empleado,r.producto,r.categoria,r.proveedor,r.cantidad,r.total]));
  const body=csv.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([body],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='reporte-financiero-ejecutivo.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
function finBind(){
  const data=finBuildData();
  finInitCharts(data);
  ['finDesde','finHasta','finArea','finCategoria','finProveedor'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.onchange=()=>{finSyncFilters();finDrill={type:'resumen',value:''};finRefresh();};
  });
  document.getElementById('finClear')?.addEventListener('click',()=>{finFilters={desde:'',hasta:'',area:'',categoria:'',proveedor:''};finDrill={type:'resumen',value:''};finRefresh();});
  document.getElementById('finExport')?.addEventListener('click',finExportCSV);
  const root=document.getElementById('finExecRoot');
  if(root)root.onclick=e=>{
    const drill=e.target.closest('[data-fin-drill]');
    if(!drill)return;
    const type=drill.dataset.finDrill||'resumen';
    const value=drill.dataset.finValue||'';
    finDrill={type,value};
    finRefresh();
  };
}
export function render(){
  return'<div id="finExecRoot">'+finRenderContent()+'</div>';
}
export function init(){
  finBind();
}

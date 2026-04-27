import{getStore}from'./storage.js';import{getAreaNames}from'./areas-config.js';import{esc,fmt,fmtMoney,fmtDate}from'./utils.js';import{createChart}from'./ui.js';
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
export function render(){
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
export function init(){
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

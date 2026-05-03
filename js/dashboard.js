import{VERSION}from'./config.js';import{getStore}from'./storage.js';import{calcStats,calcStatsArea}from'./rules.js';import{buildAreaBadge,createChart,openDrawer}from'./ui.js';import{getAreaNames}from'./areas-config.js';import{fmt,fmtMoney,esc,fmtDate}from'./utils.js';
import{getUserRole}from'./user-roles.js';
import{getProductos,getMovimientos,getEntregasNuevas,getDevolucionesNuevas,getSalidas as getSalidasNuevas,getCostoUnitarioProducto,productoTieneCosto,getValorInventarioProducto,getAlmacenDataQuality}from'./almacen-api.js';

function areaIcon(name){const n=(name||'').toUpperCase();if(n.includes('PLANT'))return{icon:'fa-industry',color:'#2563eb'};if(n.includes('MANTEN')||n.includes('MECANIC')||n.includes('TALLER'))return{icon:'fa-tools',color:'#d97706'};if(n.includes('SUPERV'))return{icon:'fa-user-tie',color:'#7c3aed'};if(n.includes('PUERTA'))return{icon:'fa-door-open',color:'#059669'};if(n.includes('MATERIA'))return{icon:'fa-boxes',color:'#0891b2'};if(n.includes('TULT'))return{icon:'fa-building',color:'#dc2626'};if(n.includes('BRUK'))return{icon:'fa-hard-hat',color:'#ea580c'};if(n.includes('ADMIN')||n.includes('OFIC'))return{icon:'fa-briefcase',color:'#475569'};if(n.includes('ALMAC'))return{icon:'fa-warehouse',color:'#854d0e'};if(n.includes('SEGUR'))return{icon:'fa-shield-alt',color:'#1d4ed8'};return{icon:'fa-layer-group',color:'#64748b'};}

function productoTipo(p){return(p&&p.tipo)||'personal';}
function entregaTipo(e,productos,lineas){if(e.tipo_entrega)return e.tipo_entrega;const ls=lineas.filter(l=>l.entrega_id===e.id);return ls.some(l=>productoTipo(productos.get(l.producto_id))==='consumible')?'consumible':'personal';}
function entregaPiezas(e,lineas){return lineas.filter(l=>l.entrega_id===e.id).reduce((s,l)=>s+(Number(l.cantidad)||0),0);}
function sumarPor(map,key,piezas){const item=map.get(key)||{label:key,piezas:0,entregas:0};item.piezas+=piezas;item.entregas+=1;map.set(key,item);}
function stockProducto(p){return p.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(Number(v.stock_actual)||0),0):(Number(p.stock_actual)||0);}
function costoProducto(p){return p?getCostoUnitarioProducto(p.id,null)||0:0;}
function valorInventarioProducto(p){return getValorInventarioProducto(p).valor;}
function costoLineaEntrega(linea,productos){const p=productos.get(linea.producto_id);return(Number(linea.cantidad)||0)*costoProducto(p||{});}
function areaFinanciera(area){const a=(area||'').toUpperCase();if(a.includes('VENT'))return'Ventas';if(a.includes('ADMIN')||a.includes('OFIC')||a.includes('RH'))return'Admin';if(a.includes('LOG')||a.includes('ALMAC'))return'Logística';return'Operaciones';}
function categoriaFinanciera(p,categorias){const c=(categorias.get(p.categoria_id)?.nombre||p.categoria_nombre||p.nombre||'').toUpperCase();if(productoTipo(p)==='consumible'||c.includes('CONSUM'))return'Consumibles';if(c.includes('CALZ')||c.includes('BOTA')||c.includes('ZAPATO')||c.includes('TENIS'))return'Calzado';if(c.includes('EPP')||c.includes('SEGUR')||c.includes('GUANTE')||c.includes('CASCO')||c.includes('LENTE'))return'EPP';return'Uniformes';}
function esAlertaNivel1(p){const min=Number(p.stock_minimo);return Number(p.nivel_control||3)===1&&Number.isFinite(min)&&stockProducto(p)<=min;}
function pctCambio(actual,previo){if(!previo)return actual>0?100:0;return Math.round(((actual-previo)/previo)*100);}

let financialChartData=null;

// Calcula últimos N meses
function lastMonths(n){const months=[];const now=new Date();for(let i=n-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({label:d.toLocaleDateString('es-MX',{month:'short',year:'2-digit'}),key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')});}return months;}

function buildFinancialDashboardData(){
  const st=getStore();const productos=getProductos();const productosMap=new Map(productos.map(p=>[p.id,p]));const categorias=new Map((st.categorias||[]).map(c=>[c.id,c]));
  const lineasEntrega=st.lineasEntrega||[];const entregas=getEntregasNuevas();const movimientos=getMovimientos();const meses=lastMonths(6);
  const mensual={personal:{},consumible:{}};meses.forEach(m=>{mensual.personal[m.key]=0;mensual.consumible[m.key]=0;});
  const gastoArea={Operaciones:{personal:0,consumible:0},Ventas:{personal:0,consumible:0},Admin:{personal:0,consumible:0},'Logística':{personal:0,consumible:0}};
  entregas.forEach(e=>{const mes=(e.fecha_hora||'').slice(0,7);const tipo=entregaTipo(e,productosMap,lineasEntrega);const lineas=lineasEntrega.filter(l=>l.entrega_id===e.id);const gasto=lineas.reduce((s,l)=>s+costoLineaEntrega(l,productosMap),0);if(mensual[tipo]&&mes in mensual[tipo])mensual[tipo][mes]+=gasto;const area=areaFinanciera(e.area);gastoArea[area][tipo]+=gasto;});
  const inventarioCat={Uniformes:0,Calzado:0,EPP:0,Consumibles:0};productos.forEach(p=>{inventarioCat[categoriaFinanciera(p,categorias)]+=valorInventarioProducto(p);});
  const topMap=new Map();movimientos.forEach(m=>{if(!m.producto_id)return;const p=productosMap.get(m.producto_id);const item=topMap.get(m.producto_id)||{label:p?.nombre||m.producto_id,cantidad:0};item.cantidad+=Math.abs(Number(m.cantidad)||0);topMap.set(m.producto_id,item);});
  const topProductos=Array.from(topMap.values()).sort((a,b)=>b.cantidad-a.cantidad).slice(0,10);
  const now=new Date();const mesActual=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');const prev=new Date(now.getFullYear(),now.getMonth()-1,1);const mesPrev=prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0');
  const gastoActual=(mensual.personal[mesActual]||0)+(mensual.consumible[mesActual]||0);const gastoPrevio=(mensual.personal[mesPrev]||0)+(mensual.consumible[mesPrev]||0);
  const valorTotal=productos.reduce((s,p)=>s+valorInventarioProducto(p),0);const stockBajo=productos.filter(esAlertaNivel1).length;
  return{meses,personalMensual:meses.map(m=>mensual.personal[m.key]||0),consumibleMensual:meses.map(m=>mensual.consumible[m.key]||0),inventarioCat,topProductos,gastoArea,valorTotal,gastoActual,gastoPrevio,cambio:pctCambio(gastoActual,gastoPrevio),gastoPersonalMes:mensual.personal[mesActual]||0,gastoConsumibleMes:mensual.consumible[mesActual]||0,stockBajo};
}

function renderFinancialSection(d){
  const cambioColor=d.cambio>=0?'#dc2626':'#059669';
  return'<div id="financialDashboard" style="margin:20px 0">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="fas fa-chart-line" style="color:#059669;font-size:16px"></i><h3 style="font-size:14px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase">Dashboard Financiero</h3></div>'+
    '<div class="kpi-grid">'+
      '<div class="kpi" style="border-top:2px solid #059669"><div class="kpi-label">Valor Total Inventario</div><div class="kpi-value" style="font-size:20px">'+fmtMoney(d.valorTotal)+'</div><div class="kpi-sub">stock × costo unitario</div></div>'+
      '<div class="kpi" style="border-top:2px solid '+cambioColor+'"><div class="kpi-label">Gasto vs Mes Pasado</div><div class="kpi-value">'+(d.cambio>0?'+':'')+d.cambio+'%</div><div class="kpi-sub">'+fmtMoney(d.gastoActual)+' este mes</div></div>'+
      '<div class="kpi" style="border-top:2px solid #22c55e"><div class="kpi-label">Gasto Personal</div><div class="kpi-value" style="font-size:20px">'+fmtMoney(d.gastoPersonalMes)+'</div><div class="kpi-sub">mes actual</div></div>'+
      '<div class="kpi" style="border-top:2px solid #2563eb"><div class="kpi-label">Gasto Consumible</div><div class="kpi-value" style="font-size:20px">'+fmtMoney(d.gastoConsumibleMes)+'</div><div class="kpi-sub">mes actual</div></div>'+
      '<div class="kpi" style="border-top:2px solid #dc2626"><div class="kpi-label">Alertas Stock Bajo</div><div class="kpi-value">'+d.stockBajo+'</div><div class="kpi-sub">productos bajo mínimo</div></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px">'+
      '<div class="chart-box" style="height:310px"><div class="card-head"><h3>Gasto mensual</h3></div><canvas id="finGastoMensual"></canvas></div>'+
      '<div class="chart-box" style="height:310px"><div class="card-head"><h3>Inventario por categoría</h3></div><canvas id="finInventarioCategoria"></canvas></div>'+
      '<div class="chart-box" style="height:340px"><div class="card-head"><h3>Top 10 productos más movidos</h3></div><canvas id="finTopProductos"></canvas></div>'+
      '<div class="chart-box" style="height:340px"><div class="card-head"><h3>Gasto por área</h3></div><canvas id="finGastoArea"></canvas></div>'+
    '</div>'+
  '</div>';
}

function moneyTick(v){return'$'+fmt(Number(v)||0);}
function commonChartOptions(){return{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{padding:12,usePointStyle:true,font:{size:11},color:'#cbd5e1'}}},scales:{x:{ticks:{color:'#94a3b8',font:{size:10}},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#94a3b8',callback:moneyTick},grid:{color:'rgba(148,163,184,.12)'}}}};}
function initFinancialCharts(){
  const d=financialChartData||buildFinancialDashboardData();const monthLabels=d.meses.map(m=>m.label);
  createChart('finGastoMensual',{type:'line',data:{labels:monthLabels,datasets:[{label:'Personal',data:d.personalMensual,borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,.14)',tension:.35,fill:true,pointRadius:3},{label:'Consumible',data:d.consumibleMensual,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.14)',tension:.35,fill:true,pointRadius:3}]},options:commonChartOptions()});
  createChart('finInventarioCategoria',{type:'doughnut',data:{labels:Object.keys(d.inventarioCat),datasets:[{data:Object.values(d.inventarioCat),backgroundColor:['#059669','#2563eb','#f59e0b','#7c3aed'],borderColor:'var(--surface)',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'66%',plugins:{legend:{position:'bottom',labels:{padding:12,usePointStyle:true,font:{size:11},color:'#cbd5e1'}},tooltip:{callbacks:{label:ctx=>ctx.label+': '+fmtMoney(ctx.parsed||0)}}}}});
  createChart('finTopProductos',{type:'bar',data:{labels:d.topProductos.map(x=>x.label),datasets:[{label:'Movimientos',data:d.topProductos.map(x=>x.cantidad),backgroundColor:'#7c3aed',borderRadius:5,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{color:'#94a3b8'},grid:{color:'rgba(148,163,184,.12)'}},y:{ticks:{color:'#cbd5e1',font:{size:10}},grid:{display:false}}}}});
  createChart('finGastoArea',{type:'bar',data:{labels:Object.keys(d.gastoArea),datasets:[{label:'Personal',data:Object.values(d.gastoArea).map(x=>x.personal),backgroundColor:'#22c55e',borderRadius:5,borderSkipped:false},{label:'Consumible',data:Object.values(d.gastoArea).map(x=>x.consumible),backgroundColor:'#2563eb',borderRadius:5,borderSkipped:false}]},options:{...commonChartOptions(),scales:{x:{stacked:true,ticks:{color:'#94a3b8',font:{size:10}},grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{color:'#94a3b8',callback:moneyTick},grid:{color:'rgba(148,163,184,.12)'}}}}});
}

function legacyRender(){
  const isAdmin=getUserRole()==='admin';
  const s=calcStats();const st=getStore();const areas=getAreaNames();
  const now=new Date();const mes=now.toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const thisYear=now.getFullYear().toString();
  const mesActual=thisYear+'-'+String(now.getMonth()+1).padStart(2,'0');
  const totalEnt=st.entregas.length;
  const entConFirma=st.entregas.filter(e=>e.firma).length;
  const gastoUnif=st.proveedores.reduce((t,p)=>t+p.cantidad*p.precioUnitario,0);
  const gastoAlm=(st.comprasAlmacen||[]).reduce((t,c)=>t+c.cantidad*c.precioUnitario,0);
  const gastoTotal=gastoUnif+gastoAlm;
  const alertasStock=(st.inventario||[]).filter(i=>i.minStock>0&&i.cantidad<=i.minStock).length;
  const pctN=parseFloat(s.pct);const pctColor=pctN>=80?'#059669':pctN>=50?'#d97706':'#dc2626';
  // Cobertura entregas año en curso
  const activos=st.employees.filter(e=>e.estado==='activo');
  const empConEntrega=new Set(st.entregas.filter(e=>e.fecha&&e.fecha.startsWith(thisYear)).map(e=>e.empleadoId));
  const cobertura=activos.length?Math.round(empConEntrega.size/activos.length*100):0;
  const cobColor=cobertura>=80?'#059669':cobertura>=50?'#d97706':'#dc2626';
  // Empleados sin entrega este año
  const sinEntrega=activos.filter(e=>!empConEntrega.has(e.id));

  let h='';
  h+='<div class="page-head"><div class="page-title"><h1>Dashboard</h1><p>Control Store Pro — ASSA ABLOY México · '+mes+'</p></div><span style="background:rgba(59,130,246,.1);color:#60a5fa;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:.05em;border:1px solid rgba(59,130,246,.2)">v'+VERSION+'</span></div>';

  // Alert banner
  if(alertasStock>0||s.pendientes>0){
    h+='<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.22);border-radius:var(--radius);padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">';
    if(alertasStock>0)h+='<span style="font-size:13px;color:#fbbf24"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i><strong>'+alertasStock+'</strong> artículo'+(alertasStock>1?'s':'')+' con stock bajo en almacén</span>';
    if(alertasStock>0&&s.pendientes>0)h+='<span style="color:rgba(255,255,255,.2);font-size:18px">·</span>';
    if(s.pendientes>0)h+='<span style="font-size:13px;color:#fbbf24"><i class="fas fa-clock" style="margin-right:6px"></i><strong>'+s.pendientes+'</strong> empleado'+(s.pendientes>1?'s':'')+' sin captura de tallas</span>';
    h+='</div>';
  }

  // KPIs principales — valores siempre blancos, color solo en borde superior
  h+='<div class="kpi-grid">';
  h+='<div class="kpi" style="border-top:2px solid #3b82f6"><div class="kpi-label">Empleados</div><div class="kpi-value">'+s.total+'</div><div class="kpi-sub">'+s.activos+' activos · '+s.bajas+' bajas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid '+pctColor+'"><div class="kpi-label">Captura de Tallas</div><div class="kpi-value">'+s.pct+'%</div><div class="kpi-sub">'+s.capturados+' listos · '+s.pendientes+' por capturar</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #22d3ee"><div class="kpi-label">Entregas Totales</div><div class="kpi-value">'+totalEnt+'</div><div class="kpi-sub">'+(totalEnt?Math.round(entConFirma/totalEnt*100):0)+'% firmadas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid '+cobColor+'"><div class="kpi-label">Cobertura '+thisYear+'</div><div class="kpi-value">'+cobertura+'%</div><div class="kpi-sub">'+empConEntrega.size+' de '+activos.length+' empleados</div></div>';
  if(isAdmin&&gastoTotal>0)h+='<div class="kpi" style="border-top:2px solid var(--success)"><div class="kpi-label">Inversión Total</div><div class="kpi-value" style="font-size:20px">'+fmtMoney(gastoTotal)+'</div><div class="kpi-sub">Uniformes + Almacén</div></div>';
  h+='<div class="kpi" style="border-top:2px solid '+(alertasStock>0?'var(--warning)':'var(--neutral)')+'"><div class="kpi-label">'+(alertasStock>0?'Stock Bajo':'Inactivos')+'</div><div class="kpi-value">'+(alertasStock>0?alertasStock:s.bajas)+'</div><div class="kpi-sub">'+(alertasStock>0?'artículos bajo mínimo':'no requieren captura')+'</div></div>';
  h+='</div>';

  // Área cards + panel de captura limpio (sin dona)
  const pctPend=s.total?Math.round(s.pendientes/s.total*100):0;
  const pctBajas=s.total?Math.round(s.bajas/s.total*100):0;
  h+='<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(220px,1fr);gap:12px;margin-bottom:20px">';
  h+='<div class="card"><div class="card-head"><h3>Estado por Área</h3><span class="text-xs text-muted">Captura de tallas '+thisYear+'</span></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:8px;padding:4px 16px 16px">';
  areas.forEach(a=>{const st2=calcStatsArea(a);const p=parseInt(st2.pct,10);const bc=p>=80?'#22c55e':p>=50?'#f59e0b':'#ef4444';const ai=areaIcon(a);h+='<div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2)"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div style="width:34px;height:34px;border-radius:7px;background:'+ai.color+';display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas '+ai.icon+'" style="color:#fff;font-size:13px"></i></div><div style="flex:1;min-width:0"><p style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0">'+a+'</p><p style="font-size:11px;color:var(--text-muted);margin:0">'+st2.total+' empleado'+(st2.total!==1?'s':'')+'</p></div></div><div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:5px"><span style="color:var(--text-muted)">'+st2.capturados+' listos</span><span style="font-weight:700;color:'+bc+'">'+p+'%</span></div><div style="height:3px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:'+p+'%;background:'+bc+';border-radius:999px;transition:width .5s ease"></div></div></div>';});
  h+='</div></div>';
  // Panel estado captura (reemplaza dona)
  h+='<div class="chart-box" style="display:flex;flex-direction:column">';
  h+='<div class="card-head"><h3>Estado de Captura</h3></div>';
  h+='<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:8px 0 4px">';
  h+='<div style="text-align:center;padding:20px 0 24px"><div style="font-size:52px;font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--text)">'+s.pct+'<span style="font-size:22px;font-weight:600;color:var(--text-muted)">%</span></div><div style="font-size:11px;color:var(--text-muted);margin-top:5px;text-transform:uppercase;letter-spacing:.07em">captura completada</div></div>';
  h+='<div style="border-top:1px solid var(--border);padding-top:14px;display:flex;flex-direction:column;gap:10px">';
  h+='<div><div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="font-size:11.5px;color:var(--text-sec);display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--success)"></span>Capturados</span><strong style="font-size:12px">'+s.capturados+'</strong></div><div style="height:3px;background:var(--border);border-radius:999px"><div style="width:'+s.pct+'%;height:100%;background:var(--success);border-radius:999px"></div></div></div>';
  h+='<div><div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="font-size:11.5px;color:var(--text-sec);display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--warning)"></span>Pendientes</span><strong style="font-size:12px">'+s.pendientes+'</strong></div><div style="height:3px;background:var(--border);border-radius:999px"><div style="width:'+pctPend+'%;height:100%;background:var(--warning);border-radius:999px"></div></div></div>';
  h+='<div><div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="font-size:11.5px;color:var(--text-sec);display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--neutral)"></span>Bajas/Mov.</span><strong style="font-size:12px">'+s.bajas+'</strong></div><div style="height:3px;background:var(--border);border-radius:999px"><div style="width:'+pctBajas+'%;height:100%;background:var(--neutral);border-radius:999px"></div></div></div>';
  h+='</div></div></div>';
  h+='</div>';

  // ── Gráficas de almacén nuevo ───────────────────────────────────────────────
  const entregasNuevas=getEntregasNuevas();
  const devolucionesNuevas=getDevolucionesNuevas();
  const salidasNuevas=getSalidasNuevas();

  const entregasMes=entregasNuevas.filter(e=>e.fecha_hora.startsWith(mesActual));
  const devolucionesMes=devolucionesNuevas.filter(d=>d.fecha_hora.startsWith(mesActual));
  const salidasMes=salidasNuevas.filter(s=>s.fecha_hora.startsWith(mesActual));

  const pzasEntregadas=entregasMes.reduce((sum,e)=>{
    const lineas=getStore().lineasEntrega.filter(l=>l.entrega_id===e.id);
    return sum+lineas.reduce((s,l)=>s+l.cantidad,0);
  },0);
  const productosMap=new Map(getStore().productos.map(p=>[p.id,p]));
  const lineasEntrega=getStore().lineasEntrega||[];
  const entregasPersonalMes=entregasMes.filter(e=>entregaTipo(e,productosMap,lineasEntrega)==='personal');
  const entregasConsumibleMes=entregasMes.filter(e=>entregaTipo(e,productosMap,lineasEntrega)==='consumible');
  const personalPorEmpleado=new Map();
  const consumiblePorProducto=new Map();
  entregasPersonalMes.forEach(e=>sumarPor(personalPorEmpleado,e.quien_recibe||e.empleado_nombre||'Sin empleado',entregaPiezas(e,lineasEntrega)));
  entregasConsumibleMes.forEach(e=>{
    lineasEntrega.filter(l=>l.entrega_id===e.id).forEach(l=>sumarPor(consumiblePorProducto,productosMap.get(l.producto_id)?.nombre||'Producto',Number(l.cantidad)||0));
  });

  const pzasDevueltas=devolucionesMes.reduce((sum,d)=>{
    const lineas=getStore().lineasDevolucion.filter(l=>l.devolucion_id===d.id);
    return sum+lineas.reduce((s,l)=>s+l.cantidad,0);
  },0);

  const pzasSalidas=salidasMes.reduce((sum,s)=>{
    const lineas=getStore().lineasSalida.filter(l=>l.salida_id===s.id);
    return sum+lineas.reduce((s,l)=>s+l.cantidad,0);
  },0);

  h+='<div style="margin-bottom:20px">';
  h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">';
  h+='<i class="fas fa-boxes" style="color:#7c3aed;font-size:16px"></i>';
  h+='<h3 style="font-size:14px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase">Almacén Unificado</h3>';
  h+='</div>';

  // KPIs Almacén
  h+='<div class="kpi-grid">';
  const productos=getProductos();
  const totalPzasStock=productos.reduce((sum,p)=>{const st=p.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(v.stock_actual||0),0):(p.stock_actual||0);return sum+st;},0);
  const prodConStock=productos.filter(p=>{const st=p.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(v.stock_actual||0),0):(p.stock_actual||0);return st>0;}).length;
  const prodBajoMinimo=productos.filter(esAlertaNivel1).length;
  financialChartData=isAdmin?buildFinancialDashboardData():null;

  h+='<div class="kpi" style="border-top:2px solid #7c3aed"><div class="kpi-label">Productos</div><div class="kpi-value">'+productos.length+'</div><div class="kpi-sub">'+prodConStock+' con stock</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #2563eb"><div class="kpi-label">Piezas en Stock</div><div class="kpi-value">'+totalPzasStock+'</div><div class="kpi-sub">unidades físicas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #059669"><div class="kpi-label">Entregas — '+now.toLocaleDateString('es-MX',{month:'short'})+'</div><div class="kpi-value">'+entregasMes.length+'</div><div class="kpi-sub">'+pzasEntregadas+' piezas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #22c55e"><div class="kpi-label">Entregas Personal</div><div class="kpi-value">'+entregasPersonalMes.length+'</div><div class="kpi-sub">'+entregasPersonalMes.reduce((sum,e)=>sum+entregaPiezas(e,lineasEntrega),0)+' piezas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #2563eb"><div class="kpi-label">Entregas Consumible</div><div class="kpi-value">'+entregasConsumibleMes.length+'</div><div class="kpi-sub">'+entregasConsumibleMes.reduce((sum,e)=>sum+entregaPiezas(e,lineasEntrega),0)+' piezas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #0891b2"><div class="kpi-label">Devoluciones — '+now.toLocaleDateString('es-MX',{month:'short'})+'</div><div class="kpi-value">'+devolucionesMes.length+'</div><div class="kpi-sub">'+pzasDevueltas+' piezas</div></div>';
  if(prodBajoMinimo>0)h+='<div class="kpi" style="border-top:2px solid #dc2626"><div class="kpi-label"><i class="fas fa-exclamation-triangle mr-1" style="color:#dc2626"></i>Bajo Mínimo</div><div class="kpi-value" style="color:#dc2626">'+prodBajoMinimo+'</div><div class="kpi-sub">requieren reposición</div></div>';
  h+='</div>';

  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:12px 0 20px">';
  h+='<div class="card"><div class="card-head"><h3>Personal por empleado</h3><span class="text-xs text-muted">'+now.toLocaleDateString('es-MX',{month:'short'})+'</span></div><div style="padding:0 16px 16px">';
  h+=(Array.from(personalPorEmpleado.values()).sort((a,b)=>b.piezas-a.piezas).slice(0,5).map(x=>'<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>'+esc(x.label)+'</span><strong>'+x.piezas+'</strong></div>').join('')||'<p class="text-muted" style="padding:12px 0">Sin entregas personal</p>');
  h+='</div></div>';
  h+='<div class="card"><div class="card-head"><h3>Consumible por producto</h3><span class="text-xs text-muted">'+now.toLocaleDateString('es-MX',{month:'short'})+'</span></div><div style="padding:0 16px 16px">';
  h+=(Array.from(consumiblePorProducto.values()).sort((a,b)=>b.piezas-a.piezas).slice(0,5).map(x=>'<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>'+esc(x.label)+'</span><strong>'+x.piezas+'</strong></div>').join('')||'<p class="text-muted" style="padding:12px 0">Sin entregas consumible</p>');
  h+='</div></div></div>';

  if(isAdmin)h+=renderFinancialSection(financialChartData);

  // Productos bajo mínimo
  const bajoMinimo=productos.filter(esAlertaNivel1).slice(0,8);
  if(bajoMinimo.length){
    h+='<div class="card mt-3"><div class="card-head"><h3><i class="fas fa-exclamation-triangle mr-2" style="color:#dc2626"></i>Productos que requieren atención</h3><span class="text-xs text-muted">'+bajoMinimo.length+' en alerta</span></div>';
    h+='<div class="table-wrap"><table class="dt" style="font-size:13px"><thead><tr><th>Producto</th><th>SKU</th><th style="text-align:right">Stock</th><th style="text-align:right">Mínimo</th><th style="text-align:center">Estado</th></tr></thead><tbody>';
    h+=bajoMinimo.map(p=>{
      const st=p.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(v.stock_actual||0),0):(p.stock_actual||0);
      return'<tr><td class="text-sm font-bold">'+esc(p.nombre)+'</td><td><code style="font-weight:800;font-size:11px;color:var(--primary)">'+esc(p.sku)+'</code></td><td style="text-align:right;font-size:16px;font-weight:900;color:#dc2626">'+st+'</td><td style="text-align:right;font-size:13px;color:var(--text-muted)">'+p.stock_minimo+'</td><td style="text-align:center"><span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700"><i class="fas fa-exclamation-triangle mr-1"></i>'+esc(p.nombre)+': '+st+' (mínimo '+p.stock_minimo+')</span></td></tr>';
    }).join('');
    h+='</tbody></table></div></div>';
  }
  h+='</div>';

  // Detail table
  h+='<div class="card"><div class="card-head"><h3>Detalle por Área</h3><span class="text-xs text-muted">Temporada '+thisYear+'</span></div><div class="table-wrap"><table class="dt"><thead><tr><th>Área</th><th style="text-align:center">Total</th><th style="text-align:center">Capturados</th><th style="text-align:center">Pendientes</th><th style="text-align:center">Bajas</th><th>Progreso</th></tr></thead><tbody>';
  areas.forEach(a=>{const st2=calcStatsArea(a);const p=parseInt(st2.pct,10);const bc=p>=80?'var(--success)':p>=50?'var(--warning)':'var(--danger)';h+='<tr><td>'+buildAreaBadge(a)+'</td><td style="text-align:center;font-weight:700">'+st2.total+'</td><td style="text-align:center;color:var(--success);font-weight:700">'+st2.capturados+'</td><td style="text-align:center;color:var(--warning)">'+st2.pendientes+'</td><td style="text-align:center;color:var(--info)">'+st2.bajas+'</td><td style="min-width:160px"><div class="flex items-center gap-2"><div class="progress" style="flex:1;height:8px"><div class="progress-bar" style="width:'+st2.pct+'%;background:'+bc+'"></div></div><span class="text-xs font-bold" style="color:'+bc+';min-width:36px">'+st2.pct+'%</span></div></td></tr>';});
  h+='</tbody></table></div></div>';
  return h;
}

function legacyInit(){
  if(getUserRole()==='admin')initFinancialCharts();
}

const EXEC_MONTHS=[
  ['01','Enero'],['02','Febrero'],['03','Marzo'],['04','Abril'],['05','Mayo'],['06','Junio'],
  ['07','Julio'],['08','Agosto'],['09','Septiembre'],['10','Octubre'],['11','Noviembre'],['12','Diciembre']
];
const EXEC_OUTPUT_TYPES=new Set(['salida_entrega','entrega','salida_colocacion','salida_uso_interno','salida','salida_merma','merma','salida_ajuste','ajuste_negativo']);
const EXEC_MERMA_TYPES=new Set(['merma','salida_merma']);
const EXEC_ENTRADA_TYPES=new Set(['entrada_compra','entrada','inventario_inicial','ajuste_positivo']);
const EXEC_DEVOLUCION_TYPES=new Set(['entrada_devolucion','devolucion']);
const EXEC_DETAIL_LABELS={
  resumen:'Movimientos recientes',
  inventario:'Inventario filtrado',
  bajoStock:'Productos bajo stock',
  sinCosto:'Productos sin costo configurado',
  entradas:'Detalle de entradas',
  salidas:'Detalle de salidas',
  entregas:'Detalle de entregas',
  devoluciones:'Detalle de devoluciones',
  mermas:'Detalle de mermas',
  producto:'Detalle del producto'
};
const EXEC_TYPE_LABELS={
  entrada_compra:'Entrada compra',
  inventario_inicial:'Inventario inicial',
  ajuste_positivo:'Ajuste positivo',
  salida_entrega:'Entrega',
  salida_colocacion:'Salida colocación',
  salida_merma:'Merma',
  merma:'Merma',
  salida_ajuste:'Salida ajuste',
  salida_devolucion_proveedor:'Devolución proveedor',
  salida_uso_interno:'Uso interno',
  entrada_devolucion:'Devolución',
  ajuste_negativo:'Ajuste negativo',
  entrada:'Entrada',
  salida:'Salida',
  entrega:'Entrega',
  devolucion:'Devolución'
};
const EXEC_NOW=new Date();
const execDefaultFilters=()=>({
  year:String(EXEC_NOW.getFullYear()),
  month:String(EXEC_NOW.getMonth()+1).padStart(2,'0'),
  area:'',
  categoria:'',
  nivel:'',
  tipo:'',
  sitio:'',
  origen:''
});
let execFilters=execDefaultFilters();
let execActiveDetail='resumen';
let execActiveProduct='';

function execDateValue(x){return String(x?.fecha_hora||x?.fecha||x?.fecha_creacion||'');}
function execDateKey(x){return execDateValue(x).slice(0,10);}
function execMonthKey(x){return execDateValue(x).slice(0,7);}
function execTipo(m){return m?.tipo||m?.tipo_movimiento||'';}
function execAbsQty(x){return Math.abs(Number(x?.cantidad)||0);}
function execStock(p){return p?.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(Number(v.stock_actual)||0),0):(Number(p?.stock_actual)||0);}
function execUnitCost(p,varianteId=null){
  return p?getCostoUnitarioProducto(p.id,varianteId)||0:0;
}
function execInventoryValue(p){
  return getValorInventarioProducto(p).valor;
}
function execHasCost(p){
  return productoTieneCosto(p);
}
function execCategoryName(p,categorias){
  return categorias.get(p?.categoria_id)?.nombre||p?.categoria_nombre||p?.categoria||'Sin categoría';
}
function execProviderName(p){
  return(p?.proveedor_frecuente||p?.proveedor||p?.proveedor_nombre||'').trim();
}
function execNivel(p){return Number(p?.nivel_control||3);}
function execLowStock(p){
  if(!p)return false;
  if(p.es_por_variante&&Array.isArray(p.variantes)&&p.variantes.length){
    return p.variantes.some(v=>{
      const min=Number(v.stock_minimo||p.stock_minimo);
      return min>0&&(Number(v.stock_actual)||0)<=min;
    });
  }
  const min=Number(p.stock_minimo);
  return min>0&&execStock(p)<=min;
}
function execPeriodoOk(x,filters=execFilters){
  const key=execMonthKey(x);
  if(!key)return false;
  if(filters.year&&key.slice(0,4)!==filters.year)return false;
  if(filters.month&&key.slice(5,7)!==filters.month)return false;
  return true;
}
function execProductOk(p,filters=execFilters,categorias=new Map()){
  if(!p)return false;
  if(filters.categoria&&String(p.categoria_id)!==String(filters.categoria)&&execCategoryName(p,categorias)!==filters.categoria)return false;
  if(filters.nivel&&execNivel(p)!==Number(filters.nivel))return false;
  return true;
}
function execEmployeeById(store,id){return(store.employees||[]).find(e=>String(e.id)===String(id));}
function execDocArea(doc,store){
  if(doc?.area)return doc.area;
  const emp=execEmployeeById(store,doc?.empleado_id||doc?.empleadoId);
  return emp?.area||'';
}
function execDocSitio(doc,store){
  if(doc?.sitio)return doc.sitio;
  const emp=execEmployeeById(store,doc?.empleado_id||doc?.empleadoId);
  return emp?.sitio||'';
}
function execDocOk(doc,filters,store){
  if(!doc)return false;
  if(!execPeriodoOk(doc,filters))return false;
  if(filters.area&&execDocArea(doc,store)!==filters.area)return false;
  if(filters.sitio&&execDocSitio(doc,store)!==filters.sitio)return false;
  return true;
}
function execMovementDoc(m,store){
  const id=m.documento_id;
  if(!id)return null;
  if(m.documento_tipo==='entrega')return(store.entregasNuevas||[]).find(x=>x.id===id)||null;
  if(m.documento_tipo==='devolucion')return(store.devolucionesNuevas||[]).find(x=>x.id===id)||null;
  if(m.documento_tipo==='entrada')return(store.entradas||[]).find(x=>x.id===id)||null;
  if(m.documento_tipo==='salida')return(store.salidasNuevas||[]).find(x=>x.id===id)||null;
  return(store.entregasNuevas||[]).find(x=>x.id===id)||(store.devolucionesNuevas||[]).find(x=>x.id===id)||(store.salidasNuevas||[]).find(x=>x.id===id)||(store.entradas||[]).find(x=>x.id===id)||null;
}
function execMovementOk(m,filters,store,productosMap,categorias){
  if(!execPeriodoOk(m,filters))return false;
  if(filters.tipo&&execTipo(m)!==filters.tipo)return false;
  const p=productosMap.get(m.producto_id);
  if(!execProductOk(p,filters,categorias))return false;
  const doc=execMovementDoc(m,store);
  if(filters.area){
    const area=execDocArea(doc,store);
    if(area!==filters.area)return false;
  }
  if(filters.sitio){
    const sitio=execDocSitio(doc,store);
    if(sitio!==filters.sitio)return false;
  }
  return true;
}
function execLineCost(linea,p){
  return(Number(linea?.cantidad)||0)*execUnitCost(p,linea?.variante_id||null);
}
function execEntradaUnitCost(linea,p){
  const cantidad=Number(linea?.cantidad)||0;
  const total=Number(linea?.costo_total)||0;
  return Number(linea?.costo_unitario)||((cantidad>0&&total>0)?total/cantidad:0)||execUnitCost(p,linea?.variante_id||null);
}
function execPushMetric(map,key,label,patch){
  const item=map.get(key)||{id:key,label,piezas:0,costo:0,docs:0};
  item.piezas+=Number(patch.piezas)||0;
  item.costo+=Number(patch.costo)||0;
  item.docs+=Number(patch.docs)||0;
  map.set(key,item);
}
function execBuildLineRows(kind,store,filters,productosMap,categorias){
  const rows=[];
  const productsMatch=linea=>execProductOk(productosMap.get(linea.producto_id),filters,categorias);
  if(kind==='entradas'){
    (store.entradas||[]).forEach(doc=>{
      if(!execDocOk(doc,filters,store))return;
      if(filters.tipo&&!EXEC_ENTRADA_TYPES.has(filters.tipo))return;
      (store.lineasEntrada||[]).filter(l=>l.entrada_id===doc.id&&productsMatch(l)).forEach(l=>{
        const p=productosMap.get(l.producto_id);
        const unit=execEntradaUnitCost(l,p);
        rows.push({fecha:execDateKey(doc),tipo:'Entrada',documento:doc.numero||doc.id,producto:p?.nombre||l.producto_id,cantidad:Number(l.cantidad)||0,costo:unit?(Number(l.cantidad)||0)*unit:0,unitario:unit,area:'No disponible',empleado:'No disponible',proveedor:doc.proveedor||execProviderName(p)||'No disponible',producto_id:l.producto_id});
      });
    });
  }
  if(kind==='entregas'){
    (store.entregasNuevas||[]).forEach(doc=>{
      if(!execDocOk(doc,filters,store))return;
      if(filters.origen&&(doc.origen||'salida_normal')!==filters.origen)return;
      if(filters.tipo&&!['salida_entrega','entrega'].includes(filters.tipo))return;
      (store.lineasEntrega||[]).filter(l=>l.entrega_id===doc.id&&productsMatch(l)).forEach(l=>{
        const p=productosMap.get(l.producto_id);
        rows.push({fecha:execDateKey(doc),tipo:'Entrega',documento:doc.numero||doc.id,producto:p?.nombre||l.producto_id,cantidad:Number(l.cantidad)||0,costo:execLineCost(l,p),unitario:execUnitCost(p,l.variante_id),area:execDocArea(doc,store)||'No disponible',empleado:doc.quien_recibe||doc.empleado_nombre||'No disponible',proveedor:execProviderName(p)||'No disponible',producto_id:l.producto_id});
      });
    });
  }
  if(kind==='salidas'){
    const salidaTipoMap={colocacion:'salida_colocacion',merma:'salida_merma',ajuste:'salida_ajuste',devolucion_proveedor:'salida_devolucion_proveedor',uso_interno:'salida_uso_interno'};
    (store.salidasNuevas||[]).forEach(doc=>{
      if(!execDocOk(doc,filters,store))return;
      const tipoMov=salidaTipoMap[doc.tipo]||'salida';
      if(filters.tipo&&filters.tipo!==tipoMov&&filters.tipo!=='salida')return;
      (store.lineasSalida||[]).filter(l=>l.salida_id===doc.id&&productsMatch(l)).forEach(l=>{
        const p=productosMap.get(l.producto_id);
        rows.push({fecha:execDateKey(doc),tipo:EXEC_TYPE_LABELS[tipoMov]||doc.tipo||'Salida',documento:doc.numero||doc.id,producto:p?.nombre||l.producto_id,cantidad:Number(l.cantidad)||0,costo:execLineCost(l,p),unitario:execUnitCost(p,l.variante_id),area:'No disponible',empleado:doc.autorizado_por||'No disponible',proveedor:execProviderName(p)||'No disponible',producto_id:l.producto_id});
      });
    });
  }
  if(kind==='devoluciones'){
    (store.devolucionesNuevas||[]).forEach(doc=>{
      if(!execDocOk(doc,filters,store))return;
      if(filters.tipo&&!EXEC_DEVOLUCION_TYPES.has(filters.tipo))return;
      (store.lineasDevolucion||[]).filter(l=>l.devolucion_id===doc.id&&productsMatch(l)).forEach(l=>{
        const p=productosMap.get(l.producto_id);
        rows.push({fecha:execDateKey(doc),tipo:'Devolución',documento:doc.numero||doc.id,producto:p?.nombre||l.producto_id,cantidad:Number(l.cantidad)||0,costo:execLineCost(l,p),unitario:execUnitCost(p,l.variante_id),area:execDocArea(doc,store)||'No disponible',empleado:doc.empleado_nombre||'No disponible',proveedor:execProviderName(p)||'No disponible',producto_id:l.producto_id});
      });
    });
  }
  return rows.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
}
function execLastMonthKey(filters,offset){
  const year=Number(filters.year||EXEC_NOW.getFullYear());
  const month=Number(filters.month||String(EXEC_NOW.getMonth()+1).padStart(2,'0'))-1;
  const d=new Date(year,month-offset,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function execTrendKeys(filters,count=6){
  const keys=[];
  for(let i=count-1;i>=0;i--)keys.push(execLastMonthKey(filters,i));
  return keys;
}
function execDelta(current,previous){
  if(!previous&&current>0)return'Sin histórico';
  if(!previous)return'Sin variación';
  const pct=Math.round(((current-previous)/previous)*100);
  return(pct>=0?'+':'')+pct+'% vs mes anterior';
}
function execDotacionStats(store,filters){
  const dotaciones=store.dotaciones||[];
  if(!dotaciones.length)return{available:false};
  const active=dotaciones.find(d=>d.estado==='activa')||dotaciones.slice().sort((a,b)=>Number(b.anio||0)-Number(a.anio||0))[0];
  const activos=(store.employees||[]).filter(e=>e.estado==='activo'&&(!filters.area||e.area===filters.area)&&(!filters.sitio||e.sitio===filters.sitio));
  const conTipo=activos.filter(e=>e.tipo_dotacion).length;
  const entregas=(store.dotacionEntregas||[]).filter(e=>e.dotacion_id===active.id&&e.estado!=='cancelada');
  const entregados=new Set(entregas.map(e=>String(e.empleado_id)));
  return{available:true,nombre:active.nombre||('Dotación '+(active.anio||'')),cobertura:activos.length?Math.round(conTipo/activos.length*100):0,avance:activos.length?Math.round(entregados.size/activos.length*100):0,activos:activos.length,conTipo,entregados:entregados.size};
}
function execBuildData(filters=execFilters){
  const store=getStore();
  const categorias=new Map((store.categorias||[]).map(c=>[c.id,c]));
  const productosAll=getProductos();
  const productosMap=new Map(productosAll.map(p=>[p.id,p]));
  const productos=productosAll.filter(p=>execProductOk(p,filters,categorias));
  const movimientos=getMovimientos().filter(m=>execMovementOk(m,filters,store,productosMap,categorias));
  const entradas=execBuildLineRows('entradas',store,filters,productosMap,categorias);
  const entregas=execBuildLineRows('entregas',store,filters,productosMap,categorias);
  const salidas=execBuildLineRows('salidas',store,filters,productosMap,categorias);
  const devoluciones=execBuildLineRows('devoluciones',store,filters,productosMap,categorias);
  const mermasMov=movimientos.filter(m=>EXEC_MERMA_TYPES.has(execTipo(m))).map(m=>{
    const p=productosMap.get(m.producto_id);
    const unit=Number(m.costo_unitario)||execUnitCost(p,m.variante_id||null);
    return{fecha:execDateKey(m),tipo:'Merma',documento:m.documento_id||m.id,producto:p?.nombre||m.producto_nombre||m.producto_id,cantidad:execAbsQty(m),costo:execAbsQty(m)*unit,unitario:unit,area:execDocArea(execMovementDoc(m,store),store)||'No disponible',empleado:m.usuario||'No disponible',proveedor:execProviderName(p)||'No disponible',producto_id:m.producto_id,motivo:m.motivo||m.observaciones||''};
  });
  const stockByLevel=[1,2,3,4].map(n=>({nivel:n,stock:productos.filter(p=>execNivel(p)===n).reduce((s,p)=>s+execStock(p),0),productos:productos.filter(p=>execNivel(p)===n).length}));
  const bajoStock=productos.filter(execLowStock).sort((a,b)=>execInventoryValue(b)-execInventoryValue(a));
  const sinCosto=productos.filter(p=>!execHasCost(p)).sort((a,b)=>execStock(b)-execStock(a));
  const totalStock=productos.reduce((s,p)=>s+execStock(p),0);
  const valorInventario=productos.reduce((s,p)=>s+execInventoryValue(p),0);
  const hasInventoryCost=productos.some(p=>execInventoryValue(p)>0);
  const inventoryCostIncomplete=productos.some(p=>getValorInventarioProducto(p).sinCosto);
  const consumoMap=new Map();
  movimientos.filter(m=>EXEC_OUTPUT_TYPES.has(execTipo(m))&&!EXEC_MERMA_TYPES.has(execTipo(m))).forEach(m=>{
    const p=productosMap.get(m.producto_id);if(!p)return;
    const qty=execAbsQty(m);const cost=qty*(Number(m.costo_unitario)||execUnitCost(p,m.variante_id||null));
    execPushMetric(consumoMap,p.id,p.nombre,{piezas:qty,costo:cost,docs:1});
  });
  if(!consumoMap.size)entregas.concat(salidas).forEach(r=>execPushMetric(consumoMap,r.producto_id,r.producto,{piezas:r.cantidad,costo:r.costo,docs:1}));
  const topConsumo=Array.from(consumoMap.values()).sort((a,b)=>b.piezas-a.piezas).slice(0,5);
  const topCosto=productos.map(p=>({id:p.id,label:p.nombre,piezas:execStock(p),costo:execInventoryValue(p),docs:0})).filter(x=>x.costo>0).sort((a,b)=>b.costo-a.costo).slice(0,5);
  const currentKey=(filters.year||'')+'-'+(filters.month||'');
  const prevKey=execLastMonthKey(filters,1);
  const monthCount=(rows,key)=>rows.filter(r=>String(r.fecha).startsWith(key)).length;
  const trendKeys=execTrendKeys(filters,6);
  const trend=trendKeys.map(key=>({key,label:new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1,1).toLocaleDateString('es-MX',{month:'short',year:'2-digit'}),entradas:monthCount(entradas,key),entregas:monthCount(entregas,key),salidas:monthCount(salidas,key),mermas:mermasMov.filter(r=>String(r.fecha).startsWith(key)).reduce((s,r)=>s+r.costo,0)}));
  const mermasCost=mermasMov.reduce((s,r)=>s+r.costo,0);
  const mermasCostAvailable=!mermasMov.length||mermasMov.every(r=>r.unitario>0);
  const dataQuality=getAlmacenDataQuality();
  return{store,categorias,productosAll,productos,productosMap,movimientos,entradas,entregas,salidas,devoluciones,mermas:mermasMov,stockByLevel,bajoStock,sinCosto,totalStock,valorInventario,hasInventoryCost,inventoryCostIncomplete,topConsumo,topCosto,currentKey,prevKey,trend,dotacion:execDotacionStats(store,filters),dataQuality,kpi:{entradas:entradas.length,salidas:salidas.length,entregas:entregas.length,devoluciones:devoluciones.length,mermas:mermasMov.length,mermasCost,mermasCostAvailable,entradasPrev:monthCount(entradas,prevKey),salidasPrev:monthCount(salidas,prevKey),entregasPrev:monthCount(entregas,prevKey),devolucionesPrev:monthCount(devoluciones,prevKey),mermasPrev:mermasMov.filter(r=>String(r.fecha).startsWith(prevKey)).length}};
}
function execOptions(values,selected){
  return values.map(v=>'<option value="'+esc(v.value)+'"'+(String(v.value)===String(selected)?' selected':'')+'>'+esc(v.label)+'</option>').join('');
}
function execFilterOptions(data){
  const store=data.store;
  const dateItems=[...(store.movimientos||[]),...(store.entradas||[]),...(store.entregasNuevas||[]),...(store.salidasNuevas||[]),...(store.devolucionesNuevas||[])];
  const years=Array.from(new Set(dateItems.map(x=>execDateValue(x).slice(0,4)).filter(Boolean).concat(String(EXEC_NOW.getFullYear())))).sort().reverse();
  const areas=Array.from(new Set(getAreaNames().concat((store.entregasNuevas||[]).map(e=>e.area)).concat((store.devolucionesNuevas||[]).map(e=>e.area)).filter(Boolean))).sort();
  const cats=(store.categorias||[]).map(c=>({value:c.id,label:c.nombre}));
  const tipos=Array.from(new Set((store.movimientos||[]).map(execTipo).filter(Boolean).concat(['entrada_compra','salida_entrega','salida_merma','entrada_devolucion']))).sort().map(t=>({value:t,label:EXEC_TYPE_LABELS[t]||t}));
  const sitios=Array.from(new Set((store.employees||[]).map(e=>e.sitio).filter(Boolean))).sort();
  return{years,areas,cats,tipos,sitios};
}
function execStatusBadge(status,label){
  const cls=status==='danger'?'badge-danger':status==='warning'?'badge-warning':status==='success'?'badge-success':'badge-info';
  return'<span class="badge '+cls+'">'+esc(label)+'</span>';
}
function execKpi({label,value,sub,note,status='info',drill,available=true,icon='fa-chart-line'}){
  const detail=drill?'<button class="exec-link" data-drill="'+drill+'">Ver detalle</button>':'';
  return'<div class="exec-kpi '+(drill?'is-clickable':'')+'" '+(drill?'data-drill="'+drill+'"':'')+'><div class="exec-kpi-top"><span class="exec-kpi-icon '+status+'"><i class="fas '+icon+'"></i></span>'+execStatusBadge(status,status==='danger'?'Crítico':status==='warning'?'Atención':status==='success'?'En orden':'Info')+'</div><div class="exec-kpi-label">'+esc(label)+'</div><div class="exec-kpi-value '+(!available?'is-na':'')+'">'+(available?value:'No disponible')+'</div><div class="exec-kpi-sub">'+esc(sub||'')+'</div>'+(note?'<div class="exec-kpi-note">'+esc(note)+'</div>':'')+detail+'</div>';
}
function execRenderFilters(data){
  const opts=execFilterOptions(data);
  return'<div class="exec-filterbar"><div class="form-group"><label class="form-label">Año</label><select class="form-select" id="execYear">'+execOptions(opts.years.map(y=>({value:y,label:y})),execFilters.year)+'</select></div><div class="form-group"><label class="form-label">Mes</label><select class="form-select" id="execMonth"><option value="">Todos</option>'+execOptions(EXEC_MONTHS.map(([v,l])=>({value:v,label:l})),execFilters.month)+'</select></div><div class="form-group"><label class="form-label">Área</label><select class="form-select" id="execArea"><option value="">Todas</option>'+execOptions(opts.areas.map(a=>({value:a,label:a})),execFilters.area)+'</select></div><div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="execCategoria"><option value="">Todas</option>'+execOptions(opts.cats,execFilters.categoria)+'</select></div><div class="form-group"><label class="form-label">Nivel</label><select class="form-select" id="execNivel"><option value="">Todos</option>'+execOptions([1,2,3,4].map(n=>({value:String(n),label:'Nivel '+n})),execFilters.nivel)+'</select></div><div class="form-group"><label class="form-label">Movimiento</label><select class="form-select" id="execTipo"><option value="">Todos</option>'+execOptions(opts.tipos,execFilters.tipo)+'</select></div>'+(opts.sitios.length?'<div class="form-group"><label class="form-label">Sitio</label><select class="form-select" id="execSitio"><option value="">Todos</option>'+execOptions(opts.sitios.map(s=>({value:s,label:s})),execFilters.sitio)+'</select></div>':'')+'<div class="form-group"><label class="form-label">Origen</label><select class="form-select" id="execOrigen"><option value="">Todos</option><option value="dotacion_anual"'+(execFilters.origen==='dotacion_anual'?' selected':'')+'>Dotación anual</option><option value="salida_normal"'+(execFilters.origen==='salida_normal'?' selected':'')+'>Salidas normales</option></select></div>'+'<button class="btn btn-ghost" id="execClearFilters"><i class="fas fa-filter-circle-xmark"></i> Limpiar filtros</button></div>';
}
function execRenderTopList(items,mode){
  if(!items.length)return'<div class="exec-empty-inline">Sin datos</div>';
  const max=Math.max(...items.map(x=>mode==='cost'?x.costo:x.piezas),1);
  return items.map((x,i)=>{
    const val=mode==='cost'?x.costo:x.piezas;
    return'<button class="exec-rank-row" data-product="'+esc(x.id)+'"><span class="exec-rank-pos">'+(i+1)+'</span><span class="exec-rank-main"><strong>'+esc(x.label)+'</strong><span>'+(mode==='cost'?fmtMoney(x.costo):fmt(x.piezas)+' piezas')+'</span></span><span class="exec-rank-bar"><i style="width:'+Math.max(4,Math.round(val/max*100))+'%"></i></span></button>';
  }).join('');
}
function execRenderCharts(data){
  return'<div class="exec-chart-grid"><div class="exec-panel"><div class="exec-panel-head"><div><h3>Top consumo</h3><p>Productos con mayor salida del periodo</p></div></div>'+(data.topConsumo.length?'<canvas id="execTopConsumo"></canvas>':'<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Sin datos</p></div>')+'</div><div class="exec-panel"><div class="exec-panel-head"><div><h3>Tendencia mensual</h3><p>Entradas, entregas y costo de mermas</p></div></div><canvas id="execTrend"></canvas></div><div class="exec-panel"><div class="exec-panel-head"><div><h3>Stock por nivel</h3><p>Unidades actuales por nivel de control</p></div></div><canvas id="execStockNivel"></canvas></div></div>';
}
function execProductRows(products,data){
  if(!products.length)return'<tr><td colspan="7" class="empty-state"><i class="fas fa-box-open"></i><p>Sin datos</p></td></tr>';
  return products.map(p=>'<tr><td><button class="exec-table-link" data-product="'+esc(p.id)+'">'+esc(p.nombre)+'</button><div class="text-xs text-muted">'+esc(p.sku||'Sin SKU')+'</div></td><td>'+esc(execCategoryName(p,data.categorias))+'</td><td class="text-center">Nivel '+execNivel(p)+'</td><td class="text-right">'+fmt(execStock(p))+'</td><td class="text-right">'+(execHasCost(p)?fmtMoney(execUnitCost(p)):'No disponible')+'</td><td class="text-right">'+(execInventoryValue(p)>0?fmtMoney(execInventoryValue(p)):'No disponible')+'</td><td>'+(execLowStock(p)?execStatusBadge('warning','Bajo stock'):execStatusBadge('success','OK'))+'</td></tr>').join('');
}
function execMovementRows(rows){
  if(!rows.length)return'<tr><td colspan="9" class="empty-state"><i class="fas fa-list"></i><p>Sin datos</p></td></tr>';
  return rows.slice(0,80).map(r=>'<tr><td class="text-xs">'+fmtDate(r.fecha)+'</td><td>'+esc(r.tipo)+'</td><td>'+esc(r.documento||'No disponible')+'</td><td><button class="exec-table-link" data-product="'+esc(r.producto_id||'')+'">'+esc(r.producto)+'</button></td><td>'+esc(r.area||'No disponible')+'</td><td>'+esc(r.empleado||'No disponible')+'</td><td class="text-right">'+fmt(r.cantidad)+'</td><td class="text-right">'+(r.unitario>0?fmtMoney(r.unitario):'No disponible')+'</td><td class="text-right">'+(r.costo>0?fmtMoney(r.costo):'No disponible')+'</td></tr>').join('');
}
function execRecentMovementRows(data){
  const rows=data.movimientos.slice(0,80).map(m=>{
    const p=data.productosMap.get(m.producto_id);
    const unit=Number(m.costo_unitario)||execUnitCost(p,m.variante_id||null);
    const doc=execMovementDoc(m,data.store);
    return{fecha:execDateKey(m),tipo:EXEC_TYPE_LABELS[execTipo(m)]||execTipo(m)||'Movimiento',documento:m.documento_id||m.id,producto:p?.nombre||m.producto_nombre||m.producto_id,producto_id:m.producto_id,area:execDocArea(doc,data.store)||'No disponible',empleado:doc?.quien_recibe||doc?.empleado_nombre||m.usuario||'No disponible',cantidad:Number(m.cantidad)||0,unitario:unit,costo:execAbsQty(m)*unit};
  });
  return execMovementRows(rows);
}
function execRenderDetail(data){
  let table='';
  if(execActiveDetail==='bajoStock')table='<table class="dt"><thead><tr><th>Producto</th><th>Categoría</th><th>Nivel</th><th class="text-right">Stock</th><th class="text-right">Costo</th><th class="text-right">Valor</th><th>Estado</th></tr></thead><tbody>'+execProductRows(data.bajoStock,data)+'</tbody></table>';
  else if(execActiveDetail==='sinCosto')table='<table class="dt"><thead><tr><th>Producto</th><th>Categoría</th><th>Nivel</th><th class="text-right">Stock</th><th class="text-right">Costo</th><th class="text-right">Valor</th><th>Estado</th></tr></thead><tbody>'+execProductRows(data.sinCosto,data)+'</tbody></table>';
  else if(execActiveDetail==='inventario')table='<table class="dt"><thead><tr><th>Producto</th><th>Categoría</th><th>Nivel</th><th class="text-right">Stock</th><th class="text-right">Costo</th><th class="text-right">Valor</th><th>Estado</th></tr></thead><tbody>'+execProductRows(data.productos,data)+'</tbody></table>';
  else if(execActiveDetail==='producto'){
    const p=data.productosMap.get(execActiveProduct);
    const rows=data.movimientos.filter(m=>m.producto_id===execActiveProduct).map(m=>{const unit=Number(m.costo_unitario)||execUnitCost(p,m.variante_id||null);const doc=execMovementDoc(m,data.store);return{fecha:execDateKey(m),tipo:EXEC_TYPE_LABELS[execTipo(m)]||execTipo(m)||'Movimiento',documento:m.documento_id||m.id,producto:p?.nombre||m.producto_nombre||m.producto_id,producto_id:m.producto_id,area:execDocArea(doc,data.store)||'No disponible',empleado:doc?.quien_recibe||doc?.empleado_nombre||m.usuario||'No disponible',cantidad:Number(m.cantidad)||0,unitario:unit,costo:execAbsQty(m)*unit};});
    table='<div class="exec-product-summary"><strong>'+esc(p?.nombre||'Producto no disponible')+'</strong><span>Stock '+fmt(execStock(p))+'</span><span>'+(execInventoryValue(p)>0?fmtMoney(execInventoryValue(p)):'Valor no disponible')+'</span></div><table class="dt"><thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Producto</th><th>Área</th><th>Persona</th><th class="text-right">Cantidad</th><th class="text-right">Costo unit.</th><th class="text-right">Impacto</th></tr></thead><tbody>'+execMovementRows(rows)+'</tbody></table>';
  }else{
    const rowMap={entradas:data.entradas,salidas:data.salidas,entregas:data.entregas,devoluciones:data.devoluciones,mermas:data.mermas};
    const rows=rowMap[execActiveDetail];
    table='<table class="dt"><thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Producto</th><th>Área</th><th>Persona</th><th class="text-right">Cantidad</th><th class="text-right">Costo unit.</th><th class="text-right">Impacto</th></tr></thead><tbody>'+(rows?execMovementRows(rows):execRecentMovementRows(data))+'</tbody></table>';
  }
  return'<div class="exec-panel exec-detail"><div class="exec-panel-head"><div><h3>'+esc(EXEC_DETAIL_LABELS[execActiveDetail]||EXEC_DETAIL_LABELS.resumen)+'</h3><p>Detalle ejecutivo filtrado por los criterios activos</p></div><button class="btn btn-ghost btn-sm" data-drill="resumen"><i class="fas fa-rotate-left"></i> Resumen</button></div><div class="table-wrap">'+table+'</div></div>';
}
function execRenderDashboardContent(){
  const data=execBuildData(execFilters);
  const mesLabel=execFilters.month?EXEC_MONTHS.find(x=>x[0]===execFilters.month)?.[1]:'Todos los meses';
  const k=data.kpi;
  const dot=data.dotacion;
  const gastoMensual=data.entregas.reduce((s,r)=>s+(r.costo||0),0)+data.salidas.reduce((s,r)=>s+(r.costo||0),0);
  const gastoRows=data.entregas.concat(data.salidas);
  const gastoDisponible=gastoRows.length>0&&gastoRows.every(r=>r.unitario>0);
  let html='<div class="exec-dashboard"><div class="exec-hero"><div><span class="exec-eyebrow">Dashboard Ejecutivo Operativo</span><h1>Lectura directiva de inventario y movimientos</h1><p>'+esc(mesLabel||'Mes')+' '+esc(execFilters.year||'')+' · KPIs accionables con datos existentes del almacén.</p></div><div class="exec-hero-meta"><strong>'+fmt(data.productos.length)+'</strong><span>productos filtrados</span></div></div>';
  html+=execRenderFilters(data);
  html+='<div class="kpi-primary-grid">';
  html+='<div class="kpi-primary is-clickable" data-drill="inventario" style="border-top:3px solid #059669"><div class="kpi-label">Inventario Valorizado</div><div class="kpi-value">'+(data.hasInventoryCost?fmtMoney(data.valorInventario):'No disponible')+'</div><div class="kpi-sub">'+(data.inventoryCostIncomplete?'Dato incompleto: productos sin costo':'Stock actual × costo de recepción')+'</div></div>';
  html+='<div class="kpi-primary '+(gastoRows.length?'is-clickable':'')+'" '+(gastoRows.length?'data-drill="entregas"':'')+' style="border-top:3px solid #2563eb"><div class="kpi-label">Gasto Mensual</div><div class="kpi-value">'+(gastoDisponible?fmtMoney(gastoMensual):(gastoRows.length?'Dato incompleto':'No disponible'))+'</div><div class="kpi-sub">'+(gastoRows.length&&!gastoDisponible?'No disponible por falta de costo':'Entregas + salidas del periodo')+'</div></div>';
  html+='<div class="kpi-primary '+(k.mermas?'is-clickable':'')+'" '+(k.mermas?'data-drill="mermas"':'')+' style="border-top:3px solid #dc2626"><div class="kpi-label">Merma</div><div class="kpi-value">'+(k.mermasCostAvailable&&k.mermasCost>0?fmtMoney(k.mermasCost):k.mermas>0?(k.mermasCostAvailable?k.mermas+' eventos':'Dato incompleto'):'Sin mermas')+'</div><div class="kpi-sub">'+(k.mermas&&!k.mermasCostAvailable?'No disponible por falta de costo':(k.mermas?k.mermas+' evento'+(k.mermas!==1?'s':'')+' en el periodo':'Sin mermas en el periodo'))+'</div></div>';
  html+='</div>';
  html+='<div class="kpi-secondary-grid">';
  html+='<div class="kpi-secondary" style="border-top:2px solid #38bdf8"><div class="kpi-label">Stock Total</div><div class="kpi-value">'+fmt(data.totalStock)+'</div><div class="kpi-sub">Unidades en inventario</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #f87171"><div class="kpi-label">Bajo Stock</div><div class="kpi-value">'+fmt(data.bajoStock.length)+'</div><div class="kpi-sub">'+(data.bajoStock.length?'Requieren reposición':'Sin alertas')+'</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #fbbf24"><div class="kpi-label">Sin Costo</div><div class="kpi-value">'+fmt(data.sinCosto.length)+'</div><div class="kpi-sub">Productos sin precio</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #fb923c"><div class="kpi-label">Mov. sin costo</div><div class="kpi-value">'+fmt(data.dataQuality.movimientosSinCosto)+'</div><div class="kpi-sub">Impacto no valorizable</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #f59e0b"><div class="kpi-label">Recepciones sin costo</div><div class="kpi-value">'+fmt(data.dataQuality.recepcionesSinCosto)+'</div><div class="kpi-sub">Dato incompleto</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #22c55e"><div class="kpi-label">Entradas</div><div class="kpi-value">'+fmt(k.entradas)+'</div><div class="kpi-sub">'+execDelta(k.entradas,k.entradasPrev)+'</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #818cf8"><div class="kpi-label">Salidas</div><div class="kpi-value">'+fmt(k.salidas)+'</div><div class="kpi-sub">'+execDelta(k.salidas,k.salidasPrev)+'</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #0ea5e9"><div class="kpi-label">Entregas</div><div class="kpi-value">'+fmt(k.entregas)+'</div><div class="kpi-sub">'+execDelta(k.entregas,k.entregasPrev)+'</div></div>';
  html+='<div class="kpi-secondary" style="border-top:2px solid #a78bfa"><div class="kpi-label">Devoluciones</div><div class="kpi-value">'+fmt(k.devoluciones)+'</div><div class="kpi-sub">'+execDelta(k.devoluciones,k.devolucionesPrev)+'</div></div>';
  if(dot.available){
    html+='<div class="kpi-secondary" style="border-top:2px solid #7c3aed"><div class="kpi-label">Avance Dotación</div><div class="kpi-value">'+dot.avance+'%</div><div class="kpi-sub">'+dot.entregados+' de '+dot.activos+' empleados</div></div>';
    html+='<div class="kpi-secondary" style="border-top:2px solid #6d28d9"><div class="kpi-label">Cobertura Tipo</div><div class="kpi-value">'+dot.cobertura+'%</div><div class="kpi-sub">Con tipo asignado</div></div>';
  }
  html+='</div>';
  html+='<div class="dash-chart-main"><div class="exec-panel-head" style="margin-bottom:16px"><div><h3 style="font-size:14px;font-weight:700;color:#f8fafc;text-transform:none;letter-spacing:0">Tendencia mensual</h3><p style="font-size:12px;color:#64748b;margin-top:3px">Entradas, entregas y costo de mermas — últimos 6 meses</p></div></div><canvas id="execTrend"></canvas></div>';
  html+=execRenderDetail(data);
  html+='</div>';
  return html;
}
function execChartOptions(){
  return{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#cbd5e1',usePointStyle:true,font:{size:11}}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#94a3b8'},grid:{color:'rgba(148,163,184,.14)'}}}};
}
function execInitCharts(data){
  if(typeof Chart==='undefined')return;
  if(data.topConsumo.length)createChart('execTopConsumo',{type:'bar',data:{labels:data.topConsumo.map(x=>x.label),datasets:[{label:'Piezas',data:data.topConsumo.map(x=>x.piezas),backgroundColor:'#38bdf8',borderRadius:6,borderSkipped:false}]},options:{...execChartOptions(),indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{color:'#94a3b8'},grid:{color:'rgba(148,163,184,.14)'}},y:{ticks:{color:'#cbd5e1',font:{size:10}},grid:{display:false}}}}});
  createChart('execTrend',{type:'line',data:{labels:data.trend.map(x=>x.label),datasets:[{label:'Entradas',data:data.trend.map(x=>x.entradas),borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,.12)',tension:.32,fill:true},{label:'Entregas',data:data.trend.map(x=>x.entregas),borderColor:'#38bdf8',backgroundColor:'rgba(56,189,248,.1)',tension:.32,fill:true},{label:'Costo mermas',data:data.trend.map(x=>x.mermas),borderColor:'#f87171',backgroundColor:'rgba(248,113,113,.1)',tension:.32,fill:true,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#cbd5e1',usePointStyle:true,font:{size:11}}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#94a3b8'},grid:{color:'rgba(148,163,184,.14)'}},y1:{beginAtZero:true,position:'right',ticks:{color:'#fca5a5',callback:v=>'$'+fmt(v)},grid:{drawOnChartArea:false}}}}});
  createChart('execStockNivel',{type:'bar',data:{labels:data.stockByLevel.map(x=>'Nivel '+x.nivel),datasets:[{label:'Stock',data:data.stockByLevel.map(x=>x.stock),backgroundColor:['#22c55e','#38bdf8','#fbbf24','#818cf8'],borderRadius:6,borderSkipped:false}]},options:{...execChartOptions(),plugins:{legend:{display:false}}}});
}
function execSyncFiltersFromDom(){
  execFilters={year:document.getElementById('execYear')?.value||'',month:document.getElementById('execMonth')?.value||'',area:document.getElementById('execArea')?.value||'',categoria:document.getElementById('execCategoria')?.value||'',nivel:document.getElementById('execNivel')?.value||'',tipo:document.getElementById('execTipo')?.value||'',sitio:document.getElementById('execSitio')?.value||'',origen:document.getElementById('execOrigen')?.value||''};
}
function execRefresh(){
  const root=document.getElementById('execDashboardRoot');
  if(!root)return;
  root.innerHTML=execRenderDashboardContent();
  execBind();
}
function execBind(){
  const data=execBuildData(execFilters);
  execInitCharts(data);
  ['execYear','execMonth','execArea','execCategoria','execNivel','execTipo','execSitio','execOrigen'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.onchange=()=>{execSyncFiltersFromDom();execActiveDetail='resumen';execActiveProduct='';execRefresh();};
  });
  const clear=document.getElementById('execClearFilters');
  if(clear)clear.onclick=()=>{execFilters=execDefaultFilters();execActiveDetail='resumen';execActiveProduct='';execRefresh();};
  const root=document.getElementById('execDashboardRoot');
  if(root)root.onclick=e=>{
    const product=e.target.closest('[data-product]');
    if(product&&product.dataset.product){execActiveProduct=product.dataset.product;execActiveDetail='producto';execRefresh();return;}
    const drill=e.target.closest('[data-drill]');
    if(drill&&drill.dataset.drill){execActiveDetail=drill.dataset.drill;execActiveProduct='';execRefresh();return;}
  };
}
export function render(){
  return'<div id="execDashboardRoot">'+execRenderDashboardContent()+'</div>';
}
export function init(){
  execBind();
}

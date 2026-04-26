import{VERSION}from'./config.js';import{getStore}from'./storage.js';import{calcStats,calcStatsArea}from'./rules.js';import{buildAreaBadge}from'./ui.js';import{getAreaNames}from'./areas-config.js';import{fmt,fmtMoney,esc,fmtDate}from'./utils.js';
import{getProductos,getMovimientos,getEntregasNuevas,getDevolucionesNuevas,getSalidas as getSalidasNuevas}from'./almacen-api.js';

function areaIcon(name){const n=(name||'').toUpperCase();if(n.includes('PLANT'))return{icon:'fa-industry',color:'#2563eb'};if(n.includes('MANTEN')||n.includes('MECANIC')||n.includes('TALLER'))return{icon:'fa-tools',color:'#d97706'};if(n.includes('SUPERV'))return{icon:'fa-user-tie',color:'#7c3aed'};if(n.includes('PUERTA'))return{icon:'fa-door-open',color:'#059669'};if(n.includes('MATERIA'))return{icon:'fa-boxes',color:'#0891b2'};if(n.includes('TULT'))return{icon:'fa-building',color:'#dc2626'};if(n.includes('BRUK'))return{icon:'fa-hard-hat',color:'#ea580c'};if(n.includes('ADMIN')||n.includes('OFIC'))return{icon:'fa-briefcase',color:'#475569'};if(n.includes('ALMAC'))return{icon:'fa-warehouse',color:'#854d0e'};if(n.includes('SEGUR'))return{icon:'fa-shield-alt',color:'#1d4ed8'};return{icon:'fa-layer-group',color:'#64748b'};}

// Calcula últimos N meses
function lastMonths(n){const months=[];const now=new Date();for(let i=n-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({label:d.toLocaleDateString('es-MX',{month:'short',year:'2-digit'}),key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')});}return months;}

export function render(){
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
  if(gastoTotal>0)h+='<div class="kpi" style="border-top:2px solid var(--success)"><div class="kpi-label">Inversión Total</div><div class="kpi-value" style="font-size:20px">'+fmtMoney(gastoTotal)+'</div><div class="kpi-sub">Uniformes + Almacén</div></div>';
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
  const prodBajoMinimo=productos.filter(p=>{const st=p.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(v.stock_actual||0),0):(p.stock_actual||0);return st>0&&st<=p.stock_minimo;}).length;

  h+='<div class="kpi" style="border-top:2px solid #7c3aed"><div class="kpi-label">Productos</div><div class="kpi-value">'+productos.length+'</div><div class="kpi-sub">'+prodConStock+' con stock</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #2563eb"><div class="kpi-label">Piezas en Stock</div><div class="kpi-value">'+totalPzasStock+'</div><div class="kpi-sub">unidades físicas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #059669"><div class="kpi-label">Entregas — '+now.toLocaleDateString('es-MX',{month:'short'})+'</div><div class="kpi-value">'+entregasMes.length+'</div><div class="kpi-sub">'+pzasEntregadas+' piezas</div></div>';
  h+='<div class="kpi" style="border-top:2px solid #0891b2"><div class="kpi-label">Devoluciones — '+now.toLocaleDateString('es-MX',{month:'short'})+'</div><div class="kpi-value">'+devolucionesMes.length+'</div><div class="kpi-sub">'+pzasDevueltas+' piezas</div></div>';
  if(prodBajoMinimo>0)h+='<div class="kpi" style="border-top:2px solid #dc2626"><div class="kpi-label"><i class="fas fa-exclamation-triangle mr-1" style="color:#dc2626"></i>Bajo Mínimo</div><div class="kpi-value" style="color:#dc2626">'+prodBajoMinimo+'</div><div class="kpi-sub">requieren reposición</div></div>';
  h+='</div>';

  // Productos bajo mínimo
  const bajoMinimo=productos.filter(p=>{const st=p.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(v.stock_actual||0),0):(p.stock_actual||0);return st>0&&st<=p.stock_minimo;}).slice(0,8);
  if(bajoMinimo.length){
    h+='<div class="card mt-3"><div class="card-head"><h3><i class="fas fa-exclamation-triangle mr-2" style="color:#dc2626"></i>Productos que requieren atención</h3><span class="text-xs text-muted">'+bajoMinimo.length+' en alerta</span></div>';
    h+='<div class="table-wrap"><table class="dt" style="font-size:13px"><thead><tr><th>Producto</th><th>SKU</th><th style="text-align:right">Stock</th><th style="text-align:right">Mínimo</th><th style="text-align:center">Estado</th></tr></thead><tbody>';
    h+=bajoMinimo.map(p=>{
      const st=p.es_por_variante?(p.variantes||[]).reduce((s,v)=>s+(v.stock_actual||0),0):(p.stock_actual||0);
      return'<tr><td class="text-sm font-bold">'+esc(p.nombre)+'</td><td><code style="font-weight:800;font-size:11px;color:var(--primary)">'+esc(p.sku)+'</code></td><td style="text-align:right;font-size:16px;font-weight:900;color:#dc2626">'+st+'</td><td style="text-align:right;font-size:13px;color:var(--text-muted)">'+p.stock_minimo+'</td><td style="text-align:center"><span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700"><i class="fas fa-exclamation-triangle mr-1"></i>Bajo</span></td></tr>';
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

export function init(){
  // No charts initialization needed for MVP — ECharts graphs removed in favor of KPI cards
}

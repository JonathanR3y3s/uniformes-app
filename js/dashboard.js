import{VERSION}from'./config.js';import{getStore}from'./storage.js';import{calcStats,calcStatsArea}from'./rules.js';import{buildAreaBadge}from'./ui.js';import{getAreaNames}from'./areas-config.js';import{fmt,fmtMoney,esc}from'./utils.js';

function areaIcon(name){const n=(name||'').toUpperCase();if(n.includes('PLANT'))return{icon:'fa-industry',color:'#2563eb'};if(n.includes('MANTEN')||n.includes('MECANIC')||n.includes('TALLER'))return{icon:'fa-tools',color:'#d97706'};if(n.includes('SUPERV'))return{icon:'fa-user-tie',color:'#7c3aed'};if(n.includes('PUERTA'))return{icon:'fa-door-open',color:'#059669'};if(n.includes('MATERIA'))return{icon:'fa-boxes',color:'#0891b2'};if(n.includes('TULT'))return{icon:'fa-building',color:'#dc2626'};if(n.includes('BRUK'))return{icon:'fa-hard-hat',color:'#ea580c'};if(n.includes('ADMIN')||n.includes('OFIC'))return{icon:'fa-briefcase',color:'#475569'};if(n.includes('ALMAC'))return{icon:'fa-warehouse',color:'#854d0e'};if(n.includes('SEGUR'))return{icon:'fa-shield-alt',color:'#1d4ed8'};return{icon:'fa-layer-group',color:'#64748b'};}

// Calcula últimos N meses
function lastMonths(n){const months=[];const now=new Date();for(let i=n-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({label:d.toLocaleDateString('es-MX',{month:'short',year:'2-digit'}),key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')});}return months;}

export function render(){
  const s=calcStats();const st=getStore();const areas=getAreaNames();
  const now=new Date();const mes=now.toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const thisYear=now.getFullYear().toString();
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

  // KPIs principales
  h+='<div class="kpi-grid">';
  h+='<div class="kpi" style="border-top:3px solid #2563eb"><div class="kpi-label"><i class="fas fa-users mr-1" style="color:#2563eb"></i>Empleados</div><div class="kpi-value">'+s.total+'</div><div class="kpi-sub">'+s.activos+' activos · '+s.bajas+' bajas</div></div>';
  h+='<div class="kpi" style="border-top:3px solid '+pctColor+'"><div class="kpi-label"><i class="fas fa-clipboard-check mr-1" style="color:'+pctColor+'"></i>Captura de Tallas</div><div class="kpi-value" style="color:'+pctColor+'">'+s.pct+'%</div><div class="kpi-sub">'+s.capturados+' listos · '+s.pendientes+' por capturar</div></div>';
  h+='<div class="kpi" style="border-top:3px solid #004B87"><div class="kpi-label"><i class="fas fa-hand-holding mr-1" style="color:#004B87"></i>Entregas Totales</div><div class="kpi-value" style="color:#004B87">'+totalEnt+'</div><div class="kpi-sub">'+(totalEnt?Math.round(entConFirma/totalEnt*100):0)+'% firmadas</div></div>';
  h+='<div class="kpi" style="border-top:3px solid '+cobColor+'"><div class="kpi-label"><i class="fas fa-percent mr-1" style="color:'+cobColor+'"></i>Cobertura '+thisYear+'</div><div class="kpi-value" style="color:'+cobColor+'">'+cobertura+'%</div><div class="kpi-sub">'+empConEntrega.size+' de '+activos.length+' empleados atendidos</div></div>';
  if(gastoTotal>0)h+='<div class="kpi" style="border-top:3px solid #059669"><div class="kpi-label"><i class="fas fa-dollar-sign mr-1" style="color:#059669"></i>Inversión Total</div><div class="kpi-value" style="color:#059669;font-size:20px">'+fmtMoney(gastoTotal)+'</div><div class="kpi-sub">Uniformes + Almacén</div></div>';
  h+='<div class="kpi" style="border-top:3px solid '+(alertasStock>0?'#d97706':'#7c3aed')+'"><div class="kpi-label"><i class="fas '+(alertasStock>0?'fa-exclamation-triangle':'fa-user-slash')+' mr-1" style="color:'+(alertasStock>0?'#d97706':'#7c3aed')+'"></i>'+(alertasStock>0?'Stock Bajo':'Inactivos')+'</div><div class="kpi-value" style="color:'+(alertasStock>0?'#d97706':'#7c3aed')+'">'+(alertasStock>0?alertasStock:s.bajas)+'</div><div class="kpi-sub">'+(alertasStock>0?'artículos bajo mínimo':'no requieren captura')+'</div></div>';
  h+='</div>';

  // Área cards + doughnut
  h+='<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(220px,1fr);gap:12px;margin-bottom:20px">';
  h+='<div class="card"><div class="card-head"><h3><i class="fas fa-layer-group mr-2" style="color:#004B87"></i>Estado por Área</h3><span class="text-xs text-muted">Captura de tallas '+thisYear+'</span></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:8px;padding:4px 16px 16px">';
  areas.forEach(a=>{const st2=calcStatsArea(a);const p=parseInt(st2.pct,10);const bc=p>=80?'#059669':p>=50?'#d97706':'#dc2626';const bg=p>=80?'rgba(5,150,105,.06)':p>=50?'rgba(217,119,6,.06)':'rgba(220,38,38,.06)';const ai=areaIcon(a);h+='<div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:'+bg+'"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div style="width:34px;height:34px;border-radius:8px;background:'+ai.color+';display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas '+ai.icon+'" style="color:#fff;font-size:14px"></i></div><div style="flex:1;min-width:0"><p style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0">'+a+'</p><p style="font-size:11px;color:var(--text-muted);margin:0">'+st2.total+' empleado'+(st2.total!==1?'s':'')+'</p></div></div><div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:4px"><span style="color:var(--success)"><i class="fas fa-check mr-1"></i>'+st2.capturados+' listos</span><span style="font-weight:800;color:'+bc+'">'+p+'%</span></div><div style="height:5px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:'+p+'%;background:'+bc+';border-radius:999px;transition:width .5s ease"></div></div></div>';});
  h+='</div></div>';
  // Doughnut
  h+='<div class="chart-box" style="display:flex;flex-direction:column"><div class="card-head" style="padding-bottom:8px"><h3><i class="fas fa-chart-pie mr-2" style="color:#059669"></i>Estado de Captura</h3></div><div id="ecEstado" style="height:185px"></div><div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0"><div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;border-radius:3px;background:#22c55e;display:inline-block"></span><span style="font-size:12px">Capturados</span></div><strong style="color:#22c55e;font-size:14px">'+s.capturados+'</strong></div>';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0"><div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;border-radius:3px;background:#f59e0b;display:inline-block"></span><span style="font-size:12px">Pendientes</span></div><strong style="color:#f59e0b;font-size:14px">'+s.pendientes+'</strong></div>';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0"><div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;border-radius:3px;background:rgba(255,255,255,.15);display:inline-block"></span><span style="font-size:12px">Bajas / Mov.</span></div><strong style="color:var(--text-sec);font-size:14px">'+s.bajas+'</strong></div>';
  h+='</div></div>';
  h+='</div>';

  // Gráficas de entregas
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">';
  // Tendencia mensual (últimos 6 meses)
  h+='<div class="chart-box"><div class="card-head"><h3><i class="fas fa-chart-bar mr-2" style="color:#2563eb"></i>Entregas por Mes</h3><span class="text-xs text-muted">Últimos 6 meses</span></div><div id="ecTend" style="height:180px"></div></div>';
  // Tipos de entrega / últimas
  if(totalEnt>0){
    h+='<div style="display:grid;gap:12px">';
    h+='<div class="chart-box"><div class="card-head"><h3><i class="fas fa-boxes mr-2" style="color:#d97706"></i>Tipo de Entregas</h3></div><div id="ecEnt" style="height:150px"></div></div>';
    h+='</div>';
  } else {
    // Si no hay entregas, mostrar cobertura donut
    h+='<div class="chart-box" style="display:flex;flex-direction:column"><div class="card-head"><h3><i class="fas fa-user-check mr-2" style="color:'+cobColor+'"></i>Cobertura de Entregas '+thisYear+'</h3></div><div id="ecCob" style="height:150px"></div><div style="margin-top:8px;border-top:1px solid var(--border);padding-top:10px">';
    h+='<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0"><span>Con entrega</span><strong style="color:'+cobColor+'">'+empConEntrega.size+'</strong></div>';
    h+='<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0"><span>Sin entrega</span><strong style="color:#dc2626">'+sinEntrega.length+'</strong></div>';
    h+='</div></div>';
  }
  h+='</div>';

  // Últimas entregas + Empleados sin entrega
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">';
  // Últimas entregas
  h+='<div class="chart-box"><div class="card-head"><h3><i class="fas fa-history mr-2" style="color:#7c3aed"></i>Últimas Entregas</h3></div><div id="lastEntregas" style="padding:2px 0"></div></div>';
  // Empleados sin entrega este año
  h+='<div class="card"><div class="card-head"><h3><i class="fas fa-user-clock mr-2" style="color:#dc2626"></i>Sin Entrega '+thisYear+'</h3><span class="badge badge-'+(sinEntrega.length>0?'danger':'success')+'" style="font-size:11px">'+sinEntrega.length+'</span></div>';
  h+='<div style="max-height:200px;overflow-y:auto;padding:4px 16px 12px">';
  if(!sinEntrega.length){
    h+='<div style="text-align:center;padding:20px;color:var(--success)"><i class="fas fa-check-circle" style="font-size:28px;margin-bottom:8px;display:block"></i><p style="font-size:13px;font-weight:700">¡Todos los empleados activos han recibido su uniforme este año!</p></div>';
  } else {
    h+=sinEntrega.slice(0,20).map(e=>'<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><div style="width:28px;height:28px;border-radius:50%;background:#dc2626;display:flex;align-items:center;justify-content:center;flex-shrink:0"><span style="color:#fff;font-size:11px;font-weight:700">'+((e.nombre||'?')[0]).toUpperCase()+'</span></div><div style="flex:1;min-width:0"><p style="font-size:12px;font-weight:700;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(e.nombre+' '+(e.paterno||''))+'</p><p style="font-size:10px;color:var(--text-muted);margin:0">'+esc(e.area)+'</p></div></div>').join('');
    if(sinEntrega.length>20)h+='<p class="text-xs text-muted" style="text-align:center;padding:8px 0">...y '+(sinEntrega.length-20)+' más</p>';
  }
  h+='</div></div>';
  h+='</div>';

  // Detail table
  h+='<div class="card"><div class="card-head"><h3><i class="fas fa-table mr-2" style="color:#004B87"></i>Detalle por Área</h3><span class="text-xs text-muted">Temporada '+thisYear+'</span></div><div class="table-wrap"><table class="dt"><thead><tr><th>Área</th><th style="text-align:center">Total</th><th style="text-align:center">Capturados</th><th style="text-align:center">Pendientes</th><th style="text-align:center">Bajas</th><th>Progreso</th></tr></thead><tbody>';
  areas.forEach(a=>{const st2=calcStatsArea(a);const p=parseInt(st2.pct,10);const bc=p>=80?'var(--success)':p>=50?'var(--warning)':'var(--danger)';h+='<tr><td>'+buildAreaBadge(a)+'</td><td style="text-align:center;font-weight:700">'+st2.total+'</td><td style="text-align:center;color:var(--success);font-weight:700">'+st2.capturados+'</td><td style="text-align:center;color:var(--warning)">'+st2.pendientes+'</td><td style="text-align:center;color:var(--info)">'+st2.bajas+'</td><td style="min-width:160px"><div class="flex items-center gap-2"><div class="progress" style="flex:1;height:8px"><div class="progress-bar" style="width:'+st2.pct+'%;background:'+bc+'"></div></div><span class="text-xs font-bold" style="color:'+bc+';min-width:36px">'+st2.pct+'%</span></div></td></tr>';});
  h+='</tbody></table></div></div>';
  return h;
}

export function init(){
  const st=getStore();const s=calcStats();
  const now=new Date();const thisYear=now.getFullYear().toString();
  const activos=st.employees.filter(e=>e.estado==='activo');
  const empConEntrega=new Set(st.entregas.filter(e=>e.fecha&&e.fecha.startsWith(thisYear)).map(e=>e.empleadoId));
  const cobN=activos.length?Math.round(empConEntrega.size/activos.length*100):0;
  const cobColor=cobN>=80?'#22c55e':cobN>=50?'#f59e0b':'#ef4444';
  const EC=typeof echarts!=='undefined'?echarts:null;
  const tooltip={backgroundColor:'rgba(17,17,24,.95)',borderColor:'rgba(255,255,255,.1)',textStyle:{color:'#e2e8f6',fontSize:12}};

  // Donut Estado Captura (ECharts)
  const elEstado=document.getElementById('ecEstado');
  if(elEstado&&EC){
    EC.init(elEstado).setOption({
      backgroundColor:'transparent',
      tooltip:{...tooltip,trigger:'item',formatter:'{b}: {c}'},
      series:[{type:'pie',radius:['58%','80%'],center:['50%','50%'],
        data:[
          {value:s.capturados,name:'Capturados',itemStyle:{color:'#22c55e'}},
          {value:s.pendientes,name:'Pendientes',itemStyle:{color:'#f59e0b'}},
          {value:s.bajas,name:'Bajas/Mov.',itemStyle:{color:'rgba(255,255,255,.1)'}}
        ],
        label:{show:false},
        emphasis:{scale:true,scaleSize:4},
        itemStyle:{borderRadius:4,borderWidth:3,borderColor:'#111118'}
      }]
    });
  }

  // Tendencia mensual — barra con gradiente (ECharts)
  const months=lastMonths(6);
  const countsByMonth={};
  st.entregas.forEach(e=>{if(e.fecha){const mk=e.fecha.slice(0,7);if(!countsByMonth[mk])countsByMonth[mk]=0;countsByMonth[mk]++;}});
  const monthData=months.map(m=>countsByMonth[m.key]||0);
  const elTend=document.getElementById('ecTend');
  if(elTend&&EC){
    EC.init(elTend).setOption({
      backgroundColor:'transparent',
      grid:{top:10,right:12,bottom:28,left:40},
      tooltip:{...tooltip,trigger:'axis',axisPointer:{type:'shadow',shadowStyle:{color:'rgba(255,255,255,.03)'}}},
      xAxis:{type:'category',data:months.map(m=>m.label),axisLine:{lineStyle:{color:'rgba(255,255,255,.08)'}},axisTick:{show:false},axisLabel:{color:'rgba(226,232,246,.45)',fontSize:11}},
      yAxis:{type:'value',minInterval:1,axisLabel:{color:'rgba(226,232,246,.4)',fontSize:10},splitLine:{lineStyle:{color:'rgba(255,255,255,.05)'}}},
      series:[{type:'bar',data:monthData,barMaxWidth:44,
        itemStyle:{borderRadius:[6,6,0,0],color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#60a5fa'},{offset:1,color:'rgba(59,130,246,.5)'}]}},
        emphasis:{itemStyle:{color:'#93c5fd'}}
      }]
    });
  }

  // Tipos de entrega (ECharts)
  const da=st.entregas.filter(e=>e.tipo==='DOTACION_ANUAL').length;
  const ni=st.entregas.filter(e=>e.tipo==='NUEVO_INGRESO').length;
  const su=st.entregas.filter(e=>e.tipo==='SUSTITUCION').length;
  const otro=st.entregas.filter(e=>!['DOTACION_ANUAL','NUEVO_INGRESO','SUSTITUCION'].includes(e.tipo)).length;
  const elEnt=document.getElementById('ecEnt');
  if(elEnt&&EC&&(da+ni+su>0)){
    EC.init(elEnt).setOption({
      backgroundColor:'transparent',
      grid:{top:10,right:12,bottom:28,left:40},
      tooltip:{...tooltip,trigger:'axis',axisPointer:{type:'shadow',shadowStyle:{color:'rgba(255,255,255,.03)'}}},
      xAxis:{type:'category',data:['Dotación','Nuevo Ingreso','Sustitución','Otro'],axisLine:{lineStyle:{color:'rgba(255,255,255,.08)'}},axisTick:{show:false},axisLabel:{color:'rgba(226,232,246,.45)',fontSize:10}},
      yAxis:{type:'value',minInterval:1,axisLabel:{color:'rgba(226,232,246,.4)',fontSize:10},splitLine:{lineStyle:{color:'rgba(255,255,255,.05)'}}},
      series:[{type:'bar',data:[
        {value:da,itemStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#4ade80'},{offset:1,color:'rgba(34,197,94,.5)'}]}}},
        {value:ni,itemStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#60a5fa'},{offset:1,color:'rgba(59,130,246,.5)'}]}}},
        {value:su,itemStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#fbbf24'},{offset:1,color:'rgba(245,158,11,.5)'}]}}},
        {value:otro,itemStyle:{color:'rgba(148,163,184,.4)'}}
      ],barMaxWidth:40,itemStyle:{borderRadius:[6,6,0,0]}}]
    });
  } else if(elEnt&&EC){
    // Gauge cobertura cuando no hay entregas tipificadas
    const sinEnt=activos.length-empConEntrega.size;
    EC.init(elEnt).setOption({
      backgroundColor:'transparent',
      series:[{type:'gauge',startAngle:200,endAngle:-20,min:0,max:100,radius:'90%',
        pointer:{show:false},
        progress:{show:true,overlap:false,roundCap:true,width:14,itemStyle:{color:cobColor}},
        axisLine:{lineStyle:{width:14,color:[[1,'rgba(255,255,255,.07)']]}},
        axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},
        detail:{offsetCenter:[0,'8%'],formatter:'{value}%',color:cobColor,fontSize:20,fontWeight:700,fontFamily:'Inter'},
        title:{offsetCenter:[0,'36%'],color:'rgba(226,232,246,.45)',fontSize:10,fontFamily:'Inter'},
        data:[{value:cobN,name:'Cobertura '+thisYear}]
      }]
    });
  }

  // Últimas entregas
  const TIPOS_MAP={DOTACION_ANUAL:{c:'#22c55e',l:'Dotación'},NUEVO_INGRESO:{c:'#3b82f6',l:'Nuevo'},SUSTITUCION:{c:'#f59e0b',l:'Sustitución'}};
  const lb=document.getElementById('lastEntregas');
  if(lb){
    if(!st.entregas.length){lb.innerHTML='<p class="text-sm text-muted" style="padding:12px 0">Sin entregas registradas</p>';return;}
    lb.innerHTML=st.entregas.slice(-8).reverse().map(ent=>{
      const emp=st.employees.find(x=>x.id===ent.empleadoId);
      const nom=emp?emp.nombre+' '+(emp.paterno||''):ent.empleadoId;
      const ti=TIPOS_MAP[ent.tipo]||{c:'#6b7280',l:ent.tipoCustom||ent.tipo||'—'};
      const pc=(ent.prendas||[]).length;
      return'<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">'
        +'<span style="background:'+ti.c+'22;color:'+ti.c+';border:1px solid '+ti.c+'44;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0">'+ti.l+'</span>'
        +'<span style="font-weight:600;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(nom)+'</span>'
        +'<span style="font-size:11px;color:var(--text-muted);white-space:nowrap">'+pc+' pzs'+(ent.firma?' <span style="color:#22c55e">✓</span>':'')+'</span>'
        +'</div>';
    }).join('');
  }
}

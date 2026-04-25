import{getStore}from'./storage.js';import{esc,fmt,fmtMoney,fmtDate}from'./utils.js';import{createChart}from'./ui.js';
let currentYear=new Date().getFullYear().toString();
function getGastos(){const s=getStore();const g=[];s.proveedores.forEach(p=>{g.push({id:p.id,fecha:p.fecha||'',tipo:'UNIFORME',descripcion:p.prenda+(p.talla?' T:'+p.talla:''),cantidad:p.cantidad||0,precioUnitario:p.precioUnitario||0,total:(p.cantidad||0)*(p.precioUnitario||0),proveedor:p.proveedor||'—',referencia:p.referencia||'',categoria:'Uniformes'});});(s.comprasAlmacen||[]).forEach(c=>{g.push({id:c.id,fecha:c.fecha||'',tipo:'ALMACEN',descripcion:c.articulo||'',cantidad:c.cantidad||0,precioUnitario:c.precioUnitario||0,total:(c.cantidad||0)*(c.precioUnitario||0),proveedor:c.proveedor||'—',referencia:c.referencia||'',categoria:c.categoria||'Almacén'});});return g.sort((a,b)=>b.fecha.localeCompare(a.fecha));}
function byYear(g,y){return y==='todos'?g:g.filter(x=>(x.fecha||'').startsWith(y));}
function years(g){const s=new Set(g.map(x=>(x.fecha||'').slice(0,4)).filter(Boolean));return[...s].sort().reverse();}
export function render(){
const all=getGastos();const yrs=years(all);
if(yrs.length&&!yrs.includes(currentYear))currentYear=yrs[0];
const g=byYear(all,currentYear);
const totU=g.filter(x=>x.tipo==='UNIFORME').reduce((s,x)=>s+x.total,0);
const totA=g.filter(x=>x.tipo==='ALMACEN').reduce((s,x)=>s+x.total,0);
const totG=totU+totA;
const emp=getStore().employees.filter(e=>e.estado==='activo').length;
const invEmp=emp>0?totG/emp:0;
const provMap={};g.forEach(x=>{if(x.proveedor&&x.proveedor!=='—')provMap[x.proveedor]=(provMap[x.proveedor]||0)+x.total;});
const topProv=Object.entries(provMap).sort((a,b)=>b[1]-a[1])[0];
const yearOpts=[...new Set([...(yrs.length?yrs:[]),'todos',new Date().getFullYear().toString()])].sort().reverse();
let h='';
h+='<div class="page-head"><div class="page-title"><h1>Control Financiero</h1><p>Análisis financiero · Control de inversión · Comparativas</p></div>';
h+='<select class="form-select" id="ccYear" style="width:auto;min-width:120px"><option value="todos">Todos los años</option>'+yearOpts.filter(y=>y!=='todos').map(y=>'<option value="'+y+'"'+(y===currentYear?' selected':'')+'>'+y+'</option>').join('')+'</select>';
h+='</div>';
// KPIs
h+='<div class="kpi-grid">';
h+='<div class="kpi" style="border-top:3px solid #059669"><div class="kpi-label"><i class="fas fa-chart-line mr-1" style="color:#059669"></i>Inversión Total</div><div class="kpi-value" style="color:#059669;font-size:'+(totG>=1000000?'16px':'20px')+'">'+fmtMoney(totG)+'</div><div class="kpi-sub">'+(currentYear==='todos'?'Historial completo':currentYear)+'</div></div>';
h+='<div class="kpi" style="border-top:3px solid #004B87"><div class="kpi-label"><i class="fas fa-tshirt mr-1" style="color:#004B87"></i>Uniformes</div><div class="kpi-value" style="color:#004B87;font-size:20px">'+fmtMoney(totU)+'</div><div class="kpi-sub">'+(totG>0?Math.round(totU/totG*100):0)+'% del gasto total</div></div>';
h+='<div class="kpi" style="border-top:3px solid #7c3aed"><div class="kpi-label"><i class="fas fa-boxes mr-1" style="color:#7c3aed"></i>Almacén General</div><div class="kpi-value" style="color:#7c3aed;font-size:20px">'+fmtMoney(totA)+'</div><div class="kpi-sub">'+(totG>0?Math.round(totA/totG*100):0)+'% del gasto total</div></div>';
h+='<div class="kpi" style="border-top:3px solid #d97706"><div class="kpi-label"><i class="fas fa-user-circle mr-1" style="color:#d97706"></i>Inversión / Empleado</div><div class="kpi-value" style="color:#d97706;font-size:18px">'+fmtMoney(invEmp)+'</div><div class="kpi-sub">'+emp+' empleados activos</div></div>';
if(topProv)h+='<div class="kpi" style="border-top:3px solid #0891b2"><div class="kpi-label"><i class="fas fa-star mr-1" style="color:#0891b2"></i>Proveedor Principal</div><div class="kpi-value" style="font-size:13px;line-height:1.3;font-weight:700">'+esc(topProv[0])+'</div><div class="kpi-sub">'+fmtMoney(topProv[1])+' acumulado</div></div>';
h+='</div>';
// Charts
if(g.length){
h+='<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:20px">';
h+='<div class="chart-box"><div class="card-head"><h3><i class="fas fa-chart-bar mr-2" style="color:#004B87"></i>Gasto Mensual</h3><span class="text-xs text-muted">Uniformes vs. Almacén</span></div><div style="height:220px;position:relative"><canvas id="ccMensual"></canvas></div></div>';
h+='<div class="chart-box"><div class="card-head"><h3><i class="fas fa-chart-pie mr-2" style="color:#7c3aed"></i>Por Categoría</h3></div><div style="height:220px;position:relative"><canvas id="ccDist"></canvas></div></div>';
h+='</div>';
// Top artículos
const topMap={};g.forEach(x=>{const k=x.descripcion;if(!topMap[k])topMap[k]={total:0,qty:0,tipo:x.tipo,cat:x.categoria};topMap[k].total+=x.total;topMap[k].qty+=x.cantidad;});
const topList=Object.entries(topMap).sort((a,b)=>b[1].total-a[1].total).slice(0,12);
const maxVal=topList.length?topList[0][1].total:1;
const COLORS=['#004B87','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#ea580c','#0f766e','#9333ea','#475569','#b45309','#1d4ed8'];
h+='<div class="card mb-4"><div class="card-head"><h3><i class="fas fa-trophy mr-2" style="color:#d97706"></i>Ranking por Inversión</h3><span class="text-xs text-muted">Top '+topList.length+' artículos / prendas</span></div><div style="padding:8px 16px 16px">';
topList.forEach(([nombre,data],i)=>{const pct=Math.round(data.total/maxVal*100);const c=COLORS[i]||'#64748b';const tipo=data.tipo==='UNIFORME'?'<span style="background:#dbeafe;color:#1d4ed8;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:6px">UNIF</span>':'<span style="background:#ede9fe;color:#7c3aed;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:6px">ALM</span>';h+='<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><div><span style="font-size:11px;font-weight:700;color:var(--text-sec);margin-right:6px">#'+(i+1)+'</span><span class="font-bold text-sm">'+esc(nombre)+'</span>'+tipo+'</div><span class="font-bold text-sm" style="color:'+c+'">'+fmtMoney(data.total)+'</span></div><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+c+';border-radius:999px;transition:width .6s ease"></div></div><span style="font-size:10px;color:var(--text-muted);width:28px;text-align:right">'+data.qty+' pzs</span></div></div>';});
h+='</div></div>';
}
// History table
h+='<div class="card"><div class="card-head"><h3><i class="fas fa-list mr-2" style="color:#64748b"></i>Historial Completo</h3><span class="text-sm text-muted" id="ccCount">'+g.length+' registros</span></div>';
h+='<div class="table-wrap"><table class="dt"><thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo / Prenda</th><th>Categoría</th><th>Proveedor</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Total</th></tr></thead><tbody id="ccTB"></tbody></table></div></div>';
return h;}
function renderRows(g){const tb=document.getElementById('ccTB');if(!tb)return;const cc=document.getElementById('ccCount');if(cc)cc.textContent=g.length+' registros';if(!g.length){tb.innerHTML='<tr><td colspan="8" class="empty-state"><i class="fas fa-chart-line"></i><p>Sin registros de gasto para este período</p></td></tr>';return;}const TM={UNIFORME:{c:'#1d4ed8',bg:'#dbeafe',l:'Uniforme'},ALMACEN:{c:'#7c3aed',bg:'#ede9fe',l:'Almacén'}};tb.innerHTML=g.map(x=>{const t=TM[x.tipo]||{c:'#64748b',bg:'#f3f4f6',l:x.tipo};return'<tr><td class="text-xs font-mono">'+fmtDate(x.fecha)+'</td><td><span style="background:'+t.bg+';color:'+t.c+';font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">'+t.l+'</span></td><td class="font-bold">'+esc(x.descripcion)+'</td><td class="text-xs text-muted">'+esc(x.categoria)+'</td><td class="text-xs">'+esc(x.proveedor)+'</td><td style="text-align:center">'+fmt(x.cantidad)+'</td><td style="text-align:right">'+fmtMoney(x.precioUnitario)+'</td><td style="text-align:right;font-weight:700;color:var(--success)">'+fmtMoney(x.total)+'</td></tr>';}).join('');}
function buildCharts(g){
const meses={};g.forEach(x=>{const m=(x.fecha||'').slice(0,7);if(!m)return;if(!meses[m])meses[m]={u:0,a:0};if(x.tipo==='UNIFORME')meses[m].u+=x.total;else meses[m].a+=x.total;});
const mk=Object.keys(meses).sort();const ml=mk.map(m=>{const[y,mo]=m.split('-');return new Date(+y,+mo-1).toLocaleDateString('es-MX',{month:'short',year:'2-digit'}).toUpperCase();});
if(mk.length)createChart('ccMensual',{type:'bar',data:{labels:ml,datasets:[{label:'Uniformes',data:mk.map(m=>meses[m].u),backgroundColor:'#004B87',borderRadius:5,borderSkipped:false},{label:'Almacén',data:mk.map(m=>meses[m].a),backgroundColor:'#7c3aed',borderRadius:5,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{padding:14,usePointStyle:true,font:{size:11},color:'#374151'}}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#94a3b8',callback:v=>'$'+fmt(v)},grid:{color:'rgba(0,0,0,.05)'}}}}});
const catM={};g.forEach(x=>{catM[x.categoria]=(catM[x.categoria]||0)+x.total;});
const ce=Object.entries(catM).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
const COL=['#004B87','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#ea580c','#0f766e','#9333ea'];
if(ce.length)createChart('ccDist',{type:'doughnut',data:{labels:ce.map(([k])=>k),datasets:[{data:ce.map(([,v])=>v),backgroundColor:COL.slice(0,ce.length),borderWidth:3,borderColor:'var(--surface)',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{padding:10,usePointStyle:true,font:{size:10},color:'#374151'}}}}});}
export function init(){
const all=getGastos();let g=byYear(all,currentYear);renderRows(g);buildCharts(g);
document.getElementById('ccYear')?.addEventListener('change',function(){currentYear=this.value;const filtered=byYear(all,this.value);renderRows(filtered);buildCharts(filtered);});}

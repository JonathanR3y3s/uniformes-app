import{CATEGORIAS}from'./config.js';import{calcStats,generarDatosTablero}from'./rules.js';import{esc,fmt,sortTallas}from'./utils.js';
export function render(){
const datos=generarDatosTablero();const stats=calcStats();
const porArt={};datos.forEach(d=>{if(!porArt[d.articulo])porArt[d.articulo]={categoria:d.categoria,tallas:{},total:0};if(!porArt[d.articulo].tallas[d.talla])porArt[d.articulo].tallas[d.talla]=0;porArt[d.articulo].tallas[d.talla]+=d.cantidad;porArt[d.articulo].total+=d.cantidad;});
const granTotal=datos.reduce((s,d)=>s+d.cantidad,0);
const totCal=datos.filter(d=>d.categoria==='CALZADO').reduce((s,d)=>s+d.cantidad,0);
const totRop=datos.filter(d=>d.categoria==='ROPA').reduce((s,d)=>s+d.cantidad,0);
const totAcc=datos.filter(d=>d.categoria==='ACCESORIOS').reduce((s,d)=>s+d.cantidad,0);
const fecha=new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase();
const cats={CALZADO:{color:'#2563eb',bg:'#eff6ff',light:'#dbeafe',icon:'fa-shoe-prints',total:totCal},ROPA:{color:'#059669',bg:'#f0fdf4',light:'#d1fae5',icon:'fa-tshirt',total:totRop},ACCESORIOS:{color:'#d97706',bg:'#fffbeb',light:'#fef3c7',icon:'fa-box-open',total:totAcc}};
let h='';
h+='<div class="page-head"><div class="page-title"><h1>Tablero Maestro</h1><p>Resumen de dotación · '+stats.activos+' empleados activos · '+fecha+'</p></div></div>';
// KPI summary
h+='<div class="kpi-grid">';
h+='<div class="kpi" style="border-top:3px solid #2563eb"><div class="kpi-label"><i class="fas fa-shoe-prints mr-1" style="color:#2563eb"></i>Calzado</div><div class="kpi-value" style="color:#2563eb">'+fmt(totCal)+'</div><div class="kpi-sub">piezas</div></div>';
h+='<div class="kpi" style="border-top:3px solid #059669"><div class="kpi-label"><i class="fas fa-tshirt mr-1" style="color:#059669"></i>Ropa</div><div class="kpi-value" style="color:#059669">'+fmt(totRop)+'</div><div class="kpi-sub">piezas</div></div>';
h+='<div class="kpi" style="border-top:3px solid #d97706"><div class="kpi-label"><i class="fas fa-box-open mr-1" style="color:#d97706"></i>Accesorios</div><div class="kpi-value" style="color:#d97706">'+fmt(totAcc)+'</div><div class="kpi-sub">piezas</div></div>';
h+='<div class="kpi" style="border-top:3px solid #1a1f2e"><div class="kpi-label"><i class="fas fa-layer-group mr-1"></i>Gran Total</div><div class="kpi-value">'+fmt(granTotal)+'</div><div class="kpi-sub">piezas en total</div></div>';
h+='</div>';
if(!granTotal){h+='<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>Sin datos de tallas capturadas</p><p class="text-xs text-muted">Captura las tallas de los empleados para generar el tablero</p></div>';return h;}
// Category sections
['CALZADO','ROPA','ACCESORIOS'].forEach(cat=>{
const arts=Object.entries(porArt).filter(([,v])=>v.categoria===cat);
if(!arts.length)return;
const c=cats[cat];
h+='<div class="card mb-4">';
// Category header
h+='<div style="padding:16px 20px;background:'+c.bg+';border-bottom:2px solid '+c.light+';border-radius:var(--radius) var(--radius) 0 0;display:flex;align-items:center;justify-content:space-between">';
h+='<div style="display:flex;align-items:center;gap:12px"><div style="width:42px;height:42px;background:'+c.color+';border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas '+c.icon+'" style="color:#fff;font-size:18px"></i></div>';
h+='<div><p style="font-weight:800;font-size:16px;color:'+c.color+';margin:0;letter-spacing:.03em">'+cat+'</p><p style="font-size:12px;color:var(--text-muted);margin:0">'+arts.length+' artículo'+(arts.length!==1?'s':'')+' · distribución por talla</p></div></div>';
h+='<div style="text-align:right"><p style="font-size:30px;font-weight:800;color:'+c.color+';margin:0;line-height:1">'+fmt(c.total)+'</p><p style="font-size:11px;color:var(--text-muted);margin:0">piezas totales</p></div>';
h+='</div>';
// Cards grid
h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1px;background:var(--border)">';
arts.sort((a,b)=>b[1].total-a[1].total).forEach(([nombre,data])=>{
const tallasOrd=sortTallas(nombre,Object.entries(data.tallas));
h+='<div style="background:var(--surface);padding:16px">';
h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
h+='<p style="font-weight:700;font-size:13px;margin:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px">'+esc(nombre)+'</p>';
h+='<span style="background:'+c.light+';color:'+c.color+';font-size:14px;font-weight:800;padding:3px 12px;border-radius:20px;white-space:nowrap;flex-shrink:0">'+fmt(data.total)+'</span>';
h+='</div>';
h+='<div style="display:flex;flex-wrap:wrap;gap:6px">';
tallasOrd.forEach(([talla,qty])=>{
h+='<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-align:center;min-width:54px">';
h+='<div style="font-size:10px;color:var(--text-muted);font-weight:600;letter-spacing:.03em">'+esc(talla)+'</div>';
h+='<div style="font-size:16px;font-weight:800;color:'+c.color+'">'+qty+'</div>';
h+='</div>';
});
h+='</div></div>';
});
h+='</div>';
// Category footer
h+='<div style="padding:10px 20px;background:'+c.bg+';border-top:1px solid '+c.light+';display:flex;align-items:center;gap:6px;border-radius:0 0 var(--radius) var(--radius)">';
h+='<i class="fas fa-info-circle" style="color:'+c.color+';font-size:12px;opacity:.6"></i>';
h+='<span style="font-size:11px;color:var(--text-muted)">'+arts.length+' tipo'+(arts.length!==1?'s':'')+' de prenda · '+fmt(c.total)+' piezas en total para '+stats.activos+' empleados</span>';
h+='</div>';
h+='</div>';
});
// Grand total bar
h+='<div style="background:#1a1f2e;color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;border-radius:var(--radius);margin-top:4px">';
h+='<div><p style="font-size:14px;font-weight:600;margin:0;opacity:.6"><i class="fas fa-chart-pie mr-2"></i>RESUMEN FINAL</p>';
h+='<div style="display:flex;gap:24px;margin-top:8px">';
h+='<div><p style="font-size:10px;opacity:.4;margin:0">CALZADO</p><p style="font-size:18px;font-weight:700;color:#60a5fa;margin:0">'+fmt(totCal)+'</p></div>';
h+='<div><p style="font-size:10px;opacity:.4;margin:0">ROPA</p><p style="font-size:18px;font-weight:700;color:#34d399;margin:0">'+fmt(totRop)+'</p></div>';
h+='<div><p style="font-size:10px;opacity:.4;margin:0">ACCESORIOS</p><p style="font-size:18px;font-weight:700;color:#fbbf24;margin:0">'+fmt(totAcc)+'</p></div>';
h+='</div></div>';
h+='<div style="text-align:right"><p style="font-size:11px;opacity:.4;margin:0">TOTAL GENERAL</p><p style="font-size:40px;font-weight:800;margin:0">'+fmt(granTotal)+' <span style="font-size:14px;opacity:.4;font-weight:400">pzs</span></p></div>';
h+='</div>';
return h;}

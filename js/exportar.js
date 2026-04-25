import{getStore}from'./storage.js';import{verificarCaptura,calcTotalesDetallados}from'./rules.js';import{notify}from'./ui.js';import{fmtDate,fmtMoney}from'./utils.js';

function renderCards(){
  let h='<div class="page-head"><div class="page-title"><h1>Exportar Datos</h1><p>Descarga en Excel o PDF</p></div></div>';

  // Excel section
  h+='<h3 style="font-size:14px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px"><i class="fas fa-file-excel mr-2" style="color:#059669"></i>Excel (.xlsx)</h3>';
  h+='<div class="grid-3 mb-6">';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-users" style="font-size:32px;color:#004B87;margin-bottom:10px;display:block"></i><h3 class="mb-2">Empleados</h3><p class="text-sm text-sec mb-4">Lista completa con tallas</p><button class="btn btn-primary" style="width:100%" id="expEmpXls"><i class="fas fa-download mr-1"></i> Excel</button></div></div>';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-calculator" style="font-size:32px;color:#059669;margin-bottom:10px;display:block"></i><h3 class="mb-2">Totales</h3><p class="text-sm text-sec mb-4">Por prenda y talla</p><button class="btn btn-success" style="width:100%" id="expTotXls"><i class="fas fa-download mr-1"></i> Excel</button></div></div>';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-hand-holding" style="font-size:32px;color:#d97706;margin-bottom:10px;display:block"></i><h3 class="mb-2">Entregas</h3><p class="text-sm text-sec mb-4">Historial completo</p><button class="btn btn-warning" style="width:100%" id="expEntXls"><i class="fas fa-download mr-1"></i> Excel</button></div></div>';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-truck" style="font-size:32px;color:#2563eb;margin-bottom:10px;display:block"></i><h3 class="mb-2">Proveedores</h3><p class="text-sm text-sec mb-4">Compras y costos</p><button class="btn btn-primary" style="width:100%" id="expProvXls"><i class="fas fa-download mr-1"></i> Excel</button></div></div>';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-history" style="font-size:32px;color:#dc2626;margin-bottom:10px;display:block"></i><h3 class="mb-2">Bitácora</h3><p class="text-sm text-sec mb-4">Registro de cambios</p><button class="btn btn-danger" style="width:100%" id="expLogXls"><i class="fas fa-download mr-1"></i> Excel</button></div></div>';
  h+='</div>';

  // PDF section
  h+='<h3 style="font-size:14px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px"><i class="fas fa-file-pdf mr-2" style="color:#dc2626"></i>PDF</h3>';
  h+='<div class="grid-3">';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-users" style="font-size:32px;color:#dc2626;margin-bottom:10px;display:block"></i><h3 class="mb-2">Empleados PDF</h3><p class="text-sm text-sec mb-4">Lista con estado de captura</p><button class="btn btn-danger" style="width:100%" id="expEmpPdf"><i class="fas fa-file-pdf mr-1"></i> PDF</button></div></div>';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-calculator" style="font-size:32px;color:#dc2626;margin-bottom:10px;display:block"></i><h3 class="mb-2">Totales PDF</h3><p class="text-sm text-sec mb-4">Resumen por prenda y talla</p><button class="btn btn-danger" style="width:100%" id="expTotPdf"><i class="fas fa-file-pdf mr-1"></i> PDF</button></div></div>';
  h+='<div class="card"><div class="card-body text-center" style="padding:28px"><i class="fas fa-hand-holding" style="font-size:32px;color:#dc2626;margin-bottom:10px;display:block"></i><h3 class="mb-2">Entregas PDF</h3><p class="text-sm text-sec mb-4">Historial de entregas</p><button class="btn btn-danger" style="width:100%" id="expEntPdf"><i class="fas fa-file-pdf mr-1"></i> PDF</button></div></div>';
  h+='</div>';
  return h;
}

export function render(){return renderCards();}

// ── Excel Exports ────────────────────────────────────────────────────────────
function downloadExcel(rows,sheetName,fileName){
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheetName);
  XLSX.writeFile(wb,fileName);
  notify('Exportado: '+fileName,'success');
}

function exportEmpXls(){
  const rows=[['ID','Nombre','Paterno','Materno','Área','Estado','Perfil','Capturado','Tallas']];
  getStore().employees.forEach(emp=>{
    const ts=Object.entries(emp.tallas||{}).filter(p=>p[1]).map(p=>p[0]+':'+p[1]).join(' | ');
    rows.push([emp.id,emp.nombre,emp.paterno||'',emp.materno||'',emp.area,emp.estado,emp.perfilDotacion||'AUTO',verificarCaptura(emp)?'SI':'NO',ts]);
  });
  downloadExcel(rows,'Empleados','Empleados_ASAABLOY.xlsx');
}

function exportTotXls(){
  const det=calcTotalesDetallados();
  const rows=[['Prenda','Talla','Base','Stock Extra','Total']];
  Object.entries(det).forEach(([p,tallas])=>{Object.entries(tallas).forEach(([t,o])=>{rows.push([p,t,o.base,o.stock,o.total]);});});
  downloadExcel(rows,'Totales','Totales_ASAABLOY.xlsx');
}

function exportEntXls(){
  const s=getStore();
  const rows=[['Fecha','Empleado ID','Nombre','Área','Tipo','Prendas','Firma','Observaciones']];
  s.entregas.forEach(ent=>{
    const emp=s.employees.find(x=>x.id===ent.empleadoId);
    const nom=emp?emp.nombre+' '+(emp.paterno||''):'';
    const prendas=(ent.prendas||[]).map(p=>p.prenda+':'+p.talla).join(' | ');
    rows.push([ent.fecha,ent.empleadoId,nom,ent.area||emp?.area||'',ent.tipo,prendas,ent.firma?'Sí':'No',ent.observaciones||'']);
  });
  downloadExcel(rows,'Entregas','Entregas_ASAABLOY.xlsx');
}

function exportProvXls(){
  const rows=[['Fecha','Proveedor','Prenda','Talla','Cantidad','P.Unitario','Total','Referencia','Observaciones']];
  getStore().proveedores.forEach(p=>{rows.push([p.fecha,p.proveedor,p.prenda,p.talla,p.cantidad,p.precioUnitario,p.cantidad*p.precioUnitario,p.referencia||'',p.observaciones||'']);});
  downloadExcel(rows,'Proveedores','Proveedores_ASAABLOY.xlsx');
}

function exportLogXls(){
  const rows=[['Fecha','Acción','Módulo','Detalle','Usuario']];
  getStore().auditLog.forEach(l=>{rows.push([l.ts,l.action,l.modulo||'',l.det||'',l.user||'']);});
  downloadExcel(rows,'Bitácora','Bitacora_ASAABLOY.xlsx');
}

// ── PDF Exports ───────────────────────────────────────────────────────────────
function getPdf(){
  if(typeof window.jspdf!=='undefined')return window.jspdf.jsPDF;
  if(typeof window.jsPDF!=='undefined')return window.jsPDF;
  notify('jsPDF no cargado. Verifica conexión a internet.','error');
  return null;
}

function pdfHeader(doc,title){
  const now=new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  doc.setFillColor(0,75,135);
  doc.rect(0,0,210,18,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(11);doc.setFont(undefined,'bold');
  doc.text('Control Store Pro — ASSA ABLOY México',10,7);
  doc.setFontSize(9);doc.setFont(undefined,'normal');
  doc.text(title,10,13);
  doc.text('Generado: '+now,200,13,'right');
  doc.setTextColor(0,0,0);
  return 24;
}

function pdfFooter(doc,page,total){
  doc.setFontSize(8);doc.setTextColor(150,150,150);
  doc.text('Control Store Pro v6.4 — ASSA ABLOY México',10,290);
  doc.text('Página '+page+' de '+total,200,290,'right');
}

function exportEmpPdf(){
  const jsPDF=getPdf();if(!jsPDF)return;
  const {jsPDF:jsPDF2}=window.jspdf||{};
  const PDF=jsPDF2||jsPDF;
  const doc=new PDF({orientation:'landscape'});
  const s=getStore();
  let y=pdfHeader(doc,'Lista de Empleados');
  doc.setFontSize(9);doc.setFont(undefined,'bold');
  const cols=[['ID',12],['Nombre',50],['Área',35],['Estado',20],['Capturado',22],['Tallas',60]];
  let x=10;
  doc.setFillColor(241,245,249);doc.rect(10,y-4,277,8,'F');
  cols.forEach(([label,w])=>{doc.text(label,x,y);x+=w;});
  y+=6;doc.setFont(undefined,'normal');
  s.employees.forEach((emp,i)=>{
    if(y>185){pdfFooter(doc,doc.getNumberOfPages(),doc.getNumberOfPages());doc.addPage();y=pdfHeader(doc,'Lista de Empleados (cont.)');}
    if(i%2===0){doc.setFillColor(248,250,252);doc.rect(10,y-4,277,7,'F');}
    x=10;
    const row=[emp.id,emp.nombre+' '+(emp.paterno||''),emp.area,emp.estado,verificarCaptura(emp)?'✓ Sí':'✗ No',Object.entries(emp.tallas||{}).filter(p=>p[1]).map(p=>p[0].replace('PLAYERA ','').replace(' TIPO ','')+':'+p[1]).join(', ')];
    cols.forEach(([,w],ci)=>{
      doc.text(String(row[ci]||'').slice(0,Math.floor(w/2.2)),x,y,{maxWidth:w-2});x+=w;
    });
    y+=7;
  });
  pdfFooter(doc,1,doc.getNumberOfPages());
  doc.save('Empleados_ASAABLOY.pdf');
  notify('PDF generado','success');
}

function exportTotPdf(){
  const jsPDF=getPdf();if(!jsPDF)return;
  const {jsPDF:jsPDF2}=window.jspdf||{};
  const PDF=jsPDF2||jsPDF;
  const doc=new PDF();
  const det=calcTotalesDetallados();
  let y=pdfHeader(doc,'Totales de Uniformes por Prenda y Talla');
  Object.entries(det).forEach(([prenda,tallas])=>{
    if(y>255){pdfFooter(doc,doc.getNumberOfPages(),doc.getNumberOfPages());doc.addPage();y=pdfHeader(doc,'Totales (cont.)');}
    doc.setFontSize(10);doc.setFont(undefined,'bold');
    doc.setFillColor(0,75,135);doc.rect(10,y-4,190,8,'F');
    doc.setTextColor(255,255,255);doc.text(prenda,12,y);
    doc.setTextColor(0,0,0);doc.setFont(undefined,'normal');y+=8;
    doc.setFontSize(8);
    const entries=Object.entries(tallas);
    let x=12;
    entries.forEach(([talla,obj],i)=>{
      if(x>170){x=12;y+=12;}
      if(i%2===0&&i>0&&x>80){doc.setFillColor(248,250,252);doc.rect(x-2,y-4,30,10,'F');}
      doc.setFont(undefined,'bold');doc.text(talla==='UNITALLA'?'S/T':talla,x,y);
      doc.setFont(undefined,'normal');doc.text(String(obj.total),x,y+5);
      if(obj.stock>0){doc.setFontSize(7);doc.setTextColor(5,150,105);doc.text('+'+obj.stock+' extra',x,y+9);doc.setTextColor(0,0,0);doc.setFontSize(8);}
      x+=28;
    });
    y+=16;
  });
  pdfFooter(doc,1,doc.getNumberOfPages());
  doc.save('Totales_ASAABLOY.pdf');
  notify('PDF generado','success');
}

function exportEntPdf(){
  const jsPDF=getPdf();if(!jsPDF)return;
  const {jsPDF:jsPDF2}=window.jspdf||{};
  const PDF=jsPDF2||jsPDF;
  const doc=new PDF({orientation:'landscape'});
  const s=getStore();
  let y=pdfHeader(doc,'Historial de Entregas');
  doc.setFontSize(8);doc.setFont(undefined,'bold');
  const cols=[['Fecha',22],['Empleado',55],['Área',32],['Tipo',28],['Prendas',18],['Firma',14],['Observaciones',50]];
  let x=10;
  doc.setFillColor(241,245,249);doc.rect(10,y-4,277,8,'F');
  cols.forEach(([l,w])=>{doc.text(l,x,y);x+=w;});
  y+=6;doc.setFont(undefined,'normal');
  const TIPOS_MAP={DOTACION_ANUAL:'Dotación',NUEVO_INGRESO:'Nuevo Ingreso',SUSTITUCION:'Sustitución'};
  s.entregas.slice().reverse().forEach((ent,i)=>{
    if(y>188){pdfFooter(doc,doc.getNumberOfPages(),doc.getNumberOfPages());doc.addPage();y=pdfHeader(doc,'Historial de Entregas (cont.)');}
    if(i%2===0){doc.setFillColor(248,250,252);doc.rect(10,y-4,277,7,'F');}
    const emp=s.employees.find(e=>e.id===ent.empleadoId);
    const nom=emp?emp.nombre+' '+(emp.paterno||''):ent.empleadoId;
    x=10;
    const row=[fmtDate(ent.fecha).replace(/ de /g,'/'),nom.slice(0,30),ent.area||emp?.area||'',TIPOS_MAP[ent.tipo]||ent.tipo||'—',(ent.prendas||[]).length+' pzs',ent.firma?'✓':'—',(ent.observaciones||'').slice(0,40)];
    cols.forEach(([,w],ci)=>{doc.text(String(row[ci]||''),x,y,{maxWidth:w-2});x+=w;});
    y+=7;
  });
  pdfFooter(doc,1,doc.getNumberOfPages());
  doc.save('Entregas_ASAABLOY.pdf');
  notify('PDF generado','success');
}

// ── Event binding ─────────────────────────────────────────────────────────────
export function init(){
  const mc=document.getElementById('mainContent');if(!mc)return;
  mc.removeEventListener('click',handleClick);
  mc.addEventListener('click',handleClick);
}

function handleClick(e){
  if(e.target.closest('#expEmpXls'))exportEmpXls();
  else if(e.target.closest('#expTotXls'))exportTotXls();
  else if(e.target.closest('#expEntXls'))exportEntXls();
  else if(e.target.closest('#expProvXls'))exportProvXls();
  else if(e.target.closest('#expLogXls'))exportLogXls();
  else if(e.target.closest('#expEmpPdf'))exportEmpPdf();
  else if(e.target.closest('#expTotPdf'))exportTotPdf();
  else if(e.target.closest('#expEntPdf'))exportEntPdf();
}

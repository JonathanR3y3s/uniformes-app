import{TIPO_TALLA,TALLAS}from'./config.js';import{getStore}from'./storage.js';import{escapeHTML}from'./sanitize.js';
export function normTalla(t){const u=(t||'').toString().trim().toUpperCase();if(!u)return'';if(u==='XL')return'XG';if(u==='XXL'||u==='2XL')return'XXG';if(u==='XXXL'||u==='3XL')return'XXXG';if(u==='EXCH')return'XCH';return u;}
export function normPrenda(p){return(p==='ZAPATO NORMAL'||p==='ZAPATO SEGURIDAD')?'BOTA':p;}
export function getTipoTalla(p){return TIPO_TALLA[p]||'ROPA';}
export function getTallasOpts(p){return TALLAS[getTipoTalla(p)]||TALLAS.ROPA;}
export function sortTallas(prenda,entries){const order=['XCH','CH','M','G','XG','XXG','XXXG'];return entries.sort((a,b)=>{const ta=normTalla(a[0]),tb=normTalla(b[0]);const na=parseInt(ta,10),nb=parseInt(tb,10);if(!isNaN(na)&&!isNaN(nb))return na-nb;const ia=order.indexOf(ta),ib=order.indexOf(tb);if(ia!==-1&&ib!==-1)return ia-ib;if(ia!==-1)return-1;if(ib!==-1)return 1;return ta.localeCompare(tb);});}
export function fmt(n){return(n||0).toLocaleString('es-MX');}
export function fmtMoney(n){return'$'+(n||0).toLocaleString('es-MX',{minimumFractionDigits:2});}
export function esc(s){return escapeHTML(s||'');}
export function areaClass(a){return'area-'+(a||'').toLowerCase().replace(/\s+/g,'');}
export function genId(){const employees=getStore().employees;const existing=new Set(employees.map(e=>e.id));let id;do{id=Date.now().toString().slice(-6);let i=0;while(existing.has(id)){i++;id=(parseInt(id,10)+i).toString();}}while(existing.has(id));return id;}
export function today(){return new Date().toISOString().split('T')[0];}
export function fmtDate(d){if(!d)return'—';try{const iso=String(d).includes('T')?d:d+'T00:00:00';const dt=new Date(iso);if(isNaN(dt.getTime()))return String(d).slice(0,10)||'—';return dt.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});}catch(e){return String(d).slice(0,10)||'—';}}
export function acFiltrar(lista, campos, texto) {
  if (!texto) return [];
  const t = texto.toLowerCase();
  return lista.filter(item => {
    return campos.some(c =>
      String(item[c] || '').toLowerCase().includes(t)
    );
  }).slice(0, 8);
}

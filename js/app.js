import{REGLAS,VERSION}from'./config.js';import{init as initStorage}from'./storage.js';import{initOfflineStorage}from'./offline-storage.js';import{initUserRoles,getUserRole}from'./user-roles.js';import{initDeliveryEvidence}from'./delivery-evidence.js';import{buildNav,setupEvents,destroyCharts}from'./ui.js';import{initAuth}from'./mod-auth.js';import{initSync}from'./sync-engine.js';
import{render as renderDashboard,init as initDashboard}from'./dashboard.js';
import{render as renderEmpleados,init as initEmpleados}from'./empleados.js';
import{render as renderCaptura,init as initCaptura}from'./captura.js';
import{render as renderEntregas,init as initEntregas}from'./entregas.js';
import{render as renderTotales,init as initTotales}from'./totales.js';
import{render as renderTablero}from'./tablero.js';
import{render as renderProveedores,init as initProveedores}from'./proveedores.js';
import{render as renderInventario,init as initInventario}from'./inventario.js';
import{render as renderSalidas,init as initSalidas}from'./salidas.js';
import{render as renderImportar,init as initImportar}from'./importar.js';
import{render as renderExportar,init as initExportar}from'./exportar.js';
import{render as renderCatalogo}from'./catalogo.js';
import{render as renderConfig,init as initConfig}from'./config-view.js';
import{render as renderAdminDash,init as initAdminDash}from'./admin-dashboard.js';
import{render as renderOperatorDelivery,init as initOperatorDelivery}from'./operator-delivery.js';
import{render as renderAdvancedReports,init as initAdvancedReports}from'./advanced-reports.js';import{render as renderEntregasV2,init as initEntregasV2}from'./mod-entregas-v2-ui.js';import{render as renderUsuarios,init as initUsuarios}from'./users.js';import{render as renderAreas,init as initAreas}from'./areas-config.js';import{render as renderCentroCostos,init as initCentroCostos}from'./centro-costos.js';import{render as renderCampanias,init as initCampanias}from'./campanias.js';import{render as renderStockUniformes,init as initStockUniformes}from'./stock-uniformes.js';import{render as renderBitacora,init as initBitacora}from'./bitacora.js';
const views={dashboard:{render:renderDashboard,init:initDashboard},empleados:{render:renderEmpleados,init:initEmpleados},captura:{render:renderCaptura,init:initCaptura},entregas:{render:renderEntregas,init:initEntregas},entregasv2:{render:renderEntregasV2,init:initEntregasV2},totales:{render:renderTotales,init:initTotales},tablero:{render:renderTablero},proveedores:{render:renderProveedores,init:initProveedores},inventario:{render:renderInventario,init:initInventario},salidas:{render:renderSalidas,init:initSalidas},importar:{render:renderImportar,init:initImportar},exportar:{render:renderExportar,init:initExportar},catalogo:{render:renderCatalogo},config:{render:renderConfig,init:initConfig},admin:{render:renderAdminDash,init:initAdminDash},operador:{render:renderOperatorDelivery,init:initOperatorDelivery},reportes:{render:renderAdvancedReports,init:initAdvancedReports},usuarios:{render:renderUsuarios,init:initUsuarios},areas:{render:renderAreas,init:initAreas},'centro-costos':{render:renderCentroCostos,init:initCentroCostos},campanias:{render:renderCampanias,init:initCampanias},'stock-uniformes':{render:renderStockUniformes,init:initStockUniformes},bitacora:{render:renderBitacora,init:initBitacora}};window.views=views;
let currentView='dashboard';
function navigate(v){currentView=v;history.pushState({v},'','#'+v);buildNav(currentView);render();}
function render(){destroyCharts();const m=document.getElementById('mainContent');const view=views[currentView]||views.dashboard;m.innerHTML=view.render();if(view.init)view.init();}
window.addEventListener('popstate',e=>{const v=(e.state&&e.state.v)||location.hash.slice(1)||'dashboard';currentView=views[v]?v:'dashboard';buildNav(currentView);render();});
(async function(){initStorage(REGLAS);initUserRoles();if(!initAuth()){return;}initDeliveryEvidence();await initOfflineStorage().catch(e=>console.warn('[OFFLINE]',e));const role=getUserRole();const isOp=role==='operador';const defView=isOp?'empleados':'dashboard';const _v=location.hash.slice(1)||defView;currentView=(views[_v]&&!(isOp&&_v==='dashboard')&&!(role==='consulta'&&_v==='admin'))?_v:defView;buildNav(currentView);setupEvents(navigate);render();console.log('[ASSA ABLOY] Sistema de Uniformes v'+VERSION+' — Listo.');// Iniciar sync con Supabase en segundo plano (no bloquea UI)
initSync().catch(e=>console.warn('[SYNC] Error al iniciar:',e));})();

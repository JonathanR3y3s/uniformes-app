import{REGLAS,VERSION}from'./config.js';import{init as initStorage}from'./storage.js';import{initOfflineStorage}from'./offline-storage.js';import{initUserRoles}from'./user-roles.js';import{initDeliveryEvidence}from'./delivery-evidence.js';import{buildNav,setupEvents,destroyCharts}from'./ui.js';
import{render as renderDashboard,init as initDashboard}from'./dashboard.js';
import{render as renderEmpleados,init as initEmpleados}from'./empleados.js';
import{render as renderCaptura,init as initCaptura}from'./captura.js';
import{render as renderEntregas,init as initEntregas}from'./entregas.js';
import{render as renderTotales}from'./totales.js';
import{render as renderTablero}from'./tablero.js';
import{render as renderProveedores,init as initProveedores}from'./proveedores.js';
import{render as renderInventario}from'./inventario.js';
import{render as renderSalidas,init as initSalidas}from'./salidas.js';
import{render as renderImportar,init as initImportar}from'./importar.js';
import{render as renderExportar}from'./exportar.js';
import{render as renderCatalogo}from'./catalogo.js';
import{render as renderConfig,init as initConfig}from'./config-view.js';
import{render as renderAdminDash,init as initAdminDash}from'./admin-dashboard.js';
import{render as renderOperatorDelivery,init as initOperatorDelivery}from'./operator-delivery.js';
import{render as renderAdvancedReports,init as initAdvancedReports}from'./advanced-reports.js';
const views={dashboard:{render:renderDashboard,init:initDashboard},empleados:{render:renderEmpleados,init:initEmpleados},captura:{render:renderCaptura,init:initCaptura},entregas:{render:renderEntregas,init:initEntregas},totales:{render:renderTotales},tablero:{render:renderTablero},proveedores:{render:renderProveedores,init:initProveedores},inventario:{render:renderInventario},salidas:{render:renderSalidas,init:initSalidas},importar:{render:renderImportar,init:initImportar},exportar:{render:renderExportar},catalogo:{render:renderCatalogo},config:{render:renderConfig,init:initConfig},admin:{render:renderAdminDash,init:initAdminDash},operador:{render:renderOperatorDelivery,init:initOperatorDelivery},reportes:{render:renderAdvancedReports,init:initAdvancedReports}};window.views=views;
let currentView='dashboard';
function navigate(v){currentView=v;history.pushState({v},'','#'+v);buildNav(currentView);render();}
function render(){destroyCharts();const m=document.getElementById('mainContent');const view=views[currentView]||views.dashboard;m.innerHTML=view.render();if(view.init)view.init();}
window.addEventListener('popstate',e=>{const v=(e.state&&e.state.v)||location.hash.slice(1)||'dashboard';currentView=views[v]?v:'dashboard';buildNav(currentView);render();});
(async function(){initStorage(REGLAS);initUserRoles();initDeliveryEvidence();await initOfflineStorage().catch(e=>console.warn('[OFFLINE]',e));const v=location.hash.slice(1)||'dashboard';currentView=views[v]?v:'dashboard';buildNav(currentView);setupEvents(navigate);render();console.log('[ASSA ABLOY] Sistema de Uniformes v'+VERSION+' — Listo.');})();

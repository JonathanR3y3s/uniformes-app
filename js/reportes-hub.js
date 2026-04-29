import * as reportesGeneral from './reportes.js';
import * as reportesAvanzados from './advanced-reports.js';
import * as centroCostos from './centro-costos.js';
import { destroyCharts } from './ui.js';

const tabs = [
  { id: 'general', label: 'General', module: reportesGeneral },
  { id: 'avanzados', label: 'Avanzados', module: reportesAvanzados },
  { id: 'centro-costos', label: 'Financiero Ejecutivo', module: centroCostos },
];

let activeTab = 'general';

function getActiveTab() {
  return tabs.find(tab => tab.id === activeTab) || tabs[0];
}

function renderActiveModule() {
  const tab = getActiveTab();
  return typeof tab.module.render === 'function' ? tab.module.render() : '';
}

function initActiveModule() {
  const tab = getActiveTab();
  if (typeof tab.module.init === 'function') tab.module.init();
}

function mountActiveModule() {
  const content = document.getElementById('reportesHubContent');
  if (!content) return;
  destroyCharts();
  content.innerHTML = renderActiveModule();
  initActiveModule();
}

export function render() {
  return `
    <div class="page-head">
      <div class="page-title">
        <h1>Reportes</h1>
        <p>Hub operativo, avanzado y financiero ejecutivo</p>
      </div>
    </div>
    <div class="tabs mb-4" id="reportesHubTabs" style="display:flex;gap:8px;flex-wrap:wrap">
      ${tabs.map(tab => `
        <button class="tab-btn ${tab.id === activeTab ? 'active' : ''}" data-tab="${tab.id}" style="padding:10px 16px;border-radius:10px;background:${tab.id === activeTab ? 'var(--primary)' : 'var(--surface)'};color:${tab.id === activeTab ? '#fff' : 'var(--text-sec)'};border:1px solid var(--border);font-weight:700">
          ${tab.label}
        </button>
      `).join('')}
    </div>
    <div id="reportesHubContent">${renderActiveModule()}</div>
  `;
}

export function init() {
  document.querySelectorAll('#reportesHubTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab || 'general';
      document.querySelectorAll('#reportesHubTabs .tab-btn').forEach(tabBtn => {
        const isActive = tabBtn.dataset.tab === activeTab;
        tabBtn.classList.toggle('active', isActive);
        tabBtn.style.background = isActive ? 'var(--primary)' : 'var(--surface)';
        tabBtn.style.color = isActive ? '#fff' : 'var(--text-sec)';
      });
      mountActiveModule();
    });
  });
  initActiveModule();
}

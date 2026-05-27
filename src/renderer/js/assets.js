/**
 * assets.js — Módulo de Inventário de Ativos (Sprint 1.2)
 */

import { State } from './state.js';
import { escapeHtml } from './dom.js';

let assetsList = [];

export async function loadAssets() {
  try {
    // Carrega ativos via API do GLPI (se disponível)
    if (window.electronAPI) {
      const result = await window.electronAPI.glpiGetAssets();
      if (result && result.ok && Array.isArray(result.data)) {
        assetsList = result.data;
      }
    }

    // Fallback: usa dados mockados se API não disponível
    if (assetsList.length === 0) {
      assetsList = generateMockAssets();
    }

    renderAssetsTable();
  } catch (err) {
    console.error('Erro ao carregar ativos:', err);
    assetsList = generateMockAssets();
    renderAssetsTable();
  }
}

function generateMockAssets() {
  return [
    {
      id: 1,
      name: 'Desktop Principal',
      description: 'Computador de trabalho',
      type: 'computer',
      model: 'Dell OptiPlex 5070',
      serial: 'N5R4C63',
      status: 'active',
      location: 'Sala 101',
      purchase_date: '2022-03-15'
    },
    {
      id: 2,
      name: 'Monitor LG 27"',
      description: 'Monitor principal',
      type: 'monitor',
      model: 'LG 27UP550',
      serial: 'LG-2023-001',
      status: 'active',
      location: 'Sala 101',
      purchase_date: '2023-01-20'
    },
    {
      id: 3,
      name: 'Impressora HP LaserJet',
      description: 'Impressora multifuncional',
      type: 'printer',
      model: 'HP M428fdn',
      serial: 'HPLJ-5432',
      status: 'active',
      location: 'Recepção',
      purchase_date: '2021-06-10'
    },
    {
      id: 4,
      name: 'Switch Cisco',
      description: 'Switch de rede principal',
      type: 'network',
      model: 'Cisco Catalyst 2960X',
      serial: 'CISCO-NET-001',
      status: 'active',
      location: 'Sala de Servidores',
      purchase_date: '2020-11-05'
    },
    {
      id: 5,
      name: 'Webcam Logitech',
      description: 'Webcam USB',
      type: 'peripheral',
      model: 'Logitech C920',
      serial: 'LOGITECH-2023-01',
      status: 'inactive',
      location: 'Almoxarifado',
      purchase_date: '2022-08-12'
    }
  ];
}

export function renderAssetsTable() {
  const tbody = document.getElementById('assets-tbody');
  if (!tbody) return;

  if (assetsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum ativo encontrado.</td></tr>';
    return;
  }

  let html = '';
  assetsList.forEach(asset => {
    const statusColor = asset.status === 'active' ? 'green' : asset.status === 'inactive' ? 'gray' : 'red';
    const statusText = asset.status === 'active' ? 'Ativo' : asset.status === 'inactive' ? 'Inativo' : 'Descontinuado';
    const typeIcon = getAssetTypeIcon(asset.type);

    html += `
      <tr>
        <td class="ticket-id">#${asset.id}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${typeIcon}</span>
            <div>
              <div style="font-weight: 600;">${escapeHtml(asset.name)}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(asset.description || 'Sem descrição')}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(formatAssetType(asset.type))}</td>
        <td style="color: var(--text-secondary);">${escapeHtml(asset.model || '--')}</td>
        <td style="font-family: monospace; font-size: 12px; color: var(--text-muted);">${escapeHtml(asset.serial || '--')}</td>
        <td>
          <div class="status-pill">
            <span class="status-pill-dot ${statusColor}"></span>
            <span>${statusText}</span>
          </div>
        </td>
        <td>
          <button class="action-btn" onclick="viewAssetDetails(${asset.id})" aria-label="Ver detalhes do ativo #${asset.id}">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function getAssetTypeIcon(type) {
  const icons = {
    'computer': '💻',
    'monitor': '🖥️',
    'printer': '🖨️',
    'network': '🌐',
    'peripheral': '⌨️'
  };
  return icons[type] || '📦';
}

function formatAssetType(type) {
  const types = {
    'computer': 'Computador',
    'monitor': 'Monitor',
    'printer': 'Impressora',
    'network': 'Rede',
    'peripheral': 'Periférico'
  };
  return types[type] || type;
}

export function filterAssetsTable() {
  const searchInput = document.getElementById('search-assets-input')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('filter-assets-type')?.value || 'all';
  const statusFilter = document.getElementById('filter-assets-status')?.value || 'all';

  const filtered = assetsList.filter(asset => {
    const matchesSearch = !searchInput ||
      asset.name.toLowerCase().includes(searchInput) ||
      asset.model.toLowerCase().includes(searchInput) ||
      asset.serial.toLowerCase().includes(searchInput);

    const matchesType = typeFilter === 'all' || asset.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Renderiza resultados filtrados temporariamente
  const tbody = document.getElementById('assets-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum ativo encontrado com os filtros aplicados.</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach(asset => {
    const statusColor = asset.status === 'active' ? 'green' : asset.status === 'inactive' ? 'gray' : 'red';
    const statusText = asset.status === 'active' ? 'Ativo' : asset.status === 'inactive' ? 'Inativo' : 'Descontinuado';
    const typeIcon = getAssetTypeIcon(asset.type);

    html += `
      <tr>
        <td class="ticket-id">#${asset.id}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${typeIcon}</span>
            <div>
              <div style="font-weight: 600;">${escapeHtml(asset.name)}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(asset.description || 'Sem descrição')}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(formatAssetType(asset.type))}</td>
        <td style="color: var(--text-secondary);">${escapeHtml(asset.model || '--')}</td>
        <td style="font-family: monospace; font-size: 12px; color: var(--text-muted);">${escapeHtml(asset.serial || '--')}</td>
        <td>
          <div class="status-pill">
            <span class="status-pill-dot ${statusColor}"></span>
            <span>${statusText}</span>
          </div>
        </td>
        <td>
          <button class="action-btn" onclick="viewAssetDetails(${asset.id})" aria-label="Ver detalhes do ativo #${asset.id}">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

export function resetAssetsFilters() {
  const inputs = [
    document.getElementById('search-assets-input'),
    document.getElementById('filter-assets-type'),
    document.getElementById('filter-assets-status')
  ];
  inputs.forEach(input => {
    if (input) input.value = input.id === 'search-assets-input' ? '' : 'all';
  });
  renderAssetsTable();
}

export function viewAssetDetails(assetId) {
  const asset = assetsList.find(a => a.id === assetId);
  if (!asset) {
    alert('Ativo não encontrado');
    return;
  }

  const details = `
ID: #${asset.id}
Nome: ${asset.name}
Descrição: ${asset.description || 'Sem descrição'}
Tipo: ${formatAssetType(asset.type)}
Modelo: ${asset.model}
Serial: ${asset.serial}
Status: ${asset.status === 'active' ? 'Ativo' : asset.status === 'inactive' ? 'Inativo' : 'Descontinuado'}
Localização: ${asset.location}
Data de Compra: ${asset.purchase_date}
  `;

  alert(details);
}

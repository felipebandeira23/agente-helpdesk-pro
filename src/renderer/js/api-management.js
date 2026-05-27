/**
 * api-management.js — Módulo de Gerenciamento de APIs e Integrações (Sprint 6.0)
 */

import { State } from './state.js';

let apiKeys = [];
let webhooks = [];
let integrations = [];
let apiLogs = [];
let rateLimits = {};

export function initializeAPIManagement() {
  // Load API keys
  const keysStored = localStorage.getItem('api-keys');
  if (keysStored) {
    try {
      apiKeys = JSON.parse(keysStored);
    } catch (e) {
      console.error('Erro ao carregar API keys:', e);
    }
  }

  // Initialize default API key if none exists
  if (apiKeys.length === 0) {
    const defaultKey = generateAPIKey();
    apiKeys.push({
      id: 'key-default',
      name: 'Chave Padrão',
      key: defaultKey,
      secret: generateAPISecret(),
      permissions: ['read:tickets', 'write:tickets', 'read:reports'],
      rateLimit: 1000,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      usageCount: 0
    });
  }

  // Load webhooks
  const webhooksStored = localStorage.getItem('webhooks');
  if (webhooksStored) {
    try {
      webhooks = JSON.parse(webhooksStored);
    } catch (e) {
      console.error('Erro ao carregar webhooks:', e);
    }
  }

  // Initialize default webhooks
  if (webhooks.length === 0) {
    webhooks = [
      {
        id: 'webhook-1',
        name: 'Ticket Created',
        url: 'https://example.com/webhooks/ticket-created',
        events: ['ticket.created'],
        enabled: false,
        createdAt: new Date().toISOString()
      },
      {
        id: 'webhook-2',
        name: 'Ticket Closed',
        url: 'https://example.com/webhooks/ticket-closed',
        events: ['ticket.closed'],
        enabled: false,
        createdAt: new Date().toISOString()
      }
    ];
  }

  // Load integrations
  const integrationsStored = localStorage.getItem('integrations');
  if (integrationsStored) {
    try {
      integrations = JSON.parse(integrationsStored);
    } catch (e) {
      console.error('Erro ao carregar integrações:', e);
    }
  }

  // Initialize available integrations
  if (integrations.length === 0) {
    integrations = [
      {
        id: 'zapier',
        name: 'Zapier',
        icon: '🔄',
        description: 'Automação e integrações com 5000+ apps',
        enabled: false,
        config: {}
      },
      {
        id: 'slack',
        name: 'Slack',
        icon: '⚙️',
        description: 'Notificações de tickets no Slack',
        enabled: false,
        config: { webhookUrl: '' }
      },
      {
        id: 'stripe',
        name: 'Stripe',
        icon: '💳',
        description: 'Processamento de pagamentos',
        enabled: false,
        config: { apiKey: '' }
      },
      {
        id: 'github',
        name: 'GitHub',
        icon: '🐙',
        description: 'Sincronizar issues com GitHub',
        enabled: false,
        config: { token: '' }
      },
      {
        id: 'jira',
        name: 'Jira',
        icon: '📊',
        description: 'Sincronizar com Jira Cloud',
        enabled: false,
        config: { apiUrl: '', token: '' }
      }
    ];
  }

  // Load API logs
  const logsStored = localStorage.getItem('api-logs');
  if (logsStored) {
    try {
      apiLogs = JSON.parse(logsStored).slice(-100); // Keep last 100 logs
    } catch (e) {
      console.error('Erro ao carregar logs de API:', e);
    }
  }

  saveAPIData();
  return { apiKeys, webhooks, integrations };
}

function generateAPIKey() {
  return 'hd_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function generateAPISecret() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function createAPIKey(name, permissions) {
  const key = {
    id: `key-${Date.now()}`,
    name,
    key: generateAPIKey(),
    secret: generateAPISecret(),
    permissions,
    rateLimit: 1000,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    usageCount: 0
  };

  apiKeys.push(key);
  saveAPIData();
  return key;
}

export function revokeAPIKey(keyId) {
  const index = apiKeys.findIndex(k => k.id === keyId);
  if (index > -1) {
    apiKeys.splice(index, 1);
    saveAPIData();
    return true;
  }
  return false;
}

export function getAPIKeys() {
  return apiKeys;
}

export function createWebhook(name, url, events) {
  const webhook = {
    id: `webhook-${Date.now()}`,
    name,
    url,
    events,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    deliveryCount: 0
  };

  webhooks.push(webhook);
  saveAPIData();
  return webhook;
}

export function deleteWebhook(webhookId) {
  const index = webhooks.findIndex(w => w.id === webhookId);
  if (index > -1) {
    webhooks.splice(index, 1);
    saveAPIData();
    return true;
  }
  return false;
}

export function toggleWebhook(webhookId) {
  const webhook = webhooks.find(w => w.id === webhookId);
  if (webhook) {
    webhook.enabled = !webhook.enabled;
    saveAPIData();
    return webhook.enabled;
  }
  return null;
}

export function getWebhooks() {
  return webhooks;
}

export function toggleIntegration(integrationId) {
  const integration = integrations.find(i => i.id === integrationId);
  if (integration) {
    integration.enabled = !integration.enabled;
    saveAPIData();
    return integration.enabled;
  }
  return null;
}

export function updateIntegrationConfig(integrationId, config) {
  const integration = integrations.find(i => i.id === integrationId);
  if (integration) {
    integration.config = config;
    saveAPIData();
    return integration;
  }
  return null;
}

export function getIntegrations() {
  return integrations;
}

export function logAPICall(method, endpoint, statusCode, responseTime, apiKeyId) {
  const log = {
    id: `log-${Date.now()}`,
    method,
    endpoint,
    statusCode,
    responseTime,
    apiKeyId,
    timestamp: new Date().toISOString()
  };

  apiLogs.push(log);

  // Keep only last 500 logs
  if (apiLogs.length > 500) {
    apiLogs = apiLogs.slice(-500);
  }

  saveAPIData();

  // Update rate limits
  if (!rateLimits[apiKeyId]) {
    rateLimits[apiKeyId] = { count: 0, resetTime: Date.now() + 3600000 };
  }
  rateLimits[apiKeyId].count++;

  // Update key usage
  const key = apiKeys.find(k => k.id === apiKeyId);
  if (key) {
    key.lastUsed = new Date().toISOString();
    key.usageCount = (key.usageCount || 0) + 1;
    saveAPIData();
  }

  return log;
}

export function getAPILogs() {
  return apiLogs;
}

function saveAPIData() {
  localStorage.setItem('api-keys', JSON.stringify(apiKeys));
  localStorage.setItem('webhooks', JSON.stringify(webhooks));
  localStorage.setItem('integrations', JSON.stringify(integrations));
  localStorage.setItem('api-logs', JSON.stringify(apiLogs));
}

export function renderAPIKeys() {
  const container = document.getElementById('api-keys-container');
  if (!container) return;

  if (apiKeys.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhuma chave de API.</p>';
    return;
  }

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th>Nome</th>
          <th style="width: 150px;">Chave</th>
          <th style="width: 100px;">Uso</th>
          <th style="width: 100px;">Status</th>
          <th style="width: 100px;">Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  apiKeys.forEach(key => {
    const displayKey = key.key.substring(0, 8) + '...' + key.key.substring(key.key.length - 4);
    const statusBadge = key.enabled
      ? '<span class="badge badge-high" style="background: rgba(0, 210, 147, 0.1); color: var(--success);">Ativa</span>'
      : '<span class="badge badge-critical">Desativada</span>';

    html += `
      <tr>
        <td>${escapeHtml(key.name)}</td>
        <td style="font-family: monospace; font-size: 11px;">${displayKey}</td>
        <td>${key.usageCount || 0} chamadas</td>
        <td>${statusBadge}</td>
        <td>
          <button class="action-btn" onclick="revokeAPIKey('${key.id}'); renderAPIKeys();" title="Revogar">
            🗑️
          </button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

export function renderWebhooks() {
  const container = document.getElementById('webhooks-container');
  if (!container) return;

  if (webhooks.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum webhook configurado.</p>';
    return;
  }

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Eventos</th>
          <th style="width: 80px;">Status</th>
          <th style="width: 100px;">Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  webhooks.forEach(webhook => {
    const statusBadge = webhook.enabled
      ? '<span class="badge badge-high" style="background: rgba(0, 210, 147, 0.1); color: var(--success);">Ativo</span>'
      : '<span class="badge badge-critical">Inativo</span>';

    html += `
      <tr>
        <td>${escapeHtml(webhook.name)}</td>
        <td style="font-size: 11px;">${webhook.events.join(', ')}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="action-btn" onclick="toggleWebhook('${webhook.id}'); renderWebhooks();" title="Toggle">
            ${webhook.enabled ? '✕' : '✓'}
          </button>
          <button class="action-btn" onclick="deleteWebhook('${webhook.id}'); renderWebhooks();" title="Deletar">
            🗑️
          </button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

export function renderIntegrations() {
  const container = document.getElementById('integrations-container');
  if (!container) return;

  let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">';

  integrations.forEach(integration => {
    const statusClass = integration.enabled ? 'connected' : 'disconnected';
    const statusText = integration.enabled ? 'Conectado' : 'Desconectado';

    html += `
      <div style="border: 1px solid var(--border-glass); border-radius: 8px; padding: 16px; background: rgba(255, 255, 255, 0.01);">
        <div style="font-size: 24px; margin-bottom: 8px;">${integration.icon}</div>
        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">${integration.name}</h4>
        <p style="font-size: 11px; color: var(--text-secondary); margin-bottom: 12px;">${escapeHtml(integration.description)}</p>
        <div style="display: flex; gap: 8px;">
          <button class="btn-secondary" style="flex: 1; padding: 8px; font-size: 11px;" onclick="toggleIntegration('${integration.id}'); renderIntegrations();">
            ${integration.enabled ? '🔌 Desconectar' : '🔌 Conectar'}
          </button>
          ${integration.enabled ? `
            <button class="action-btn" style="flex: 0 0 40px;" onclick="openIntegrationConfig('${integration.id}')" title="Configurar">
              ⚙️
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

export function renderAPILogs() {
  const container = document.getElementById('api-logs-container');
  if (!container) return;

  if (apiLogs.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum log de API disponível.</p>';
    return;
  }

  // Show latest logs
  const recentLogs = apiLogs.slice(-20).reverse();

  let html = `
    <table class="table-container" style="width: 100%; font-size: 12px;">
      <thead>
        <tr>
          <th style="width: 80px;">Método</th>
          <th style="flex: 1;">Endpoint</th>
          <th style="width: 60px;">Status</th>
          <th style="width: 60px;">Tempo (ms)</th>
          <th style="width: 120px;">Timestamp</th>
        </tr>
      </thead>
      <tbody>
  `;

  recentLogs.forEach(log => {
    const statusColor = log.statusCode >= 200 && log.statusCode < 300 ? 'var(--success)' : 'var(--danger)';

    html += `
      <tr>
        <td style="font-weight: 600;">${log.method}</td>
        <td style="font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(log.endpoint)}</td>
        <td style="color: ${statusColor}; font-weight: 600;">${log.statusCode}</td>
        <td>${log.responseTime}ms</td>
        <td>${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

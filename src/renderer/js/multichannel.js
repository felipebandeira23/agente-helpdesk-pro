/**
 * multichannel.js — Módulo de Chat Multi-canal (Sprint 3.0)
 */

import { State } from './state.js';

const channels = [];
const channelMessages = {};

export function initializeChannels() {
  const defaultChannels = [
    {
      id: 'native',
      name: 'Helpdesk Nativo',
      icon: '💬',
      type: 'native',
      enabled: true,
      config: {}
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      icon: '📱',
      type: 'whatsapp',
      enabled: false,
      config: {
        apiUrl: '',
        apiKey: '',
        phoneNumber: ''
      }
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      icon: '🔷',
      type: 'teams',
      enabled: false,
      config: {
        webhookUrl: '',
        channelId: '',
        tenantId: ''
      }
    },
    {
      id: 'slack',
      name: 'Slack Workspace',
      icon: '⚙️',
      type: 'slack',
      enabled: false,
      config: {
        webhookUrl: '',
        channelId: '',
        botToken: ''
      }
    }
  ];

  channels.length = 0;
  channels.push(...defaultChannels);

  // Initialize message storage for each channel
  channels.forEach(channel => {
    if (!channelMessages[channel.id]) {
      channelMessages[channel.id] = [];
    }
  });

  // Load persisted config
  const stored = localStorage.getItem('multichannel-config');
  if (stored) {
    try {
      const storedChannels = JSON.parse(stored);
      storedChannels.forEach(storedChannel => {
        const channel = channels.find(c => c.id === storedChannel.id);
        if (channel) {
          channel.enabled = storedChannel.enabled;
          channel.config = storedChannel.config;
        }
      });
    } catch (e) {
      console.error('Erro ao carregar configuração de canais:', e);
    }
  }

  return channels;
}

export function getChannels() {
  return channels;
}

export function updateChannelConfig(channelId, config) {
  const channel = channels.find(c => c.id === channelId);
  if (channel) {
    channel.config = config;
    persistChannelConfig();
    return true;
  }
  return false;
}

export function toggleChannel(channelId) {
  const channel = channels.find(c => c.id === channelId);
  if (channel) {
    channel.enabled = !channel.enabled;
    persistChannelConfig();

    // Simulate connection/disconnection
    if (channel.enabled) {
      console.log(`[MULTICHANNEL] Conectado ao canal: ${channel.name}`);
    } else {
      console.log(`[MULTICHANNEL] Desconectado do canal: ${channel.name}`);
    }

    return channel.enabled;
  }
  return null;
}

function persistChannelConfig() {
  const config = channels.map(c => ({
    id: c.id,
    enabled: c.enabled,
    config: c.config
  }));
  localStorage.setItem('multichannel-config', JSON.stringify(config));
}

export function sendMultichannelMessage(ticketId, message, targetChannels = null) {
  const enabledChannels = targetChannels
    ? channels.filter(c => targetChannels.includes(c.id) && c.enabled)
    : channels.filter(c => c.enabled);

  const results = [];

  enabledChannels.forEach(channel => {
    const msg = {
      id: Date.now() + Math.random(),
      channelId: channel.id,
      ticketId,
      text: message,
      timestamp: new Date().toISOString(),
      status: 'sent',
      sender: 'agent'
    };

    if (!channelMessages[channel.id]) {
      channelMessages[channel.id] = [];
    }

    // Simulate message routing based on channel type
    if (channel.type === 'whatsapp') {
      msg.status = sendToWhatsApp(ticketId, message);
    } else if (channel.type === 'teams') {
      msg.status = sendToTeams(ticketId, message);
    } else if (channel.type === 'slack') {
      msg.status = sendToSlack(ticketId, message);
    }

    channelMessages[channel.id].push(msg);
    results.push({
      channel: channel.name,
      status: msg.status
    });
  });

  return results;
}

function sendToWhatsApp(ticketId, message) {
  // Simulated WhatsApp API call
  const channel = channels.find(c => c.id === 'whatsapp');
  if (!channel.config.apiKey) return 'error';

  console.log(`[WHATSAPP] Enviando mensagem do ticket #${ticketId}`);
  return 'pending';
}

function sendToTeams(ticketId, message) {
  // Simulated Teams API call
  const channel = channels.find(c => c.id === 'teams');
  if (!channel.config.webhookUrl) return 'error';

  console.log(`[TEAMS] Enviando mensagem do ticket #${ticketId}`);
  return 'pending';
}

function sendToSlack(ticketId, message) {
  // Simulated Slack API call
  const channel = channels.find(c => c.id === 'slack');
  if (!channel.config.botToken) return 'error';

  console.log(`[SLACK] Enviando mensagem do ticket #${ticketId}`);
  return 'pending';
}

export function getChannelMessages(channelId) {
  return channelMessages[channelId] || [];
}

export function renderChannelConfig() {
  const container = document.getElementById('multichannel-config-container');
  if (!container) return;

  let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">';

  channels.forEach(channel => {
    const statusClass = channel.enabled ? 'active' : 'inactive';
    const statusText = channel.enabled ? 'Ativo' : 'Inativo';

    html += `
      <div style="border: 1px solid var(--border-glass); border-radius: 8px; padding: 16px; background: rgba(255, 255, 255, 0.01);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <div style="font-size: 20px; margin-bottom: 4px;">${channel.icon}</div>
            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 2px;">${channel.name}</h4>
            <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: ${channel.enabled ? 'rgba(0, 210, 147, 0.1)' : 'rgba(100, 100, 100, 0.1)'}; color: ${channel.enabled ? 'var(--accent-neon)' : 'var(--text-muted)'};">${statusText}</span>
          </div>
          <label class="checklist-item" style="margin-bottom: 0;">
            <input type="checkbox" ${channel.enabled ? 'checked' : ''} onchange="toggleMultichannelChannel('${channel.id}')">
          </label>
        </div>

        ${channel.type !== 'native' ? `
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); border-radius: 6px; padding: 10px; margin-top: 12px;">
            <button type="button" class="btn-secondary" style="width: 100%; padding: 8px; font-size: 11px;" onclick="openChannelConfigModal('${channel.id}')">
              ⚙️ Configurar
            </button>
          </div>
        ` : ''}
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

export function renderChannelStatus() {
  const container = document.getElementById('channel-status-container');
  if (!container) return;

  const enabledCount = channels.filter(c => c.enabled).length;
  const totalCount = channels.length;

  let html = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
  `;

  channels.forEach(channel => {
    if (!channel.enabled) return;

    html += `
      <div style="background: rgba(0, 210, 147, 0.05); border: 1px solid rgba(0, 210, 147, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 18px; margin-bottom: 6px;">${channel.icon}</div>
        <div style="font-size: 12px; font-weight: 600; color: var(--accent-neon);">${channel.name}</div>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Conectado</div>
      </div>
    `;
  });

  html += '</div>';
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

/**
 * portal.js — Módulo de Portal de Auto-atendimento do Cliente (Sprint 3.1)
 */

import { State } from './state.js';

const portalSettings = {
  enabled: true,
  baseUrl: 'https://helpdesk.example.com/portal',
  apiUrl: 'https://api.helpdesk.example.com',
  allowedFeatures: ['view-tickets', 'submit-ticket', 'view-kb'],
  requiresLogin: true,
  sessionTimeout: 3600000, // 1 hour
  enabledLanguages: ['pt-BR', 'en-US'],
  supportedCategories: []
};

export function initializePortal() {
  const stored = localStorage.getItem('portal-settings');
  if (stored) {
    try {
      const settings = JSON.parse(stored);
      Object.assign(portalSettings, settings);
    } catch (e) {
      console.error('Erro ao carregar configurações do portal:', e);
    }
  }

  // Copy supported categories from State
  if (State.categoriesList && State.categoriesList.length > 0) {
    portalSettings.supportedCategories = State.categoriesList.map(c => ({
      id: c.id,
      name: c.name
    }));
  }

  return portalSettings;
}

export function generatePortalLink() {
  const uuid = generateUUID();
  return `${portalSettings.baseUrl}?token=${uuid}`;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getPortalSettings() {
  return portalSettings;
}

export function updatePortalSettings(settings) {
  Object.assign(portalSettings, settings);
  localStorage.setItem('portal-settings', JSON.stringify(portalSettings));
  return portalSettings;
}

export function togglePortalFeature(feature) {
  const index = portalSettings.allowedFeatures.indexOf(feature);
  if (index > -1) {
    portalSettings.allowedFeatures.splice(index, 1);
  } else {
    portalSettings.allowedFeatures.push(feature);
  }
  localStorage.setItem('portal-settings', JSON.stringify(portalSettings));
  return portalSettings.allowedFeatures;
}

export function getKnowledgeBase() {
  const kb = [
    {
      id: 1,
      title: 'Como redefinir minha senha?',
      category: 'Conta',
      content: 'Para redefinir sua senha, visite a página de login e clique em "Esqueci minha senha". Siga as instruções enviadas por email.',
      views: 234
    },
    {
      id: 2,
      title: 'Como conectar-se à VPN da empresa?',
      category: 'Rede',
      content: 'Instale o cliente VPN fornecido pela TI. Configure com seu usuário corporativo e a senha fornecida na sua orientação inicial.',
      views: 512
    },
    {
      id: 3,
      title: 'Como instalar o Microsoft Office?',
      category: 'Software',
      content: 'Acesse o portal de software corporativo com suas credenciais. Selecione Microsoft Office e clique em "Instalar".',
      views: 389
    },
    {
      id: 4,
      title: 'Impressora não está conectada',
      category: 'Periféricos',
      content: 'Verifique se o cabo USB está conectado. Reinstale o driver de impressora do website do fabricante ou acesse "Adicionar Impressora" nas configurações.',
      views: 156
    },
    {
      id: 5,
      title: 'Como compartilhar arquivos na nuvem?',
      category: 'Armazenamento',
      content: 'Use o OneDrive corporativo ou SharePoint. Faça upload do arquivo e use o botão "Compartilhar" para gerar links de acesso.',
      views: 278
    }
  ];

  return kb;
}

export function renderPortalSetup() {
  const container = document.getElementById('portal-setup-container');
  if (!container) return;

  const portalLink = generatePortalLink();

  let html = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div style="background: rgba(0, 210, 147, 0.05); border: 1px solid rgba(0, 210, 147, 0.2); border-radius: 8px; padding: 16px;">
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Link do Portal</h4>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="text" value="${portalLink}" style="flex: 1; padding: 8px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: monospace;" readonly>
          <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px;" onclick="copyPortalLink()">📋 Copiar</button>
        </div>
        <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Compartilhe este link com os clientes para acessar o portal de auto-atendimento.</p>
      </div>

      <div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 10px;">Recursos Habilitados</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label class="checklist-item">
            <input type="checkbox" ${portalSettings.allowedFeatures.includes('view-tickets') ? 'checked' : ''} onchange="togglePortalFeature('view-tickets')">
            <span>Visualizar Chamados</span>
          </label>
          <label class="checklist-item">
            <input type="checkbox" ${portalSettings.allowedFeatures.includes('submit-ticket') ? 'checked' : ''} onchange="togglePortalFeature('submit-ticket')">
            <span>Abrir Novo Chamado</span>
          </label>
          <label class="checklist-item">
            <input type="checkbox" ${portalSettings.allowedFeatures.includes('view-kb') ? 'checked' : ''} onchange="togglePortalFeature('view-kb')">
            <span>Base de Conhecimento</span>
          </label>
          <label class="checklist-item">
            <input type="checkbox" ${portalSettings.allowedFeatures.includes('track-sla') ? 'checked' : ''} onchange="togglePortalFeature('track-sla')">
            <span>Rastrear SLA</span>
          </label>
        </div>
      </div>

      <div style="border-top: 1px solid var(--border-glass); padding-top: 12px;">
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 10px;">Configurações de Segurança</h4>
        <label class="checklist-item" style="margin-bottom: 8px;">
          <input type="checkbox" ${portalSettings.requiresLogin ? 'checked' : ''} onchange="updatePortalRequiresLogin(this.checked)">
          <span>Exigir login</span>
        </label>
        <label style="font-size: 12px; display: flex; align-items: center; gap: 8px;">
          <span>Timeout de sessão:</span>
          <input type="number" value="${portalSettings.sessionTimeout / 60000}" style="width: 80px; padding: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); border-radius: 4px; color: var(--text-primary);" onchange="updatePortalTimeout(this.value)" min="5"> minutos
        </label>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

export function renderKnowledgeBase() {
  const container = document.getElementById('kb-container');
  if (!container) return;

  const kb = getKnowledgeBase();

  let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">';

  kb.forEach(article => {
    html += `
      <div style="border: 1px solid var(--border-glass); border-radius: 8px; padding: 16px; background: rgba(255, 255, 255, 0.01); cursor: pointer; transition: var(--transition-smooth);" onmouseover="this.style.background='rgba(0, 210, 147, 0.05)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.01)'">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <span style="font-size: 11px; padding: 2px 6px; background: rgba(0, 210, 147, 0.1); border-radius: 4px; color: var(--accent-neon);">${article.category}</span>
          <span style="font-size: 11px; color: var(--text-muted);">👁️ ${article.views}</span>
        </div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">${escapeHtml(article.title)}</h4>
        <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(article.content.substring(0, 100))}...</p>
        <button class="btn-secondary" style="width: 100%; margin-top: 12px; padding: 8px; font-size: 11px;">Ler Artigo →</button>
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

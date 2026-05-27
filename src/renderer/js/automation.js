/**
 * automation.js — Módulo de Automação e Workflows (Sprint 2.1)
 */

import { State } from './state.js';

const automationRules = [];
let ruleIdCounter = 1;

export function createAutomationRule(name, trigger, condition, action) {
  const rule = {
    id: ruleIdCounter++,
    name,
    trigger,
    condition,
    action,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    triggerCount: 0
  };

  automationRules.push(rule);
  localStorage.setItem('automation-rules', JSON.stringify(automationRules));
  return rule;
}

export function loadAutomationRules() {
  const stored = localStorage.getItem('automation-rules');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      automationRules.length = 0;
      automationRules.push(...parsed);
      ruleIdCounter = Math.max(...automationRules.map(r => r.id), 0) + 1;
    } catch (e) {
      console.error('Erro ao carregar regras de automação:', e);
    }
  }

  // Create default rules if none exist
  if (automationRules.length === 0) {
    createDefaultRules();
  }

  return automationRules;
}

function createDefaultRules() {
  // Regra 1: Auto-assign urgent tickets to specialists
  createAutomationRule(
    'Auto-atribuir chamados urgentes',
    'ticket-created',
    { urgency: 6 },
    { type: 'assign', value: 'specialist' }
  );

  // Regra 2: Auto-close resolved tickets after 24 hours
  createAutomationRule(
    'Fechar automaticamente após resolução',
    'ticket-status-changed',
    { status: 5, hoursElapsed: 24 },
    { type: 'close', value: 'auto' }
  );

  // Regra 3: Send notification on SLA breach
  createAutomationRule(
    'Notificar quando SLA está próximo',
    'sla-warning',
    { timeLeft: 3600000 },
    { type: 'notify', value: 'technician' }
  );

  // Regra 4: Auto-categorize by keywords
  createAutomationRule(
    'Auto-categorizar por palavras-chave',
    'ticket-created',
    { title: 'email|impressora|rede' },
    { type: 'categorize', value: 'auto' }
  );
}

export function deleteAutomationRule(ruleId) {
  const index = automationRules.findIndex(r => r.id === ruleId);
  if (index > -1) {
    automationRules.splice(index, 1);
    localStorage.setItem('automation-rules', JSON.stringify(automationRules));
    return true;
  }
  return false;
}

export function toggleAutomationRule(ruleId) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = !rule.enabled;
    localStorage.setItem('automation-rules', JSON.stringify(automationRules));
    return rule.enabled;
  }
  return null;
}

export function evaluateRules(ticket) {
  const results = [];

  automationRules.forEach(rule => {
    if (!rule.enabled) return;

    let triggered = false;

    // Check trigger type
    if (rule.trigger === 'ticket-created' && ticket.isNew) {
      triggered = evaluateCondition(rule.condition, ticket);
    } else if (rule.trigger === 'ticket-status-changed') {
      triggered = evaluateCondition(rule.condition, ticket);
    } else if (rule.trigger === 'sla-warning') {
      const now = Date.now();
      const resolveTime = new Date(ticket.time_to_resolve).getTime();
      const timeLeft = resolveTime - now;
      if (timeLeft > 0 && timeLeft <= rule.condition.timeLeft) {
        triggered = true;
      }
    }

    if (triggered) {
      rule.lastTriggered = new Date().toISOString();
      rule.triggerCount++;
      results.push(executeAction(rule.action, ticket));
    }
  });

  return results;
}

function evaluateCondition(condition, ticket) {
  if (condition.urgency && parseInt(ticket.urgency) !== condition.urgency) {
    return false;
  }
  if (condition.status && parseInt(ticket.status) !== condition.status) {
    return false;
  }
  if (condition.title) {
    const keywords = condition.title.split('|');
    const matches = keywords.some(kw =>
      ticket.name.toLowerCase().includes(kw.toLowerCase())
    );
    if (!matches) return false;
  }

  return true;
}

function executeAction(action, ticket) {
  const result = {
    action: action.type,
    ticketId: ticket.id,
    executed: true,
    message: ''
  };

  switch(action.type) {
    case 'assign':
      result.message = `Chamado #${ticket.id} atribuído automaticamente`;
      break;
    case 'close':
      result.message = `Chamado #${ticket.id} fechado automaticamente`;
      break;
    case 'notify':
      result.message = `Notificação enviada sobre o chamado #${ticket.id}`;
      break;
    case 'categorize':
      result.message = `Chamado #${ticket.id} categorizado automaticamente`;
      break;
    default:
      result.executed = false;
      result.message = 'Ação desconhecida';
  }

  return result;
}

export function renderAutomationRules() {
  const container = document.getElementById('automation-rules-container');
  if (!container) return;

  const rules = loadAutomationRules();

  if (rules.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Nenhuma regra de automação configurada.</p>';
    return;
  }

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th style="width: 40px;">Ativo</th>
          <th>Nome da Regra</th>
          <th style="width: 150px;">Gatilho</th>
          <th style="width: 150px;">Ação</th>
          <th style="width: 80px;">Acionada</th>
          <th style="width: 60px;">Ação</th>
        </tr>
      </thead>
      <tbody>
  `;

  rules.forEach(rule => {
    const statusCheck = `<input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleAutomationRule(${rule.id})">`;
    const triggerName = getTriggerName(rule.trigger);
    const actionName = getActionName(rule.action.type);

    html += `
      <tr>
        <td style="text-align: center;">${statusCheck}</td>
        <td><strong>${escapeHtml(rule.name)}</strong></td>
        <td>${triggerName}</td>
        <td>${actionName}</td>
        <td style="text-align: center;">${rule.triggerCount}</td>
        <td>
          <button class="action-btn" style="color: var(--danger);" onclick="deleteAutomationRule(${rule.id})" title="Deletar regra">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z"/></svg>
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

function getTriggerName(trigger) {
  const triggers = {
    'ticket-created': 'Novo Chamado',
    'ticket-status-changed': 'Status Alterado',
    'sla-warning': 'Aviso SLA',
    'ticket-closed': 'Chamado Fechado'
  };
  return triggers[trigger] || trigger;
}

function getActionName(actionType) {
  const actions = {
    'assign': 'Atribuir',
    'close': 'Fechar',
    'notify': 'Notificar',
    'categorize': 'Categorizar',
    'escalate': 'Escalar'
  };
  return actions[actionType] || actionType;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getAutomationRules() {
  return automationRules;
}

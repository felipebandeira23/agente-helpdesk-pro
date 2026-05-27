/**
 * payment.js — Módulo de Métodos de Pagamento e Gerenciamento de Assinaturas (Sprint 4.1)
 */

import { State } from './state.js';

let paymentMethods = [];
let subscriptions = [];
let paymentHistory = [];

export function initializePaymentMethods() {
  const stored = localStorage.getItem('payment-methods');
  if (stored) {
    try {
      paymentMethods = JSON.parse(stored);
    } catch (e) {
      console.error('Erro ao carregar métodos de pagamento:', e);
    }
  }

  // Initialize default payment method if none exists
  if (paymentMethods.length === 0) {
    paymentMethods = [
      {
        id: 'pm-default',
        type: 'credit-card',
        holder: 'Empresa Padrão',
        lastDigits: '4111',
        expiryMonth: 12,
        expiryYear: 2025,
        isDefault: true,
        createdAt: new Date().toISOString()
      }
    ];
    savePaymentData();
  }

  return paymentMethods;
}

export function initializeSubscriptions() {
  const stored = localStorage.getItem('subscriptions');
  if (stored) {
    try {
      subscriptions = JSON.parse(stored);
    } catch (e) {
      console.error('Erro ao carregar assinaturas:', e);
    }
  }

  // Initialize default subscription if none exists
  if (subscriptions.length === 0) {
    subscriptions = [
      {
        id: 'sub-default',
        planId: 'professional',
        customerId: null,
        status: 'active',
        billingCycle: 'monthly',
        amount: 299.90,
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        startDate: new Date().toISOString().split('T')[0],
        autoRenew: true,
        createdAt: new Date().toISOString()
      }
    ];
    savePaymentData();
  }

  return subscriptions;
}

export function initializePaymentHistory() {
  const stored = localStorage.getItem('payment-history');
  if (stored) {
    try {
      paymentHistory = JSON.parse(stored);
    } catch (e) {
      console.error('Erro ao carregar histórico de pagamentos:', e);
    }
  }
  return paymentHistory;
}

export function addPaymentMethod(type, holderName, details) {
  const paymentMethod = {
    id: `pm-${Date.now()}`,
    type, // credit-card, bank-transfer, pix
    holder: holderName,
    lastDigits: details.lastDigits || '',
    expiryMonth: details.expiryMonth || null,
    expiryYear: details.expiryYear || null,
    pixKey: details.pixKey || null,
    bankCode: details.bankCode || null,
    isDefault: paymentMethods.length === 0,
    createdAt: new Date().toISOString()
  };

  paymentMethods.push(paymentMethod);
  savePaymentData();
  return paymentMethod;
}

export function removePaymentMethod(methodId) {
  const index = paymentMethods.findIndex(m => m.id === methodId);
  if (index > -1) {
    paymentMethods.splice(index, 1);
    // If removed method was default, set next as default
    if (paymentMethods.length > 0 && !paymentMethods.some(m => m.isDefault)) {
      paymentMethods[0].isDefault = true;
    }
    savePaymentData();
    return true;
  }
  return false;
}

export function setDefaultPaymentMethod(methodId) {
  paymentMethods.forEach(m => m.isDefault = false);
  const method = paymentMethods.find(m => m.id === methodId);
  if (method) {
    method.isDefault = true;
    savePaymentData();
    return true;
  }
  return false;
}

export function getPaymentMethods() {
  return paymentMethods;
}

export function createSubscription(planId, billingCycle = 'monthly', amount) {
  const subscription = {
    id: `sub-${Date.now()}`,
    planId,
    customerId: null,
    status: 'active',
    billingCycle,
    amount,
    nextBillingDate: calculateNextBillingDate(billingCycle),
    startDate: new Date().toISOString().split('T')[0],
    autoRenew: true,
    createdAt: new Date().toISOString()
  };

  subscriptions.push(subscription);
  savePaymentData();
  return subscription;
}

function calculateNextBillingDate(billingCycle) {
  const now = new Date();
  if (billingCycle === 'monthly') {
    now.setMonth(now.getMonth() + 1);
  } else if (billingCycle === 'quarterly') {
    now.setMonth(now.getMonth() + 3);
  } else if (billingCycle === 'annual') {
    now.setFullYear(now.getFullYear() + 1);
  }
  return now.toISOString().split('T')[0];
}

export function updateSubscription(subscriptionId, updates) {
  const subscription = subscriptions.find(s => s.id === subscriptionId);
  if (subscription) {
    Object.assign(subscription, updates);
    savePaymentData();
    return subscription;
  }
  return null;
}

export function cancelSubscription(subscriptionId) {
  const subscription = subscriptions.find(s => s.id === subscriptionId);
  if (subscription) {
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date().toISOString();
    savePaymentData();
    return true;
  }
  return false;
}

export function getSubscriptions() {
  return subscriptions;
}

export function recordPayment(invoiceId, amount, method, reference) {
  const payment = {
    id: `pay-${Date.now()}`,
    invoiceId,
    amount,
    method, // credit-card, bank-transfer, pix
    reference,
    status: 'completed',
    timestamp: new Date().toISOString(),
    processedBy: 'system'
  };

  paymentHistory.push(payment);
  savePaymentData();
  return payment;
}

export function getPaymentHistory() {
  return paymentHistory;
}

function savePaymentData() {
  const data = {
    paymentMethods,
    subscriptions,
    paymentHistory
  };
  localStorage.setItem('payment-methods', JSON.stringify(paymentMethods));
  localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
  localStorage.setItem('payment-history', JSON.stringify(paymentHistory));
}

export function renderPaymentMethods() {
  const container = document.getElementById('payment-methods-container');
  if (!container) return;

  if (paymentMethods.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum método de pagamento registrado.</p>';
    return;
  }

  let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">';

  paymentMethods.forEach(method => {
    const typeLabel = {
      'credit-card': '💳 Cartão de Crédito',
      'bank-transfer': '🏦 Transferência Bancária',
      'pix': '📱 PIX'
    }[method.type] || method.type;

    const defaultBadge = method.isDefault
      ? '<span style="font-size: 11px; padding: 2px 6px; background: rgba(0, 210, 147, 0.1); border-radius: 4px; color: var(--accent-neon);">Padrão</span>'
      : '';

    html += `
      <div style="border: 1px solid var(--border-glass); border-radius: 8px; padding: 16px; background: rgba(255, 255, 255, 0.01);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">${typeLabel}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">${escapeHtml(method.holder)}</div>
            ${defaultBadge}
          </div>
        </div>

        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 12px; color: var(--text-muted);">
          ${method.type === 'credit-card' ? `Cartão terminado em <strong>${method.lastDigits}</strong><br>Vencimento: ${method.expiryMonth}/${method.expiryYear}` : ''}
          ${method.type === 'pix' ? `Chave PIX: <strong>${method.pixKey?.substring(0, 10)}...</strong>` : ''}
          ${method.type === 'bank-transfer' ? `Banco: <strong>${method.bankCode}</strong>` : ''}
        </div>

        <div style="display: flex; gap: 8px;">
          ${!method.isDefault ? `
            <button class="btn-secondary" style="flex: 1; padding: 8px; font-size: 11px;" onclick="setDefaultPaymentMethod('${method.id}'); renderPaymentMethods();">
              ⭐ Padrão
            </button>
          ` : ''}
          <button class="action-btn" style="flex: 0 0 40px;" onclick="removePaymentMethod('${method.id}'); renderPaymentMethods();" title="Remover">
            🗑️
          </button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

export function renderSubscriptions() {
  const container = document.getElementById('subscriptions-container');
  if (!container) return;

  if (subscriptions.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhuma assinatura ativa.</p>';
    return;
  }

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th>Plano</th>
          <th style="width: 100px;">Ciclo</th>
          <th style="width: 100px;">Valor</th>
          <th style="width: 120px;">Próx. Cobrança</th>
          <th style="width: 80px;">Status</th>
          <th style="width: 80px;">Ação</th>
        </tr>
      </thead>
      <tbody>
  `;

  subscriptions.forEach(sub => {
    const planNames = {
      'basic': 'Plano Básico',
      'professional': 'Plano Profissional',
      'enterprise': 'Plano Enterprise'
    };

    const statusBadge = sub.status === 'active'
      ? '<span class="badge badge-high" style="background: rgba(0, 210, 147, 0.1); color: var(--success);">Ativo</span>'
      : '<span class="badge badge-critical">Cancelado</span>';

    const cycleLabel = {
      'monthly': 'Mensal',
      'quarterly': 'Trimestral',
      'annual': 'Anual'
    }[sub.billingCycle] || sub.billingCycle;

    html += `
      <tr>
        <td>${planNames[sub.planId] || sub.planId}</td>
        <td>${cycleLabel}</td>
        <td style="font-weight: 600;">R$ ${sub.amount.toFixed(2)}</td>
        <td>${new Date(sub.nextBillingDate).toLocaleDateString('pt-BR')}</td>
        <td>${statusBadge}</td>
        <td>
          ${sub.status === 'active' ? `
            <button class="action-btn" onclick="cancelSubscription('${sub.id}'); renderSubscriptions();" title="Cancelar">
              ✕
            </button>
          ` : '—'}
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

export function renderPaymentHistory() {
  const container = document.getElementById('payment-history-container');
  if (!container) return;

  if (paymentHistory.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum pagamento registrado.</p>';
    return;
  }

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th>ID</th>
          <th>Método</th>
          <th style="width: 100px;">Valor</th>
          <th style="width: 100px;">Data</th>
          <th style="width: 80px;">Status</th>
        </tr>
      </thead>
      <tbody>
  `;

  paymentHistory.forEach(payment => {
    const methodLabel = {
      'credit-card': '💳 Cartão',
      'bank-transfer': '🏦 Transf.',
      'pix': '📱 PIX'
    }[payment.method] || payment.method;

    const statusBadge = payment.status === 'completed'
      ? '<span class="badge badge-high" style="background: rgba(0, 210, 147, 0.1); color: var(--success);">✓ Pago</span>'
      : '<span class="badge badge-critical">Pendente</span>';

    const paymentDate = new Date(payment.timestamp);

    html += `
      <tr>
        <td class="ticket-id">${payment.id}</td>
        <td>${methodLabel}</td>
        <td style="font-weight: 600;">R$ ${payment.amount.toFixed(2)}</td>
        <td>${paymentDate.toLocaleDateString('pt-BR')}</td>
        <td>${statusBadge}</td>
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

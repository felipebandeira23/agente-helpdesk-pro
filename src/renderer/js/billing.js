/**
 * billing.js — Módulo de Faturamento e Invoices (Sprint 4.0)
 */

import { State } from './state.js';

let invoices = [];
let billingPlans = [];
let chargeRates = {};

export function initializeBilling() {
  // Load stored invoices and settings
  const stored = localStorage.getItem('billing-data');
  if (stored) {
    try {
      const data = JSON.parse(stored);
      invoices = data.invoices || [];
      chargeRates = data.chargeRates || {};
    } catch (e) {
      console.error('Erro ao carregar dados de faturamento:', e);
    }
  }

  // Initialize default billing plans
  billingPlans = [
    {
      id: 'basic',
      name: 'Plano Básico',
      monthlyPrice: 99.90,
      description: 'Até 50 chamados por mês',
      features: ['Suporte por email', 'Base de conhecimento', 'Relatórios básicos']
    },
    {
      id: 'professional',
      name: 'Plano Profissional',
      monthlyPrice: 299.90,
      description: 'Até 500 chamados por mês',
      features: ['Suporte prioritário', 'Chat em tempo real', 'Relatórios avançados', 'API']
    },
    {
      id: 'enterprise',
      name: 'Plano Enterprise',
      monthlyPrice: 999.90,
      description: 'Chamados ilimitados',
      features: ['Suporte 24/7', 'Integração customizada', 'Analytics em tempo real', 'SLA garantido']
    }
  ];

  // Initialize default charge rates
  chargeRates = {
    'per-ticket': 25.00,      // R$ per ticket
    'per-hour': 150.00,        // R$ per technician hour
    'additional-user': 49.90    // R$ per additional user
  };

  return { invoices, billingPlans, chargeRates };
}

export function createInvoice(customerId, ticketIds, description, amount, dueDate) {
  const invoice = {
    id: `INV-${Date.now()}`,
    customerId,
    ticketIds,
    description,
    amount,
    dueDate,
    createdAt: new Date().toISOString(),
    status: 'pending',
    paymentMethod: null,
    paidDate: null,
    notes: ''
  };

  invoices.push(invoice);
  saveBillingData();
  return invoice;
}

export function markInvoiceAsPaid(invoiceId, paymentMethod) {
  const invoice = invoices.find(i => i.id === invoiceId);
  if (invoice) {
    invoice.status = 'paid';
    invoice.paymentMethod = paymentMethod;
    invoice.paidDate = new Date().toISOString();
    saveBillingData();
    return true;
  }
  return false;
}

export function generateInvoiceFromTickets(ticketIds) {
  let totalCost = 0;
  const tickets = [];

  ticketIds.forEach(ticketId => {
    const ticket = State.ticketsList.find(t => t.id === ticketId);
    if (ticket) {
      tickets.push(ticket);
      // Calculate cost based on resolution time
      const created = new Date(ticket.date).getTime();
      const resolved = new Date(ticket.closedate || Date.now()).getTime();
      const hours = (resolved - created) / (1000 * 60 * 60);
      totalCost += Math.ceil(hours) * chargeRates['per-hour'];
    }
  });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // Due in 30 days

  return createInvoice(
    null,
    ticketIds,
    `Faturamento de ${ticketIds.length} chamados`,
    parseFloat(totalCost.toFixed(2)),
    dueDate.toISOString().split('T')[0]
  );
}

export function getInvoices() {
  return invoices;
}

export function getBillingPlans() {
  return billingPlans;
}

export function getChargeRates() {
  return chargeRates;
}

function saveBillingData() {
  const data = {
    invoices,
    chargeRates
  };
  localStorage.setItem('billing-data', JSON.stringify(data));
}

export function renderInvoicesList() {
  const container = document.getElementById('invoices-list-container');
  if (!container) return;

  if (invoices.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhuma fatura gerada ainda.</p>';
    return;
  }

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th style="width: 100px;">ID</th>
          <th>Descrição</th>
          <th style="width: 100px;">Valor</th>
          <th style="width: 100px;">Vencimento</th>
          <th style="width: 100px;">Status</th>
          <th style="width: 80px;">Ação</th>
        </tr>
      </thead>
      <tbody>
  `;

  invoices.forEach(invoice => {
    const statusBadge = invoice.status === 'paid'
      ? '<span class="badge badge-high" style="background: rgba(16, 185, 129, 0.1); color: var(--success);">Pago</span>'
      : '<span class="badge badge-critical">Pendente</span>';

    const dueDate = new Date(invoice.dueDate);
    const isOverdue = new Date() > dueDate && invoice.status === 'pending';
    const dueDateText = isOverdue
      ? `<span style="color: var(--danger);">${dueDate.toLocaleDateString('pt-BR')}</span>`
      : dueDate.toLocaleDateString('pt-BR');

    html += `
      <tr>
        <td class="ticket-id">${escapeHtml(invoice.id)}</td>
        <td>${escapeHtml(invoice.description)}</td>
        <td style="font-weight: 600;">R$ ${invoice.amount.toFixed(2)}</td>
        <td>${dueDateText}</td>
        <td>${statusBadge}</td>
        <td>
          ${invoice.status === 'pending' ? `
            <button class="action-btn" onclick="markInvoiceAsPaid('${invoice.id}', 'credit-card'); renderInvoicesList();" title="Marcar como pago">
              ✓
            </button>
          ` : '✓'}
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

export function renderBillingPlans() {
  const container = document.getElementById('billing-plans-container');
  if (!container) return;

  let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">';

  billingPlans.forEach(plan => {
    html += `
      <div style="border: 1px solid var(--border-glass); border-radius: 8px; padding: 20px; background: rgba(255, 255, 255, 0.01); display: flex; flex-direction: column;">
        <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 4px;">${escapeHtml(plan.name)}</h4>
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">${escapeHtml(plan.description)}</p>

        <div style="background: rgba(0, 210, 147, 0.05); border: 1px solid rgba(0, 210, 147, 0.1); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Preço mensal</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--accent-neon);">R$ ${plan.monthlyPrice.toFixed(2)}</div>
        </div>

        <div style="flex: 1; margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">Recursos</div>
          <ul style="font-size: 12px; color: var(--text-secondary); line-height: 1.6; list-style: none; padding: 0;">
            ${plan.features.map(f => `<li>✓ ${f}</li>`).join('')}
          </ul>
        </div>

        <button class="btn-primary" style="width: 100%; padding: 10px; font-size: 12px;">Selecionar Plano</button>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

export function renderChargeRates() {
  const container = document.getElementById('charge-rates-container');
  if (!container) return;

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th>Tipo de Cobrança</th>
          <th style="width: 120px;">Valor</th>
          <th style="width: 80px;">Editar</th>
        </tr>
      </thead>
      <tbody>
  `;

  const rateLabels = {
    'per-ticket': 'Por Chamado',
    'per-hour': 'Por Hora (Técnico)',
    'additional-user': 'Usuário Adicional'
  };

  Object.entries(chargeRates).forEach(([key, value]) => {
    html += `
      <tr>
        <td>${rateLabels[key] || key}</td>
        <td>R$ <strong>${value.toFixed(2)}</strong></td>
        <td>
          <button class="action-btn" style="font-size: 12px;" onclick="editChargeRate('${key}')">✎</button>
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

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function exportInvoiceAsCSV() {
  if (invoices.length === 0) {
    alert('Nenhuma fatura para exportar');
    return;
  }

  let csv = 'ID,Descrição,Valor,Vencimento,Status\n';
  invoices.forEach(invoice => {
    csv += `"${invoice.id}","${invoice.description}",${invoice.amount},"${invoice.dueDate}","${invoice.status}"\n`;
  });

  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
  element.setAttribute('download', `faturas-${Date.now()}.csv`);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

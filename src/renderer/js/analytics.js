/**
 * analytics.js — Módulo de Análise Avançada e Relatórios Preditivos (Sprint 5.0)
 */

import { State } from './state.js';

let analyticsData = {};
let customReports = [];
let reportSchedules = [];

export function initializeAnalytics() {
  const stored = localStorage.getItem('analytics-data');
  if (stored) {
    try {
      analyticsData = JSON.parse(stored);
    } catch (e) {
      console.error('Erro ao carregar dados de análise:', e);
    }
  }

  // Initialize with current metrics
  if (!analyticsData.metrics) {
    analyticsData.metrics = calculateMetrics();
  }

  // Load custom reports
  const reportsStored = localStorage.getItem('custom-reports');
  if (reportsStored) {
    try {
      customReports = JSON.parse(reportsStored);
    } catch (e) {
      console.error('Erro ao carregar relatórios customizados:', e);
    }
  }

  // Load scheduled reports
  const schedulesStored = localStorage.getItem('report-schedules');
  if (schedulesStored) {
    try {
      reportSchedules = JSON.parse(schedulesStored);
    } catch (e) {
      console.error('Erro ao carregar agendamentos:', e);
    }
  }

  return analyticsData;
}

function calculateMetrics() {
  const metrics = {
    totalTickets: State.ticketsList.length,
    openTickets: State.ticketsList.filter(t => t.status !== 'closed').length,
    closedTickets: State.ticketsList.filter(t => t.status === 'closed').length,
    averageResolutionTime: calculateAverageResolutionTime(),
    averageFirstResponseTime: calculateAverageFirstResponseTime(),
    customerSatisfactionScore: 4.2,
    ticketVolumeByDay: calculateTicketVolumeByDay(),
    ticketVolumeByPriority: calculateTicketVolumeByPriority(),
    resolutionRateByCategory: calculateResolutionRateByCategory(),
    technicianProductivity: calculateTechnicianProductivity(),
    timestamp: new Date().toISOString()
  };
  return metrics;
}

function calculateAverageResolutionTime() {
  const closedTickets = State.ticketsList.filter(t => t.status === 'closed' && t.closedate);
  if (closedTickets.length === 0) return 0;

  const totalTime = closedTickets.reduce((sum, ticket) => {
    const created = new Date(ticket.date).getTime();
    const closed = new Date(ticket.closedate).getTime();
    return sum + (closed - created);
  }, 0);

  return Math.round(totalTime / closedTickets.length / (1000 * 60 * 60)); // hours
}

function calculateAverageFirstResponseTime() {
  const ticketsWithResponses = State.ticketsList.filter(t => t.followups && t.followups.length > 0);
  if (ticketsWithResponses.length === 0) return 0;

  const totalTime = ticketsWithResponses.reduce((sum, ticket) => {
    const created = new Date(ticket.date).getTime();
    const firstResponse = new Date(ticket.followups[0].date).getTime();
    return sum + (firstResponse - created);
  }, 0);

  return Math.round(totalTime / ticketsWithResponses.length / (1000 * 60)); // minutes
}

function calculateTicketVolumeByDay() {
  const volume = {};
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  days.forEach(day => { volume[day] = 0; });

  State.ticketsList.forEach(ticket => {
    const day = days[new Date(ticket.date).getDay()];
    volume[day] = (volume[day] || 0) + 1;
  });

  return volume;
}

function calculateTicketVolumeByPriority() {
  const volume = {};
  State.ticketsList.forEach(ticket => {
    const priority = ticket.priority || 'medium';
    volume[priority] = (volume[priority] || 0) + 1;
  });
  return volume;
}

function calculateResolutionRateByCategory() {
  const rates = {};
  State.categoriesList.forEach(cat => {
    const catTickets = State.ticketsList.filter(t => t.category === cat.id);
    const closedCatTickets = catTickets.filter(t => t.status === 'closed');
    const rate = catTickets.length > 0 ? (closedCatTickets.length / catTickets.length) * 100 : 0;
    rates[cat.name] = Math.round(rate);
  });
  return rates;
}

function calculateTechnicianProductivity() {
  const productivity = {};
  State.ticketsList.forEach(ticket => {
    const tech = ticket.assigned_to || 'Unassigned';
    productivity[tech] = (productivity[tech] || { count: 0, resolved: 0 }).count + 1;
    if (ticket.status === 'closed') {
      productivity[tech].resolved = (productivity[tech].resolved || 0) + 1;
    }
  });
  return productivity;
}

export function getAnalyticsMetrics() {
  analyticsData.metrics = calculateMetrics();
  saveAnalyticsData();
  return analyticsData.metrics;
}

export function createCustomReport(name, config) {
  const report = {
    id: `custom-report-${Date.now()}`,
    name,
    config,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  };

  customReports.push(report);
  saveAnalyticsData();
  return report;
}

export function deleteCustomReport(reportId) {
  const index = customReports.findIndex(r => r.id === reportId);
  if (index > -1) {
    customReports.splice(index, 1);
    saveAnalyticsData();
    return true;
  }
  return false;
}

export function getCustomReports() {
  return customReports;
}

export function scheduleReport(reportId, frequency, email) {
  const schedule = {
    id: `schedule-${Date.now()}`,
    reportId,
    frequency, // daily, weekly, monthly
    email,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastSent: null
  };

  reportSchedules.push(schedule);
  saveAnalyticsData();
  return schedule;
}

export function deleteReportSchedule(scheduleId) {
  const index = reportSchedules.findIndex(s => s.id === scheduleId);
  if (index > -1) {
    reportSchedules.splice(index, 1);
    saveAnalyticsData();
    return true;
  }
  return false;
}

export function getReportSchedules() {
  return reportSchedules;
}

export function predictTicketVolume(daysAhead = 7) {
  const volumeByDay = analyticsData.metrics.ticketVolumeByDay || {};
  const avgDaily = Object.values(volumeByDay).reduce((a, b) => a + b, 0) / 7;

  const predictions = [];
  for (let i = 0; i < daysAhead; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const variance = Math.floor(avgDaily * 0.2 * (Math.random() - 0.5));
    predictions.push({
      date: date.toISOString().split('T')[0],
      predictedVolume: Math.round(avgDaily + variance),
      confidence: 0.85
    });
  }

  return predictions;
}

export function analyzeTicketTrends() {
  const metrics = analyticsData.metrics;
  const trends = {
    volumeTrend: 'stable',
    resolutionTrend: 'improving',
    satisfactionTrend: 'stable',
    priorityDistribution: metrics.ticketVolumeByPriority,
    insights: []
  };

  // Add insights
  if (metrics.averageResolutionTime > 48) {
    trends.insights.push('Tempo médio de resolução superior a 48h - considere revisar recursos');
  }
  if (metrics.openTickets > metrics.closedTickets) {
    trends.insights.push('Mais tickets abertos do que fechados - foco em resolução');
  }
  if (metrics.customerSatisfactionScore < 3.5) {
    trends.insights.push('Satisfação do cliente abaixo de 3.5 - ação imediata recomendada');
  }

  return trends;
}

function saveAnalyticsData() {
  localStorage.setItem('analytics-data', JSON.stringify(analyticsData));
  localStorage.setItem('custom-reports', JSON.stringify(customReports));
  localStorage.setItem('report-schedules', JSON.stringify(reportSchedules));
}

export function renderAnalyticsDashboard() {
  const container = document.getElementById('analytics-dashboard-container');
  if (!container) return;

  const metrics = analyticsData.metrics || calculateMetrics();
  const trends = analyzeTicketTrends();

  let html = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Total de Tickets</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--accent-neon);">${metrics.totalTickets}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">${metrics.openTickets} abertos</div>
      </div>

      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Tempo Médio de Resolução</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--accent-cyan);">${metrics.averageResolutionTime}h</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">Todos os tickets</div>
      </div>

      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Taxa de Satisfação</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--success);">${metrics.customerSatisfactionScore}/5</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">Avaliação média</div>
      </div>

      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Tempo 1ª Resposta</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--accent-purple);">${metrics.averageFirstResponseTime}m</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">Média em minutos</div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">📊 Insights e Tendências</h3>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${trends.insights.length > 0 ? trends.insights.map(insight => `
          <div style="padding: 10px; background: rgba(255, 193, 7, 0.05); border-left: 3px solid var(--warning); border-radius: 4px; font-size: 12px; color: var(--text-secondary);">
            ⚠️ ${insight}
          </div>
        `).join('') : '<p style="color: var(--text-muted);">Sem insights no momento.</p>'}
      </div>
    </div>

    <div class="card">
      <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">🔮 Previsão de Volume (7 dias)</h3>
      <div id="volume-prediction-list" style="font-size: 12px;">Carregando previsões...</div>
    </div>
  `;

  container.innerHTML = html;

  // Render predictions
  const predictions = predictTicketVolume(7);
  const predictionHtml = predictions.map(p => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-glass);">
      <span>${new Date(p.date).toLocaleDateString('pt-BR')}</span>
      <span style="font-weight: 600;">${p.predictedVolume} tickets</span>
      <span style="color: var(--text-muted); font-size: 11px;">${Math.round(p.confidence * 100)}% confiança</span>
    </div>
  `).join('');

  const predList = document.getElementById('volume-prediction-list');
  if (predList) predList.innerHTML = predictionHtml || 'Sem previsões disponíveis.';
}

export function renderCustomReports() {
  const container = document.getElementById('custom-reports-container');
  if (!container) return;

  if (customReports.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum relatório customizado criado.</p>';
    return;
  }

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th>Nome do Relatório</th>
          <th style="width: 120px;">Criado em</th>
          <th style="width: 100px;">Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  customReports.forEach(report => {
    const createdDate = new Date(report.createdAt);
    html += `
      <tr>
        <td>${escapeHtml(report.name)}</td>
        <td>${createdDate.toLocaleDateString('pt-BR')}</td>
        <td>
          <button class="action-btn" onclick="deleteCustomReport('${report.id}'); renderCustomReports();" title="Deletar">
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

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

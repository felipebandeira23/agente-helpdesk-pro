/**
 * reports.js — Módulo de Relatórios e Automação (Sprint 2.0)
 */

import { State } from './state.js';
import { escapeHtml } from './dom.js';

const reportTypes = {
  'tickets-by-status': 'Chamados por Status',
  'tickets-by-priority': 'Chamados por Prioridade',
  'tickets-by-category': 'Chamados por Categoria',
  'sla-compliance': 'Conformidade com SLA',
  'technician-performance': 'Desempenho de Técnicos',
  'resolution-time': 'Tempo Médio de Resolução'
};

export function generateReport(reportType, dateRange) {
  switch(reportType) {
    case 'tickets-by-status':
      return generateTicketsByStatusReport(dateRange);
    case 'tickets-by-priority':
      return generateTicketsByPriorityReport(dateRange);
    case 'tickets-by-category':
      return generateTicketsByCategoryReport(dateRange);
    case 'sla-compliance':
      return generateSLAComplianceReport(dateRange);
    case 'technician-performance':
      return generateTechnicianPerformanceReport(dateRange);
    case 'resolution-time':
      return generateResolutionTimeReport(dateRange);
    default:
      return null;
  }
}

function filterTicketsByDateRange(tickets, dateRange) {
  const now = Date.now();
  let startDate = now;

  if (dateRange === 'today') {
    startDate = now - (24 * 60 * 60 * 1000);
  } else if (dateRange === 'week') {
    startDate = now - (7 * 24 * 60 * 60 * 1000);
  } else if (dateRange === 'month') {
    startDate = now - (30 * 24 * 60 * 60 * 1000);
  } else if (dateRange === 'quarter') {
    startDate = now - (90 * 24 * 60 * 60 * 1000);
  }

  return tickets.filter(t => {
    const ticketDate = new Date(t.date).getTime();
    return ticketDate >= startDate;
  });
}

function generateTicketsByStatusReport(dateRange) {
  const filtered = filterTicketsByDateRange(State.ticketsList, dateRange);
  const statusMap = {
    1: { name: 'Novo', count: 0 },
    2: { name: 'Em Atendimento', count: 0 },
    3: { name: 'Em Atendimento', count: 0 },
    4: { name: 'Pendente', count: 0 },
    5: { name: 'Solucionado', count: 0 },
    6: { name: 'Fechado', count: 0 }
  };

  filtered.forEach(t => {
    const status = parseInt(t.status);
    if (statusMap[status]) {
      statusMap[status].count++;
    }
  });

  return {
    title: 'Relatório: Chamados por Status',
    dateRange,
    generatedAt: new Date().toLocaleString('pt-BR'),
    data: Object.values(statusMap),
    totalTickets: filtered.length
  };
}

function generateTicketsByPriorityReport(dateRange) {
  const filtered = filterTicketsByDateRange(State.ticketsList, dateRange);
  const priorityMap = {
    1: { name: 'Baixa', count: 0 },
    3: { name: 'Média', count: 0 },
    5: { name: 'Alta', count: 0 },
    6: { name: 'Urgente', count: 0 }
  };

  filtered.forEach(t => {
    const priority = parseInt(t.urgency);
    if (priorityMap[priority]) {
      priorityMap[priority].count++;
    }
  });

  return {
    title: 'Relatório: Chamados por Prioridade',
    dateRange,
    generatedAt: new Date().toLocaleString('pt-BR'),
    data: Object.values(priorityMap),
    totalTickets: filtered.length
  };
}

function generateTicketsByCategoryReport(dateRange) {
  const filtered = filterTicketsByDateRange(State.ticketsList, dateRange);
  const categoryMap = {};

  filtered.forEach(t => {
    const catName = t.category_name || 'Sem Categoria';
    if (!categoryMap[catName]) {
      categoryMap[catName] = 0;
    }
    categoryMap[catName]++;
  });

  const data = Object.entries(categoryMap).map(([name, count]) => ({
    name,
    count
  }));

  return {
    title: 'Relatório: Chamados por Categoria',
    dateRange,
    generatedAt: new Date().toLocaleString('pt-BR'),
    data,
    totalTickets: filtered.length
  };
}

function generateSLAComplianceReport(dateRange) {
  const filtered = filterTicketsByDateRange(State.ticketsList, dateRange);
  let compliant = 0, noncompliant = 0, pending = 0;
  const now = Date.now();

  filtered.forEach(t => {
    const status = parseInt(t.status);
    if (status === 6 || status === 5) return; // Closed or resolved

    const resolveTime = new Date(t.time_to_resolve).getTime();
    const timeLeft = resolveTime - now;

    if (status === 4) {
      pending++;
    } else if (timeLeft >= 0) {
      compliant++;
    } else {
      noncompliant++;
    }
  });

  const total = compliant + noncompliant + pending;
  const complianceRate = total > 0 ? ((compliant / total) * 100).toFixed(1) : 0;

  return {
    title: 'Relatório: Conformidade com SLA',
    dateRange,
    generatedAt: new Date().toLocaleString('pt-BR'),
    data: [
      { name: 'Em Conformidade', count: compliant },
      { name: 'Fora de Conformidade', count: noncompliant },
      { name: 'Pendentes', count: pending }
    ],
    complianceRate,
    totalTickets: total
  };
}

function generateTechnicianPerformanceReport(dateRange) {
  const filtered = filterTicketsByDateRange(State.ticketsList, dateRange);
  const technicianMap = {};

  filtered.forEach(t => {
    const techName = t.technician_name || 'Sem Atribuição';
    if (!technicianMap[techName]) {
      technicianMap[techName] = {
        name: techName,
        assigned: 0,
        resolved: 0
      };
    }
    technicianMap[techName].assigned++;
    if (parseInt(t.status) === 5) {
      technicianMap[techName].resolved++;
    }
  });

  const data = Object.values(technicianMap).map(tech => ({
    ...tech,
    resolutionRate: tech.assigned > 0 ? ((tech.resolved / tech.assigned) * 100).toFixed(1) : 0
  }));

  return {
    title: 'Relatório: Desempenho de Técnicos',
    dateRange,
    generatedAt: new Date().toLocaleString('pt-BR'),
    data,
    totalTickets: filtered.length
  };
}

function generateResolutionTimeReport(dateRange) {
  const filtered = filterTicketsByDateRange(State.ticketsList, dateRange);
  let totalTime = 0, resolvedCount = 0;

  filtered.forEach(t => {
    if (parseInt(t.status) === 5 || parseInt(t.status) === 6) {
      const created = new Date(t.date).getTime();
      const resolved = new Date(t.closedate || Date.now()).getTime();
      const duration = resolved - created;
      totalTime += duration;
      resolvedCount++;
    }
  });

  const avgTimeMs = resolvedCount > 0 ? totalTime / resolvedCount : 0;
  const avgHours = (avgTimeMs / (1000 * 60 * 60)).toFixed(1);
  const avgDays = (avgTimeMs / (1000 * 60 * 60 * 24)).toFixed(1);

  return {
    title: 'Relatório: Tempo Médio de Resolução',
    dateRange,
    generatedAt: new Date().toLocaleString('pt-BR'),
    data: [
      { metric: 'Tempo Médio', value: `${avgHours} horas` },
      { metric: 'Equivalente em Dias', value: `${avgDays} dias` },
      { metric: 'Chamados Resolvidos', value: resolvedCount }
    ],
    resolvedCount
  };
}

export function displayReportPreview(report) {
  const container = document.getElementById('report-preview-container');
  if (!container) return;

  let html = `
    <div style="border-bottom: 1px solid var(--border-glass); padding-bottom: 16px; margin-bottom: 16px;">
      <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">${report.title}</h3>
      <p style="font-size: 12px; color: var(--text-muted);">
        Período: ${report.dateRange} | Gerado em: ${report.generatedAt}
      </p>
    </div>
  `;

  if (report.complianceRate !== undefined) {
    html += `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
        <div style="background: rgba(0, 210, 147, 0.1); border: 1px solid rgba(0, 210, 147, 0.2); padding: 12px; border-radius: 8px;">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Taxa de Conformidade</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--accent-neon);">${report.complianceRate}%</div>
        </div>
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 12px; border-radius: 8px;">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Total de Chamados</div>
          <div style="font-size: 20px; font-weight: 700;">${report.totalTickets}</div>
        </div>
      </div>
    `;
  }

  // Display data as table
  if (Array.isArray(report.data) && report.data.length > 0) {
    html += `<table class="table-container" style="width: 100%; font-size: 13px;">`;

    // Get header keys from first data item
    const headers = Object.keys(report.data[0]);
    html += `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    html += `<tbody>`;

    report.data.forEach(row => {
      html += `<tr>`;
      headers.forEach(header => {
        const value = row[header];
        html += `<td>${escapeHtml(String(value))}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
  }

  // Display simple data structure
  if (report.data && !Array.isArray(report.data)) {
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    Object.entries(report.data).forEach(([key, value]) => {
      html += `
        <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(255, 255, 255, 0.01); border-radius: 6px;">
          <span>${escapeHtml(key)}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </div>
      `;
    });
    html += `</div>`;
  }

  html += `
    <div style="display: flex; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-glass);">
      <button class="btn-primary" style="padding: 10px 16px; font-size: 12px;" onclick="exportReportAsCSV()">📥 Exportar CSV</button>
      <button class="btn-secondary" style="padding: 10px 16px; font-size: 12px;" onclick="printReport()">🖨️ Imprimir</button>
    </div>
  `;

  container.innerHTML = html;
}

export function exportReportAsCSV() {
  const container = document.getElementById('report-preview-container');
  if (!container) return;

  const table = container.querySelector('table');
  if (!table) {
    alert('Nenhuma tabela para exportar');
    return;
  }

  let csv = '';

  // Extract headers
  const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
  csv += headers.join(',') + '\n';

  // Extract rows
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const cols = Array.from(row.querySelectorAll('td')).map(td => {
      const text = td.textContent.trim();
      return `"${text}"`;
    });
    csv += cols.join(',') + '\n';
  });

  // Create download link
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
  element.setAttribute('download', `relatorio-${Date.now()}.csv`);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

export function printReport() {
  const container = document.getElementById('report-preview-container');
  if (!container) return;

  const printWindow = window.open('', '', 'height=400,width=600');
  printWindow.document.write('<pre>' + escapeHtml(container.innerText) + '</pre>');
  printWindow.document.close();
  printWindow.print();
}

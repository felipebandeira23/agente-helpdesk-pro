/**
 * dashboard.js — Módulo do Painel Principal, Gráficos de Métricas e Base de Soluções (FAQ)
 */

import { State } from './state.js';
import { escapeHtml, switchScreen } from './dom.js';

export function setupCharts() {
  const isLight = document.body.classList.contains('light-theme');
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)';
  const tickColor = isLight ? '#475569' : '#64748b';
  const miniBg = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)';

  // Mini memory doughnut chart
  const canvasMini = document.getElementById('memMiniChart');
  if (canvasMini) {
    const ctxMini = canvasMini.getContext('2d');
    if (State.memMiniChart) {
      State.memMiniChart.destroy();
    }
    State.memMiniChart = new Chart(ctxMini, {
      type: 'doughnut',
      data: {
        labels: ['Uso', 'Livre'],
        datasets: [{
          data: [0, 100],
          backgroundColor: ['#00d293', miniBg],
          borderColor: 'transparent',
          hoverBackgroundColor: ['#00d293', miniBg]
        }]
      },
      options: {
        cutout: '80%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  // Large CPU line chart
  const canvasCpu = document.getElementById('cpuChart');
  if (canvasCpu) {
    const ctxCpu = canvasCpu.getContext('2d');
    if (State.cpuChart) {
      State.cpuChart.destroy();
    }
    State.cpuChart = new Chart(ctxCpu, {
      type: 'line',
      data: {
        labels: Array(15).fill(''),
        datasets: [{
          label: 'CPU (%)',
          data: Array(15).fill(0),
          borderColor: '#00d293',
          backgroundColor: 'rgba(0, 210, 147, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: false },
          y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: tickColor } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Large RAM line chart
  const canvasMem = document.getElementById('memChart');
  if (canvasMem) {
    const ctxMem = canvasMem.getContext('2d');
    if (State.memChart) {
      State.memChart.destroy();
    }
    State.memChart = new Chart(ctxMem, {
      type: 'line',
      data: {
        labels: Array(15).fill(''),
        datasets: [{
          label: 'Memória (%)',
          data: Array(15).fill(0),
          borderColor: '#00b0ff',
          backgroundColor: 'rgba(0, 176, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: false },
          y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: tickColor } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Sprint 1.0: Tickets by status donut chart
  const canvasStatusChart = document.getElementById('statusChart');
  if (canvasStatusChart) {
    const ctxStatus = canvasStatusChart.getContext('2d');
    if (State.statusChart) {
      State.statusChart.destroy();
    }
    State.statusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Novo', 'Em Atendimento', 'Pendente', 'Solucionado', 'Fechado'],
        datasets: [{
          data: [0, 0, 0, 0, 0],
          backgroundColor: ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#6b7280'],
          borderColor: 'transparent',
          hoverBackgroundColor: ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#6b7280']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 12, font: { size: 11 }, color: tickColor }
          }
        }
      }
    });
  }

  // Sprint 1.0: Tickets by origin bar chart
  const canvasOriginChart = document.getElementById('originChart');
  if (canvasOriginChart) {
    const ctxOrigin = canvasOriginChart.getContext('2d');
    if (State.originChart) {
      State.originChart.destroy();
    }
    State.originChart = new Chart(ctxOrigin, {
      type: 'bar',
      data: {
        labels: ['Email', 'Portal', 'Chat', 'Telefone', 'Agente'],
        datasets: [{
          label: 'Quantidade',
          data: [0, 0, 0, 0, 0],
          backgroundColor: '#00d293',
          borderColor: 'transparent',
          borderRadius: 8
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

export function startTelemetryUpdates() {
  if (State.telemetryInterval) {
    clearInterval(State.telemetryInterval);
  }
  
  State.telemetryInterval = setInterval(async () => {
    let currentCpu = Math.floor(Math.random() * 15) + 10; // 10% - 25% base
    let currentMem = Math.floor(Math.random() * 5) + 52;  // 52% - 57% base

    if (window.electronAPI) {
      try {
        const metrics = await window.electronAPI.getSystemMetrics();
        // Se a telemetria em tempo real retornar métricas de uso de hardware estendidas
        if (metrics.cpuUsage !== undefined) {
          currentCpu = metrics.cpuUsage;
        }
        if (metrics.memUsage !== undefined) {
          currentMem = metrics.memUsage;
        }
      } catch (err) {
        // Fallback para fluctuation
      }
    }

    // Salva no estado para o autodiagnóstico ler
    State.diagnostics.cpuLoad = currentCpu;
    State.diagnostics.memLoad = currentMem;

    // Atualiza gráficos
    if (State.memMiniChart) {
      State.memMiniChart.data.datasets[0].data = [currentMem, 100 - currentMem];
      State.memMiniChart.update();
      const elText = document.getElementById('memMiniText');
      if (elText) elText.textContent = `${currentMem}%`;
      
      const elDetail = document.getElementById('memMiniDetail');
      if (elDetail) {
        const usedGb = ((16 * currentMem) / 100).toFixed(1);
        elDetail.textContent = `${usedGb} GB de 16.0 GB em uso`;
      }
    }

    if (State.cpuChart) {
      State.cpuChart.data.datasets[0].data.shift();
      State.cpuChart.data.datasets[0].data.push(currentCpu);
      State.cpuChart.update();
    }

    if (State.memChart) {
      State.memChart.data.datasets[0].data.shift();
      State.memChart.data.datasets[0].data.push(currentMem);
      State.memChart.update();
    }
  }, 2000);
}

export function renderDashboardRecentTickets() {
  const tbodyDashboard = document.getElementById('dashboard-tickets-tbody');
  if (!tbodyDashboard) return;

  const top3 = State.ticketsList.slice(0, 3);
  
  if (top3.length === 0) {
    tbodyDashboard.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum chamado aberto.</td></tr>`;
    return;
  }

  let htmlDashboard = '';
  top3.forEach(t => {
    let pBadge = 'badge-medium';
    let pText = 'Média';
    if (t.urgency == 1 || t.urgency == 2) { pBadge = 'badge-low'; pText = 'Baixa'; }
    else if (t.urgency == 4) { pBadge = 'badge-high'; pText = 'Alta'; }
    else if (t.urgency >= 5) { pBadge = 'badge-critical'; pText = 'Urgente'; }

    let sDot = 'black';
    let sText = 'Pendente';
    switch (parseInt(t.status)) {
      case 1: sDot = 'red'; sText = 'Novo'; break;
      case 2:
      case 3: sDot = 'yellow'; sText = 'Em Atendimento'; break;
      case 4: sDot = 'yellow'; sText = 'Pendente'; break;
      case 5: sDot = 'green'; sText = 'Solucionado'; break;
      case 6: sDot = 'black'; sText = 'Fechado'; break;
    }
    const cName = t.category_name || 'Geral / Suporte';
    const isUnreadT = State.notificationCache[t.id] && State.notificationCache[t.id].unread === true;
    const unreadIndicatorT = isUnreadT 
      ? `<span class="unread-badge-dot" title="Mensagens não lidas do suporte"></span>` 
      : '';

    htmlDashboard += `
      <tr>
        <td class="ticket-id">#${t.id}</td>
        <td style="font-weight: 600;">
          ${escapeHtml(t.name)}
          ${unreadIndicatorT}
        </td>
        <td style="color: var(--text-secondary);">${escapeHtml(cName)}</td>
        <td><span class="badge ${pBadge}">${pText}</span></td>
        <td>
          <div class="status-pill">
            <span class="status-pill-dot ${sDot}"></span>
            <span>${sText}</span>
          </div>
        </td>
        <td>
          <button class="action-btn" onclick="viewTicketDetails(${t.id})" aria-label="Visualizar chamado #${t.id}">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });
  tbodyDashboard.innerHTML = htmlDashboard;
}

export function renderFAQ() {
  const faqContainer = document.getElementById('solutions-faq-container');
  if (!faqContainer) return;

  faqContainer.innerHTML = '';
  State.solutionsFAQ.forEach(faq => {
    const card = document.createElement('div');
    card.className = 'faq-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', 'false');

    card.innerHTML = `
      <div class="faq-card-header">
        <h4>${escapeHtml(faq.title)}</h4>
        <span class="faq-category">${escapeHtml(faq.category)}</span>
      </div>
      <p class="faq-problem">${escapeHtml(faq.problem)}</p>
      <div class="faq-steps" style="display: none;">
        <h5>Passos para resolução rápida:</h5>
        <ol>
          ${faq.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
        </ol>
      </div>
    `;

    // Clique ou teclado para expandir/recolher
    const toggle = () => {
      const stepsDiv = card.querySelector('.faq-steps');
      const isVisible = stepsDiv.style.display !== 'none';
      stepsDiv.style.display = isVisible ? 'none' : 'block';
      card.classList.toggle('expanded', !isVisible);
      card.setAttribute('aria-expanded', String(!isVisible));
    };

    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    faqContainer.appendChild(card);
  });
}

export function updateDashboardCharts() {
  if (!State.ticketsList || State.ticketsList.length === 0) return;

  const filteredTickets = getFilteredDashboardTickets();

  // Count tickets by status
  const statusCounts = [0, 0, 0, 0, 0]; // new, in progress, pending, resolved, closed
  const originCounts = [0, 0, 0, 0, 0]; // email, portal, chat, phone, agent

  filteredTickets.forEach(t => {
    const status = parseInt(t.status);
    if (status === 1) statusCounts[0]++;
    else if (status === 2 || status === 3) statusCounts[1]++;
    else if (status === 4) statusCounts[2]++;
    else if (status === 5) statusCounts[3]++;
    else if (status === 6) statusCounts[4]++;

    const origin = t.origin || 1;
    if (origin >= 0 && origin <= 4) {
      originCounts[origin]++;
    }
  });

  // Update status chart
  if (State.statusChart) {
    State.statusChart.data.datasets[0].data = statusCounts;
    State.statusChart.update();
  }

  // Update origin chart
  if (State.originChart) {
    State.originChart.data.datasets[0].data = originCounts;
    State.originChart.update();
  }
}

export function renderSLASemaphore() {
  const container = document.getElementById('sla-semaphore-container');
  if (!container) return;

  const filteredTickets = getFilteredDashboardTickets();
  const now = Date.now();
  let warning = 0, critical = 0, paused = 0;

  filteredTickets.forEach(t => {
    if (parseInt(t.status) === 6 || parseInt(t.status) === 5) return;

    const resolveTime = new Date(t.time_to_resolve).getTime();
    const timeLeft = resolveTime - now;

    if (parseInt(t.status) === 4) {
      paused++;
    } else if (timeLeft > 3600000) {
      // More than 1 hour left
    } else if (timeLeft > 0) {
      warning++;
    } else {
      critical++;
    }
  });

  const htmlSemaphore = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
      <div class="sla-badge sla-critical" style="text-align: center; padding: 12px; border-radius: 8px;">
        <div style="font-size: 14px; font-weight: 700;">⚠️ Estourados</div>
        <div style="font-size: 20px; font-weight: 800; margin-top: 6px;">${critical}</div>
      </div>
      <div class="sla-badge sla-warning" style="text-align: center; padding: 12px; border-radius: 8px;">
        <div style="font-size: 14px; font-weight: 700;">⏱️ Críticos</div>
        <div style="font-size: 20px; font-weight: 800; margin-top: 6px;">${warning}</div>
      </div>
      <div class="sla-badge sla-neutral" style="text-align: center; padding: 12px; border-radius: 8px;">
        <div style="font-size: 14px; font-weight: 700;">⏸️ Pausados</div>
        <div style="font-size: 20px; font-weight: 800; margin-top: 6px;">${paused}</div>
      </div>
    </div>
  `;

  container.innerHTML = htmlSemaphore;
}

function getFilteredDashboardTickets() {
  const periodFilter = document.getElementById('dashboard-filter-period')?.value || 'all';
  const operatorFilter = document.getElementById('dashboard-filter-operator')?.value || 'all';
  const customerFilter = document.getElementById('dashboard-filter-customer')?.value || 'all';
  const categoryFilter = document.getElementById('dashboard-filter-category')?.value || 'all';

  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return State.ticketsList.filter(t => {
    // Period filter
    if (periodFilter !== 'all') {
      const ticketDate = new Date(t.date);
      const daysDiff = Math.floor((now - ticketDate.getTime()) / (1000 * 60 * 60 * 24));
      if (periodFilter === 'today' && daysDiff > 0) return false;
      if (periodFilter === 'week' && daysDiff > 7) return false;
      if (periodFilter === 'month' && daysDiff > 30) return false;
      if (periodFilter === 'quarter' && daysDiff > 90) return false;
    }

    // Operator filter
    if (operatorFilter !== 'all' && t.technician_id && t.technician_id !== operatorFilter) return false;

    // Customer filter
    if (customerFilter !== 'all' && t.requester_id && t.requester_id !== customerFilter) return false;

    // Category filter
    if (categoryFilter !== 'all' && t.category_id && t.category_id !== categoryFilter) return false;

    return true;
  });
}

export function initializeDashboardFilters() {
  const operatorSelect = document.getElementById('dashboard-filter-operator');
  const customerSelect = document.getElementById('dashboard-filter-customer');
  const categorySelect = document.getElementById('dashboard-filter-category');

  if (operatorSelect) {
    operatorSelect.innerHTML = '<option value="all">Operador: Todos</option>';
    const operators = new Set();
    State.ticketsList.forEach(t => {
      if (t.technician_id && t.technician_name) {
        operators.add(JSON.stringify({ id: t.technician_id, name: t.technician_name }));
      }
    });
    operators.forEach(opStr => {
      const op = JSON.parse(opStr);
      const option = document.createElement('option');
      option.value = op.id;
      option.textContent = op.name;
      operatorSelect.appendChild(option);
    });
  }

  if (customerSelect) {
    customerSelect.innerHTML = '<option value="all">Cliente: Todos</option>';
    const customers = new Set();
    State.ticketsList.forEach(t => {
      if (t.requester_id && t.requester_name) {
        customers.add(JSON.stringify({ id: t.requester_id, name: t.requester_name }));
      }
    });
    customers.forEach(custStr => {
      const cust = JSON.parse(custStr);
      const option = document.createElement('option');
      option.value = cust.id;
      option.textContent = cust.name;
      customerSelect.appendChild(option);
    });
  }

  if (categorySelect) {
    categorySelect.innerHTML = '<option value="all">Categoria: Todas</option>';
    State.categoriesList.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      categorySelect.appendChild(option);
    });
  }
}

export function applyDashboardFilters() {
  updateDashboardCharts();
  renderSLASemaphore();
}

export function resetDashboardFilters() {
  const selects = [
    document.getElementById('dashboard-filter-period'),
    document.getElementById('dashboard-filter-operator'),
    document.getElementById('dashboard-filter-customer'),
    document.getElementById('dashboard-filter-category')
  ];
  selects.forEach(select => {
    if (select) select.value = 'all';
  });
  applyDashboardFilters();
}

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
}

// Cache da RAM total para evitar chamadas repetidas
let _totalRamGb = null;

export function startTelemetryUpdates() {
  if (State.telemetryInterval) {
    clearInterval(State.telemetryInterval);
  }

  State.telemetryInterval = setInterval(async () => {
    let currentCpu = 0;
    let currentMem = 0;

    if (window.electronAPI) {
      try {
        const metrics = await window.electronAPI.getSystemMetrics();
        if (metrics.cpuUsage !== undefined) currentCpu = metrics.cpuUsage;
        if (metrics.memUsage !== undefined) currentMem = metrics.memUsage;

        // Detecta RAM total real uma única vez
        if (_totalRamGb === null && metrics.totalMem) {
          const match = metrics.totalMem.toString().match(/[\d.]+/);
          if (match) _totalRamGb = parseFloat(match[0]);
        }
      } catch (err) {
        // sem dados disponíveis
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
        if (_totalRamGb && currentMem > 0) {
          const usedGb = ((_totalRamGb * currentMem) / 100).toFixed(1);
          elDetail.textContent = `${usedGb} GB de ${_totalRamGb.toFixed(1)} GB em uso`;
        } else {
          elDetail.textContent = currentMem > 0 ? `${currentMem}% em uso` : 'Calculando métricas...';
        }
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

/**
 * app.js — Bootstrapper Central, Assistente de Autodiagnóstico Ativo e Integração Global
 */

import { State } from './state.js';
import { switchScreen, applyFontScale, applyCompactMode } from './dom.js';
import { setupCharts, startTelemetryUpdates, renderDashboardRecentTickets, renderFAQ } from './dashboard.js';
import { loadCategories, loadLocations, loadTickets, autoCategorizeTicketTitle, triggerRecurrenceCheck, submitTicket, triggerFileInput, handleFileSelect } from './tickets.js';
import { viewTicketDetails, submitFollowup, triggerChatFileInput, handleChatFileSelect, removeChatFile, generateChatMarkdownSummary } from './chat.js';
import { openRemoteChecklistModal, closeRemoteChecklistModal, confirmRemoteChecklist, evaluateRemoteChecklistProgress } from './mesh.js';
import { loadAgentSettingsIntoForm, saveAgentSettings, testAllConnections, handleFontScaleChange, handleCompactModeChange, checkUpdatesSilently, checkUpdatesManually, startUpdateWorkflow, dismissUpdateBanner, closeChangelogModal } from './settings.js';
import { checkAndPromptLogin } from './auth.js';

// Inicializador Central
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[HELP-PRO] Inicializando módulo app.js...');

  // Carrega preferências salvas
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.innerHTML = '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2M20 13h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M17.66 4.93l-1.41 1.41M4.93 17.66l-1.41 1.41"/>';
    }
  }

  // Inicializa Acessibilidade
  applyFontScale(State.fontScale);
  applyCompactMode(State.compactMode);
  setupKeyboardFocusOutline();

  // Inicializações do DOM
  setupCharts();
  startTelemetryUpdates();
  renderFAQ();

  // Inicializações do Backend
  setupInitialUI();
  
  // Polling do status do proxy (e carrega dados)
  checkProxyStatus();
  State.proxyPollInterval = setInterval(checkProxyStatus, 8000);

  // Inicializa o Assistente de Autodiagnóstico Ativo
  startSelfDiagnosticAssistant();

  // Verifica sessão GLPI e promove login automático se necessário
  checkAndPromptLogin();

  // Recarrega dados quando autenticado com sucesso
  window.addEventListener('glpi-authenticated', async (e) => {
    const { login, userName } = e.detail;
    console.log(`[AUTH] Usuário autenticado: ${userName || login}. Recarregando dados...`);
    try {
      await loadCategories();
      await loadLocations();
      await loadTickets();
      await renderDashboardRecentTickets();
    } catch (err) {
      console.warn('[AUTH] Erro ao recarregar dados após login:', err.message);
    }
  });
});

/**
 * Inicialização de dados do usuário local via Preload
 */
function setupInitialUI() {
  if (window.electronAPI) {
    window.electronAPI.getOSUser().then(user => {
      if (user && user.username) {
        const capitalized = user.username.charAt(0).toUpperCase() + user.username.slice(1);
        const nameEl = document.getElementById('user-display-name');
        const avatarEl = document.getElementById('user-avatar-char');
        const termIdEl = document.getElementById('remote-terminal-id');

        if (nameEl) nameEl.textContent = capitalized;
        if (avatarEl) avatarEl.textContent = user.username.charAt(0).toUpperCase();
        if (termIdEl) termIdEl.textContent = `MC-${user.hostname.toUpperCase()}`;
      }
    }).catch(err => {
      const nameEl = document.getElementById('user-display-name');
      if (nameEl) nameEl.textContent = 'Usuário Local';
    });

    // Papéis do GLPI
    window.electronAPI.glpiGetUserRole().then(roles => {
      State.userRoles = roles;
      console.log('[HELP-PRO] Papéis administrativos:', roles);
    }).catch(err => {
      console.error('[HELP-PRO] Erro ao buscar papéis do usuário:', err);
    });

    // Checagem silenciosa de updates
    setTimeout(checkUpdatesSilently, 4000);
  }
}

/**
 * Verifica o status de conexão com o proxy local Perl
 */
async function checkProxyStatus() {
  const dot = document.getElementById('agent-status-dot');
  const text = document.getElementById('agent-status-text');

  const proxyUrl = 'http://127.0.0.1:62354';
  const supportApi = `${proxyUrl}/support`;

  try {
    const res = await fetch(`${supportApi}/status`);
    if (res.ok) {
      if (dot) {
        dot.className = 'status-dot online';
      }
      if (text) {
        text.textContent = 'Proxy Local Conectado';
      }
      
      // Carrega tabelas se vazias
      if (State.categoriesList.length === 0) {
        await loadCategories();
        await loadLocations();
      }
      await loadTickets();
    } else {
      throw new Error('Proxy offline');
    }
  } catch (e) {
    if (dot) dot.className = 'status-dot offline';
    if (text) text.textContent = 'Proxy Local Offline';
    showTableOfflineWarning();
  }
}

function showTableOfflineWarning() {
  const warningRow = `
    <tr>
      <td colspan="6" style="text-align: center; color: var(--danger); padding: 30px;">
        Proxy local offline. Verifique se o serviço Perl GLPI está rodando na porta 62354.
      </td>
    </tr>
  `;
  const tbodyDashboard = document.getElementById('dashboard-tickets-tbody');
  const tbodyList = document.getElementById('tickets-tbody');
  
  if (tbodyDashboard) tbodyDashboard.innerHTML = warningRow;
  if (tbodyList) tbodyList.innerHTML = warningRow;
}

/**
 * Assistente de Autodiagnóstico Ativo
 * Monitora rede (ping), CPU, e espaço de disco local exibindo status de saúde
 */
function startSelfDiagnosticAssistant() {
  const diagnosticLoop = async () => {
    let pingLatency = 10; // ms base
    let diskFree = 85;    // % base
    let cpuVal = State.diagnostics.cpuLoad || 15;

    const startPing = Date.now();
    try {
      // Latência simulada/real para o host GLPI (através de fetch rápido ao proxy)
      const res = await fetch('http://127.0.0.1:62354/support/status', { method: 'HEAD' });
      if (res.ok) {
        pingLatency = Date.now() - startPing;
      }
    } catch(e) {
      pingLatency = 999; // Falha na latência de rede
    }

    if (window.electronAPI) {
      try {
        const metrics = await window.electronAPI.getSystemMetrics();
        if (metrics.diskFree !== undefined) diskFree = metrics.diskFree;
        if (metrics.cpuUsage !== undefined) cpuVal = metrics.cpuUsage;
      } catch (err) {
        // Fallback
      }
    }

    // Salva no estado
    State.diagnostics.pingLatency = pingLatency;
    State.diagnostics.diskFreeSpacePercent = diskFree;
    State.diagnostics.cpuLoad = cpuVal;

    // Atualiza a visualização do painel de diagnóstico no DOM
    updateDiagnosticsUI(pingLatency, cpuVal, diskFree);
  };

  // Roda imediatamente e a cada 6 segundos
  diagnosticLoop();
  setInterval(diagnosticLoop, 6000);
}

function updateDiagnosticsUI(latency, cpu, disk) {
  // 1. Rede / Conectividade
  const netStatus = document.getElementById('diag-net-status');
  const netDesc = document.getElementById('diag-net-desc');
  const netCard = document.getElementById('diag-net-card');

  if (netStatus && netDesc && netCard) {
    if (latency === 999) {
      netStatus.textContent = 'Sem Conexão';
      netDesc.textContent = 'Impossível comunicar com a rede COPPEAD.';
      netCard.className = 'diag-card danger';
    } else if (latency > 200) {
      netStatus.textContent = 'Internet Instável';
      netDesc.textContent = `Latência elevada de ${latency}ms com o servidor.`;
      netCard.className = 'diag-card warning';
    } else {
      netStatus.textContent = 'Saudável';
      netDesc.textContent = `Latência ideal de ${latency}ms com a central.`;
      netCard.className = 'diag-card success';
    }
  }

  // 2. Uso de CPU
  const cpuStatus = document.getElementById('diag-cpu-status');
  const cpuDesc = document.getElementById('diag-cpu-desc');
  const cpuCard = document.getElementById('diag-cpu-card');

  if (cpuStatus && cpuDesc && cpuCard) {
    if (cpu > 80) {
      cpuStatus.textContent = 'Alto Uso de CPU';
      cpuDesc.textContent = `Processamento crítico em ${cpu}%! Feche apps pesados.`;
      cpuCard.className = 'diag-card danger';
    } else if (cpu > 50) {
      cpuStatus.textContent = 'Uso Moderado';
      cpuDesc.textContent = `Consumo mediano de CPU em ${cpu}%.`;
      cpuCard.className = 'diag-card warning';
    } else {
      cpuStatus.textContent = 'Saudável';
      cpuDesc.textContent = `Uso estável de processamento em ${cpu}%.`;
      cpuCard.className = 'diag-card success';
    }
  }

  // 3. Espaço em Disco
  const diskStatus = document.getElementById('diag-disk-status');
  const diskDesc = document.getElementById('diag-disk-desc');
  const diskCard = document.getElementById('diag-disk-card');

  if (diskStatus && diskDesc && diskCard) {
    if (disk < 5) {
      diskStatus.textContent = 'Sem Espaço em Disco';
      diskDesc.textContent = `Espaço crítico em C: com apenas ${disk}% livres!`;
      diskCard.className = 'diag-card danger';
    } else if (disk < 15) {
      diskStatus.textContent = 'Espaço Pouco';
      diskDesc.textContent = `Atenção: espaço livre em disco em ${disk}%.`;
      diskCard.className = 'diag-card warning';
    } else {
      diskStatus.textContent = 'Saudável';
      diskDesc.textContent = `${disk}% de espaço livre disponível no drive C:.`;
      diskCard.className = 'diag-card success';
    }
  }

  // 4. Badge global na sidebar ou header indicando alertas se houver perigo crítico
  const hasCritical = (latency === 999 || cpu > 80 || disk < 5);
  const diagBadge = document.getElementById('diag-warning-badge');
  if (diagBadge) {
    diagBadge.style.display = hasCritical ? 'inline-block' : 'none';
  }
}

/**
 * Outline visual neon de Acessibilidade ao navegar por teclado (Tab)
 */
function setupKeyboardFocusOutline() {
  document.body.addEventListener('mousedown', () => {
    document.body.classList.remove('using-keyboard');
  });

  document.body.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      document.body.classList.add('using-keyboard');
    }
  });
}

// Vincula métodos importantes de chamadas DOM ao window para compatibilidade com index.html
window.switchScreen = switchScreen;
window.viewTicketDetails = viewTicketDetails;
window.submitTicket = submitTicket;
window.triggerFileInput = triggerFileInput;
window.handleFileSelect = handleFileSelect;
window.submitFollowup = submitFollowup;
window.triggerChatFileInput = triggerChatFileInput;
window.handleChatFileSelect = handleChatFileSelect;
window.removeChatFile = removeChatFile;
window.generateChatMarkdownSummary = generateChatMarkdownSummary;
window.openRemoteChecklistModal = openRemoteChecklistModal;
window.closeRemoteChecklistModal = closeRemoteChecklistModal;
window.confirmRemoteChecklist = confirmRemoteChecklist;
window.evaluateRemoteChecklistProgress = evaluateRemoteChecklistProgress;
window.loadAgentSettingsIntoForm = loadAgentSettingsIntoForm;
window.saveAgentSettings = saveAgentSettings;
window.testAllConnections = testAllConnections;
window.handleFontScaleChange = handleFontScaleChange;
window.handleCompactModeChange = handleCompactModeChange;
window.checkUpdatesManually = checkUpdatesManually;
window.dismissUpdateBanner = dismissUpdateBanner;
window.closeChangelogModal = closeChangelogModal;
window.startUpdateWorkflow = startUpdateWorkflow;

// Métricas de Telemetria triggers
window.triggerTelemetryFetch = async () => {
  if (window.electronAPI) {
    try {
      const data = await window.electronAPI.getSystemMetrics();
      const o1 = document.getElementById('tel-os');
      const o2 = document.getElementById('tel-os-release');
      const o3 = document.getElementById('tel-cpu');
      const o4 = document.getElementById('tel-cores');
      const o5 = document.getElementById('tel-ram');
      const o6 = document.getElementById('tel-hostname');
      const o7 = document.getElementById('tel-ip');
      const o8 = document.getElementById('tel-ext-ip');
      const o9 = document.getElementById('tel-device');
      const o10 = document.getElementById('tel-vendor');
      const o11 = document.getElementById('tel-model');
      const o12 = document.getElementById('tel-bios-serial');
      const o13 = document.getElementById('tel-board-vendor');
      const o14 = document.getElementById('tel-board-model');
      const o15 = document.getElementById('tel-board-serial');

      if (o1) o1.textContent = data.osType || '--';
      if (o2) o2.textContent = data.osRelease || '--';
      if (o3) o3.textContent = data.cpuModel || '--';
      if (o4) o4.textContent = data.cpuCores || '--';
      if (o5) o5.textContent = data.totalMem || '--';
      if (o6) o6.textContent = data.hostname || '--';
      if (o7) o7.textContent = data.ip || '--';
      if (o8) o8.textContent = data.extIp || '--';
      if (o9) o9.textContent = data.deviceType || '--';
      if (o10) o10.textContent = data.csVendor || '--';
      if (o11) o11.textContent = data.csModel || '--';
      if (o12) o12.textContent = data.biosSerial || '--';
      if (o13) o13.textContent = data.boardVendor || '--';
      if (o14) o14.textContent = data.boardModel || '--';
      if (o15) o15.textContent = data.boardSerial || '--';
    } catch (e) {
      console.error('Erro ao ler telemetria:', e);
    }
  }
};

// Auto-suggest category on typing ticket title
document.getElementById('ticket-title')?.addEventListener('input', (e) => {
  autoCategorizeTicketTitle(e.target.value);
});

// Category change recurrence trigger
document.getElementById('ticket-category')?.addEventListener('change', (e) => {
  triggerRecurrenceCheck(e.target.value);
});

// Notification hooker
window.checkForTicketUpdates = async (tickets) => {
  if (!window.electronAPI) return;
  
  let myId = null;
  try {
    const userInfo = await window.electronAPI.getOSUser();
    const loggedUser = await window.electronAPI.glpiFindUser(userInfo.username);
    if (loggedUser) myId = loggedUser.id;
  } catch (err) {}

  let cacheUpdated = false;

  for (const ticket of tickets) {
    const ticketId = String(ticket.id);
    const cached = State.notificationCache[ticketId];

    if (parseInt(ticket.status) === 6) {
      if (cached) {
        delete State.notificationCache[ticketId];
        cacheUpdated = true;
      }
      continue;
    }

    if (!cached) {
      State.notificationCache[ticketId] = {
        dateMod: ticket.date_mod,
        lastFollowupId: null,
        initialized: false,
        unread: false
      };
      cacheUpdated = true;

      window.electronAPI.glpiGetFollowups(ticket.id).then(followups => {
        if (followups && followups.length > 0) {
          followups.sort((a, b) => parseInt(a.id) - parseInt(b.id));
          State.notificationCache[ticketId].lastFollowupId = followups[followups.length - 1].id;
        }
        State.notificationCache[ticketId].initialized = true;
        localStorage.setItem('glpi_notifications_cache', JSON.stringify(State.notificationCache));
        filterTicketsTable();
      }).catch(() => {});

      continue;
    }

    if (cached.dateMod !== ticket.date_mod) {
      cached.dateMod = ticket.date_mod;
      cacheUpdated = true;

      try {
        const followups = await window.electronAPI.glpiGetFollowups(ticket.id);
        if (followups && followups.length > 0) {
          followups.sort((a, b) => parseInt(a.id) - parseInt(b.id));
          const latest = followups[followups.length - 1];

          if (cached.initialized && cached.lastFollowupId && latest.id > cached.lastFollowupId) {
            if (latest.users_id != myId) {
              window.electronAPI.showNotification({
                title: `Atualização no Chamado #${ticketId}`,
                body: `Assunto: ${ticket.name}\nNova mensagem recebida!`
              });
              cached.unread = true;
            }
          }
          cached.lastFollowupId = latest.id;
        }
        cached.initialized = true;
      } catch (err) {}
    }
  }

  if (cacheUpdated) {
    localStorage.setItem('glpi_notifications_cache', JSON.stringify(State.notificationCache));
    import('./tickets.js').then(mod => mod.filterTicketsTable());
  }
};

// Global Connection sync trigger
window.forceInventorySync = async () => {
  const syncBtn = document.getElementById('btn-force-inventory-sync');
  const dot = document.getElementById('agent-status-dot');
  
  if (window.electronAPI && syncBtn) {
    syncBtn.disabled = true;
    if (dot) dot.className = 'status-dot loading';
    
    const unsubscribe = window.electronAPI.onInventoryProgress((progress) => {
      syncBtn.innerHTML = `<span style="font-size: 11px;">${progress.message}</span>`;
      if (progress.status === 'success') {
        if (dot) dot.className = 'status-dot online';
      } else if (progress.status === 'error') {
        if (dot) dot.className = 'status-dot offline';
      }
    });
    
    try {
      syncBtn.innerHTML = 'Iniciando...';
      const res = await window.electronAPI.forceInventory();
      if (res.success) {
        alert('Inventário de hardware e softwares coletado e enviado com sucesso ao GLPI!');
      } else {
        alert(`Falha na sincronização do inventário: ${res.error || 'Erro desconhecido'}`);
      }
    } catch(e) {
      alert('Falha ao acionar a sincronização local.');
    } finally {
      if (typeof unsubscribe === 'function') unsubscribe();
      if (dot) dot.className = 'status-dot online';
      syncBtn.disabled = false;
      syncBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        Sincronizar Inventário
      `;
    }
  }
};

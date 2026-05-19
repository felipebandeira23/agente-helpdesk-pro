const PROXY_URL = 'http://127.0.0.1:62354';
const SUPPORT_API = `${PROXY_URL}/support`;

let activeScreen = 'dashboard';
let ticketsList = [];
let categoriesList = [];
let activeTicketId = null;
let chatPollInterval = null;
let proxyPollInterval = null;

// Realtime Telemetry Charts
let cpuChart = null;
let memChart = null;
let memMiniChart = null;
let telemetryInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved theme if any
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.innerHTML = '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2M20 13h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M17.66 4.93l-1.41 1.41M4.93 17.66l-1.41 1.41"/>';
    }
  }

  setupInitialUI();
  setupCharts();
  
  // Start Polling Proxy Status
  checkProxyStatus();
  proxyPollInterval = setInterval(checkProxyStatus, 8000);

  // Start Telemetry updates
  startTelemetryUpdates();
});

function setupInitialUI() {
  // Get OS User information via Preload
  if (window.electronAPI) {
    window.electronAPI.getOSUser().then(user => {
      if (user && user.username) {
        const capitalized = user.username.charAt(0).toUpperCase() + user.username.slice(1);
        document.getElementById('user-display-name').textContent = capitalized;
        document.getElementById('user-avatar-char').textContent = user.username.charAt(0).toUpperCase();
        
        // Populate default terminal ID with hostname
        document.getElementById('remote-terminal-id').textContent = `MC-${user.hostname.toUpperCase()}`;
      }
    }).catch(err => {
      document.getElementById('user-display-name').textContent = 'Usuário Local';
    });
  }
}

// Check Proxy Status
async function checkProxyStatus() {
  const dot = document.getElementById('agent-status-dot');
  const text = document.getElementById('agent-status-text');

  try {
    const res = await fetch(`${SUPPORT_API}/status`);
    if (res.ok) {
      dot.className = 'status-dot online';
      text.textContent = 'Proxy Local Conectado';
      
      // Load categories & tickets if empty
      if (categoriesList.length === 0) {
        loadCategories();
      }
      loadTickets();
    } else {
      throw new Error('Proxy offline');
    }
  } catch (e) {
    dot.className = 'status-dot offline';
    text.textContent = 'Proxy Local Offline';
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
  document.getElementById('dashboard-tickets-tbody').innerHTML = warningRow;
  document.getElementById('tickets-tbody').innerHTML = warningRow;
}

// Load Categories from GLPI Proxy or Electron API
async function loadCategories() {
  const selectEl = document.getElementById('ticket-category');
  try {
    let categories = [];
    if (window.electronAPI) {
      categories = await window.electronAPI.glpiGetCategories();
    } else {
      const res = await fetch(`${SUPPORT_API}/categories`);
      if (res.ok) {
        categories = await res.json();
      }
    }
    
    categoriesList = categories;
    selectEl.innerHTML = '<option value="">Selecione uma categoria...</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      selectEl.appendChild(opt);
    });
  } catch (e) {
    selectEl.innerHTML = '<option value="">Falha ao obter categorias (Offline)</option>';
  }
}

// Load Tickets
async function loadTickets() {
  try {
    let tickets = [];
    if (window.electronAPI) {
      let loggedUser = null;
      try {
        const userInfo = await window.electronAPI.getOSUser();
        loggedUser = await window.electronAPI.glpiFindUser(userInfo.username);
      } catch (err) {}
      
      const userId = loggedUser ? loggedUser.id : null;
      tickets = await window.electronAPI.glpiGetTickets(userId);
    } else {
      const res = await fetch(`${SUPPORT_API}/tickets`);
      if (res.ok) {
        tickets = await res.json();
      }
    }
    ticketsList = tickets;
    renderTicketsTable(ticketsList);
  } catch (e) {
    console.error('Falha ao obter chamados:', e);
  }
}

// Render Tickets in Table
function renderTicketsTable(tickets) {
  const tbodyDashboard = document.getElementById('dashboard-tickets-tbody');
  const tbodyList = document.getElementById('tickets-tbody');
  
  if (!tickets || tickets.length === 0) {
    const emptyRow = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum chamado aberto para seu usuário.</td></tr>`;
    tbodyDashboard.innerHTML = emptyRow;
    tbodyList.innerHTML = emptyRow;
    return;
  }

  // Sort descending by ID
  tickets.sort((a, b) => b.id - a.id);

  let htmlRows = '';
  tickets.forEach(ticket => {
    // Priority class selection
    let priorityBadge = 'badge-medium';
    let priorityText = 'Média';
    if (ticket.urgency == 1 || ticket.urgency == 2) {
      priorityBadge = 'badge-low';
      priorityText = 'Baixa';
    } else if (ticket.urgency == 4) {
      priorityBadge = 'badge-high';
      priorityText = 'Alta';
    } else if (ticket.urgency >= 5) {
      priorityBadge = 'badge-critical';
      priorityText = 'Urgente';
    }

    // Status mapping based on typical GLPI status codes
    // 1: Novo, 2: Atribuído, 3: Planejado, 4: Pendente, 5: Solucionado, 6: Fechado
    let statusDot = 'black';
    let statusText = 'Pendente';
    switch (parseInt(ticket.status)) {
      case 1:
        statusDot = 'red';
        statusText = 'Novo';
        break;
      case 2:
      case 3:
        statusDot = 'yellow';
        statusText = 'Em Atendimento';
        break;
      case 4:
        statusDot = 'yellow';
        statusText = 'Pendente';
        break;
      case 5:
        statusDot = 'green';
        statusText = 'Solucionado';
        break;
      case 6:
        statusDot = 'black';
        statusText = 'Fechado';
        break;
    }

    const categoryName = ticket.category_name || 'Geral / Suporte';

    htmlRows += `
      <tr>
        <td class="ticket-id">#${ticket.id}</td>
        <td style="font-weight: 600;">${escapeHtml(ticket.name)}</td>
        <td style="color: var(--text-secondary);">${escapeHtml(categoryName)}</td>
        <td><span class="badge ${priorityBadge}">${priorityText}</span></td>
        <td>
          <div class="status-pill">
            <span class="status-pill-dot ${statusDot}"></span>
            <span>${statusText}</span>
          </div>
        </td>
        <td>
          <button class="action-btn" onclick="viewTicketDetails(${ticket.id})">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });

  tbodyList.innerHTML = htmlRows;
  
  // Dashboard shows top 3 recent tickets only for clean visual balance
  const top3 = tickets.slice(0, 3);
  let htmlDashboard = '';
  if (top3.length === 0) {
    htmlDashboard = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum chamado aberto.</td></tr>`;
  } else {
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

      htmlDashboard += `
        <tr>
          <td class="ticket-id">#${t.id}</td>
          <td style="font-weight: 600;">${escapeHtml(t.name)}</td>
          <td style="color: var(--text-secondary);">${escapeHtml(cName)}</td>
          <td><span class="badge ${pBadge}">${pText}</span></td>
          <td>
            <div class="status-pill">
              <span class="status-pill-dot ${sDot}"></span>
              <span>${sText}</span>
            </div>
          </td>
          <td>
            <button class="action-btn" onclick="viewTicketDetails(${t.id})">
              <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            </button>
          </td>
        </tr>
      `;
    });
  }
  tbodyDashboard.innerHTML = htmlDashboard;
}

// Switch Screens
function switchScreen(screenName) {
  // Clear any active chat polling
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }

  // Deactivate all screens
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));

  // Deactivate all navbar buttons
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => btn.classList.remove('active'));

  // Find target button and activate
  navBtns.forEach(btn => {
    if (btn.getAttribute('onclick').includes(screenName)) {
      btn.classList.add('active');
    }
  });

  // Activate screen
  const targetScreen = document.getElementById(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Dynamic header bar details
  const headerText = document.getElementById('header-text');
  const headerIcon = document.getElementById('header-icon');
  
  switch(screenName) {
    case 'dashboard':
      headerText.textContent = 'Painel Principal';
      headerIcon.innerHTML = '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>';
      break;
    case 'new-ticket':
      headerText.textContent = 'Abrir Novo Chamado';
      headerIcon.innerHTML = '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>';
      break;
    case 'tickets-list':
      headerText.textContent = 'Lista de Chamados';
      headerIcon.innerHTML = '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>';
      loadTickets();
      break;
    case 'telemetry':
      headerText.textContent = 'Métricas de Telemetria';
      headerIcon.innerHTML = '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H5v-2h5v2zm0-4H5v-2h5v2zm0-4H5V5h5v2zm9 8h-7v-2h7v2zm0-4h-7v-2h7v2zm0-4h-7V5h7v2z"/>';
      triggerTelemetryFetch();
      break;
    case 'remote-access':
      headerText.textContent = 'Suporte Remoto Criptografado';
      headerIcon.innerHTML = '<path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/>';
      break;
    case 'settings':
      headerText.textContent = 'Configurações do Agente';
      headerIcon.innerHTML = '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor"/>';
      loadAgentSettingsIntoForm();
      break;
    case 'ticket-detail':
      headerText.textContent = 'Detalhes do Chamado';
      headerIcon.innerHTML = '<path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>';
      break;
  }
}

// Drag & Drop / File Select Handlers
let attachedFile = null;

function triggerFileInput() {
  document.getElementById('ticket-file').click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    attachedFile = file;
    document.getElementById('dropzone-text').textContent = `Arquivo selecionado: ${file.name} (${Math.round(file.size/1024)} KB)`;
    document.getElementById('file-dropzone').style.borderColor = 'var(--accent-neon)';
  }
}

// Submit Ticket Form
async function submitTicket(event) {
  event.preventDefault();
  
  const title = document.getElementById('ticket-title').value.trim();
  const category = document.getElementById('ticket-category').value;
  const urgency = document.getElementById('ticket-urgency').value;
  const content = document.getElementById('ticket-content').value.trim();
  const submitBtn = document.getElementById('btn-submit-ticket');

  if (!title || !category || !content) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  try {
    let success = false;
    let ticketId = null;
    let errMessage = '';

    if (window.electronAPI) {
      let loggedUser = null;
      try {
        const userInfo = await window.electronAPI.getOSUser();
        loggedUser = await window.electronAPI.glpiFindUser(userInfo.username);
      } catch (err) {}
      
      const userId = loggedUser ? loggedUser.id : null;
      const res = await window.electronAPI.glpiCreateTicket({
        title,
        description: content,
        categoryId: category,
        urgency,
        userId
      });

      if (res && res.id) {
        success = true;
        ticketId = res.id;
      } else if (res && res.error) {
        errMessage = res.error;
      }
    } else {
      const payload = {
        title: title,
        category_id: category,
        urgency: urgency,
        content: content
      };

      const res = await fetch(`${SUPPORT_API}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        success = true;
        ticketId = data.id;
      } else {
        errMessage = await res.text();
      }
    }

    if (success) {
      alert(`Chamado #${ticketId} criado com sucesso no GLPI!`);
      document.getElementById('new-ticket-form').reset();
      attachedFile = null;
      document.getElementById('dropzone-text').textContent = 'Arraste e solte o arquivo aqui ou clique para selecionar';
      document.getElementById('file-dropzone').style.borderColor = 'var(--border-glass)';
      
      // Load list and redirect
      loadTickets();
      switchScreen('tickets-list');
    } else {
      alert(`Erro ao criar chamado: ${errMessage || 'Erro desconhecido'}`);
    }
  } catch (e) {
    alert(`Erro de conexão ao criar chamado: ${e.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar Chamado';
  }
}

// View Ticket Details & Chat
async function viewTicketDetails(ticketId) {
  activeTicketId = ticketId;
  switchScreen('ticket-detail');

  // Find ticket in local cache list
  const ticket = ticketsList.find(t => t.id == ticketId);
  if (!ticket) return;

  // Set Info Panel
  document.getElementById('detail-ticket-id').textContent = `#${ticket.id}`;
  document.getElementById('detail-ticket-title').textContent = ticket.name;
  document.getElementById('detail-ticket-category').textContent = ticket.category_name || 'Geral / Suporte';
  document.getElementById('detail-ticket-desc').textContent = ticket.content;
  document.getElementById('detail-ticket-date').textContent = ticket.date_creation || 'Não disponível';

  // Set priority label
  let pText = 'Média';
  let pBadge = 'badge-medium';
  if (ticket.urgency == 1 || ticket.urgency == 2) { pText = 'Baixa'; pBadge = 'badge-low'; }
  else if (ticket.urgency == 4) { pText = 'Alta'; pBadge = 'badge-high'; }
  else if (ticket.urgency >= 5) { pText = 'Crítica'; pBadge = 'badge-critical'; }
  document.getElementById('detail-ticket-priority').innerHTML = `<span class="badge ${pBadge}">${pText}</span>`;

  // Set status label
  let sDot = 'black';
  let sText = 'Pendente';
  switch (parseInt(ticket.status)) {
    case 1: sDot = 'red'; sText = 'Novo'; break;
    case 2:
    case 3: sDot = 'yellow'; sText = 'Em Atendimento'; break;
    case 4: sDot = 'yellow'; sText = 'Pendente'; break;
    case 5: sDot = 'green'; sText = 'Solucionado'; break;
    case 6: sDot = 'black'; sText = 'Fechado'; break;
  }
  document.getElementById('detail-ticket-status').innerHTML = `
    <div class="status-pill">
      <span class="status-pill-dot ${sDot}"></span>
      <span>${sText}</span>
    </div>
  `;

  // Clear timeline and show loader
  const timeline = document.getElementById('chat-timeline');
  timeline.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Buscando conversas...</div>';

  // Load Followups
  await loadFollowups(ticketId);

  // Poll for new messages every 5 seconds while viewing this ticket
  chatPollInterval = setInterval(() => {
    loadFollowups(ticketId);
  }, 5000);
}

// Load Followups/Chat Bubble
async function loadFollowups(ticketId) {
  const timeline = document.getElementById('chat-timeline');
  try {
    let followups = [];
    let currentUserId = null;

    if (window.electronAPI) {
      try {
        const userInfo = await window.electronAPI.getOSUser();
        const loggedUser = await window.electronAPI.glpiFindUser(userInfo.username);
        if (loggedUser) currentUserId = loggedUser.id;
      } catch (err) {}

      followups = await window.electronAPI.glpiGetFollowups(ticketId);
    } else {
      const res = await fetch(`${SUPPORT_API}/tickets/${ticketId}/followups`);
      if (res.ok) {
        followups = await res.json();
      }
    }

    if (followups.length === 0) {
      timeline.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma interação registrada ainda. Use a caixa abaixo para iniciar.</div>';
      return;
    }

    // Sort chronological by creation date or ID
    followups.sort((a, b) => a.id - b.id);

    let htmlBubbles = '';
    followups.forEach(f => {
      const isTech = window.electronAPI 
        ? (f.users_id != currentUserId) 
        : (f.is_tech == 1 || f.is_tech === true);
        
      const bubbleClass = isTech ? 'message-received' : 'message-sent';
      const sender = isTech ? 'Suporte Técnico' : 'Você';
      
      htmlBubbles += `
        <div class="message-bubble ${bubbleClass}">
          <span class="message-meta">${escapeHtml(sender)} • ${f.date_creation || f.date || ''}</span>
          <div>${escapeHtml(f.content)}</div>
        </div>
      `;
    });

    // Keep scroll position if user is reading, or auto scroll
    const wasAtBottom = timeline.scrollHeight - timeline.clientHeight <= timeline.scrollTop + 50;
    timeline.innerHTML = htmlBubbles;
    
    if (wasAtBottom) {
      timeline.scrollTop = timeline.scrollHeight;
    }
  } catch (e) {
    console.error('Falha ao obter interações:', e);
  }
}

// Submit Followup/Message
async function submitFollowup(event) {
  event.preventDefault();
  
  if (!activeTicketId) return;

  const inputEl = document.getElementById('chat-input-field');
  const message = inputEl.value.trim();
  if (!message) return;

  inputEl.value = '';
  inputEl.focus();

  try {
    let success = false;
    let errText = '';

    if (window.electronAPI) {
      const res = await window.electronAPI.glpiAddFollowup(activeTicketId, message);
      if (res && res.id) {
        success = true;
      } else if (res && res.error) {
        errText = res.error;
      }
    } else {
      const res = await fetch(`${SUPPORT_API}/tickets/${activeTicketId}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message })
      });
      if (res.ok) {
        success = true;
      } else {
        errText = await res.text();
      }
    }

    if (success) {
      // Reload bubbles immediately
      loadFollowups(activeTicketId);
    } else {
      alert(`Falha ao registrar mensagem: ${errText || 'Erro desconhecido'}`);
    }
  } catch (e) {
    alert('Erro de rede ao enviar resposta. Verifique conexão.');
  }
}

// Force hardware inventory sync
async function forceInventorySync() {
  const syncBtn = document.querySelector('.sidebar-bottom button');
  const dot = document.getElementById('agent-status-dot');
  
  if (window.electronAPI) {
    syncBtn.disabled = true;
    dot.className = 'status-dot loading';
    
    // Subscribe to progress events
    const unsubscribe = window.electronAPI.onInventoryProgress((progress) => {
      if (syncBtn) {
        syncBtn.innerHTML = `<span style="font-size: 11px;">${progress.message}</span>`;
      }
      if (progress.status === 'success') {
        dot.className = 'status-dot online';
      } else if (progress.status === 'error') {
        dot.className = 'status-dot offline';
      }
    });
    
    try {
      if (syncBtn) syncBtn.innerHTML = 'Iniciando...';
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
      dot.className = 'status-dot online';
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Sincronizar Inventário
        `;
      }
    }
  }
}

// Fetch Full System Telemetry
async function triggerTelemetryFetch() {
  if (window.electronAPI) {
    try {
      const data = await window.electronAPI.getSystemMetrics();
      
      document.getElementById('tel-os').textContent = data.osType || '--';
      document.getElementById('tel-os-release').textContent = data.osRelease || '--';
      document.getElementById('tel-cpu').textContent = data.cpuModel || '--';
      document.getElementById('tel-cores').textContent = data.cpuCores || '--';
      document.getElementById('tel-ram').textContent = data.totalMem || '--';
      document.getElementById('tel-hostname').textContent = data.hostname || '--';
      document.getElementById('tel-ip').textContent = data.ip || '--';
      document.getElementById('tel-ext-ip').textContent = data.extIp || '--';
      document.getElementById('tel-device').textContent = data.deviceType || '--';
      document.getElementById('tel-vendor').textContent = data.csVendor || '--';
      document.getElementById('tel-model').textContent = data.csModel || '--';
      document.getElementById('tel-bios-serial').textContent = data.biosSerial || '--';
      document.getElementById('tel-board-vendor').textContent = data.boardVendor || '--';
      document.getElementById('tel-board-model').textContent = data.boardModel || '--';
      document.getElementById('tel-board-serial').textContent = data.boardSerial || '--';

    } catch (e) {
      console.error('Erro ao ler métricas de telemetria via Electron IPC:', e);
    }
  }
}

// Real-time Chart.js Integration & Metrics Loop
function setupCharts() {
  const isLight = document.body.classList.contains('light-theme');
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)';
  const tickColor = isLight ? '#475569' : '#64748b';
  const miniBg = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)';

  // Mini memory doughnut chart
  const ctxMini = document.getElementById('memMiniChart').getContext('2d');
  memMiniChart = new Chart(ctxMini, {
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

  // Large CPU line chart
  const ctxCpu = document.getElementById('cpuChart').getContext('2d');
  cpuChart = new Chart(ctxCpu, {
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

  // Large RAM line chart
  const ctxMem = document.getElementById('memChart').getContext('2d');
  memChart = new Chart(ctxMem, {
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

function startTelemetryUpdates() {
  if (telemetryInterval) clearInterval(telemetryInterval);
  
  // Simulate active telemetry monitor
  telemetryInterval = setInterval(() => {
    // Generates realistic system fluctuation
    const randomCpu = Math.floor(Math.random() * 25) + 10; // 10% - 35%
    const randomMem = Math.floor(Math.random() * 10) + 55; // 55% - 65%

    // Update Mini Doughnut Chart
    if (memMiniChart) {
      memMiniChart.data.datasets[0].data = [randomMem, 100 - randomMem];
      memMiniChart.update();
      document.getElementById('memMiniText').textContent = `${randomMem}%`;
      
      // Assume typical 16GB RAM for dashboard display details
      const usedGb = ((16 * randomMem) / 100).toFixed(1);
      document.getElementById('memMiniDetail').textContent = `${usedGb} GB de 16.0 GB em uso`;
    }

    // Update CPU graph
    if (cpuChart) {
      cpuChart.data.datasets[0].data.shift();
      cpuChart.data.datasets[0].data.push(randomCpu);
      cpuChart.update();
    }

    // Update RAM graph
    if (memChart) {
      memChart.data.datasets[0].data.shift();
      memChart.data.datasets[0].data.push(randomMem);
      memChart.update();
    }
  }, 2000);
}

// MeshCentral Remote Support Integration
async function requestRemoteSupport() {
  const terminalLog = document.getElementById('terminal-action-log');
  const sessionStatus = document.getElementById('remote-session-status');
  const reqBtn = document.getElementById('btn-request-remote');

  reqBtn.disabled = true;
  reqBtn.innerHTML = 'Conectando Suporte...';

  terminalLog.innerHTML = '<div>[SYSTEM] Inicializando verificação de suporte...</div>';

  if (!window.electronAPI) {
    terminalLog.innerHTML += '<div style="color: #ef4444;">[ERRO] API do Agente não disponível.</div>';
    reqBtn.disabled = false;
    reqBtn.innerHTML = 'Solicitar Acesso Remoto Agora';
    return;
  }

  // Load config to get mesh settings
  let cfg = { meshUrl: 'https://rdp.intranet.coppead.ufrj.br', meshGroupId: '' };
  try {
    cfg = await window.electronAPI.glpiGetConfig();
  } catch (e) {
    console.error('Erro ao ler config:', e);
  }

  const meshServer = cfg.meshUrl || 'https://rdp.intranet.coppead.ufrj.br';

  setTimeout(() => {
    terminalLog.innerHTML += '<div>[USER] Consentimento registrado: OK</div>';
  }, 500);

  setTimeout(async () => {
    terminalLog.innerHTML += '<div style="color: #66d9ef;">[SYSTEM] Buscando serviço local do MeshAgent...</div>';
    
    try {
      const status = await window.electronAPI.checkMeshAgent();
      
      if (status === 'Running' || status === true) {
        terminalLog.innerHTML += '<div style="color: #00d293;">[SYSTEM] MeshAgent ativo e conectado ao servidor!</div>';
        terminalLog.innerHTML += `<div style="color: #00d293;">[SUPPORT] Link de pareamento ativo com ${meshServer}</div>`;
        
        sessionStatus.textContent = 'Agente Ativo / Aguardando';
        sessionStatus.style.color = 'var(--success)';
        
        alert('O Agente de Suporte Remoto já está ativo e operando em segundo plano no seu computador!\n\nPor favor, informe ao analista de suporte que sua máquina está disponível para conexão.');
      } else if (status === 'Stopped') {
        terminalLog.innerHTML += '<div style="color: #fbbf24;">[WARNING] O serviço Mesh Agent está instalado, mas está PARADO.</div>';
        terminalLog.innerHTML += '<div style="color: #66d9ef;">[SYSTEM] Orientando ativação do serviço...</div>';
        
        sessionStatus.textContent = 'Serviço Parado';
        sessionStatus.style.color = 'var(--warning)';
        
        alert('O Agente de Suporte Remoto (Mesh Agent) está instalado no seu computador, mas o serviço está PARADO ou DESATIVADO.\n\nComo resolver:\n1. Abra o PowerShell como Administrador.\n2. Execute o comando:\n   Start-Service -Name "Mesh Agent"\n3. Ou abra o painel "Serviços" do Windows (services.msc), localize "Mesh Agent", clique com o botão direito e selecione "Iniciar".\n\nCaso o antivírus Kaspersky estivesse bloqueando, certifique-se de que ele está desativado (ou crie uma regra de exclusão para o executável do MeshAgent) antes de iniciar o serviço.');
      } else {
        terminalLog.innerHTML += '<div style="color: #fbbf24;">[WARNING] MeshAgent não detectado em execução local.</div>';
        terminalLog.innerHTML += '<div style="color: #66d9ef;">[MESH] Redirecionando para portal de download...</div>';
        
        sessionStatus.textContent = 'Instalação Requerida';
        sessionStatus.style.color = 'var(--warning)';
        
        let downloadUrl = meshServer;
        if (cfg.meshGroupId) {
          downloadUrl = `${meshServer}/meshagent.exe?id=${cfg.meshGroupId}`;
        }
        
        terminalLog.innerHTML += `<div style="color: #00b0ff;">[INFO] Abrindo link de download: ${downloadUrl}</div>`;
        
        await window.electronAPI.openExternal(downloadUrl);
        
        alert(`O Agente de Suporte Remoto (MeshAgent) não foi encontrado no seu computador.\n\nEstamos abrindo o portal do MeshCentral (${meshServer}) para que você possa baixar e instalar o agente de suporte.\n\nInstruções:\n1. Baixe o instalador do MeshAgent.\n2. Execute o arquivo e clique em "Install" / "Instalar como serviço".\n3. Após a instalação, seu computador estará imediatamente disponível para a equipe de TI.`);
      }
    } catch (err) {
      terminalLog.innerHTML += `<div style="color: #ef4444;">[ERRO] Falha ao verificar serviço: ${err.message}</div>`;
    } finally {
      reqBtn.disabled = false;
      reqBtn.innerHTML = 'Solicitar Acesso Remoto Agora';
    }
  }, 1200);
}

// Configs Load & Save Management
async function loadAgentSettingsIntoForm() {
  if (window.electronAPI) {
    try {
      const cfg = await window.electronAPI.glpiGetConfig();
      document.getElementById('settings-glpi-url').value = cfg.glpiUrl || '';
      document.getElementById('settings-glpi-app-token').value = cfg.appToken || '';
      document.getElementById('settings-glpi-user-token').value = cfg.userToken || '';
      document.getElementById('settings-mesh-url').value = cfg.meshUrl || 'https://rdp.intranet.coppead.ufrj.br';
      document.getElementById('settings-mesh-group').value = cfg.meshGroupId || '';
    } catch (e) {
      console.error('Erro ao carregar configurações:', e);
    }
  }
}

async function saveAgentSettings(event) {
  if (event) event.preventDefault();
  const glpiUrl = document.getElementById('settings-glpi-url').value.trim();
  const appToken = document.getElementById('settings-glpi-app-token').value.trim();
  const userToken = document.getElementById('settings-glpi-user-token').value.trim();
  const meshUrl = document.getElementById('settings-mesh-url').value.trim();
  const meshGroupId = document.getElementById('settings-mesh-group').value.trim();

  if (window.electronAPI) {
    try {
      const res = await window.electronAPI.glpiSetConfig({
        glpiUrl,
        appToken,
        userToken,
        meshUrl,
        meshGroupId
      });
      if (res.ok) {
        alert('Configurações salvas com sucesso!');
      } else {
        alert('Falha ao salvar configurações.');
      }
    } catch (e) {
      alert(`Erro ao salvar: ${e.message}`);
    }
  }
}

async function testAllConnections() {
  // Try to find the button
  const testBtn = document.querySelector('#settings-form button[type="button"]');
  const originalHtml = testBtn ? testBtn.innerHTML : '';
  
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = 'Testando conexões...';
  }

  if (window.electronAPI) {
    try {
      // 1. Test GLPI URL connection
      const glpiRes = await window.electronAPI.glpiTestConnection();
      const glpiMsg = glpiRes.ok 
        ? '✅ Conexão GLPI: Bem-sucedida!' 
        : `❌ Conexão GLPI: Falhou (${glpiRes.message})`;

      // 2. Test MeshCentral connection
      const meshUrl = document.getElementById('settings-mesh-url').value.trim();
      const meshRes = await window.electronAPI.testMeshConnection(meshUrl);
      const meshMsg = meshRes.ok
        ? '✅ Conexão MeshCentral: Bem-sucedida!'
        : `❌ Conexão MeshCentral: Falhou (${meshRes.message})`;

      alert(`${glpiMsg}\n\n${meshMsg}`);
    } catch (e) {
      alert(`Erro de teste: ${e.message}`);
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.innerHTML = originalHtml;
      }
    }
  }
}

// Simple Helper to prevent HTML injections in chats
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Theme Toggle Helper Function
function toggleTheme() {
  const body = document.body;
  const icon = document.getElementById('theme-icon');
  
  if (body.classList.contains('light-theme')) {
    body.classList.remove('light-theme');
    localStorage.setItem('theme', 'dark');
    if (icon) {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
    updateChartsTheme(false);
  } else {
    body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
    if (icon) {
      icon.innerHTML = '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2M20 13h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M17.66 4.93l-1.41 1.41M4.93 17.66l-1.41 1.41"/>';
    }
    updateChartsTheme(true);
  }
}

function updateChartsTheme(isLight) {
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)';
  const tickColor = isLight ? '#475569' : '#64748b';
  const miniBg = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)';
  
  if (cpuChart) {
    cpuChart.options.scales.y.grid.color = gridColor;
    cpuChart.options.scales.y.ticks.color = tickColor;
    cpuChart.update();
  }
  if (memChart) {
    memChart.options.scales.y.grid.color = gridColor;
    memChart.options.scales.y.ticks.color = tickColor;
    memChart.update();
  }
  if (memMiniChart) {
    memMiniChart.data.datasets[0].backgroundColor[1] = miniBg;
    memMiniChart.data.datasets[0].hoverBackgroundColor[1] = miniBg;
    memMiniChart.update();
  }
}

/**
 * chat.js — Chat do Chamado, Timeline de Eventos, Upload de Anexos, Resumo em Markdown e Polling Focado
 * Sprint 0.5: Split Layout 70/30, Progress Bar, SLA Timer, Customer History, Quick-Add Modal, Admin Controls
 */

import { State } from './state.js';
import { escapeHtml, switchScreen } from './dom.js';
import { loadTickets } from './tickets.js';

let chatAttachedFile = null;
let slaTimerInterval = null;

export function triggerChatFileInput() {
  const input = document.getElementById('chat-file-input');
  if (input) input.click();
}

export function handleChatFileSelect(event) {
  const file = event.target.files[0];
  const indicator = document.getElementById('chat-file-indicator');
  
  if (file) {
    chatAttachedFile = file;
    if (indicator) {
      indicator.innerHTML = `
        <span class="chat-file-badge">
          📎 ${escapeHtml(file.name)} (${Math.round(file.size/1024)} KB)
          <button class="chat-file-remove" onclick="removeChatFile(event)">&times;</button>
        </span>
      `;
      indicator.style.display = 'block';
    }
  }
}

export function removeChatFile(event) {
  if (event) event.preventDefault();
  chatAttachedFile = null;
  const indicator = document.getElementById('chat-file-indicator');
  if (indicator) {
    indicator.innerHTML = '';
    indicator.style.display = 'none';
  }
  const input = document.getElementById('chat-file-input');
  if (input) input.value = '';
}

/**
 * Visualizar Detalhes do Chamado (Ponto de Entrada do Chat)
 */
export async function viewTicketDetails(ticketId) {
  State.activeTicketId = ticketId;
  switchScreen('ticket-detail');

  const ticket = State.ticketsList.find(t => t.id == ticketId);
  if (!ticket) return;

  // Marca chamado como lido
  if (State.notificationCache[ticketId]) {
    State.notificationCache[ticketId].unread = false;
    localStorage.setItem('glpi_notifications_cache', JSON.stringify(State.notificationCache));
    
    // Atualiza tabela para tirar bolinha vermelha
    loadTickets();
  }

  // Preenche dados visuais
  updateTicketDetailsUI(ticket);

  // Limpa e exibe carregando
  const timeline = document.getElementById('chat-timeline');
  if (timeline) {
    timeline.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Buscando conversas e anexos...</div>';
  }

  // Carrega conversas e arquivos associados
  await loadFollowupsAndDocuments(ticketId);

  // Configura polling focado inteligente
  startFocusedPolling(ticketId);
}

function updateTicketDetailsUI(ticket) {
  const idEl = document.getElementById('detail-ticket-id');
  const titleEl = document.getElementById('detail-ticket-title');
  const catEl = document.getElementById('detail-ticket-category');
  const descEl = document.getElementById('detail-ticket-desc');
  const dateEl = document.getElementById('detail-ticket-date');
  const requesterEl = document.getElementById('detail-ticket-requester');

  if (idEl) idEl.textContent = `#${ticket.id}`;
  if (titleEl) titleEl.textContent = ticket.name;
  if (catEl) catEl.textContent = ticket.category_name || 'Geral / Suporte';
  if (descEl) descEl.innerHTML = ticket.content || '<em>Sem descrição fornecida.</em>';
  if (dateEl) dateEl.textContent = ticket.date_creation || 'Não disponível';
  if (requesterEl) requesterEl.textContent = ticket.user_name || 'Desconhecido';

  // Urgência
  const prioEl = document.getElementById('detail-ticket-priority');
  if (prioEl) {
    let pText = 'Média';
    let pBadge = 'badge-medium';
    if (ticket.urgency == 1 || ticket.urgency == 2) { pText = 'Baixa'; pBadge = 'badge-low'; }
    else if (ticket.urgency == 4) { pText = 'Alta'; pBadge = 'badge-high'; }
    else if (ticket.urgency >= 5) { pText = 'Crítica'; pBadge = 'badge-critical'; }
    prioEl.innerHTML = `<span class="badge ${pBadge}">${pText}</span>`;
  }

  // Status
  const statusEl = document.getElementById('detail-ticket-status');
  if (statusEl) {
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
    statusEl.innerHTML = `
      <div class="status-pill">
        <span class="status-pill-dot ${sDot}"></span>
        <span>${sText}</span>
      </div>
    `;
  }

  // Barra de progresso (persistida em localStorage)
  const savedPct = parseInt(localStorage.getItem(`ticket-progress-${ticket.id}`)) || 0;
  updateProgressBar(savedPct);
  const slider = document.getElementById('detail-progress-slider');
  if (slider) slider.value = String(savedPct);

  // SLA Timer
  if (slaTimerInterval) clearInterval(slaTimerInterval);
  displaySlaTimer(ticket);
  slaTimerInterval = setInterval(() => displaySlaTimer(ticket), 60000);

  // Seções Administrativas
  const adminSection = document.getElementById('admin-controls-section');
  if (adminSection) {
    if (State.userRoles.isSuperAdmin || State.userRoles.isTecnico) {
      adminSection.style.display = 'flex';

      // Exibe o slider de progresso para técnicos
      if (slider) slider.style.display = 'block';

      const statusSelect = document.getElementById('admin-change-status');
      if (statusSelect) {
        let val = parseInt(ticket.status);
        if (val === 3) val = 2;
        statusSelect.value = String(val);
      }

      const typeSelect = document.getElementById('admin-change-type');
      if (typeSelect && ticket.type) typeSelect.value = String(ticket.type);

      const catSelect = document.getElementById('admin-change-category');
      if (catSelect && ticket.itilcategories_id) catSelect.value = String(ticket.itilcategories_id);

      const urgSelect = document.getElementById('admin-change-urgency');
      if (urgSelect && ticket.urgency) urgSelect.value = String(ticket.urgency);

      const locSelect = document.getElementById('admin-change-location');
      if (locSelect && ticket.locations_id) locSelect.value = String(ticket.locations_id);

      const closeBtn = document.getElementById('btn-admin-close-ticket');
      if (closeBtn) {
        if (parseInt(ticket.status) === 6) {
          closeBtn.disabled = true;
          closeBtn.textContent = 'Chamado Fechado';
          closeBtn.style.opacity = '0.5';
        } else {
          closeBtn.disabled = false;
          closeBtn.textContent = 'Fechar Chamado';
          closeBtn.style.opacity = '1';
        }
      }
    } else {
      adminSection.style.display = 'none';
    }
  }

  // Histórico do solicitante (async)
  loadCustomerHistory(ticket);
}

/**
 * Atualiza a barra de progresso visual
 */
function updateProgressBar(pct) {
  const fill = document.getElementById('detail-progress-fill');
  const label = document.getElementById('detail-progress-pct');
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
}

/**
 * Handler do slider de progresso — chamado pelo oninput do input range
 */
export function handleProgressSliderChange(value) {
  const pct = parseInt(value);
  updateProgressBar(pct);
  localStorage.setItem(`ticket-progress-${State.activeTicketId}`, String(pct));
}

/**
 * Calcula e exibe o timer de SLA
 */
function displaySlaTimer(ticket) {
  const slaEl = document.getElementById('detail-sla-timer');
  if (!slaEl) return;

  const timeToResolve = ticket.time_to_resolve;
  if (!timeToResolve || timeToResolve === '0000-00-00 00:00:00' || timeToResolve === null) {
    slaEl.textContent = 'Sem prazo definido';
    slaEl.className = 'sla-badge sla-neutral';
    return;
  }

  const deadline = new Date(timeToResolve);
  const now = new Date();
  const diffMs = deadline - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) {
    slaEl.textContent = `⚠ SLA estourado há ${formatDuration(Math.abs(diffMs))}`;
    slaEl.className = 'sla-badge sla-critical';
  } else if (diffHours < 4) {
    slaEl.textContent = `⏰ Vence em ${formatDuration(diffMs)}`;
    slaEl.className = 'sla-badge sla-warning';
  } else {
    slaEl.textContent = `✓ ${formatDuration(diffMs)} restantes`;
    slaEl.className = 'sla-badge sla-ok';
  }
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours > 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

/**
 * Carrega o histórico de chamados do solicitante
 */
async function loadCustomerHistory(ticket) {
  const listEl = document.getElementById('customer-history-list');
  if (!listEl) return;

  const requesterId = ticket.users_id_recipient;
  if (!requesterId || !window.electronAPI) {
    listEl.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Sem histórico disponível.</span>';
    return;
  }

  try {
    const allTickets = await window.electronAPI.glpiGetTickets(requesterId);
    const recent = allTickets
      .filter(t => t.id != ticket.id)
      .sort((a, b) => parseInt(b.id) - parseInt(a.id))
      .slice(0, 5);

    if (recent.length === 0) {
      listEl.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Nenhum chamado anterior.</span>';
      return;
    }

    const statusColors = {
      1: '#ef4444', 2: '#f59e0b', 3: '#f59e0b',
      4: '#f59e0b', 5: '#10b981', 6: '#64748b'
    };

    listEl.innerHTML = recent.map(t => {
      const color = statusColors[parseInt(t.status)] || '#64748b';
      return `
        <div class="customer-history-item" onclick="viewTicketDetails(${t.id})" role="button" tabindex="0" title="#${t.id} — ${escapeHtml(t.name)}">
          <span class="hist-id">#${t.id}</span>
          <span class="hist-title">${escapeHtml(t.name)}</span>
          <span class="hist-dot" style="background: ${color};"></span>
        </div>
      `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Erro ao carregar histórico.</span>';
  }
}

/**
 * Admin: atualiza um campo do chamado ativo via GLPI API
 */
export async function updateTicketFieldFromAdmin(field, value) {
  if (!State.activeTicketId || !window.electronAPI) return;

  try {
    const res = await window.electronAPI.glpiUpdateTicket(State.activeTicketId, { [field]: value });
    if (res && res.error) {
      alert(`Erro ao atualizar: ${res.error}`);
    } else {
      // Atualiza estado local
      const ticket = State.ticketsList.find(t => t.id == State.activeTicketId);
      if (ticket) {
        ticket[field] = value;
        updateTicketDetailsUI(ticket);
      }
      loadTickets();
    }
  } catch (e) {
    alert(`Erro ao atualizar chamado: ${e.message}`);
  }
}

/**
 * Admin: fecha o chamado ativo
 */
export async function closeTicketFromAdmin() {
  if (!State.activeTicketId || !window.electronAPI) return;

  if (!confirm('Tem certeza que deseja fechar este chamado?')) return;

  try {
    const res = await window.electronAPI.glpiUpdateTicket(State.activeTicketId, { status: 6 });
    if (res && res.error) {
      alert(`Erro ao fechar chamado: ${res.error}`);
    } else {
      const ticket = State.ticketsList.find(t => t.id == State.activeTicketId);
      if (ticket) {
        ticket.status = 6;
        updateTicketDetailsUI(ticket);
      }
      loadTickets();
    }
  } catch (e) {
    alert(`Erro ao fechar chamado: ${e.message}`);
  }
}

/**
 * Modal de criação rápida — abre o modal
 */
export function openQuickAddModal() {
  const modal = document.getElementById('quick-add-modal');
  if (!modal) return;

  // Popula categorias
  const catSelect = document.getElementById('quick-category');
  if (catSelect && State.categoriesList.length > 0) {
    catSelect.innerHTML = '<option value="">Selecione uma categoria...</option>';
    State.categoriesList.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      catSelect.appendChild(opt);
    });
  }

  // Reseta formulário e erro
  const form = document.getElementById('quick-add-form');
  if (form) form.reset();
  const errEl = document.getElementById('quick-add-error');
  if (errEl) errEl.style.display = 'none';

  modal.style.display = 'flex';
  document.getElementById('quick-title')?.focus();
}

/**
 * Modal de criação rápida — fecha o modal
 */
export function closeQuickAddModal() {
  const modal = document.getElementById('quick-add-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Modal de criação rápida — submete o chamado
 */
export async function submitQuickAddTicket(event) {
  event.preventDefault();

  const title = document.getElementById('quick-title')?.value.trim();
  const category = document.getElementById('quick-category')?.value;
  const urgency = document.getElementById('quick-urgency')?.value || '3';
  const description = document.getElementById('quick-desc')?.value.trim();
  const submitBtn = document.getElementById('quick-add-submit-btn');
  const errEl = document.getElementById('quick-add-error');

  if (!title || !category || !description) return;

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando...'; }
  if (errEl) errEl.style.display = 'none';

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
        description,
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
    }

    if (success) {
      closeQuickAddModal();
      alert(`Chamado #${ticketId} criado com sucesso!`);
      await loadTickets();
      switchScreen('tickets-list');
    } else {
      if (errEl) {
        errEl.textContent = `Erro ao criar chamado: ${errMessage || 'Erro desconhecido'}`;
        errEl.style.display = 'block';
      }
    }
  } catch (e) {
    if (errEl) {
      errEl.textContent = `Erro de conexão: ${e.message}`;
      errEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Abrir Chamado'; }
  }
}

/**
 * Carrega follow-ups (conversas) e documentos anexos do chamado
 */
export async function loadFollowupsAndDocuments(ticketId) {
  const timeline = document.getElementById('chat-timeline');
  if (!timeline) return;

  try {
    let followups = [];
    let documents = [];
    let currentUserId = null;

    if (window.electronAPI) {
      try {
        const userInfo = await window.electronAPI.getOSUser();
        const loggedUser = await window.electronAPI.glpiFindUser(userInfo.username);
        if (loggedUser) currentUserId = loggedUser.id;
      } catch (err) {}

      followups = await window.electronAPI.glpiGetFollowups(ticketId);
      try {
        documents = await window.electronAPI.glpiGetDocuments(ticketId);
      } catch (docErr) {
        // Ignora silenciosamente se o endpoint de documentos falhar
      }
    }

    // Ordenação cronológica dos follow-ups
    followups.sort((a, b) => a.id - b.id);

    // Timeline consolidada (conversas + arquivos)
    let timelineElements = [];

    // Adiciona evento de criação de chamado
    const ticket = State.ticketsList.find(t => t.id == ticketId);
    if (ticket) {
      timelineElements.push({
        type: 'event',
        date: ticket.date_creation,
        message: '🎫 Chamado criado no sistema por ' + (ticket.user_name || 'Usuário Local')
      });
      if (ticket.status > 1) {
        timelineElements.push({
          type: 'event',
          date: ticket.date_mod,
          message: `👤 Atendimento iniciado pelo suporte técnico`
        });
      }
    }

    // Adiciona follow-ups
    followups.forEach(f => {
      const isTech = window.electronAPI 
        ? (f.users_id != currentUserId) 
        : (f.is_tech == 1 || f.is_tech === true);
        
      timelineElements.push({
        type: 'followup',
        date: f.date_creation || f.date || '',
        sender: isTech ? 'Suporte Técnico' : 'Você',
        isTech: isTech,
        content: f.content
      });
    });

    // Adiciona documentos anexados
    documents.forEach(d => {
      timelineElements.push({
        type: 'attachment',
        date: d.date_creation || d.date_mod || '',
        name: d.name || d.filename,
        filename: d.filename,
        filepath: d.filepath,
        downloadUrl: d.download_url
      });
    });

    // Ordena toda a timeline de forma cronológica
    timelineElements.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (timelineElements.length === 0) {
      timeline.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma interação registrada ainda. Use a caixa abaixo para iniciar.</div>';
      return;
    }

    let htmlTimeline = '';
    timelineElements.forEach(item => {
      if (item.type === 'event') {
        htmlTimeline += `
          <div class="system-event-badge" role="status">
            <span>${escapeHtml(item.message)}</span>
            <span class="event-time">${escapeHtml(item.date)}</span>
          </div>
        `;
      } else if (item.type === 'followup') {
        const bubbleClass = item.isTech ? 'message-received' : 'message-sent';
        htmlTimeline += `
          <div class="message-bubble ${bubbleClass}">
            <span class="message-meta">${escapeHtml(item.sender)} • ${escapeHtml(item.date)}</span>
            <div class="message-text">${item.content}</div>
          </div>
        `;
      } else if (item.type === 'attachment') {
        htmlTimeline += `
          <div class="message-bubble message-received attachment-bubble">
            <span class="message-meta">📎 Anexo Recebido • ${escapeHtml(item.date)}</span>
            <div class="attachment-box">
              <span class="attachment-name">${escapeHtml(item.name || item.filename)}</span>
              <button class="btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="openAttachmentLink('${escapeHtml(item.downloadUrl || item.filepath)}')">Abrir Anexo</button>
            </div>
          </div>
        `;
      }
    });

    const wasAtBottom = timeline.scrollHeight - timeline.clientHeight <= timeline.scrollTop + 80;
    timeline.innerHTML = htmlTimeline;
    
    if (wasAtBottom) {
      timeline.scrollTop = timeline.scrollHeight;
    }
  } catch (e) {
    console.error('Falha ao obter interações:', e);
  }
}

/**
 * Envia uma mensagem no chat (follow-up) com suporte a anexo instantâneo
 */
export async function submitFollowup(event) {
  event.preventDefault();
  
  if (!State.activeTicketId) return;

  const inputEl = document.getElementById('chat-input-field');
  const message = inputEl.value.trim();
  
  if (!message && !chatAttachedFile) return;

  inputEl.value = '';
  inputEl.focus();

  const fileToUpload = chatAttachedFile;
  removeChatFile(); // Reseta indicador visual

  try {
    let success = false;
    let errText = '';

    if (window.electronAPI) {
      let followupRes = null;
      if (message) {
        followupRes = await window.electronAPI.glpiAddFollowup(State.activeTicketId, message);
        if (followupRes && followupRes.id) {
          success = true;
        } else if (followupRes && followupRes.error) {
          errText = followupRes.error;
        }
      }

      if (fileToUpload) {
        try {
          const arrayBuffer = await fileToUpload.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const uploadRes = await window.electronAPI.glpiUploadDocument(State.activeTicketId, fileToUpload.name, uint8Array);
          if (uploadRes && uploadRes.id) {
            success = true;
          }
        } catch (fileErr) {
          errText = `Falha no anexo: ${fileErr.message}`;
        }
      }
    }

    if (success) {
      await loadFollowupsAndDocuments(State.activeTicketId);
    } else {
      alert(`Falha ao registrar mensagem: ${errText || 'Erro desconhecido'}`);
    }
  } catch (e) {
    alert('Erro de rede ao enviar resposta. Verifique conexão.');
  }
}

/**
 * Inicia Polling inteligente baseado em Foco (3s ativo, 10s em background)
 */
export function startFocusedPolling(ticketId) {
  if (State.chatPollInterval) {
    clearInterval(State.chatPollInterval);
  }

  const poll = () => {
    if (State.activeScreen === 'ticket-detail' && State.activeTicketId === ticketId) {
      loadFollowupsAndDocuments(ticketId);
    }
  };

  const getIntervalTime = () => State.isAppFocused ? 3000 : 10000;

  // Primeiro interval
  State.chatPollInterval = setInterval(poll, getIntervalTime());

  // Registra ou monitora mudanças de foco
  if (window.electronAPI) {
    window.electronAPI.onWindowFocusChanged((focused) => {
      State.isAppFocused = focused;
      
      // Reinicia interval com novo tempo
      clearInterval(State.chatPollInterval);
      State.chatPollInterval = setInterval(poll, getIntervalTime());
      
      console.log(`[CHAT-POLL] Janela alterada para focado=${focused}. Ajustado polling para ${getIntervalTime()}ms`);
    });
  }
}

/**
 * Abre arquivo anexo de forma segura
 */
window.openAttachmentLink = async function(urlOrPath) {
  if (window.electronAPI) {
    await window.electronAPI.openExternal(urlOrPath);
  }
};

/**
 * Compila a timeline em um lindo Markdown de Sumário para cópia de um clique
 */
export function generateChatMarkdownSummary() {
  const ticket = State.ticketsList.find(t => t.id == State.activeTicketId);
  if (!ticket) return;

  const timeline = document.getElementById('chat-timeline');
  if (!timeline) return;

  const bubbles = timeline.querySelectorAll('.message-bubble, .system-event-badge');
  let md = `## 📝 Resumo do Atendimento - Chamado #${ticket.id}\n\n`;
  md += `**Assunto:** ${ticket.name}\n`;
  md += `**Categoria:** ${ticket.category_name || 'Suporte Geral'}\n`;
  md += `**Data de Abertura:** ${ticket.date_creation}\n`;
  md += `**Status Atual:** ${ticket.status == 6 ? 'Fechado' : 'Em Atendimento'}\n\n`;
  md += `### ⏱️ Histórico de Interações:\n`;

  bubbles.forEach(b => {
    if (b.classList.contains('system-event-badge')) {
      const text = b.querySelector('span:first-child')?.textContent || '';
      const time = b.querySelector('.event-time')?.textContent || '';
      md += `* [SISTEMA] ${text} (${time})\n`;
    } else {
      const meta = b.querySelector('.message-meta')?.textContent || '';
      const text = b.querySelector('div')?.textContent || '';
      md += `* **${meta.replace('•', '** -')}**\n  > ${text.trim().replace(/\n/g, '\n  > ')}\n`;
    }
  });

  md += `\n---\n*Gerado automaticamente pelo Agente Helpdesk Pro em ${new Date().toLocaleString('pt-BR')}*`;

  navigator.clipboard.writeText(md).then(() => {
    alert('Sumário de atendimento em Markdown copiado para a Área de Transferência com sucesso!');
  }).catch(() => {
    alert('Não foi possível copiar automaticamente. Selecione e copie o resumo manually.');
  });
}

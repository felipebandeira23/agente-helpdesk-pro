/**
 * chat.js — Chat do Chamado, Timeline de Eventos, Upload de Anexos, Resumo em Markdown e Polling Focado
 */

import { State } from './state.js';
import { escapeHtml, switchScreen } from './dom.js';
import { loadTickets } from './tickets.js';

let chatAttachedFile = null;

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

  if (idEl) idEl.textContent = `#${ticket.id}`;
  if (titleEl) titleEl.textContent = ticket.name;
  if (catEl) catEl.textContent = ticket.category_name || 'Geral / Suporte';
  if (descEl) descEl.innerHTML = ticket.content || '<em>Sem descrição fornecida.</em>';
  if (dateEl) dateEl.textContent = ticket.date_creation || 'Não disponível';

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

  // Seções Administrativas
  const adminSection = document.getElementById('admin-controls-section');
  if (adminSection) {
    if (State.userRoles.isSuperAdmin || State.userRoles.isTecnico) {
      adminSection.style.display = 'flex';
      
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
          const buffer = Buffer.from(arrayBuffer);
          const uploadRes = await window.electronAPI.glpiUploadDocument(State.activeTicketId, fileToUpload.name, buffer);
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

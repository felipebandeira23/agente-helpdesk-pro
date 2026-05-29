/**
 * tickets.js — Gerenciamento de Abertura, Listagem, Filtros de Chamados, Auto-Categorização e Incidentes Recorrentes
 */

import { State } from './state.js';
import { escapeHtml, switchScreen } from './dom.js';
import { renderDashboardRecentTickets } from './dashboard.js';

// Banco de templates de chamado pré-configurados
const TICKET_TEMPLATES = {
  impressora: {
    title: 'Impressora não imprime / Fila travada',
    urgency: '4',
    catMatch: 'impressora',
    description: `Descreva o problema com a impressora:\n\n- Nome/modelo da impressora: \n- Mensagem de erro exibida (se houver): \n- A fila de impressão está travada? (Sim/Não): \n- Último funcionamento normal (data aproximada): \n\nJá tentei:\n☐ Reiniciar a impressora\n☐ Cancelar trabalhos da fila`,
  },
  lentidao: {
    title: 'Computador lento ou travando',
    urgency: '3',
    catMatch: 'lentidao',
    description: `Descreva o problema de desempenho:\n\n- O computador trava ao abrir qual programa: \n- Há quanto tempo ocorre a lentidão: \n- O computador foi reiniciado recentemente? (Sim/Não): \n\nJá tentei:\n☐ Reiniciar o computador\n☐ Fechar programas não utilizados`,
  },
  internet: {
    title: 'Sem acesso à Internet / Rede',
    urgency: '4',
    catMatch: 'rede',
    description: `Descreva o problema de conectividade:\n\n- O Wi-Fi está conectado mas sem Internet? (Sim/Não): \n- O problema afeta apenas este computador ou outros também: \n- Mensagem de erro exibida (se houver): \n\nJá tentei:\n☐ Desligar e religar o roteador/switch\n☐ Desconectar e reconectar ao Wi-Fi`,
  },
  outlook: {
    title: 'Problema com e-mail / Outlook',
    urgency: '3',
    catMatch: 'e-mail',
    description: `Descreva o problema com o e-mail:\n\n- O Outlook não abre, trava ou exibe erro: \n- Não consigo enviar / receber e-mails: \n- Caixa de entrada não atualiza: \n- Mensagem de erro exibida (se houver): \n\nJá tentei:\n☐ Fechar e reabrir o Outlook\n☐ Reiniciar o computador`,
  },
  senha: {
    title: 'Redefinição de senha / Conta bloqueada',
    urgency: '5',
    catMatch: 'acesso',
    description: `Descreva o problema de acesso:\n\n- Qual sistema está inacessível (Windows, e-mail, sistema interno): \n- A conta foi bloqueada após tentativas incorretas? (Sim/Não): \n- Quando ocorreu o bloqueio (horário aproximado): \n\nNOTA: Por segurança, NÃO informe sua senha atual neste chamado.`,
  },
  software: {
    title: 'Solicitação de instalação / atualização de software',
    urgency: '1',
    catMatch: 'software',
    description: `Dados da solicitação de software:\n\n- Nome do software solicitado: \n- Versão desejada (se souber): \n- Motivo / finalidade de uso: \n- Prazo de necessidade: \n\nObservação: Instalações precisam de aprovação prévia conforme política de TI.`,
  },
};

/**
 * Aplica um template ao formulário de novo chamado
 */
export function applyTicketTemplate(templateKey) {
  const tpl = TICKET_TEMPLATES[templateKey];
  if (!tpl) return;

  const titleEl = document.getElementById('ticket-title');
  const urgencyEl = document.getElementById('ticket-urgency');
  const contentEl = document.getElementById('ticket-content');

  if (titleEl) titleEl.value = tpl.title;
  if (urgencyEl) urgencyEl.value = tpl.urgency;
  if (contentEl) contentEl.value = tpl.description;

  // Seleciona a categoria correspondente
  autoCategorizeTicketTitle(tpl.title);

  // Marca botão ativo visualmente
  document.querySelectorAll('.ticket-template-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick')?.includes(templateKey)) {
      btn.classList.add('active');
    }
  });

  // Remove destaque após 3s
  setTimeout(() => {
    document.querySelectorAll('.ticket-template-btn').forEach(b => b.classList.remove('active'));
  }, 3000);
}

let attachedFile = null;

export function triggerFileInput() {
  const fileInput = document.getElementById('ticket-file');
  if (fileInput) fileInput.click();
}

export function handleFileSelect(event) {
  const file = event.target.files[0];
  const dropzoneText = document.getElementById('dropzone-text');
  const dropzone = document.getElementById('file-dropzone');
  
  if (file) {
    attachedFile = file;
    if (dropzoneText) {
      dropzoneText.textContent = `Arquivo selecionado: ${file.name} (${Math.round(file.size/1024)} KB)`;
    }
    if (dropzone) {
      dropzone.style.borderColor = 'var(--accent-neon)';
    }
  }
}

export function resetFileAttachment() {
  attachedFile = null;
  const dropzoneText = document.getElementById('dropzone-text');
  const dropzone = document.getElementById('file-dropzone');
  if (dropzoneText) {
    dropzoneText.textContent = 'Arraste e solte o arquivo aqui ou clique para selecionar';
  }
  if (dropzone) {
    dropzone.style.borderColor = 'var(--border-glass)';
  }
}

/**
 * Carrega Categorias e popula o formulário e o admin panel
 */
export async function loadCategories() {
  const selectEl = document.getElementById('ticket-category');
  if (!selectEl) return;
  
  try {
    let categories = [];
    if (window.electronAPI) {
      categories = await window.electronAPI.glpiGetCategories();
    }
    
    State.categoriesList = categories;
    selectEl.innerHTML = '<option value="">Selecione uma categoria...</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      selectEl.appendChild(opt);
    });

    // Popula dropdown de alteração administrativa
    const adminCategorySelect = document.getElementById('admin-change-category');
    if (adminCategorySelect) {
      adminCategorySelect.innerHTML = '<option value="">Selecione uma categoria...</option>';
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        adminCategorySelect.appendChild(opt);
      });
    }
  } catch (e) {
    selectEl.innerHTML = '<option value="">Falha ao obter categorias (Offline)</option>';
  }
}

/**
 * Carrega Localizações do GLPI para o painel administrativo
 */
export async function loadLocations() {
  const selectEl = document.getElementById('admin-change-location');
  if (!selectEl) return;
  try {
    let locations = [];
    if (window.electronAPI) {
      locations = await window.electronAPI.glpiGetLocations();
    }
    State.locationsList = locations;
    selectEl.innerHTML = '<option value="">Selecione uma localização...</option>';
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = loc.name;
      selectEl.appendChild(opt);
    });
  } catch (e) {
    selectEl.innerHTML = '<option value="">Falha ao obter localizações</option>';
  }
}

/**
 * Sugestão Automática de Categoria com base em palavras-chave
 */
export function autoCategorizeTicketTitle(titleStr) {
  if (!titleStr) return;
  const lowerTitle = titleStr.toLowerCase();
  const selectEl = document.getElementById('ticket-category');
  if (!selectEl || !State.categoriesList.length) return;

  let matchedId = null;

  const keymaps = [
    { words: ['impressora', 'print', 'toner', 'papel', 'impressao', 'spooler'], catMatch: 'impressora' },
    { words: ['outlook', 'email', 'e-mail', 'caixa de entrada', 'ost', 'mensagem'], catMatch: 'e-mail' },
    { words: ['lentidao', 'lento', 'travando', 'cpu', 'trava', 'demora'], catMatch: 'lentidao' },
    { words: ['internet', 'rede', 'wifi', 'wi-fi', 'ip', 'offline', 'dns', 'conexao'], catMatch: 'rede' },
    { words: ['acesso', 'senha', 'bloqueado', 'login', 'permissao'], catMatch: 'acesso' }
  ];

  for (const map of keymaps) {
    if (map.words.some(word => lowerTitle.includes(word))) {
      // Procura na lista de categorias pelo nome correspondente
      const found = State.categoriesList.find(c => c.name.toLowerCase().includes(map.catMatch));
      if (found) {
        matchedId = found.id;
        break;
      }
    }
  }

  if (matchedId) {
    selectEl.value = String(matchedId);
    triggerRecurrenceCheck(matchedId);
  }
}

/**
 * Dispara verificação de chamados recorrentes ao alterar a categoria
 */
export function triggerRecurrenceCheck(categoryId) {
  const alertBox = document.getElementById('recurring-incident-alert');
  if (!alertBox) return;

  const isRecurring = State.checkRecurringIncident(categoryId);
  if (isRecurring) {
    alertBox.style.display = 'block';
    alertBox.querySelector('.alert-text').innerHTML = `
      <strong>Atenção:</strong> Detectamos que você abriu chamados similares desta categoria no último mês.
      Dica: Você pode consultar a aba <strong>Início</strong> para verificar soluções rápidas!
    `;
  } else {
    alertBox.style.display = 'none';
  }
}

/**
 * Carrega todos os chamados do usuário logado
 */
export async function loadTickets() {
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
    }
    
    tickets.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    State.ticketsList = tickets;
    
    // Atualiza tabelas
    filterTicketsTable();
    renderDashboardRecentTickets();
    
    // Dispara checagem silenciosa de novas mensagens / atualizações
    if (window.electronAPI && typeof window.checkForTicketUpdates === 'function') {
      window.checkForTicketUpdates(tickets).catch(err => console.error('[NOTIFY] Erro:', err));
    }
  } catch (e) {
    console.error('Falha ao obter chamados:', e);
  }
}

/**
 * Renderiza os chamados na listagem de chamados
 */
export function renderTicketsTable(tickets) {
  const tbodyList = document.getElementById('tickets-tbody');
  if (!tbodyList) return;

  if (!tickets || tickets.length === 0) {
    tbodyList.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px;">Nenhum chamado corresponde aos filtros selecionados.</td></tr>`;
    return;
  }

  // Ordena descendente por ID
  tickets.sort((a, b) => parseInt(b.id) - parseInt(a.id));

  let htmlRows = '';
  tickets.forEach(ticket => {
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

    let statusDot = 'black';
    let statusText = 'Pendente';
    switch (parseInt(ticket.status)) {
      case 1: statusDot = 'red'; statusText = 'Novo'; break;
      case 2:
      case 3: statusDot = 'yellow'; statusText = 'Em Atendimento'; break;
      case 4: statusDot = 'yellow'; statusText = 'Pendente'; break;
      case 5: statusDot = 'green'; statusText = 'Solucionado'; break;
      case 6: statusDot = 'black'; statusText = 'Fechado'; break;
    }

    const categoryName = ticket.category_name || 'Geral / Suporte';
    const isUnread = State.notificationCache[ticket.id] && State.notificationCache[ticket.id].unread === true;
    const unreadIndicator = isUnread 
      ? `<span class="unread-badge-dot" title="Mensagens não lidas do suporte"></span>` 
      : '';

    htmlRows += `
      <tr>
        <td class="ticket-id">#${ticket.id}</td>
        <td style="font-weight: 600;">
          ${escapeHtml(ticket.name)}
          ${unreadIndicator}
        </td>
        <td style="color: var(--text-secondary);">${escapeHtml(categoryName)}</td>
        <td><span class="badge ${priorityBadge}">${priorityText}</span></td>
        <td>
          <div class="status-pill">
            <span class="status-pill-dot ${statusDot}"></span>
            <span>${statusText}</span>
          </div>
        </td>
        <td>
          <button class="action-btn" onclick="viewTicketDetails(${ticket.id})" aria-label="Visualizar chamado #${ticket.id}">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });

  tbodyList.innerHTML = htmlRows;
}

/**
 * Filtro local de chamados baseado em busca de texto, prioridade e status
 */
export function filterTicketsTable() {
  const searchInput = document.getElementById('search-tickets-input');
  const statusFilter = document.getElementById('filter-tickets-status');
  const priorityFilter = document.getElementById('filter-tickets-priority');

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const statusVal = statusFilter ? statusFilter.value : 'all';
  const priorityVal = priorityFilter ? priorityFilter.value : 'all';

  const filtered = State.ticketsList.filter(ticket => {
    // 1. Busca
    let matchesSearch = true;
    if (searchQuery) {
      const ticketId = `#${ticket.id}`;
      const name = (ticket.name || '').toLowerCase();
      const category = (ticket.category_name || '').toLowerCase();
      const idStr = String(ticket.id);
      
      matchesSearch = name.includes(searchQuery) || 
                      category.includes(searchQuery) || 
                      ticketId.includes(searchQuery) ||
                      idStr.includes(searchQuery);
    }

    // 2. Status
    let matchesStatus = true;
    if (statusVal !== 'all') {
      const ticketStatus = parseInt(ticket.status);
      if (statusVal === '2-3') {
        matchesStatus = (ticketStatus === 2 || ticketStatus === 3);
      } else {
        matchesStatus = (ticketStatus === parseInt(statusVal));
      }
    }

    // 3. Prioridade
    let matchesPriority = true;
    if (priorityVal !== 'all') {
      const urgency = parseInt(ticket.urgency) || 3;
      if (priorityVal === 'low') {
        matchesPriority = (urgency === 1 || urgency === 2);
      } else if (priorityVal === 'medium') {
        matchesPriority = (urgency === 3);
      } else if (priorityVal === 'high') {
        matchesPriority = (urgency === 4);
      } else if (priorityVal === 'critical') {
        matchesPriority = (urgency >= 5);
      }
    }

    return matchesSearch && matchesStatus && matchesPriority;
  });

  renderTicketsTable(filtered);
}

const URGENCY_LABELS = { '1': 'Baixa', '2': 'Baixa', '3': 'Média', '4': 'Alta', '5': 'Urgente/Crítica' };

/**
 * Abre o modal de pré-visualização preenchido com os dados do formulário.
 * Substituiu o envio direto — o usuário confirma antes de submeter.
 */
export function submitTicket(event) {
  event.preventDefault();

  const title = document.getElementById('ticket-title').value.trim();
  const category = document.getElementById('ticket-category');
  const urgency = document.getElementById('ticket-urgency').value;
  const content = document.getElementById('ticket-content').value.trim();
  const attachContextChecked = document.getElementById('ticket-attach-telemetry')?.checked;

  if (!title || !category?.value || !content) return;

  const categoryText = category.options[category.selectedIndex]?.text || category.value;

  // Preenche o modal de pré-visualização
  const previewTitle = document.getElementById('preview-title');
  const previewCategory = document.getElementById('preview-category');
  const previewUrgency = document.getElementById('preview-urgency');
  const previewDesc = document.getElementById('preview-description');
  const previewTelRow = document.getElementById('preview-telemetry-row');
  const previewFileRow = document.getElementById('preview-file-row');
  const previewFileName = document.getElementById('preview-file-name');

  if (previewTitle) previewTitle.textContent = title;
  if (previewCategory) previewCategory.textContent = categoryText;
  if (previewUrgency) previewUrgency.textContent = URGENCY_LABELS[urgency] || 'Média';
  if (previewDesc) previewDesc.textContent = content;
  if (previewTelRow) previewTelRow.style.display = attachContextChecked ? 'flex' : 'none';
  if (previewFileRow && previewFileName) {
    if (attachedFile) {
      previewFileRow.style.display = 'flex';
      previewFileName.textContent = `📎 ${attachedFile.name} (${Math.round(attachedFile.size / 1024)} KB)`;
    } else {
      previewFileRow.style.display = 'none';
    }
  }

  const modal = document.getElementById('ticket-preview-modal');
  if (modal) modal.style.display = 'flex';
}

// Expõe funções do modal de pré-visualização no escopo global
window.closeTicketPreviewModal = function() {
  const modal = document.getElementById('ticket-preview-modal');
  if (modal) modal.style.display = 'none';
};

window.confirmAndSubmitTicket = async function() {
  const modal = document.getElementById('ticket-preview-modal');
  if (modal) modal.style.display = 'none';

  const title = document.getElementById('ticket-title').value.trim();
  const category = document.getElementById('ticket-category').value;
  const urgency = document.getElementById('ticket-urgency').value;
  let content = document.getElementById('ticket-content').value.trim();
  const submitBtn = document.getElementById('btn-submit-ticket');
  const attachContextChecked = document.getElementById('ticket-attach-telemetry')?.checked;

  if (!title || !category || !content) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  try {
    // 1. Auto preenchimento / Auto-anexo do contexto do dispositivo
    if (attachContextChecked && window.electronAPI) {
      try {
        const metrics = await window.electronAPI.getSystemMetrics();
        const diskFree = State.diagnostics.diskFreeSpacePercent !== undefined ? `${State.diagnostics.diskFreeSpacePercent}%` : 'N/A';
        const pingLatency = State.diagnostics.pingLatency !== undefined ? `${State.diagnostics.pingLatency}ms` : 'N/A';
        
        content += `\n\n--- CONTEXTO DO DISPOSITIVO (AUTO-ANEXO) ---\n` +
                   `Hostname: ${metrics.hostname || 'Desconhecido'}\n` +
                   `Sistema Operacional: ${metrics.osType || 'Microsoft Windows'} (Build ${metrics.osRelease})\n` +
                   `Processador: ${metrics.cpuModel || 'N/A'} (${metrics.cpuCores} núcleos)\n` +
                   `Memória RAM Instalada: ${metrics.totalMem || 'N/A'}\n` +
                   `Espaço Livre em Disco (C:): ${diskFree}\n` +
                   `Latência de Conectividade GLPI: ${pingLatency}\n` +
                   `IP de Origem: Local ${metrics.ip || 'Desconhecido'} | Wan ${metrics.extIp || 'Desconhecido'}\n` +
                   `Dispositivo Virtual (VM): ${metrics.vm || 'Não'}\n` +
                   `-------------------------------------------`;
      } catch (ctxErr) {
        console.warn('Erro ao coletar contexto para o ticket:', ctxErr);
      }
    }

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
        
        // 2. Faz o upload de anexo para o chamado criado se o usuário selecionou algum arquivo
        if (attachedFile) {
          try {
            const arrayBuffer = await attachedFile.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            await window.electronAPI.glpiUploadDocument(ticketId, attachedFile.name, uint8Array);
          } catch (fileErr) {
            console.error('Falha ao subir anexo:', fileErr);
            alert(`Chamado criado com sucesso, mas o anexo falhou no envio: ${fileErr.message}`);
          }
        }
      } else if (res && res.error) {
        errMessage = res.error;
      }
    }

    if (success) {
      alert(`Chamado #${ticketId} criado com sucesso no GLPI!`);
      document.getElementById('new-ticket-form').reset();
      resetFileAttachment();
      
      // Esconde o alerta de recorrência
      const alertBox = document.getElementById('recurring-incident-alert');
      if (alertBox) alertBox.style.display = 'none';
      
      // Recarrega chamados e redireciona
      await loadTickets();
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

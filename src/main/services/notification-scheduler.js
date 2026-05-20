const { Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../logger');
const glpiApi = require('../glpi-api');

// File to store the last check timestamp so we don't spam notifications on restart
function getCachePath() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'last-notification-check.json');
  } catch (e) {
    return path.join(os.homedir(), '.helpdesk-pro', 'last-notification-check.json');
  }
}

let pollingInterval = null;

function getLastCheck() {
  const file = getCachePath();
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && data.lastCheck) return new Date(data.lastCheck);
    } catch (e) {
      // ignore
    }
  }
  // Se não existir, define como a hora atual para não disparar chamados velhos
  return new Date();
}

function saveLastCheck(dateObj) {
  const file = getCachePath();
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ lastCheck: dateObj.toISOString() }));
  } catch (e) {
    logger.warn('Erro ao salvar timestamp de notificações: ' + e.message, 'NOTIF');
  }
}

function showNotification(title, body) {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title,
    body,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });
  
  // Opcional: clicar na notificação pode abrir a janela principal
  notif.on('click', () => {
    const { BrowserWindow } = require('electron');
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].show();
      windows[0].focus();
    }
  });

  notif.show();
}

/**
 * Função de checagem.
 * Consulta chamados do usuário e vê quais tiveram date_mod alterado ou novos.
 */
async function checkNotifications() {
  try {
    const profile = await glpiApi.getMyProfile();
    // Se não há usuário logado, não tem como puxar chamados do requerente específico
    if (!profile || !profile.myprofiles || profile.myprofiles.length === 0) return;
    
    // Precisamos do ID do usuário, que não é exposto diretamente pelo getMyProfile 
    // Para simplificar, getMyTickets com ID indefinido pega todos os chamados se for super-admin 
    // ou apenas do usuário se for self-service. Vamos chamar a função sem passar ID explicitamente
    // e ela filtra automaticamente via token da sessão ou perfil.
    const tickets = await glpiApi.getMyTickets();
    if (!tickets || tickets.length === 0) return;

    const lastCheck = getLastCheck();
    let newestDate = lastCheck;

    for (const ticket of tickets) {
      if (!ticket.date_mod) continue;
      
      // O formato do GLPI é "YYYY-MM-DD HH:MM:SS" (UTC ou Local dependendo do server)
      // Substituímos o espaço por T para o Date() parsear corretamente no JS
      const ticketModDate = new Date(ticket.date_mod.replace(' ', 'T'));
      
      // Se o chamado foi modificado depois da nossa última checagem...
      if (ticketModDate > lastCheck) {
        // Se a data de criação for muito próxima da date_mod, é um chamado NOVO
        const ticketCreationDate = new Date(ticket.date_creation.replace(' ', 'T'));
        const isNew = (ticketModDate.getTime() - ticketCreationDate.getTime()) < 5000;

        if (isNew) {
          showNotification('Novo Chamado', `O chamado #${ticket.id} (${ticket.name}) foi registrado.`);
          logger.info(`Notificação enviada: Novo chamado #${ticket.id}`, 'NOTIF');
        } else {
          // É uma atualização. Opcionalmente poderíamos buscar getTicketFollowups() 
          // para ver quem mandou a última resposta, mas por segurança de performance
          // apenas disparamos a notificação genérica de alteração.
          showNotification('Atualização no Suporte', `O chamado #${ticket.id} teve uma nova interação técnica.`);
          logger.info(`Notificação enviada: Atualização no chamado #${ticket.id}`, 'NOTIF');
        }

        // Mantém controle da data mais recente verificada
        if (ticketModDate > newestDate) {
          newestDate = ticketModDate;
        }
      }
    }

    if (newestDate > lastCheck) {
      saveLastCheck(newestDate);
    } else {
      // Sempre salva o timestamp da execução para não ficar preso no passado
      saveLastCheck(new Date());
    }

  } catch (err) {
    // Falha silenciosa para não poluir o terminal, apenas avisa via logger em modo trace
    // logger.trace('Falha silenciosa ao checar notificações: ' + err.message, 'NOTIF');
  }
}

/**
 * Inicia o temporizador que roda a cada X minutos (ex: 5 minutos)
 */
function startNotificationScheduler(intervalMs = 5 * 60 * 1000) {
  if (pollingInterval) clearInterval(pollingInterval);
  
  logger.info(`Iniciando scheduler de notificações (intervalo: ${intervalMs / 1000}s)`, 'NOTIF');
  
  // Realiza a primeira checagem 30 segundos após o início para dar tempo da aplicação abrir e fazer login
  setTimeout(() => {
    checkNotifications();
    pollingInterval = setInterval(checkNotifications, intervalMs);
  }, 30 * 1000);
}

function stopNotificationScheduler() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('Scheduler de notificações parado.', 'NOTIF');
  }
}

module.exports = {
  startNotificationScheduler,
  stopNotificationScheduler,
  checkNotifications
};

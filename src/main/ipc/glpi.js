/**
 * ipc/glpi.js — Handlers IPC para integração com a API do GLPI e Inventário
 */

const { ipcMain, BrowserWindow } = require('electron');
const glpiApi = require('../glpi-api');
const { collectInventory } = require('../inventory-collector');
const logger = require('../logger');
const os = require('os');

function isString(v, maxLen = 2048) {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

function isSafeInt(v) {
  return Number.isInteger(Number(v)) && Number(v) > 0;
}

function registerGlpiIPCHandlers() {
  const getMainWindow = () => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  };

  // Configuração
  ipcMain.handle('glpi-get-config', () => glpiApi.getGlpiConfig());

  ipcMain.handle('glpi-set-config', async (event, cfg) => {
    if (!cfg || typeof cfg !== 'object') return { ok: false, message: 'Configuração inválida.' };
    return glpiApi.setGlpiConfig(cfg);
  });

  ipcMain.handle('glpi-test-connection', async () => {
    try {
      return await glpiApi.testConnection();
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // Autenticação LDAP com credenciais Windows
  ipcMain.handle('glpi-login', async (event, { login, password } = {}) => {
    if (!isString(login, 128) || !isString(password, 256)) {
      return { ok: false, message: 'Credenciais inválidas.' };
    }
    try {
      const result = await glpiApi.loginWithCredentials(login, password);
      logger.info(`[AUTH] Login LDAP bem-sucedido para: ${login}`, 'IPC-GLPI');
      return { ok: true, message: result.message, userName: result.userName };
    } catch (e) {
      logger.warn(`[AUTH] Falha no login LDAP para "${login}": ${e.message}`, 'IPC-GLPI');
      const msg = e.response?.status === 401
        ? 'Usuário ou senha incorretos. Verifique suas credenciais do Windows.'
        : e.message;
      return { ok: false, message: msg };
    }
  });

  ipcMain.handle('glpi-get-windows-user', () => {
    return glpiApi.getWindowsUser();
  });

  ipcMain.handle('glpi-logout', async () => {
    try {
      await glpiApi.killSession();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });


  // Categorias & Localizações
  ipcMain.handle('glpi-get-categories', async () => {
    try {
      return await glpiApi.getCategories();
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('glpi-get-locations', async () => {
    try {
      return await glpiApi.getLocations();
    } catch (e) {
      return [];
    }
  });

  // Usuários & Perfis
  ipcMain.handle('glpi-find-user', async (event, login) => {
    if (!isString(login, 128)) return null;
    try {
      return await glpiApi.findUserByLogin(login);
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('glpi-get-user-role', async () => {
    try {
      const profilesRes = await glpiApi.getMyProfile();
      const profiles = profilesRes.myprofiles || [];
      const isSuperAdmin = profiles.some(p => p.name && p.name.toLowerCase().includes('super-admin'));
      const isTecnico = profiles.some(p => p.name && (
        p.name.toLowerCase().includes('técnico') || 
        p.name.toLowerCase().includes('tecnico') || 
        p.name.toLowerCase().includes('gerência') || 
        p.name.toLowerCase().includes('supervisor')
      ));
      return { isSuperAdmin, isTecnico };
    } catch (e) {
      return { isSuperAdmin: false, isTecnico: false };
    }
  });

  // Tickets (Chamados)
  ipcMain.handle('glpi-get-tickets', async (event, userId) => {
    try {
      return await glpiApi.getMyTickets(userId);
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('glpi-create-ticket', async (event, opts) => {
    if (!opts || typeof opts !== 'object') return { error: 'Dados do chamado inválidos.' };
    if (!isString(opts.title, 512)) return { error: 'Título do chamado ausente ou inválido.' };
    if (!isString(opts.description, 65536)) return { error: 'Descrição do chamado ausente ou inválida.' };
    try {
      const extra = {
        hostname: os.hostname(),
        ip: Object.values(os.networkInterfaces()).flat()
          .find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || '',
        osVersion: os.type() + ' ' + os.release(),
      };
      return await glpiApi.createTicket({ ...opts, ...extra });
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('glpi-update-ticket-status', async (event, { ticketId, status } = {}) => {
    if (!isSafeInt(ticketId) || !isSafeInt(status)) return { error: 'Parâmetros inválidos.' };
    try {
      return await glpiApi.updateTicketStatus(ticketId, status);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('glpi-update-ticket', async (event, { ticketId, fields } = {}) => {
    if (!isSafeInt(ticketId) || !fields || typeof fields !== 'object') return { error: 'Parâmetros inválidos.' };
    try {
      return await glpiApi.updateTicket(ticketId, fields);
    } catch (e) {
      return { error: e.message };
    }
  });

  // Interações e Respostas (Followups)
  ipcMain.handle('glpi-get-followups', async (event, ticketId) => {
    if (!isSafeInt(ticketId)) return [];
    try {
      return await glpiApi.getTicketFollowups(ticketId);
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('glpi-add-followup', async (event, { ticketId, message } = {}) => {
    if (!isSafeInt(ticketId) || !isString(message, 65536)) return { error: 'Parâmetros inválidos.' };
    try {
      return await glpiApi.addFollowup(ticketId, message);
    } catch (e) {
      return { error: e.message };
    }
  });

  // Anexos (Documentos)
  ipcMain.handle('glpi-upload-document', async (event, { ticketId, fileName, buffer } = {}) => {
    if (!isSafeInt(ticketId) || !isString(fileName, 256)) return { error: 'Parâmetros inválidos.' };
    try {
      return await glpiApi.uploadDocument(ticketId, fileName, buffer);
    } catch (e) {
      logger.error('Erro ao fazer upload de anexo no ticket #' + ticketId, e, 'IPC-GLPI');
      return { error: e.message };
    }
  });

  ipcMain.handle('glpi-get-documents', async (event, ticketId) => {
    if (!isSafeInt(ticketId)) return [];
    try {
      return await glpiApi.getTicketDocuments(ticketId);
    } catch (e) {
      return [];
    }
  });

  // Forçar Coleta Manual de Inventário
  ipcMain.handle('force-inventory', async () => {
    const mainWin = getMainWindow();
    try {
      if (mainWin) {
        mainWin.webContents.send('inventory-progress', { status: 'collecting', message: 'Coletando dados do hardware...' });
      }
      
      const inventoryData = await collectInventory();
      
      if (mainWin) {
        mainWin.webContents.send('inventory-progress', { status: 'sending', message: 'Enviando inventário para o GLPI...' });
      }
      
      const response = await glpiApi.sendInventory(inventoryData, 'force');
      logger.info('Inventário forçado enviado com sucesso via IPC.', 'IPC-GLPI');
      
      if (mainWin) {
        mainWin.webContents.send('inventory-progress', { status: 'success', message: 'Inventário sincronizado com sucesso!' });
      }
      
      return { success: true, response };
    } catch (e) {
      logger.error('Erro na sincronização manual forçada do inventário', e, 'IPC-GLPI');
      if (mainWin) {
        mainWin.webContents.send('inventory-progress', { status: 'error', message: `Erro na sincronização: ${e.message}` });
      }
      return { success: false, error: e.message };
    }
  });
}

module.exports = {
  registerGlpiIPCHandlers
};

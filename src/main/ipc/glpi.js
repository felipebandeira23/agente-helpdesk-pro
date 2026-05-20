/**
 * ipc/glpi.js — Handlers IPC para integração com a API do GLPI e Inventário
 */

const { ipcMain, BrowserWindow } = require('electron');
const glpiApi = require('../glpi-api');
const { collectInventory } = require('../inventory-collector');
const logger = require('../logger');
const os = require('os');

function registerGlpiIPCHandlers() {
  const getMainWindow = () => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  };

  // Configuração
  ipcMain.handle('glpi-get-config', () => glpiApi.getGlpiConfig());

  ipcMain.handle('glpi-set-config', async (event, cfg) => {
    return glpiApi.setGlpiConfig(cfg);
  });

  ipcMain.handle('glpi-test-connection', async () => {
    try {
      return await glpiApi.testConnection();
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

  ipcMain.handle('glpi-update-ticket-status', async (event, { ticketId, status }) => {
    try {
      return await glpiApi.updateTicketStatus(ticketId, status);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('glpi-update-ticket', async (event, { ticketId, fields }) => {
    try {
      return await glpiApi.updateTicket(ticketId, fields);
    } catch (e) {
      return { error: e.message };
    }
  });

  // Interações e Respostas (Followups)
  ipcMain.handle('glpi-get-followups', async (event, ticketId) => {
    try {
      return await glpiApi.getTicketFollowups(ticketId);
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('glpi-add-followup', async (event, { ticketId, message }) => {
    try {
      return await glpiApi.addFollowup(ticketId, message);
    } catch (e) {
      return { error: e.message };
    }
  });

  // Anexos (Documentos)
  ipcMain.handle('glpi-upload-document', async (event, { ticketId, filePath, fileName }) => {
    try {
      return await glpiApi.uploadDocument(ticketId, filePath, fileName);
    } catch (e) {
      logger.error('Erro ao fazer upload de anexo no ticket #' + ticketId, e, 'IPC-GLPI');
      return { error: e.message };
    }
  });

  ipcMain.handle('glpi-get-documents', async (event, ticketId) => {
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

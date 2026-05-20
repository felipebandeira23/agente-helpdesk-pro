/**
 * ipc/system.js — Handlers IPC para controle do sistema, telemetria e segurança
 */

const { ipcMain, shell, Notification } = require('electron');
const telemetry = require('../services/telemetry');
const logger = require('../logger');

const DOMAIN_WHITELIST = [
  '*.intranet.coppead.ufrj.br',
  '*.coppead.ufrj.br',
  '*.ufrj.br',
  'github.com',
  'api.ipify.org',
  'localhost',
  '127.0.0.1'
];

function isValidExternalUrl(urlStr) {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    
    return DOMAIN_WHITELIST.some(pattern => {
      if (pattern.startsWith('*.')) {
        const domain = pattern.substring(2).toLowerCase();
        return hostname === domain || hostname.endsWith('.' + domain);
      }
      return hostname === pattern.toLowerCase();
    });
  } catch (e) {
    return false;
  }
}

function registerSystemIPCHandlers() {
  // Telemetry collection handler
  ipcMain.handle('get-system-metrics', async () => {
    try {
      return await telemetry.getSystemMetrics();
    } catch (e) {
      logger.error('Falha ao coletar métricas de telemetria', e, 'IPC-SYSTEM');
      return {};
    }
  });

  // OS local user information handler
  ipcMain.handle('get-os-user', () => {
    try {
      return telemetry.getOSUser();
    } catch (e) {
      logger.error('Falha ao obter usuário local do SO', e, 'IPC-SYSTEM');
      return { username: 'desconhecido', hostname: 'desconhecido', ip: 'desconhecido' };
    }
  });

  // Open external links securely
  ipcMain.handle('open-external', async (event, url) => {
    try {
      if (!isValidExternalUrl(url)) {
        logger.warn(`[SEGURANÇA] Bloqueada tentativa de abrir URL externa não autorizada: ${url}`, 'IPC-SYSTEM');
        return { success: false, error: 'Acesso bloqueado por política de segurança da rede COPPEAD.' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (e) {
      logger.error(`Erro ao abrir URL externa: ${url}`, e, 'IPC-SYSTEM');
      return { success: false, error: e.message };
    }
  });

  // Native Windows Toast notifications
  ipcMain.handle('show-notification', (event, { title, body }) => {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
    } catch (e) {
      logger.error('Falha ao disparar notificação nativa', e, 'IPC-SYSTEM');
    }
  });
}

module.exports = {
  registerSystemIPCHandlers,
  isValidExternalUrl
};

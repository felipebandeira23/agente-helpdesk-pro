/**
 * ipc/helpdesk-pro.js — Handlers IPC para integração com o backend HelpDesk Pro
 */

const { ipcMain } = require('electron');
const hdpApi = require('../helpdesk-pro-api');
const telemetry = require('../services/telemetry');
const logger = require('../logger');
const os = require('os');

function isString(v, maxLen = 2048) {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

function registerHelpdeskProIPCHandlers() {
  ipcMain.handle('hdp-test-connection', async () => {
    return hdpApi.testConnection();
  });

  ipcMain.handle('hdp-register-computer', async () => {
    try {
      const metrics = await telemetry.getSystemMetrics();
      return await hdpApi.registerComputer(metrics);
    } catch (e) {
      logger.error('Falha ao registrar computador no HelpDesk Pro', e, 'IPC-HDP');
      return { ok: false, message: e.message };
    }
  });

  ipcMain.handle('hdp-create-ticket', async (event, opts) => {
    if (!opts || typeof opts !== 'object') return { error: 'Dados do chamado inválidos.' };
    if (!isString(opts.title, 512)) return { error: 'Título ausente ou inválido.' };
    if (!isString(opts.description, 65536)) return { error: 'Descrição ausente ou inválida.' };
    try {
      return await hdpApi.createTicket({
        ...opts,
        hostname: os.hostname(),
        ip: Object.values(os.networkInterfaces()).flat()
          .find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || '',
        osVersion: os.type() + ' ' + os.release()
      });
    } catch (e) {
      logger.error('Falha ao criar chamado no HelpDesk Pro', e, 'IPC-HDP');
      return { error: e.message };
    }
  });
}

module.exports = { registerHelpdeskProIPCHandlers };

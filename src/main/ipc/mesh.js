/**
 * ipc/mesh.js — Handlers IPC para integração e controle do MeshAgent/MeshCentral
 */

const { ipcMain, app } = require('electron');
const meshInstaller = require('../services/mesh-installer');
const { isValidExternalUrl } = require('./system');
const logger = require('../logger');
const https = require('https');

function registerMeshIPCHandlers() {
  // Check if service is Running/Stopped/NotInstalled
  ipcMain.handle('check-mesh-agent', async () => {
    try {
      return await meshInstaller.checkMeshAgentStatus();
    } catch (e) {
      logger.error('Falha ao checar status do MeshAgent', e, 'IPC-MESH');
      return 'NotInstalled';
    }
  });

  // Test HTTPS connection with strict TLS in production
  ipcMain.handle('test-mesh-connection', async (event, meshUrl) => {
    return new Promise((resolve) => {
      if (!meshUrl) {
        resolve({ ok: false, message: 'URL do MeshCentral não informada.' });
        return;
      }
      if (!isValidExternalUrl(meshUrl)) {
        logger.warn(`[SEGURANÇA] Bloqueado teste de conexão para URL MeshCentral não autorizada: ${meshUrl}`, 'IPC-MESH');
        resolve({ ok: false, message: 'Falha na conexão: URL do MeshCentral não permitida pela política de segurança.' });
        return;
      }
      
      const cleanUrl = meshUrl.replace(/\/$/, '');
      
      // Em produção (app empacotado), validamos rigorosamente o certificado TLS do MeshCentral
      const rejectUnauthorized = app.isPackaged;
      const agent = new https.Agent({ rejectUnauthorized });
      
      logger.info(`Testando conexão remota MeshCentral: ${cleanUrl} (Verificação TLS: ${rejectUnauthorized})`, 'IPC-MESH');

      const req = https.get(cleanUrl, { agent, timeout: 5000 }, (res) => {
        resolve({ ok: true, message: `Conectado com sucesso! Código HTTP: ${res.statusCode}` });
      });
      
      req.on('error', (err) => {
        resolve({ ok: false, message: `Falha na conexão: ${err.message}` });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, message: 'Tempo limite esgotado ao tentar conectar.' });
      });
    });
  });
}

module.exports = {
  registerMeshIPCHandlers
};

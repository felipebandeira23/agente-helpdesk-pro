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

  // Test connection supporting HTTP/HTTPS and corporate CA or fallback bypass for intranet
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
      const isHttps = cleanUrl.startsWith('https');
      const httpModule = isHttps ? https : require('http');
      
      let agent = undefined;
      let tlsInfo = 'Nenhum';
      
      if (isHttps) {
        const path = require('path');
        const fs = require('fs');
        const caPath = path.join(__dirname, '..', '..', 'certs', 'ca-cert.pem');
        const isCoppead = cleanUrl.includes('.coppead.ufrj.br') || cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1');
        const agentOpts = { rejectUnauthorized: isCoppead ? false : app.isPackaged };
        
        if (fs.existsSync(caPath)) {
          agentOpts.ca = fs.readFileSync(caPath);
          tlsInfo = isCoppead ? 'CA Corporativa + Bypass Intranet' : 'CA Corporativa Ativa';
        } else {
          if (isCoppead) {
            tlsInfo = 'Bypass Intranet Ativo';
          } else {
            tlsInfo = app.isPackaged ? 'Estrito' : 'Desabilitado (Dev Mode)';
          }
        }
        agent = new https.Agent(agentOpts);
      }
      
      logger.info(`Testando conexão remota MeshCentral: ${cleanUrl} (Protocolo: ${isHttps ? 'HTTPS' : 'HTTP'}, TLS: ${tlsInfo})`, 'IPC-MESH');

      const req = httpModule.get(cleanUrl, { agent, timeout: 5000 }, (res) => {
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

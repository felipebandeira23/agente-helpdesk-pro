const { ipcMain, app } = require('electron');
const meshRunner = require('../services/mesh-runner');
const { isValidExternalUrl } = require('./system');
const logger = require('../logger');
const https = require('https');

function registerMeshIPCHandlers() {
  ipcMain.handle('mesh-start', async () => {
    try {
      await meshRunner.startMeshAgent();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mesh-stop', async () => {
    const killed = meshRunner.stopMeshAgent();
    return { success: killed };
  });

  ipcMain.handle('mesh-status', async () => {
    return meshRunner.getMeshAgentStatus();
  });

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

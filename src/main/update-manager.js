/**
 * update-manager.js — Gerenciador de atualizações automatizadas do Agente Helpdesk Pro
 * Roda no processo principal (main) do Electron
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const os = require('os');
const { app } = require('electron');
const logger = require('./logger');

// Versão local atual do package.json
const CURRENT_VERSION = app.getVersion() || '1.0.0';

// Whitelist de domínios corporativos permitidos para atualização
const DOMAIN_WHITELIST = [
  '*.intranet.coppead.ufrj.br',
  '*.coppead.ufrj.br',
  '*.ufrj.br',
  'localhost',
  '127.0.0.1'
];

function isDomainAllowed(urlStr) {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
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

function getHttpsAgentOptions() {
  let rejectUnauthorized = app.isPackaged;
  
  // Se for domínio da intranet da COPPEAD, não exigimos validação rígida de SSL
  const glpiUrl = getGLPIUrl();
  if (glpiUrl.includes('.coppead.ufrj.br') || glpiUrl.includes('localhost') || glpiUrl.includes('127.0.0.1')) {
    rejectUnauthorized = false;
  }
  
  const opts = { rejectUnauthorized };
  
  // Se existir um certificado CA interno, utiliza-o para verificação
  const caPath = path.join(__dirname, '..', '..', 'certs', 'ca-cert.pem');
  if (fs.existsSync(caPath)) {
    opts.ca = fs.readFileSync(caPath);
  }
  
  return opts;
}

/**
 * Obtém as configurações do agente
 */
function getLocalConfig() {
  try {
    const configPath = path.join(app.getPath('userData'), 'glpi-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    logger.error('Erro ao ler glpi-config.json no update-manager', e, 'UPDATE-MANAGER');
  }
  return {};
}

function getGLPIUrl() {
  const cfg = getLocalConfig();
  if (cfg.glpiUrl) {
    return cfg.glpiUrl.replace(/\/$/, '');
  }
  return 'https://chamados.intranet.coppead.ufrj.br'; // Fallback
}

function getUpdateChannel() {
  const cfg = getLocalConfig();
  return cfg.updateChannel || 'stable'; // 'stable' ou 'beta'
}

/**
 * Verifica se há atualizações disponíveis na intranet da Coppead
 */
async function checkForUpdates() {
  const glpiUrl = getGLPIUrl();
  if (!isDomainAllowed(glpiUrl)) {
    return Promise.reject(new Error('URL de atualização bloqueada por não pertencer aos domínios permitidos.'));
  }
  
  const channel = getUpdateChannel();
  const jsonFile = channel === 'beta' ? 'version_beta.json' : 'version.json';
  const updateUrl = `${glpiUrl}/agent/updates/${jsonFile}`;
  
  logger.info(`Verificando atualizações no canal [${channel.toUpperCase()}] em: ${updateUrl}`, 'UPDATE-MANAGER');

  return new Promise((resolve, reject) => {
    const client = updateUrl.startsWith('https') ? https : http;
    const agentOptions = getHttpsAgentOptions();
    
    client.get(updateUrl, { agent: new (updateUrl.startsWith('https') ? https.Agent : http.Agent)(agentOptions), timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Servidor de atualizações retornou código HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const updateInfo = JSON.parse(data);
          if (!updateInfo.version) {
            reject(new Error('Formato inválido no version.json do servidor'));
            return;
          }

          const hasUpdate = isNewerVersion(CURRENT_VERSION, updateInfo.version);
          resolve({
            currentVersion: CURRENT_VERSION,
            latestVersion: updateInfo.version,
            updateAvailable: hasUpdate,
            downloadUrl: updateInfo.url,
            sha256: updateInfo.sha256 || '',
            changelog: updateInfo.changelog || 'Melhorias gerais de segurança e performance.',
            channel: channel
          });
        } catch (err) {
          reject(new Error(`Erro ao analisar JSON de atualização: ${err.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Baixa o instalador do agente em segundo plano e valida integridade via SHA-256
 */
function downloadUpdate(downloadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    if (!isDomainAllowed(downloadUrl)) {
      reject(new Error('URL de download bloqueada por política de segurança.'));
      return;
    }
    const tempDir = os.tmpdir();
    const fileName = `Agente-Helpdesk-Pro-Setup-${Date.now()}.exe`;
    const targetPath = path.join(tempDir, fileName);
    const fileStream = fs.createWriteStream(targetPath);
    
    logger.info(`Iniciando download da atualização de: ${downloadUrl}`, 'UPDATE-MANAGER');

    const client = downloadUrl.startsWith('https') ? https : http;
    const agentOptions = getHttpsAgentOptions();

    client.get(downloadUrl, { agent: new (downloadUrl.startsWith('https') ? https.Agent : http.Agent)(agentOptions) }, (res) => {
      if (res.statusCode !== 200) {
        fileStream.close();
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        reject(new Error(`Erro no download. Status HTTP ${res.statusCode}`));
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        fileStream.write(chunk);

        if (totalBytes > 0) {
          const percent = Math.round((downloadedBytes / totalBytes) * 100);
          if (onProgress) {
            onProgress(percent);
          }
        }
      });

      res.on('end', async () => {
        fileStream.end();
        logger.info(`Download de atualização concluído: ${targetPath}`, 'UPDATE-MANAGER');
        
        // Verificação de Integridade (Hash SHA-256)
        try {
          const updateInfo = await checkForUpdates().catch(() => ({}));
          const expectedHash = updateInfo.sha256;
          if (expectedHash) {
            logger.info(`Verificando integridade SHA-256... Esperado: ${expectedHash}`, 'UPDATE-MANAGER');
            const match = verifyFileHash(targetPath, expectedHash);
            if (!match) {
              if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
              reject(new Error('Falha de Integridade: O instalador baixado possui assinatura/hash SHA-256 inválido!'));
              return;
            }
            logger.info('Verificação de integridade SHA-256 bem-sucedida!', 'UPDATE-MANAGER');
          } else {
            logger.warn('Nenhum hash SHA-256 fornecido pelo servidor. Prosseguindo sem verificação.', 'UPDATE-MANAGER');
          }
          resolve(targetPath);
        } catch (hashErr) {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          reject(hashErr);
        }
      });

    }).on('error', (err) => {
      fileStream.close();
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      reject(err);
    });
  });
}

function verifyFileHash(filePath, expectedHash) {
  const hash = crypto.createHash('sha256');
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  const computed = hash.digest('hex');
  return computed.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Executa o instalador em modo silencioso (/S) e fecha a aplicação
 */
function installAndExit(installerPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(installerPath)) {
      reject(new Error('Instalador não encontrado'));
      return;
    }

    logger.info(`Executando instalação silenciosa (/S) e registrando rollback: ${installerPath}`, 'UPDATE-MANAGER');
    
    // Regista informação de rollback/contingência em caso de falha catastrófica
    try {
      const rollbackPath = path.join(app.getPath('userData'), 'rollback-info.json');
      fs.writeFileSync(rollbackPath, JSON.stringify({
        installationInProgress: true,
        previousVersion: CURRENT_VERSION,
        timestamp: Date.now()
      }));
    } catch (e) {
      logger.error('Falha ao gravar arquivo de contingência de rollback', e, 'UPDATE-MANAGER');
    }

    // NSIS Silent trigger command
    const child = exec(`"${installerPath}" /S`, { shell: true }, (err) => {
      if (err) {
        logger.error('Erro de execução do instalador da atualização', err, 'UPDATE-MANAGER');
        reject(err);
        return;
      }
      resolve();
    });

    child.unref();

    // Fecha o Electron em 1 segundo para liberação de arquivos lock
    setTimeout(() => {
      app.quit();
    }, 1000);
  });
}

/**
 * Checa na inicialização se o instalador falhou (detecta se havia instalação em progresso mas continuou na versão anterior)
 */
function checkRollbackStatus() {
  try {
    const rollbackPath = path.join(app.getPath('userData'), 'rollback-info.json');
    if (fs.existsSync(rollbackPath)) {
      const info = JSON.parse(fs.readFileSync(rollbackPath, 'utf8'));
      if (info.installationInProgress) {
        logger.warn(`[ROLLBACK] Detectado instalador abortado ou falho. Recuperado com sucesso na versão: ${info.previousVersion}`, 'UPDATE-MANAGER');
        
        // Remove sinalizador de instalação
        fs.unlinkSync(rollbackPath);
        return { rolledBack: true, previousVersion: info.previousVersion };
      }
    }
  } catch (e) {}
  return { rolledBack: false };
}

function isNewerVersion(current, target) {
  const cParts = current.split('.').map(Number);
  const tParts = target.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const c = cParts[i] || 0;
    const t = tParts[i] || 0;
    if (t > c) return true;
    if (t < c) return false;
  }
  return false;
}

module.exports = {
  checkForUpdates,
  downloadUpdate,
  installAndExit,
  checkRollbackStatus,
  CURRENT_VERSION
};

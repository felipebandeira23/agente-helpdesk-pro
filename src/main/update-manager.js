/**
 * update-manager.js — Gerenciador de atualizações automatizadas do Agente Helpdesk Pro
 * Roda no processo principal (main) do Electron
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const os = require('os');
const { app } = require('electron');

// Versão local atual do package.json
const CURRENT_VERSION = app.getVersion() || '1.0.0';

/**
 * Obtém as configurações do agente para saber a URL do GLPI e montar a URL de update
 */
function getGLPIUrl() {
  try {
    const configPath = path.join(app.getPath('userData'), 'glpi-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed.glpiUrl) {
        return parsed.glpiUrl.replace(/\/$/, '');
      }
    }
  } catch (e) {
    console.error('[UPDATE-MANAGER] Erro ao ler glpi-config.json para atualização:', e.message);
  }
  return 'https://chamados.intranet.coppead.ufrj.br'; // Fallback
}

/**
 * Verifica se há atualizações disponíveis na intranet da Coppead
 */
async function checkForUpdates() {
  const glpiUrl = getGLPIUrl();
  const updateUrl = `${glpiUrl}/agent/updates/version.json`;
  console.log(`[UPDATE-MANAGER] Verificando atualizações em: ${updateUrl}`);

  return new Promise((resolve, reject) => {
    const client = updateUrl.startsWith('https') ? https : http;
    
    // Suporte ao certificado CA interno (aceitar cert sem verificação estrita na intranet)
    const agentOptions = { rejectUnauthorized: false };
    
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
            changelog: updateInfo.changelog || 'Melhorias de desempenho e estabilidade.'
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
 * Baixa o instalador do agente em segundo plano e notifica progresso
 */
function downloadUpdate(downloadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const fileName = `Agente-Helpdesk-Pro-Setup-${Date.now()}.exe`;
    const targetPath = path.join(tempDir, fileName);
    const fileStream = fs.createWriteStream(targetPath);
    
    console.log(`[UPDATE-MANAGER] Iniciando download do instalador de: ${downloadUrl} para: ${targetPath}`);

    const client = downloadUrl.startsWith('https') ? https : http;
    const agentOptions = { rejectUnauthorized: false };

    client.get(downloadUrl, { agent: new (downloadUrl.startsWith('https') ? https.Agent : http.Agent)(agentOptions) }, (res) => {
      if (res.statusCode !== 200) {
        fileStream.close();
        fs.unlinkSync(targetPath);
        reject(new Error(`Erro no download. Servidor retornou código HTTP ${res.statusCode}`));
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

      res.on('end', () => {
        fileStream.end();
        console.log(`[UPDATE-MANAGER] Download concluído com sucesso: ${targetPath}`);
        resolve(targetPath);
      });

    }).on('error', (err) => {
      fileStream.close();
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      reject(err);
    });
  });
}

/**
 * Executa o instalador em modo silencioso (/S) e fecha a aplicação atual
 */
function installAndExit(installerPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(installerPath)) {
      reject(new Error('Instalador não encontrado no caminho especificado'));
      return;
    }

    console.log(`[UPDATE-MANAGER] Executando instalador de forma silenciosa (/S): ${installerPath}`);
    
    // Comando nsis silencioso: exe /S
    // Usamos shell: true para execução no cmd/powershell
    const process = exec(`"${installerPath}" /S`, { shell: true }, (err) => {
      if (err) {
        console.error('[UPDATE-MANAGER] Erro ao rodar instalador:', err.message);
        reject(err);
        return;
      }
      resolve();
    });

    // Desvincula o processo filho para que ele continue rodando mesmo após fecharmos o Electron
    process.unref();

    // Fecha o Electron imediatamente para que o novo instalador consiga substituir os arquivos sem lock
    setTimeout(() => {
      app.quit();
    }, 1000);
  });
}

/**
 * Auxiliar: Compara duas strings de versão no formato semântico (SemVer)
 * Retorna true se targetVersion > currentVersion
 */
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
  CURRENT_VERSION
};

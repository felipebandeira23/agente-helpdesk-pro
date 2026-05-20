const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../logger');

let meshProcess = null;

function getAssetsDir() {
  const { app } = require('electron');
  if (app.isPackaged) {
    // Produção: extraResources são copiados para resources/assets/ (fora do ASAR)
    return path.join(process.resourcesPath, 'assets');
  }
  // Desenvolvimento: pasta assets/ na raiz do projeto
  return path.join(__dirname, '..', '..', '..', 'assets');
}

function getMeshExecutablePath() {
  return path.join(getAssetsDir(), 'meshagent64.exe');
}


function getMshPath() {
  // O nome do .msh deve ser idêntico ao do executável
  return path.join(getAssetsDir(), 'meshagent64.msh');
}

/**
 * Grava o arquivo .msh de configuração que o MeshAgent precisa para saber
 * a qual servidor e grupo se conectar.
 * Dados fixos do servidor MeshCentral do COPPEAD (obtidos do painel Connection Details).
 *
 * IMPORTANTE: O Apache faz proxy do HTTPS (443) para a interface web, mas o
 * protocolo WebSocket do MeshAgent conecta DIRETAMENTE na porta 4430.
 * Por isso sempre garantimos a porta 4430 no URL WSS do .msh.
 */
function writeMshConfig(cfg) {
  const rawUrl = (cfg.meshUrl || 'https://rdp.intranet.coppead.ufrj.br').replace(/\/$/, '');

  // Converte HTTP(S) → WS(S)
  let wssBase = rawUrl
    .replace(/^https/, 'wss')
    .replace(/^http:/, 'ws:');

  // Se a URL não tiver porta explícita, adiciona :4430 (porta direta do MeshCentral)
  try {
    const parsed = new URL(wssBase);
    if (!parsed.port) {
      parsed.port = '4430';
      wssBase = parsed.toString().replace(/\/$/, '');
    }
  } catch (_) {}

  const meshWssUrl = wssBase + '/agent.ashx';

  // ServerID visto no painel "Connection Details" do MeshAgent instalado
  const serverId = 'CFA80564B399512CDE685FC4BDCEA3FE78A2951915';

  // MeshID (Identificador de Grupo) em hex — lido do mesmo painel
  const rawGroupId = cfg.meshGroupId || '04ADAEDEE3D220437245025C8D912D2C9393D751C6';
  const meshIdHex = rawGroupId.startsWith('0x') ? rawGroupId : `0x${rawGroupId}`;

  const meshName = 'COPPEAD';

  const mshContent = [
    `MeshName=${meshName}`,
    `MeshType=2`,
    `MeshID=${meshIdHex}`,
    `ServerID=${serverId}`,
    `MeshServer=${meshWssUrl}`,
    ``
  ].join('\r\n');

  const mshPath = getMshPath();
  fs.writeFileSync(mshPath, mshContent, 'utf8');

  logger.info(`[MSH] Arquivo de config gerado: ${mshPath}`, 'MESH-RUNNER');
  logger.info(`[MSH]   Servidor : ${meshWssUrl}`, 'MESH-RUNNER');
  logger.info(`[MSH]   MeshID  : ${meshIdHex}`, 'MESH-RUNNER');
  logger.info(`[MSH]   ServerID: ${serverId}`, 'MESH-RUNNER');
  return mshPath;
}

function startMeshAgent() {
  return new Promise((resolve, reject) => {
    if (meshProcess) {
      logger.warn('Processo do MeshAgent já está em execução.', 'MESH-RUNNER');
      return resolve(true);
    }

    const exePath = getMeshExecutablePath();
    if (!fs.existsSync(exePath)) {
      return reject(new Error(
        'Executável do MeshAgent não encontrado.\n' +
        'Copie o arquivo "meshagent64-COPPEAD.exe" (baixado do MeshCentral) para a pasta assets/ e renomeie para "meshagent64.exe".'
      ));
    }

    // NÃO gerar .msh: o meshagent64-COPPEAD.exe tem o certificado do servidor EMBUTIDO.
    // Se um .msh com o mesmo nome existir, o exe ignora a config embutida e usa o .msh,
    // o que quebra a verificação do certificado TLS. Por isso removemos o .msh.
    const mshPath = path.join(getAssetsDir(), 'meshagent64.msh');
    if (fs.existsSync(mshPath)) {
      try { fs.unlinkSync(mshPath); } catch(e) { /* ignora */ }
      logger.info('[MESH] Arquivo .msh removido — usando config embutida do exe.', 'MESH-RUNNER');
    }

    logger.info(`Iniciando MeshAgent (config embutida): ${exePath} connect`, 'MESH-RUNNER');

    meshProcess = spawn(exePath, ['connect'], {
      detached: false,
      windowsHide: true,
      cwd: getAssetsDir()
    });

    meshProcess.stdout && meshProcess.stdout.on('data', (data) => {
      logger.info(`[meshagent] ${data.toString().trim()}`, 'MESH-RUNNER');
    });
    meshProcess.stderr && meshProcess.stderr.on('data', (data) => {
      logger.warn(`[meshagent stderr] ${data.toString().trim()}`, 'MESH-RUNNER');
    });

    meshProcess.on('error', (err) => {
      logger.error('Falha ao iniciar MeshAgent', err, 'MESH-RUNNER');
      meshProcess = null;
      reject(err);
    });

    meshProcess.on('exit', (code, signal) => {
      logger.info(`MeshAgent encerrado (code: ${code}, signal: ${signal})`, 'MESH-RUNNER');
      meshProcess = null;
    });

    // Aguarda 4s para o agente estabelecer a conexão WebSocket com o servidor
    setTimeout(() => {
      if (meshProcess && meshProcess.pid !== undefined) {
        logger.info(`[MESH] Processo ativo (PID ${meshProcess.pid}) — conexão em andamento.`, 'MESH-RUNNER');
        resolve(true);
      } else {
        reject(new Error(
          'O MeshAgent encerrou antes de estabelecer conexão.\n' +
          'Verifique se assets/meshagent64.exe é o arquivo "meshagent64-COPPEAD.exe" do MeshCentral.'
        ));
      }
    }, 4000);
  });
}



function stopMeshAgent() {
  if (meshProcess) {
    logger.info('Encerrando processo do MeshAgent...', 'MESH-RUNNER');
    try { meshProcess.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => {
      try { if (meshProcess) meshProcess.kill('SIGKILL'); } catch (_) {}
      meshProcess = null;
    }, 2000);
    return true;
  }
  return false;
}

function getMeshAgentStatus() {
  return meshProcess !== null;
}

module.exports = {
  startMeshAgent,
  stopMeshAgent,
  getMeshAgentStatus
};

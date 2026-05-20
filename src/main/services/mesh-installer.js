/**
 * mesh-installer.js — Serviço de verificação e instalação silenciosa do MeshAgent
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function getAssetPath(relativeChildPath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', relativeChildPath);
  } else {
    return path.join(__dirname, '..', '..', '..', 'assets', relativeChildPath);
  }
}

async function ensureMeshAgentInstalled() {
  return new Promise((resolve) => {
    // 1. Verificar se o serviço "Mesh Agent" já está ativo e rodando
    const checkCmd = 'Get-Service -Name "MeshAgent", "Mesh Agent" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status';
    const checkProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', checkCmd]);
    let checkStdout = '';
    
    checkProc.stdout.on('data', d => checkStdout += d.toString());
    
    checkProc.on('close', () => {
      const status = checkStdout.trim();
      if (status.includes('Running')) {
        console.log('[MESH] MeshAgent já está instalado e rodando.');
        resolve(true);
        return;
      }
      
      console.log('[MESH] MeshAgent não está rodando. Status:', status || 'Não Instalado');
      
      // 2. Localizar o executável do MeshAgent embutido nos assets
      const agentPath = getAssetPath('meshagent64.exe');
      if (!fs.existsSync(agentPath)) {
        console.error('[MESH] Executável do MeshAgent não encontrado em:', agentPath);
        resolve(false);
        return;
      }
      
      console.log('[MESH] Iniciando instalação/reparo do MeshAgent a partir de:', agentPath);
      
      // 3. Executar o instalador com privilégios elevados (RunAs) de forma silenciosa
      const installCmd = `Start-Process -FilePath "${agentPath}" -ArgumentList "-fullinstall" -Verb RunAs -Wait`;
      const installProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', installCmd]);
      
      installProc.on('close', (code) => {
        console.log('[MESH] Processo de instalação do MeshAgent finalizado com código:', code);
        resolve(code === 0);
      });
    });
  });
}

async function checkMeshAgentStatus() {
  return new Promise((resolve) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Service -Name "MeshAgent", "Mesh Agent" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status']);
    let stdout = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.on('close', () => {
      const status = stdout.trim();
      if (status.includes('Running')) {
        resolve('Running');
      } else if (status.includes('Stopped')) {
        resolve('Stopped');
      } else {
        resolve('NotInstalled');
      }
    });
  });
}

module.exports = {
  ensureMeshAgentInstalled,
  checkMeshAgentStatus
};

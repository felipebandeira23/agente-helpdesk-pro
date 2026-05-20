const fs = require('fs');
const path = require('path');

let userDataPath = '';
try {
  const { app } = require('electron');
  if (app) {
    userDataPath = app.getPath('userData');
  }
} catch (e) {
  userDataPath = path.join(process.cwd(), 'temp-userdata');
}

const diagFile = path.join(userDataPath, 'diagnostics.json');

// Estado interno inicial padrão
let state = {
  glpiStatus: 'disconnected',
  meshStatus: 'NotInstalled',
  lastSync: null,
  lastFailure: null,
  syncHistory: []
};

// Carrega o estado salvo no disco (se existir)
function loadState() {
  try {
    if (fs.existsSync(diagFile)) {
      const content = fs.readFileSync(diagFile, 'utf8');
      const parsed = JSON.parse(content);
      state = {
        glpiStatus: parsed.glpiStatus || 'disconnected',
        meshStatus: parsed.meshStatus || 'NotInstalled',
        lastSync: parsed.lastSync || null,
        lastFailure: parsed.lastFailure || null,
        syncHistory: Array.isArray(parsed.syncHistory) ? parsed.syncHistory : []
      };
    }
  } catch (e) {
    console.error('[DIAGNOSTICS] Erro ao carregar diagnostics.json:', e.message);
  }
}

// Salva o estado atual no disco de forma assíncrona/segura
function saveState() {
  try {
    const dir = path.dirname(diagFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(diagFile, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[DIAGNOSTICS] Erro ao salvar diagnostics.json:', e.message);
  }
}

// Inicializa no carregamento
loadState();

/**
 * Retorna as informações completas de diagnóstico
 */
function getDiagnostics() {
  let appVersion = '1.0.0 PRO';
  try {
    const { app } = require('electron');
    if (app) {
      appVersion = `${app.getVersion()} PRO`;
    }
  } catch (e) {}

  return {
    ...state,
    appVersion
  };
}

/**
 * Atualiza o status do GLPI
 */
function updateGlpiStatus(status) {
  if (state.glpiStatus !== status) {
    state.glpiStatus = status;
    saveState();
  }
}

/**
 * Atualiza o status do MeshAgent
 */
function updateMeshStatus(status) {
  if (state.meshStatus !== status) {
    state.meshStatus = status;
    saveState();
  }
}

/**
 * Registra o sucesso de uma sincronização de inventário
 */
function registerSyncSuccess(type = 'auto', message = 'Inventário sincronizado com sucesso!') {
  const timestamp = new Date().toISOString();
  state.lastSync = timestamp;
  
  const record = {
    timestamp,
    type, // 'auto' ou 'force'
    success: true,
    message
  };

  // Adiciona ao histórico (limite de 15 itens)
  state.syncHistory.unshift(record);
  if (state.syncHistory.length > 15) {
    state.syncHistory = state.syncHistory.slice(0, 15);
  }

  saveState();
}

/**
 * Registra a falha de uma sincronização de inventário
 */
function registerSyncFailure(type = 'auto', errorMsg = 'Erro desconhecido') {
  const timestamp = new Date().toISOString();
  state.lastFailure = {
    timestamp,
    message: errorMsg
  };

  const record = {
    timestamp,
    type,
    success: false,
    message: errorMsg
  };

  // Adiciona ao histórico (limite de 15 itens)
  state.syncHistory.unshift(record);
  if (state.syncHistory.length > 15) {
    state.syncHistory = state.syncHistory.slice(0, 15);
  }

  saveState();
}

/**
 * Limpa o histórico de diagnósticos
 */
function clearDiagnostics() {
  state = {
    glpiStatus: 'disconnected',
    meshStatus: 'NotInstalled',
    lastSync: null,
    lastFailure: null,
    syncHistory: []
  };
  saveState();
}

module.exports = {
  getDiagnostics,
  updateGlpiStatus,
  updateMeshStatus,
  registerSyncSuccess,
  registerSyncFailure,
  clearDiagnostics
};

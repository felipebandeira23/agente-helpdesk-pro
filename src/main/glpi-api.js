/**
 * glpi-api.js — Cliente REST para a API do GLPI
 * Roda no processo principal (main) do Electron via IPC
 *
 * GLPI REST API Docs: https://github.com/glpi-project/glpi/blob/main/apirest.md
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Importação lazy do axios para funcionar no Electron
let axios;
try { axios = require('axios'); } catch (e) { axios = null; }

// ─── Configuração persistida ───────────────────────────────────────────────
// Usa userdata do Electron se disponível, senão pasta do usuário do OS
function getConfigPath() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'glpi-config.json');
  } catch (e) {
    return path.join(os.homedir(), '.helpdesk-pro', 'glpi-config.json');
  }
}

function loadConfig() {
  const defaults = {
    glpiUrl: 'https://chamados.intranet.coppead.ufrj.br',
    appToken: 'KEFWiWcIFqIJNTpUOJksKMt6OmnBoGT6V1JCvX0F',
    userToken: '',
    meshUrl: 'https://rdp.intranet.coppead.ufrj.br',
    meshGroupId: '',
    sessionToken: null,
    sessionExpiry: null,
  };
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (!parsed.glpiUrl) parsed.glpiUrl = defaults.glpiUrl;
      if (!parsed.appToken) parsed.appToken = defaults.appToken;
      return Object.assign({}, defaults, parsed);
    }
  } catch (e) {}
  return defaults;
}

function saveConfig(cfg) {
  try {
    const cfgPath = getConfigPath();
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  } catch (e) {}
}


let _config = loadConfig();

// ─── Criação do cliente HTTP (com suporte a CA interna) ───────────────────
function buildClient() {
  if (!axios) throw new Error('axios não instalado');

  const opts = { timeout: 15000 };

  // Suporte ao certificado CA interno (intranet corporativa)
  const caPath = path.join(__dirname, '..', '..', 'certs', 'ca-cert.pem');
  if (fs.existsSync(caPath)) {
    opts.httpsAgent = new https.Agent({ ca: fs.readFileSync(caPath) });
  } else {
    // Na intranet, aceitar cert interno sem verificação de CA extra
    opts.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }

  const client = axios.create(opts);
  return client;
}

// ─── Autenticação ──────────────────────────────────────────────────────────

/**
 * Inicia ou reutiliza a sessão GLPI.
 * Retorna o session_token para uso nos headers das requisições.
 */
async function initSession() {
  const now = Date.now();

  // Reutiliza sessão ainda válida (expira em 30 min)
  if (_config.sessionToken && _config.sessionExpiry && now < _config.sessionExpiry) {
    return _config.sessionToken;
  }

  if (!_config.glpiUrl || !_config.appToken) {
    throw new Error('GLPI não configurado. Configure a URL e o App-Token nas Configurações.');
  }

  const client = buildClient();
  const headers = {
    'App-Token': _config.appToken,
    'Content-Type': 'application/json',
  };

  // Auth por user_token (preferencial, sem expor senha)
  if (_config.userToken) {
    headers['Authorization'] = `user_token ${_config.userToken}`;
  }

  const res = await client.get(`${_config.glpiUrl}/apirest.php/initSession`, { headers });

  if (!res.data || !res.data.session_token) {
    throw new Error('Falha na autenticação com GLPI: session_token não retornado');
  }

  _config.sessionToken = res.data.session_token;
  _config.sessionExpiry = now + 28 * 60 * 1000; // 28 minutos
  saveConfig(_config);

  return _config.sessionToken;
}

/**
 * Encerra a sessão atual no GLPI
 */
async function killSession() {
  if (!_config.sessionToken) return;
  try {
    const client = buildClient();
    await client.get(`${_config.glpiUrl}/apirest.php/killSession`, {
      headers: {
        'App-Token': _config.appToken,
        'Session-Token': _config.sessionToken,
      },
    });
  } catch (e) {}
  _config.sessionToken = null;
  _config.sessionExpiry = null;
  saveConfig(_config);
}

/**
 * Retorna os headers padrão com sessão válida
 */
async function authHeaders() {
  const sessionToken = await initSession();
  return {
    'App-Token': _config.appToken,
    'Session-Token': sessionToken,
    'Content-Type': 'application/json',
  };
}

// ─── Usuário ───────────────────────────────────────────────────────────────

/**
 * Busca o usuário GLPI pelo login (samAccountName do AD)
 * Retorna { id, name, email, phone } ou null
 */
async function findUserByLogin(login) {
  const client = buildClient();
  const headers = await authHeaders();
  try {
    const res = await client.get(`${_config.glpiUrl}/apirest.php/User`, {
      headers,
      params: {
        searchText: JSON.stringify({ name: login }),
        range: '0-1',
      },
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      const u = res.data[0];
      return { id: u.id, name: u.realname || u.name, email: u.email, phone: u.phone };
    }
  } catch (e) {}
  return null;
}

/**
 * Retorna o ID do usuário atual autenticado na sessão
 */
async function getMyProfile() {
  const client = buildClient();
  const headers = await authHeaders();
  const res = await client.get(`${_config.glpiUrl}/apirest.php/getMyProfiles`, { headers });
  return res.data;
}

// ─── Categorias ────────────────────────────────────────────────────────────

/**
 * Lista categorias de chamados (ITILCategory)
 */
async function getCategories() {
  const client = buildClient();
  const headers = await authHeaders();
  const res = await client.get(`${_config.glpiUrl}/apirest.php/ITILCategory`, {
    headers,
    params: { range: '0-100', sort: 'name', order: 'ASC' },
  });
  return Array.isArray(res.data) ? res.data : [];
}

// ─── Tickets ───────────────────────────────────────────────────────────────

/**
 * Cria um novo chamado no GLPI
 * @param {Object} opts - { title, description, categoryId, urgency, userId, hostname, ip, osVersion }
 * urgency: 1=Muito Baixa, 2=Baixa, 3=Média, 4=Alta, 5=Muito Alta
 */
async function createTicket({ title, description, categoryId, urgency = 3, userId, hostname, ip, osVersion }) {
  const client = buildClient();
  const headers = await authHeaders();

  // Monta descrição enriquecida com dados da máquina
  const enrichedDesc = [
    description,
    '',
    '---',
    `**Máquina:** ${hostname || 'N/A'}`,
    `**IP:** ${ip || 'N/A'}`,
    `**Sistema:** ${osVersion || 'N/A'}`,
    `**Aberto via:** Agente Helpdesk Pro`,
  ].join('\n');

  const payload = {
    input: {
      name: title,
      content: enrichedDesc,
      urgency,
      type: 1, // 1=Incidente, 2=Requisição
      status: 1, // 1=Novo
      ...(categoryId && { itilcategories_id: categoryId }),
      ...(userId && { users_id_recipient: userId }),
    },
  };

  const res = await client.post(`${_config.glpiUrl}/apirest.php/Ticket`, payload, { headers });
  return res.data; // { id, message }
}

/**
 * Lista os chamados do usuário atual
 * @param {number} userId - ID do usuário no GLPI
 */
async function getMyTickets(userId) {
  const client = buildClient();
  const headers = await authHeaders();

  const params = {
    range: '0-50',
    sort: 'date_mod',
    order: 'DESC',
  };

  if (userId) {
    params['searchText[users_id]'] = userId;
  }

  const res = await client.get(`${_config.glpiUrl}/apirest.php/Ticket`, { headers, params });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Retorna detalhes de um chamado específico
 */
async function getTicket(ticketId) {
  const client = buildClient();
  const headers = await authHeaders();
  const res = await client.get(`${_config.glpiUrl}/apirest.php/Ticket/${ticketId}`, { headers });
  return res.data;
}

/**
 * Retorna os followups (respostas/comentários) de um chamado
 */
async function getTicketFollowups(ticketId) {
  const client = buildClient();
  const headers = await authHeaders();
  const res = await client.get(`${_config.glpiUrl}/apirest.php/ITILFollowup`, {
    headers,
    params: {
      'searchText[items_id]': ticketId,
      sort: 'date',
      order: 'ASC',
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Adiciona um followup (resposta do usuário) em um chamado
 */
async function addFollowup(ticketId, message) {
  const client = buildClient();
  const headers = await authHeaders();
  const payload = {
    input: {
      items_id: ticketId,
      itemtype: 'Ticket',
      content: message,
      is_private: 0,
    },
  };
  const res = await client.post(`${_config.glpiUrl}/apirest.php/ITILFollowup`, payload, { headers });
  return res.data;
}

// ─── Configuração ──────────────────────────────────────────────────────────

/**
 * Salva as configurações de conexão com o GLPI
 */
function setGlpiConfig({ glpiUrl, appToken, userToken, meshUrl, meshGroupId }) {
  _config = {
    ..._config,
    glpiUrl: glpiUrl ? glpiUrl.replace(/\/$/, '') : _config.glpiUrl,
    appToken: appToken || _config.appToken,
    userToken: userToken || _config.userToken,
    meshUrl: meshUrl ? meshUrl.replace(/\/$/, '') : _config.meshUrl,
    meshGroupId: meshGroupId !== undefined ? meshGroupId : _config.meshGroupId,
    sessionToken: null, // força novo login
    sessionExpiry: null,
  };
  saveConfig(_config);
  return { ok: true };
}

function getGlpiConfig() {
  return {
    glpiUrl: _config.glpiUrl,
    appToken: _config.appToken,
    userToken: _config.userToken,
    meshUrl: _config.meshUrl || 'https://rdp.intranet.coppead.ufrj.br',
    meshGroupId: _config.meshGroupId || '',
    isConfigured: !!(
      _config.glpiUrl && _config.appToken && _config.userToken
    ),
  };
}

/**
 * Testa a conexão com o GLPI e retorna informações básicas
 */
async function testConnection() {
  try {
    await killSession(); // força nova sessão
    const token = await initSession();
    const client = buildClient();
    const headers = await authHeaders();
    const res = await client.get(`${_config.glpiUrl}/apirest.php/getMyProfiles`, { headers });
    return { ok: true, message: 'Conexão com GLPI bem-sucedida! (Sessão de usuário inicializada)', profiles: res.data };
  } catch (e) {
    let msg = e.message;
    if (e.response && e.response.data) {
      const data = e.response.data;
      // ERROR_LOGIN_PARAMETERS_MISSING means the server is online and App-Token is valid
      if (Array.isArray(data) && data.includes('ERROR_LOGIN_PARAMETERS_MISSING')) {
        return { ok: true, message: 'Conexão com GLPI bem-sucedida! (Servidor alcançado e App-Token aceito)' };
      }
      if (Array.isArray(data) && data[1]) {
        msg = data[1];
      } else if (typeof data === 'object' && data.message) {
        msg = data.message;
      }
    }
    return { ok: false, message: msg };
  }
}

/**
 * Envia o inventário JSON nativo para o GLPI via endpoint /front/inventory.php
 * @param {Object} inventoryData - Objeto de inventário coletado
 */
async function sendInventory(inventoryData) {
  if (!_config.glpiUrl) {
    throw new Error('GLPI não configurado. Configure a URL nas Configurações.');
  }

  const client = buildClient();
  const deviceId = `${inventoryData.hardware.name || 'DESCONHECIDO'}-${inventoryData.hardware.uuid || 'NO-UUID'}`;

  const payload = {
    action: 'inventory',
    deviceid: deviceId,
    itemtype: 'Computer',
    content: inventoryData
  };

  const url = `${_config.glpiUrl}/front/inventory.php`;
  console.log(`[GLPI-API] Enviando inventário para: ${url} (DeviceID: ${deviceId})`);

  const res = await client.post(url, payload, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  return res.data;
}

module.exports = {
  // Config
  setGlpiConfig,
  getGlpiConfig,
  testConnection,
  // Auth
  initSession,
  killSession,
  // Users
  findUserByLogin,
  getMyProfile,
  // Tickets
  createTicket,
  getMyTickets,
  getTicket,
  getTicketFollowups,
  addFollowup,
  // Categories
  getCategories,
  // Inventory
  sendInventory,
};

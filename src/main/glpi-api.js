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
const logger = require('./logger');
const diagManager = require('./diagnostics-manager');

let safeStorage;
try {
  const electron = require('electron');
  safeStorage = electron.safeStorage;
} catch (e) {
  safeStorage = null;
}

// Importação lazy do axios para funcionar no Electron
let axios;
try { axios = require('axios'); } catch (e) { axios = null; }


// Whitelist de domínios corporativos permitidos para GLPI e MeshCentral
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

// Criptografia e Decriptografia de credenciais salvas em disco via safeStorage (DPAPI)
function encryptToken(token) {
  if (!token) return '';
  if (token.startsWith('_safe:')) return token;
  
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(token);
      return '_safe:' + encrypted.toString('base64');
    } catch (err) {
      console.error('[GLPI-API] Erro ao criptografar token:', err.message);
    }
  }
  return token;
}

function decryptToken(token) {
  if (!token) return '';
  if (token.startsWith('_safe:')) {
    const base64Str = token.substring(6);
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(base64Str, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (err) {
        console.error('[GLPI-API] Erro ao descriptografar token:', err.message);
      }
    }
    console.warn('[GLPI-API] safeStorage indisponível para descriptografar token.');
    return '';
  }
  return token;
}

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

function loadPerlAgentConfig() {
  try {
    const perlCfgPath = path.join(__dirname, '..', '..', '..', 'glpi-agent', 'etc', 'support-server-plugin.cfg');
    if (fs.existsSync(perlCfgPath)) {
      const content = fs.readFileSync(perlCfgPath, 'utf8');
      const config = {};
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          config[key] = value;
        }
      }
      return {
        glpiUrl: config.glpi_url || null,
        appToken: config.app_token || null,
        userToken: config.user_token || null,
      };
    }
  } catch (e) {
    console.error('[GLPI-API] Erro ao carregar config do agente Perl:', e.message);
  }
  return null;
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
  
  let merged = { ...defaults };
  
  // 1. Tenta carregar do fallback Perl agente config
  const perlConfig = loadPerlAgentConfig();
  if (perlConfig) {
    if (perlConfig.glpiUrl) merged.glpiUrl = perlConfig.glpiUrl;
    if (perlConfig.appToken) merged.appToken = perlConfig.appToken;
    if (perlConfig.userToken) merged.userToken = perlConfig.userToken;
    console.log('[GLPI-API] Configurações de fallback carregadas do agente Perl:', {
      glpiUrl: merged.glpiUrl,
      appToken: merged.appToken ? '***' : null,
      userToken: merged.userToken ? '***' : null
    });
  }

  // 2. Tenta carregar da config local do aplicativo
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      
      let needsEncryption = false;
      
      if (parsed.glpiUrl) {
        if (isDomainAllowed(parsed.glpiUrl)) {
          merged.glpiUrl = parsed.glpiUrl;
        } else {
          console.warn('[GLPI-API] URL do GLPI bloqueada por não pertencer aos domínios permitidos:', parsed.glpiUrl);
        }
      }
      
      if (parsed.appToken) {
        if (parsed.appToken.startsWith('_safe:')) {
          merged.appToken = decryptToken(parsed.appToken);
        } else {
          merged.appToken = parsed.appToken;
          needsEncryption = true;
        }
      }
      
      if (parsed.userToken !== undefined) {
        if (parsed.userToken.startsWith('_safe:')) {
          merged.userToken = decryptToken(parsed.userToken);
        } else if (parsed.userToken) {
          merged.userToken = parsed.userToken;
          needsEncryption = true;
        } else {
          merged.userToken = parsed.userToken;
        }
      }
      
      if (parsed.meshUrl) {
        if (isDomainAllowed(parsed.meshUrl)) {
          merged.meshUrl = parsed.meshUrl;
        } else {
          console.warn('[GLPI-API] URL do MeshCentral bloqueada por não pertencer aos domínios permitidos:', parsed.meshUrl);
        }
      }
      
      if (parsed.meshGroupId !== undefined) merged.meshGroupId = parsed.meshGroupId;
      if (parsed.sessionToken !== undefined) merged.sessionToken = parsed.sessionToken;
      if (parsed.sessionExpiry !== undefined) merged.sessionExpiry = parsed.sessionExpiry;
      
      console.log('[GLPI-API] Configurações locais carregadas com sucesso de:', cfgPath);
      
      // Se detectou tokens em texto plano, salva de forma criptografada
      if (needsEncryption && safeStorage && safeStorage.isEncryptionAvailable()) {
        console.log('[GLPI-API] Criptografando credenciais salvas no disco...');
        saveConfig(merged);
      }
    }
  } catch (e) {
    console.error('[GLPI-API] Erro ao ler glpi-config.json:', e.message);
  }

  return merged;
}

function getCachePath(filename) {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), filename);
  } catch (e) {
    return path.join(os.homedir(), '.helpdesk-pro', filename);
  }
}

function isInventoryEqual(inv1, inv2) {
  if (!inv1 || !inv2) return false;
  try {
    const h1 = inv1.hardware || {};
    const h2 = inv2.hardware || {};
    if (h1.uuid !== h2.uuid || h1.name !== h2.name || h1.model !== h2.model || h1.memory !== h2.memory) {
      return false;
    }
    const b1 = inv1.bios || {};
    const b2 = inv2.bios || {};
    if (b1.ssn !== b2.ssn || b1.msn !== b2.msn) {
      return false;
    }
    const o1 = inv1.operatingsystem || {};
    const o2 = inv2.operatingsystem || {};
    if (o1.name !== o2.name || o1.version !== o2.version) {
      return false;
    }
    if ((inv1.cpus || []).length !== (inv2.cpus || []).length) return false;
    if ((inv1.memories || []).length !== (inv2.memories || []).length) return false;
    if ((inv1.storages || []).length !== (inv2.storages || []).length) return false;
    if ((inv1.networks || []).length !== (inv2.networks || []).length) return false;
    if ((inv1.softwares || []).length !== (inv2.softwares || []).length) return false;
    
    return true;
  } catch (e) {
    return false;
  }
}

function createFriendlyError(err, contextMsg) {
  let friendlyMsg = contextMsg;
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    friendlyMsg += ': Servidor inacessível ou sem conexão com a intranet COPPEAD.';
  } else if (err.response) {
    friendlyMsg += `: Servidor retornou código HTTP ${err.response.status}`;
  } else {
    friendlyMsg += `: ${err.message}`;
  }
  const errorObj = new Error(friendlyMsg);
  errorObj.messageFriendly = friendlyMsg;
  errorObj.originalError = err;
  return errorObj;
}


function saveConfig(cfg) {
  try {
    const cfgPath = getConfigPath();
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    // Cria uma cópia com os tokens criptografados para salvar no disco
    const secureCfg = {
      ...cfg,
      appToken: encryptToken(cfg.appToken),
      userToken: encryptToken(cfg.userToken)
    };
    
    fs.writeFileSync(cfgPath, JSON.stringify(secureCfg, null, 2));
  } catch (e) {
    console.error('[GLPI-API] Erro ao salvar glpi-config.json:', e.message);
  }
}


let _config = loadConfig();

// ─── Criação do cliente HTTP (com suporte a CA interna e bypass para intranet) ───
function buildClient() {
  if (!axios) throw new Error('axios não instalado');

  const opts = { timeout: 15000 };

  // Suporte ao certificado CA interno (intranet corporativa)
  const caPath = path.join(__dirname, '..', '..', 'certs', 'ca-cert.pem');
  
  let rejectUnauthorized = true;
  
  // Em desenvolvimento (fora de produção) ou se for um servidor de testes localhost,
  // podemos aceitar TLS inválido de forma facilitada para o desenvolvedor.
  // Em produção (app.isPackaged === true), a validação de TLS é obrigatória e estrita.
  try {
    const { app } = require('electron');
    if (app && !app.isPackaged) {
      rejectUnauthorized = false;
    }
  } catch (err) {
    // Fora do Electron (ex: scripts Node simples), desabilita rejectUnauthorized apenas para testes locais
    rejectUnauthorized = false;
  }
  
  // Se for domínio da intranet da COPPEAD, não exigimos validação rígida de SSL em produção
  // para permitir que certificados corporativos internos ou autoassinados funcionem perfeitamente.
  const targetUrl = _config.glpiUrl || '';
  const isCoppead = targetUrl.includes('.coppead.ufrj.br') || targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
  if (isCoppead) {
    rejectUnauthorized = false;
  }
  
  const agentOpts = { rejectUnauthorized };
  if (fs.existsSync(caPath)) {
    agentOpts.ca = fs.readFileSync(caPath);
  }
  
  opts.httpsAgent = new https.Agent(agentOpts);

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

  if (!_config.appToken) {
    _config.appToken = 'KEFWiWcIFqIJNTpUOJksKMt6OmnBoGT6V1JCvX0F';
  }

  if (!_config.glpiUrl) {
    throw new Error('GLPI não configurado. Configure a URL e o App-Token nas Configurações.');
  }

  const client = buildClient();
  const headers = {
    'App-Token': _config.appToken,
    'Content-Type': 'application/json',
  };

  // Auth por user_token ou Basic Auth
  if (_config.userToken) {
    if (_config.userToken.length < 20) {
      // Se for curto (senha), usa Basic Auth com o usuário logado no SO
      const username = os.userInfo().username;
      const credentials = Buffer.from(`${username}:${_config.userToken}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
      console.log(`[GLPI-API] Autenticando com Basic Auth via usuario local: ${username}`);
    } else {
      headers['Authorization'] = `user_token ${_config.userToken}`;
      console.log('[GLPI-API] Autenticando com User-Token direto');
    }
  } else {
    console.log('[GLPI-API] Tentando inicializar sessão sem token de usuário (anônimo ou apenas com App-Token)');
  }

  const res = await client.get(`${_config.glpiUrl}/apirest.php/initSession`, { headers });

  if (!res.data || !res.data.session_token) {
    throw new Error('Falha na autenticação com GLPI: session_token não retornado');
  }

  _config.sessionToken = res.data.session_token;
  _config.sessionExpiry = now + 28 * 60 * 1000; // 28 minutos
  saveConfig(_config);

  console.log('[GLPI-API] Sessão com GLPI inicializada com sucesso. Token:', _config.sessionToken ? '***' : 'null');
  return _config.sessionToken;
}

/**
 * Autentica no GLPI via LDAP usando usuário e senha do Windows.
 * A senha NUNCA é armazenada — apenas o session_token resultante é salvo.
 *
 * @param {string} login  - Nome de usuário (sem domínio, ex: "felipe.bandeira")
 * @param {string} password - Senha do Active Directory / LDAP
 * @returns {Promise<{ok: boolean, message: string, userName?: string}>}
 */
async function loginWithCredentials(login, password) {
  if (!login || !password) {
    throw new Error('Usuário e senha são obrigatórios.');
  }

  if (!_config.glpiUrl) {
    throw new Error('URL do GLPI não configurada.');
  }

  if (!_config.appToken) {
    _config.appToken = 'KEFWiWcIFqIJNTpUOJksKMt6OmnBoGT6V1JCvX0F';
  }

  const client = buildClient();
  const credentials = Buffer.from(`${login}:${password}`).toString('base64');

  logger.info(`[AUTH] Autenticando usuário "${login}" via LDAP/Basic Auth`, 'GLPI-API');

  const res = await client.get(`${_config.glpiUrl}/apirest.php/initSession`, {
    headers: {
      'App-Token': _config.appToken,
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    }
  });

  if (!res.data || !res.data.session_token) {
    throw new Error('Autenticação falhou: resposta inválida do servidor GLPI.');
  }

  // Salva o session_token (criptografado) — jamais a senha
  _config.sessionToken = res.data.session_token;
  _config.sessionExpiry = Date.now() + 28 * 60 * 1000;
  _config.userToken = ''; // limpa user_token manual se existia
  saveConfig(_config);

  logger.info(`[AUTH] Usuário "${login}" autenticado com sucesso no GLPI via LDAP.`, 'GLPI-API');

  // Tenta buscar o nome completo do usuário no GLPI
  let userName = login;
  try {
    const userRes = await client.get(`${_config.glpiUrl}/apirest.php/getMyProfiles`, {
      headers: { 'App-Token': _config.appToken, 'Session-Token': _config.sessionToken }
    });
    if (userRes.data && userRes.data.myprofiles && userRes.data.myprofiles.length > 0) {
      const profile = userRes.data.myprofiles[0];
      if (profile.entities && profile.entities[0] && profile.entities[0].name) {
        userName = login; // mantém login pois GLPI não retorna nome completo aqui
      }
    }
  } catch (e) { /* ignora */ }

  return { ok: true, message: `Autenticado como ${login}`, userName };
}

/**
 * Retorna o nome de usuário do SO (sem domínio) para pré-preencher o login
 */
function getWindowsUser() {
  return os.userInfo().username;
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
        searchText: login,
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
/**
 * Busca o ID do computador local (hostname do SO) no GLPI.
 */
async function findLocalComputerId() {
  const hostname = os.hostname();
  const client = buildClient();
  const headers = await authHeaders();
  
  try {
    const res = await client.get(`${_config.glpiUrl}/apirest.php/Computer`, {
      headers,
      params: { range: '0-300' }
    });
    
    if (Array.isArray(res.data)) {
      const match = res.data.find(c => c.name && c.name.toLowerCase() === hostname.toLowerCase());
      if (match) {
        console.log(`[GLPI-API] Computador local encontrado no GLPI. Nome: ${match.name}, ID: ${match.id}`);
        return match.id;
      }
    }
  } catch (e) {
    console.error('[GLPI-API] Erro ao buscar ID do computador local:', e.message);
  }
  return null;
}

/**
 * Associa um dispositivo (computador) a um chamado no GLPI via Item_Ticket.
 */
async function associateComputerToTicket(ticketId, computerId) {
  const client = buildClient();
  const headers = await authHeaders();
  const payload = {
    input: {
      tickets_id: parseInt(ticketId),
      itemtype: 'Computer',
      items_id: parseInt(computerId)
    }
  };
  
  const res = await client.post(`${_config.glpiUrl}/apirest.php/Item_Ticket`, payload, { headers });
  return res.data;
}

async function createTicket({ title, description, categoryId, urgency = 3, userId, hostname, ip, osVersion }) {
  const client = buildClient();
  let headers;
  try {
    headers = await authHeaders();
  } catch (e) {
    logger.error('Erro de autenticação ao tentar criar ticket', e, 'GLPI-API');
    throw createFriendlyError(e, 'Erro de autenticação com o GLPI. Verifique as credenciais.');
  }

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

  const url = `${_config.glpiUrl}/apirest.php/Ticket`;
  logger.info(`Abrindo chamado técnico: "${title}"`, 'GLPI-API');

  try {
    const res = await client.post(url, payload, { headers });
    const ticketId = res.data.id;
    logger.info(`Chamado #${ticketId} criado com sucesso no GLPI!`, 'GLPI-API');
    
    // Associa automaticamente o computador local ao chamado recém-criado
    try {
      const compId = await findLocalComputerId();
      if (compId) {
        logger.info(`Associando computador local (ID: ${compId}) ao chamado criado #${ticketId}...`, 'GLPI-API');
        await associateComputerToTicket(ticketId, compId);
      } else {
        logger.warn('Computador local não encontrado no GLPI para associação.', 'GLPI-API');
      }
    } catch (assocErr) {
      logger.error('Erro ao associar computador ao chamado criado', assocErr, 'GLPI-API');
    }

    return res.data;
  } catch (e) {
    logger.error('Falha ao abrir chamado no GLPI', e, 'GLPI-API');
    throw createFriendlyError(e, 'Falha ao criar o chamado no GLPI.');
  }
}

/**
 * Lista os chamados do usuário atual
 * @param {number} userId - ID do usuário no GLPI
 */
async function getMyTickets(userId) {
  const client = buildClient();
  const headers = await authHeaders();

  const params = {
    range: '0-150',
    sort: 'date_mod',
    order: 'DESC',
  };

  const res = await client.get(`${_config.glpiUrl}/apirest.php/Ticket`, { headers, params });
  let tickets = Array.isArray(res.data) ? res.data : [];

  try {
    const profileRes = await getMyProfile();
    const profiles = profileRes.myprofiles || [];
    const isSuperAdmin = profiles.some(p => p.name && p.name.toLowerCase().includes('super-admin'));
    if (!isSuperAdmin && userId) {
      console.log(`[GLPI-API] Usuário ID ${userId} não é Super-Admin. Filtrando chamados por requerente.`);
      tickets = tickets.filter(t => t.users_id_recipient == userId);
    }
  } catch (err) {
    console.error('[GLPI-API] Erro ao filtrar chamados por perfil:', err.message);
  }

  return tickets;
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
  // Validar se as URLs fornecidas pertencem aos domínios autorizados pela política de segurança
  if (glpiUrl && !isDomainAllowed(glpiUrl)) {
    return { ok: false, message: 'URL do GLPI rejeitada pela política de segurança da rede COPPEAD.' };
  }
  if (meshUrl && !isDomainAllowed(meshUrl)) {
    return { ok: false, message: 'URL do MeshCentral rejeitada pela política de segurança da rede COPPEAD.' };
  }

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

async function testConnection() {
  try {
    await killSession(); // força nova sessão
    const token = await initSession();
    const client = buildClient();
    const headers = await authHeaders();
    const res = await client.get(`${_config.glpiUrl}/apirest.php/getMyProfiles`, { headers });
    logger.info('Teste de conexão com o GLPI bem-sucedido!', 'GLPI-API');
    diagManager.updateGlpiStatus('connected');
    return { ok: true, message: 'Conexão com GLPI bem-sucedida! (Sessão de usuário inicializada)', profiles: res.data };
  } catch (e) {
    let msg = e.message;
    if (e.response && e.response.data) {
      const data = e.response.data;
      // ERROR_LOGIN_PARAMETERS_MISSING means the server is online and App-Token is valid
      if (Array.isArray(data) && data.includes('ERROR_LOGIN_PARAMETERS_MISSING')) {
        logger.info('Teste de conexão com o GLPI bem-sucedido (App-Token aceito)!', 'GLPI-API');
        diagManager.updateGlpiStatus('connected');
        return { ok: true, message: 'Conexão com GLPI bem-sucedida! (Servidor alcançado e App-Token aceito)' };
      }
      if (Array.isArray(data) && data[1]) {
        msg = data[1];
      } else if (typeof data === 'object' && data.message) {
        msg = data.message;
      }
    }
    logger.error('Falha no teste de conexão com o GLPI', e, 'GLPI-API');
    diagManager.updateGlpiStatus('error');
    return { ok: false, message: msg };
  }
}

/**
 * Envia o inventário JSON nativo para o GLPI via endpoint /front/inventory.php
 * @param {Object} inventoryData - Objeto de inventário coletado
 * @param {string} type - Tipo de envio ('auto' ou 'force')
 */
async function sendInventory(inventoryData, type = 'auto') {
  if (!_config.glpiUrl) {
    const err = new Error('GLPI não configurado. Configure a URL nas Configurações.');
    err.messageFriendly = err.message;
    throw err;
  }

  const cacheFile = getCachePath('last-sent-inventory.json');
  const offlineFile = getCachePath('offline-inventory.json');

  // 1. Delta Sync check (se não for envio forçado)
  if (type === 'auto' && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (isInventoryEqual(inventoryData, cached)) {
        logger.info('Sincronização de inventário pulada: Nenhuma alteração estrutural detectada (Delta zero).', 'INVENTORY');
        diagManager.updateGlpiStatus('connected');
        diagManager.registerSyncSuccess('auto', 'Sincronização pulada (Delta zero - Sem alterações)');
        return { success: true, skipped: true, message: 'Nenhuma alteração estrutural detectada.' };
      }
    } catch (e) {
      logger.warn('Falha ao comparar inventário com cache local: ' + e.message, 'INVENTORY');
    }
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

  try {
    const res = await client.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Registra sucesso nos diagnósticos
    diagManager.updateGlpiStatus('connected');
    diagManager.registerSyncSuccess(type, 'Inventário transmitido com sucesso!');

    // Salva o cache de inventário local para futuros delta checks
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(inventoryData, null, 2));
    } catch (cacheErr) {
      logger.warn('Falha ao gravar cache local de inventário: ' + cacheErr.message, 'INVENTORY');
    }

    return res.data;
  } catch (err) {
    // Registra falha estruturada nos diagnósticos
    diagManager.updateGlpiStatus('error');
    diagManager.registerSyncFailure(type, err.messageFriendly || err.message);
    throw err;
  }
}

async function updateTicketStatus(ticketId, status) {
  return updateTicket(ticketId, { status: parseInt(status) });
}

async function updateTicket(ticketId, fields) {
  const client = buildClient();
  const headers = await authHeaders();
  
  const formattedFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === '' || value === null || value === undefined) {
      formattedFields[key] = null;
    } else {
      const num = Number(value);
      formattedFields[key] = isNaN(num) ? value : num;
    }
  }

  const payload = {
    input: {
      id: parseInt(ticketId),
      ...formattedFields
    }
  };
  const res = await client.put(`${_config.glpiUrl}/apirest.php/Ticket/${ticketId}`, payload, { headers });
  return res.data;
}

async function getLocations() {
  const client = buildClient();
  const headers = await authHeaders();
  const res = await client.get(`${_config.glpiUrl}/apirest.php/Location`, {
    headers,
    params: { range: '0-150', sort: 'name', order: 'ASC' },
  });
  return Array.isArray(res.data) ? res.data : [];
}

async function uploadDocument(ticketId, fileName, buffer) {
  const client = buildClient();
  const headers = await authHeaders();
  
  const formData = new FormData();
  formData.append('uploadManifest', JSON.stringify({
    input: {
      name: fileName,
      itemtype: 'Ticket',
      items_id: parseInt(ticketId)
    }
  }));
  
  // Garante que o buffer recebido do IPC seja instanciado como Buffer Node seguro
  const safeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const fileBlob = new Blob([safeBuffer]);
  formData.append('filename[0]', fileBlob, fileName);

  const reqHeaders = { ...headers };
  delete reqHeaders['Content-Type'];

  const res = await client.post(`${_config.glpiUrl}/apirest.php/Document`, formData, {
    headers: reqHeaders
  });
  return res.data;
}

async function getTicketDocuments(ticketId) {
  const client = buildClient();
  const headers = await authHeaders();
  try {
    const res = await client.get(`${_config.glpiUrl}/apirest.php/Ticket/${ticketId}/Document`, { headers });
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    return [];
  }
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
  updateTicketStatus,
  updateTicket,
  // Categories
  getCategories,
  // Locations
  getLocations,
  // Inventory
  sendInventory,
  // Documents
  uploadDocument,
  getTicketDocuments
};


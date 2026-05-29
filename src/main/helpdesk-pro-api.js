/**
 * helpdesk-pro-api.js — Integração com o novo backend NestJS HelpDesk Pro
 *
 * Endpoints suportados:
 *   POST /api/v1/computers/agent  — registrar/atualizar computador no startup
 *   POST /api/v1/tickets          — criar chamado técnico com telemetria
 *   GET  /api/v1/health           — verificar conectividade
 */

const https = require('https');
const http = require('http');
const os = require('os');
const logger = require('./logger');

function getConfig() {
  const glpiApi = require('./glpi-api');
  const cfg = glpiApi.getGlpiConfig();
  return {
    baseUrl: cfg.helpdeskProUrl || '',
    apiKey: cfg.helpdeskProApiKey || ''
  };
}

/**
 * Faz uma requisição JSON ao backend HelpDesk Pro.
 * Usa TLS permissivo para suportar CA interna da COPPEAD.
 */
function request(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const { baseUrl, apiKey } = getConfig();
    if (!baseUrl) return reject(new Error('URL do HelpDesk Pro não configurada nas configurações do agente.'));

    let parsed;
    try {
      parsed = new URL(baseUrl.replace(/\/$/, '') + endpoint);
    } catch (e) {
      return reject(new Error(`URL inválida: ${baseUrl}${endpoint}`));
    }

    const isHttps = parsed.protocol === 'https:';
    const payload = (body && method !== 'GET') ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (apiKey) headers['X-API-Key'] = apiKey;

    const options = {
      hostname: parsed.hostname,
      port: parseInt(parsed.port || (isHttps ? 443 : 80)),
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers,
      rejectUnauthorized: false
    };

    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.message || data.slice(0, 200)}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({});
          } else {
            reject(new Error(`HTTP ${res.statusCode}: resposta inválida do servidor`));
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Timeout ao conectar ao HelpDesk Pro')));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Registra ou atualiza este computador no HelpDesk Pro ao iniciar o agente.
 * POST /api/v1/computers/agent
 */
async function registerComputer(metrics) {
  try {
    const result = await request('POST', '/api/v1/computers/agent', {
      hostname:     metrics.hostname    || os.hostname(),
      ip:           metrics.ip          || '',
      osType:       metrics.osType      || '',
      osRelease:    metrics.osRelease   || '',
      arch:         metrics.arch        || os.arch(),
      cpuModel:     metrics.cpuModel    || '',
      cpuCores:     metrics.cpuCores    || os.cpus().length,
      totalMem:     metrics.totalMem    || '',
      csVendor:     metrics.csVendor    || '',
      csModel:      metrics.csModel     || '',
      biosSerial:   metrics.biosSerial  || '',
      boardVendor:  metrics.boardVendor || '',
      boardModel:   metrics.boardModel  || '',
      vm:           metrics.vm          || 'Não',
      deviceType:   metrics.deviceType  || 'Computador',
      agentVersion: '1.0.0'
    });
    logger.info(`Computador registrado no HelpDesk Pro: ${metrics.hostname || os.hostname()}`, 'HDP-API');
    return { ok: true, data: result };
  } catch (e) {
    logger.warn(`Falha ao registrar computador no HelpDesk Pro: ${e.message}`, 'HDP-API');
    return { ok: false, message: e.message };
  }
}

/**
 * Cria um chamado no HelpDesk Pro.
 * POST /api/v1/tickets
 */
async function createTicket(opts) {
  const result = await request('POST', '/api/v1/tickets', {
    title:       opts.title,
    description: opts.description,
    category:    opts.category    || '',
    urgency:     opts.urgency     || 3,
    requesterId: opts.requesterId || null,
    hostname:    opts.hostname    || os.hostname(),
    ip:          opts.ip          || '',
    osVersion:   opts.osVersion   || (os.type() + ' ' + os.release())
  });
  logger.info(`Chamado criado no HelpDesk Pro: "${opts.title}"`, 'HDP-API');
  return result;
}

/**
 * Verifica conectividade com o backend HelpDesk Pro.
 * GET /api/v1/health
 */
async function testConnection() {
  try {
    await request('GET', '/api/v1/health', null);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = { registerComputer, createTicket, testConnection };

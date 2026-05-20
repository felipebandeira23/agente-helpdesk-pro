/**
 * inventory-scheduler.js — Serviço de agendamento resiliente de inventário com backoff e proteção de recursos
 */

const { collectInventory, isSystemUnderHeavyLoad } = require('../inventory-collector');
const glpiApi = require('../glpi-api');
const logger = require('../logger');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const backoffIntervals = [
  1 * 60 * 1000,   // 1 minuto
  5 * 60 * 1000,   // 5 minutos
  15 * 60 * 1000,  // 15 minutos
  30 * 60 * 1000,  // 30 minutos
  60 * 60 * 1000   // 1 hora
];

let retryCount = 0;
let schedulerTimeout = null;
let offlineQueueInterval = null;

function getOfflineFilePath() {
  try {
    return path.join(app.getPath('userData'), 'offline-inventory.json');
  } catch (e) {
    const os = require('os');
    return path.join(os.homedir(), '.helpdesk-pro', 'offline-inventory.json');
  }
}

/**
 * Inicia o agendador de inventário recorrente e verificador de fila offline
 */
function startInventoryScheduler() {
  logger.info('Agendador de inventário inicializado.', 'SCHEDULER');
  
  // 1. Agenda a primeira coleta para 3 minutos após a inicialização
  schedulerTimeout = setTimeout(runScheduledInventory, 3 * 60 * 1000);

  // 2. Inicia o monitor de fila offline a cada 10 minutos
  if (offlineQueueInterval) clearInterval(offlineQueueInterval);
  offlineQueueInterval = setInterval(checkOfflineQueue, TEN_MINUTES);
}

/**
 * Roda a rotina de inventário agendada
 */
async function runScheduledInventory() {
  try {
    // A. Proteção de Carga de Recursos
    const load = await isSystemUnderHeavyLoad();
    if (load.isHeavy) {
      logger.warn(`Sistema sob carga crítica (CPU: ${load.cpu}%, RAM livre: ${load.ramPercent}%). Coleta postergada por 10 minutos para proteger performance.`, 'SCHEDULER');
      
      if (schedulerTimeout) clearTimeout(schedulerTimeout);
      schedulerTimeout = setTimeout(runScheduledInventory, TEN_MINUTES);
      return;
    }

    logger.info('Iniciando coleta automática de inventário...', 'SCHEDULER');
    const data = await collectInventory();
    
    // B. Envia para o GLPI
    await glpiApi.sendInventory(data, 'auto');
    logger.info('Coleta automática de inventário enviada com sucesso.', 'SCHEDULER');
    
    // Reseta contador de retries em caso de sucesso
    retryCount = 0;
    
    // Re-agenda para daqui 24 horas
    if (schedulerTimeout) clearTimeout(schedulerTimeout);
    schedulerTimeout = setTimeout(runScheduledInventory, TWENTY_FOUR_HOURS);
  } catch (err) {
    // C. Backoff Exponencial em caso de falha de conexão
    const delay = backoffIntervals[Math.min(retryCount, backoffIntervals.length - 1)];
    retryCount++;
    
    logger.error(`Falha ao sincronizar inventário automático (Tentativa ${retryCount}). Reagendado em ${Math.round(delay / 1000 / 60)}m. Motivo: ${err.message}`, err, 'SCHEDULER');
    
    // Salva o inventário localmente como offline-queue em caso de falha de rede/servidor offline
    try {
      const data = await collectInventory();
      const offlinePath = getOfflineFilePath();
      fs.writeFileSync(offlinePath, JSON.stringify(data, null, 2));
      logger.warn('Inventário salvo localmente na fila offline devido a falha de transmissão.', 'SCHEDULER');
    } catch (saveErr) {
      logger.error('Falha ao gravar fila offline local', saveErr, 'SCHEDULER');
    }

    if (schedulerTimeout) clearTimeout(schedulerTimeout);
    schedulerTimeout = setTimeout(runScheduledInventory, delay);
  }
}

/**
 * Verifica se há inventários salvos localmente na fila offline e tenta enviar
 */
async function checkOfflineQueue() {
  const offlinePath = getOfflineFilePath();
  if (!fs.existsSync(offlinePath)) return;

  logger.info('Fila de inventário offline detectada. Tentando transmitir para o servidor...', 'SCHEDULER');
  try {
    const raw = fs.readFileSync(offlinePath, 'utf8');
    const data = JSON.parse(raw);
    
    // Tenta enviar (usando 'force' para forçar upload do cache antigo sem delta skip)
    await glpiApi.sendInventory(data, 'force');
    
    // Remove o arquivo de fila em caso de sucesso
    fs.unlinkSync(offlinePath);
    logger.info('Fila offline enviada com sucesso! Arquivo temporário excluído.', 'SCHEDULER');
  } catch (err) {
    logger.warn(`Não foi possível enviar a fila offline de inventário: ${err.message}. Retentando no próximo ciclo.`, 'SCHEDULER');
  }
}

module.exports = {
  startInventoryScheduler,
  runScheduledInventory
};

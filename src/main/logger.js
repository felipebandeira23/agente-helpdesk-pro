const fs = require('fs');
const path = require('path');

let userDataPath = '';
try {
  const { app } = require('electron');
  if (app) {
    userDataPath = app.getPath('userData');
  }
} catch (e) {
  // Fallback para CLI Node externa (como scripts de testes)
  userDataPath = path.join(process.cwd(), 'temp-userdata');
}

const logsDir = path.join(userDataPath, 'logs');
const logFile = path.join(logsDir, 'app.log');

// Garante que o diretório de logs existe
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (e) {
  console.error('[LOGGER] Falha ao criar diretório de logs:', e.message);
}

/**
 * Escreve uma mensagem de log formatada
 */
function writeLog(level, context, message, err = null) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const padMs = (n) => String(n).padStart(3, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${padMs(now.getMilliseconds())}`;
  
  let logText = `[${timestamp}] [${level}] [${context ? context.toUpperCase() : 'SYSTEM'}] ${message}`;
  
  if (err) {
    if (err.messageFriendly && err.messageFriendly !== message) {
      logText += ` | Friendly: ${err.messageFriendly}`;
    }
    logText += ` | Error: ${err.message || err}`;
    if (err.stack) {
      logText += `\nStack trace:\n${err.stack}`;
    }
  }
  
  logText += '\n';

  // Print to terminal/console for developer visibility
  if (level === 'ERROR') {
    console.error(`[CONSOLE-ERR] ${logText.trim()}`);
  } else if (level === 'WARN') {
    console.warn(`[CONSOLE-WARN] ${logText.trim()}`);
  } else {
    console.log(`[CONSOLE-INFO] ${logText.trim()}`);
  }

  // Append directly to app.log on disk
  try {
    // Rotation Check (5MB threshold)
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size > 5 * 1024 * 1024) {
        const backupFile = logFile + '.old';
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(logFile, backupFile);
      }
    }
    
    fs.appendFileSync(logFile, logText);
  } catch (e) {
    console.error('[LOGGER] Erro ao gravar log no disco:', e.message);
  }
}

/**
 * Retorna as últimas linhas do arquivo de log
 */
function getRecentLogs(linesCount = 100) {
  try {
    if (!fs.existsSync(logFile)) {
      return 'Nenhum log gravado ainda.';
    }
    
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length <= linesCount) {
      return content;
    }
    return lines.slice(lines.length - linesCount).join('\n');
  } catch (e) {
    return `Erro ao ler arquivo de logs: ${e.message}`;
  }
}

/**
 * Limpa o arquivo de logs sob demanda
 */
function clearLogs() {
  try {
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, `[${new Date().toISOString()}] [INFO] [SYSTEM] Logs limpos pelo usuário.\n`);
    }
    return true;
  } catch (e) {
    console.error('[LOGGER] Erro ao limpar logs:', e.message);
    return false;
  }
}

module.exports = {
  info: (message, context) => writeLog('INFO', context, message),
  warn: (message, context) => writeLog('WARN', context, message),
  error: (message, err, context) => writeLog('ERROR', context, message, err),
  getRecentLogs,
  clearLogs,
  logFile
};

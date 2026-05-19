const { app, BrowserWindow, ipcMain, Tray, Menu, shell, Notification } = require('electron');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const fs = require('fs');

function getAssetPath(relativeChildPath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', relativeChildPath);
  } else {
    return path.join(__dirname, '..', 'assets', relativeChildPath);
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


// GLPI API Module
const glpiApi = require('./main/glpi-api');

let mainWindow;
let tray = null;

const isHidden = process.argv.includes('--hidden');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 650,
    title: "Agente Helpdesk Pro",
    icon: path.join(__dirname, 'assets/icon.png'),
    show: !isHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden']
    });

    createWindow();
    ensureMeshAgentInstalled();

    // Check if icon exists, fallback if not
    let iconPath = path.join(__dirname, 'assets/icon.ico');
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, 'assets/icon.png');
    }
    
    try {
      if (fs.existsSync(iconPath)) {
        tray = new Tray(iconPath);
      } else {
        const dummyIcon = path.join(__dirname, 'renderer/favicon.ico');
        if (fs.existsSync(dummyIcon)) {
          tray = new Tray(dummyIcon);
        }
      }
    } catch (e) {
      console.warn("Falha ao inicializar o ícone da bandeja com ico, tentando png...", e.message);
      try {
        const pngPath = path.join(__dirname, 'assets/icon.png');
        if (fs.existsSync(pngPath)) {
          tray = new Tray(pngPath);
        }
      } catch (err) {
        console.warn("Falha ao inicializar o ícone da bandeja:", err.message);
      }
    }

    if (tray) {
      try {
        const contextMenu = Menu.buildFromTemplate([
          { label: 'Abrir Agente Helpdesk Pro', click: () => mainWindow.show() }
        ]);
        tray.setToolTip('Agente Helpdesk Pro');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => mainWindow.show());
      } catch (err) {
        console.warn("Falha ao configurar menu do ícone da bandeja:", err.message);
      }
    }

    startInventoryScheduler();
  });

  function startInventoryScheduler() {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    // Run once shortly after startup (e.g. after 3 minutes)
    setTimeout(async () => {
      try {
        console.log('[SCHEDULER] Iniciando coleta de inventário automática inicial...');
        const { collectInventory } = require('./main/inventory-collector');
        const data = await collectInventory();
        await glpiApi.sendInventory(data);
        console.log('[SCHEDULER] Inventário automático inicial enviado com sucesso!');
      } catch (e) {
        console.error('[SCHEDULER] Falha no inventário automático inicial:', e.message);
      }
    }, 3 * 60 * 1000);

    // Set recurring interval
    setInterval(async () => {
      try {
        console.log('[SCHEDULER] Iniciando coleta de inventário automática periódica...');
        const { collectInventory } = require('./main/inventory-collector');
        const data = await collectInventory();
        await glpiApi.sendInventory(data);
        console.log('[SCHEDULER] Inventário automático periódico enviado com sucesso!');
      } catch (e) {
        console.error('[SCHEDULER] Falha no inventário automático periódico:', e.message);
      }
    }, TWENTY_FOUR_HOURS);
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// Shell opening external link securely
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Telemetry PowerShell spawn handler (highly secure, non-encoded, direct pipeline)
ipcMain.handle('get-system-metrics', async () => {
  return new Promise((resolve) => {
    const psScript = `
$os = Get-CimInstance Win32_OperatingSystem;
$cs = Get-CimInstance Win32_ComputerSystem;
$bios = Get-CimInstance Win32_BIOS;
$board = Get-CimInstance Win32_BaseBoard;
$extIp = try { (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 2) } catch { "Desconhecido" };
$vm = if ($cs.Model -match "Virtual|VMware|VirtualBox|Xen|Bochs|QEMU") { "Sim" } else { "Não" };
$type = if ($cs.PCSystemType -eq 2) { "Notebook" } else { "Computador" };
@{ osName = $os.Caption; osBuild = $os.BuildNumber; osArch = $os.OSArchitecture; csModel = $cs.Model; csVendor = $cs.Manufacturer; biosSerial = $bios.SerialNumber; boardModel = $board.Product; boardVendor = $board.Manufacturer; boardSerial = $board.SerialNumber; extIp = $extIp; vm = $vm; deviceType = $type } | ConvertTo-Json -Compress
`;

    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-']);
    let stdoutData = '';
    
    proc.stdout.on('data', (d) => { stdoutData += d.toString(); });
    
    proc.on('close', () => {
      let psData = {};
      try {
        const jsonStr = stdoutData.trim();
        if (jsonStr.startsWith('{')) psData = JSON.parse(jsonStr);
      } catch(e) {}
      
      const cpus = os.cpus();
      resolve({
        osType: psData.osName || (os.type() === 'Windows_NT' ? 'Microsoft Windows' : os.type()),
        osRelease: psData.osBuild || os.release(),
        arch: psData.osArch || os.arch(),
        totalMem: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
        cpuModel: (cpus && cpus.length > 0) ? cpus[0].model : 'Desconhecido',
        cpuCores: (cpus ? cpus.length : 0),
        hostname: os.hostname(),
        username: os.userInfo().username,
        ip: Object.values(os.networkInterfaces()).flat().find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || 'Desconhecido',
        extIp: psData.extIp || 'Desconhecido',
        vm: psData.vm || 'Não',
        deviceType: psData.deviceType || 'Computador',
        csVendor: psData.csVendor || 'Desconhecido',
        csModel: psData.csModel || 'Desconhecido',
        biosSerial: psData.biosSerial || 'Desconhecido',
        boardModel: psData.boardModel || 'Desconhecido',
        boardVendor: psData.boardVendor || 'Desconhecido',
        boardSerial: psData.boardSerial || 'Desconhecido'
      });
    });
    
    proc.stdin.write(psScript);
    proc.stdin.end();
  });
});

ipcMain.handle('get-os-user', () => {
  return {
    username: os.userInfo().username,
    domain: process.env.USERDOMAIN || '',
    hostname: os.hostname(),
    ip: Object.values(os.networkInterfaces()).flat().find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || 'Desconhecido'
  };
});

ipcMain.handle('force-inventory', async () => {
  try {
    const { collectInventory } = require('./main/inventory-collector');
    
    if (mainWindow) {
      mainWindow.webContents.send('inventory-progress', { status: 'collecting', message: 'Coletando dados do hardware...' });
    }
    
    const inventoryData = await collectInventory();
    
    if (mainWindow) {
      mainWindow.webContents.send('inventory-progress', { status: 'sending', message: 'Enviando inventário para o GLPI...' });
    }
    
    const response = await glpiApi.sendInventory(inventoryData);
    console.log('[MAIN] Resposta do inventário GLPI:', response);
    
    if (mainWindow) {
      mainWindow.webContents.send('inventory-progress', { status: 'success', message: 'Inventário sincronizado com sucesso!' });
    }
    
    return { success: true, response };
  } catch (e) {
    console.error('[MAIN] Falha no force-inventory:', e);
    if (mainWindow) {
      mainWindow.webContents.send('inventory-progress', { status: 'error', message: `Erro na sincronização: ${e.message}` });
    }
    return { success: false, error: e.message };
  }
});

// ─── GLPI API IPC Handlers ─────────────────────────────────────────────────

ipcMain.handle('glpi-get-config', () => glpiApi.getGlpiConfig());

ipcMain.handle('glpi-set-config', async (event, cfg) => {
  return glpiApi.setGlpiConfig(cfg);
});

ipcMain.handle('glpi-test-connection', async () => {
  try { return await glpiApi.testConnection(); }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('glpi-get-categories', async () => {
  try { return await glpiApi.getCategories(); }
  catch (e) { return []; }
});

ipcMain.handle('glpi-get-tickets', async (event, userId) => {
  try { return await glpiApi.getMyTickets(userId); }
  catch (e) { return []; }
});

ipcMain.handle('glpi-create-ticket', async (event, opts) => {
  try {
    const sysInfo = await ipcMain._events['handle:get-os-user']?.(); // fallback
    const extra = {
      hostname: os.hostname(),
      ip: Object.values(os.networkInterfaces()).flat()
        .find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || '',
      osVersion: os.type() + ' ' + os.release(),
    };
    return await glpiApi.createTicket({ ...opts, ...extra });
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('glpi-get-followups', async (event, ticketId) => {
  try { return await glpiApi.getTicketFollowups(ticketId); }
  catch (e) { return []; }
});

ipcMain.handle('glpi-add-followup', async (event, { ticketId, message }) => {
  try { return await glpiApi.addFollowup(ticketId, message); }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('glpi-find-user', async (event, login) => {
  try { return await glpiApi.findUserByLogin(login); }
  catch (e) { return null; }
});

ipcMain.handle('glpi-get-user-role', async () => {
  try {
    const profilesRes = await glpiApi.getMyProfile();
    const profiles = profilesRes.myprofiles || [];
    const isSuperAdmin = profiles.some(p => p.name && p.name.toLowerCase().includes('super-admin'));
    const isTecnico = profiles.some(p => p.name && (
      p.name.toLowerCase().includes('técnico') || 
      p.name.toLowerCase().includes('tecnico') || 
      p.name.toLowerCase().includes('gerência') || 
      p.name.toLowerCase().includes('supervisor')
    ));
    return { isSuperAdmin, isTecnico };
  } catch (e) {
    return { isSuperAdmin: false, isTecnico: false };
  }
});

ipcMain.handle('glpi-update-ticket-status', async (event, { ticketId, status }) => {
  try {
    return await glpiApi.updateTicketStatus(ticketId, status);
  } catch (e) {
    return { error: e.message };
  }
});


ipcMain.handle('check-mesh-agent', async () => {
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
});

ipcMain.handle('test-mesh-connection', async (event, meshUrl) => {
  return new Promise((resolve) => {
    if (!meshUrl) {
      resolve({ ok: false, message: 'URL do MeshCentral não informada.' });
      return;
    }
    const cleanUrl = meshUrl.replace(/\/$/, '');
    const https = require('https');
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    const req = https.get(cleanUrl, { agent, timeout: 5000 }, (res) => {
      resolve({ ok: true, message: `Conectado com sucesso! Código HTTP: ${res.statusCode}` });
    });
    
    req.on('error', (err) => {
      resolve({ ok: false, message: `Falha na conexão: ${err.message}` });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, message: 'Tempo limite esgotado ao tentar conectar.' });
    });
  });
});

// Send native Windows notification when called from renderer
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

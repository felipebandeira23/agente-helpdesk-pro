const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Importação do Core Logger e Estado de Diagnóstico
const logger = require('./main/logger');
const diagManager = require('./main/diagnostics-manager');
const glpiApi = require('./main/glpi-api');
const updateManager = require('./main/update-manager');

// Importação de Serviços Modularizados
const { startInventoryScheduler } = require('./main/services/inventory-scheduler');
const { startNotificationScheduler } = require('./main/services/notification-scheduler');

// Importação de Roteadores IPC Modularizados
const { registerSystemIPCHandlers } = require('./main/ipc/system');
const { registerGlpiIPCHandlers } = require('./main/ipc/glpi');
const { registerMeshIPCHandlers } = require('./main/ipc/mesh');
const { registerUpdatesIPCHandlers } = require('./main/ipc/updates');
const { registerHelpdeskProIPCHandlers } = require('./main/ipc/helpdesk-pro');
const hdpApi = require('./main/helpdesk-pro-api');

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
      contextIsolation: true,
      backgroundThrottling: false
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

  // Notificar o renderer sobre o foco para acelerar o polling de chat
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window-focus-changed', true);
  });
  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window-focus-changed', false);
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.warn('Outra instância do agente já está rodando. Encerrando execução.', 'MAIN');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.whenReady().then(async () => {
    logger.info('Iniciando Agente Helpdesk Pro...', 'MAIN');
    
    // Verificar se houve rollback na inicialização
    const rollback = updateManager.checkRollbackStatus();
    if (rollback.rolledBack) {
      logger.warn(`Agente inicializado em modo de contingência após falha de upgrade. Versão ativa: ${rollback.previousVersion}`, 'MAIN');
    }

    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden']
    });

    // Registra Handlers IPC das rotas modularizadas
    registerSystemIPCHandlers();
    registerGlpiIPCHandlers();
    registerMeshIPCHandlers();
    registerUpdatesIPCHandlers();
    registerHelpdeskProIPCHandlers();

    // Carrega a UI principal
    createWindow();

    // MeshAgent embutido — inicia sob demanda via IPC 'mesh-start'
    // (sem verificação de serviço do Windows; o runner cuida disso)
    diagManager.updateMeshStatus('ready');

    // Inicia os temporizadores automatizados de inventário e notificações
    startInventoryScheduler();
    startNotificationScheduler();

    // Registra este computador no novo backend HelpDesk Pro (falha silenciosa se não configurado)
    setTimeout(async () => {
      const result = await hdpApi.registerComputer({});
      if (!result.ok && result.message && !result.message.includes('não configurada')) {
        logger.warn(`Registro no HelpDesk Pro falhou: ${result.message}`, 'MAIN');
      }
    }, 15000);

    // Setup do Ícone da Bandeja do Sistema (Tray Icon)
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
      logger.warn("Falha ao inicializar o ícone da bandeja com .ico, tentando .png...", 'MAIN');
      try {
        const pngPath = path.join(__dirname, 'assets/icon.png');
        if (fs.existsSync(pngPath)) {
          tray = new Tray(pngPath);
        }
      } catch (err) {
        logger.error("Falha fatal ao inicializar ícone na bandeja:", err, 'MAIN');
      }
    }

    if (tray) {
      try {
        const contextMenu = Menu.buildFromTemplate([
          { label: 'Abrir Agente Helpdesk Pro', click: () => mainWindow.show() },
          { label: 'Sair do Agente', click: () => {
              app.isQuitting = true;
              app.quit();
            }
          }
        ]);
        tray.setToolTip('Agente Helpdesk Pro');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => mainWindow.show());
      } catch (err) {
        logger.error("Falha ao configurar menu de contexto na bandeja:", err, 'MAIN');
      }
    }
  });

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

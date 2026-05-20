/**
 * ipc/updates.js — Handlers IPC para controle de atualizações automatizadas e canais de distribuição
 */

const { ipcMain, BrowserWindow } = require('electron');
const updateManager = require('../update-manager');
const logger = require('../logger');

function registerUpdatesIPCHandlers() {
  const getMainWindow = () => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  };

  // Check for updates matching local configuration channel
  ipcMain.handle('check-for-updates', async () => {
    try {
      return await updateManager.checkForUpdates();
    } catch (e) {
      logger.error('Falha ao buscar atualizações', e, 'IPC-UPDATES');
      return { updateAvailable: false, error: e.message };
    }
  });

  // Download update and emit progress status events to renderer
  ipcMain.handle('download-update', async (event, downloadUrl) => {
    const mainWin = getMainWindow();
    try {
      const installerPath = await updateManager.downloadUpdate(downloadUrl, (progress) => {
        if (mainWin) {
          mainWin.webContents.send('update-progress', progress);
        }
      });
      return { success: true, installerPath };
    } catch (e) {
      logger.error('Falha ao baixar nova atualização', e, 'IPC-UPDATES');
      return { success: false, error: e.message };
    }
  });

  // Install the downloaded NSIS package and close main application
  ipcMain.handle('install-update', async (event, installerPath) => {
    try {
      await updateManager.installAndExit(installerPath);
      return { success: true };
    } catch (e) {
      logger.error('Falha ao acionar instalação de atualização', e, 'IPC-UPDATES');
      return { success: false, error: e.message };
    }
  });
}

module.exports = {
  registerUpdatesIPCHandlers
};

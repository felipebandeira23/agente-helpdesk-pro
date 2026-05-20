const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Sistema
  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
  getOSUser:        () => ipcRenderer.invoke('get-os-user'),
  forceInventory:   () => ipcRenderer.invoke('force-inventory'),
  onInventoryProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('inventory-progress', subscription);
    return () => ipcRenderer.removeListener('inventory-progress', subscription);
  },
  openExternal:     (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (opts) => ipcRenderer.invoke('show-notification', opts),

  // GLPI — Configuração
  glpiGetConfig:       () => ipcRenderer.invoke('glpi-get-config'),
  glpiSetConfig:       (cfg) => ipcRenderer.invoke('glpi-set-config', cfg),
  glpiTestConnection:  () => ipcRenderer.invoke('glpi-test-connection'),
  glpiLogin:           (login, password) => ipcRenderer.invoke('glpi-login', { login, password }),
  glpiGetWindowsUser:  () => ipcRenderer.invoke('glpi-get-windows-user'),
  glpiLogout:          () => ipcRenderer.invoke('glpi-logout'),

  // GLPI — Categorias
  glpiGetCategories:   () => ipcRenderer.invoke('glpi-get-categories'),

  // GLPI — Tickets
  glpiGetTickets:      (userId) => ipcRenderer.invoke('glpi-get-tickets', userId),
  glpiCreateTicket:    (opts)   => ipcRenderer.invoke('glpi-create-ticket', opts),
  glpiGetFollowups:    (ticketId) => ipcRenderer.invoke('glpi-get-followups', ticketId),
  glpiAddFollowup:     (ticketId, message) => ipcRenderer.invoke('glpi-add-followup', { ticketId, message }),
  glpiUpdateTicketStatus: (ticketId, status) => ipcRenderer.invoke('glpi-update-ticket-status', { ticketId, status }),
  glpiUpdateTicket:    (ticketId, fields) => ipcRenderer.invoke('glpi-update-ticket', { ticketId, fields }),
  glpiGetLocations:    () => ipcRenderer.invoke('glpi-get-locations'),
  glpiGetUserRole:     () => ipcRenderer.invoke('glpi-get-user-role'),
  glpiUploadDocument:  (ticketId, fileName, buffer) => ipcRenderer.invoke('glpi-upload-document', { ticketId, fileName, buffer }),
  glpiGetDocuments:    (ticketId) => ipcRenderer.invoke('glpi-get-documents', ticketId),


  // GLPI — Usuário
  glpiFindUser:        (login) => ipcRenderer.invoke('glpi-find-user', login),

  // MeshCentral
  checkMeshAgent:      () => ipcRenderer.invoke('check-mesh-agent'),
  meshStart:           () => ipcRenderer.invoke('mesh-start'),
  meshStop:            () => ipcRenderer.invoke('mesh-stop'),
  meshStatus:          () => ipcRenderer.invoke('mesh-status'),
  testMeshConnection:  (url) => ipcRenderer.invoke('test-mesh-connection', url),

  // Atualizações Automatizadas
  checkForUpdates:     () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate:      (url) => ipcRenderer.invoke('download-update', url),
  installUpdate:       (installerPath) => ipcRenderer.invoke('install-update', installerPath),
  onUpdateProgress:    (callback) => {
    const subscription = (event, progress) => callback(progress);
    ipcRenderer.on('update-progress', subscription);
    return () => ipcRenderer.removeListener('update-progress', subscription);
  },
  onWindowFocusChanged: (callback) => {
    const subscription = (event, focused) => callback(focused);
    ipcRenderer.on('window-focus-changed', subscription);
    return () => ipcRenderer.removeListener('window-focus-changed', subscription);
  }
});


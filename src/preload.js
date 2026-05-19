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

  // GLPI — Categorias
  glpiGetCategories:   () => ipcRenderer.invoke('glpi-get-categories'),

  // GLPI — Tickets
  glpiGetTickets:      (userId) => ipcRenderer.invoke('glpi-get-tickets', userId),
  glpiCreateTicket:    (opts)   => ipcRenderer.invoke('glpi-create-ticket', opts),
  glpiGetFollowups:    (ticketId) => ipcRenderer.invoke('glpi-get-followups', ticketId),
  glpiAddFollowup:     (ticketId, message) => ipcRenderer.invoke('glpi-add-followup', { ticketId, message }),
  glpiUpdateTicketStatus: (ticketId, status) => ipcRenderer.invoke('glpi-update-ticket-status', { ticketId, status }),
  glpiGetUserRole:     () => ipcRenderer.invoke('glpi-get-user-role'),


  // GLPI — Usuário
  glpiFindUser:        (login) => ipcRenderer.invoke('glpi-find-user', login),

  // MeshCentral
  checkMeshAgent:      () => ipcRenderer.invoke('check-mesh-agent'),
  testMeshConnection:  (url) => ipcRenderer.invoke('test-mesh-connection', url),
});


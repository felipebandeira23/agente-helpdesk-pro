/**
 * settings.js — Controle de Configurações, Preferências de Acessibilidade (Fontes/Modo Compacto) e Updates
 */

import { State } from './state.js';
import { applyFontScale, applyCompactMode } from './dom.js';

export async function loadAgentSettingsIntoForm() {
  if (!window.electronAPI) return;
  try {
    const cfg = await window.electronAPI.glpiGetConfig();
    
    const urlEl = document.getElementById('settings-glpi-url');
    const appEl = document.getElementById('settings-glpi-app-token');
    const userEl = document.getElementById('settings-glpi-user-token');
    const meshUrlEl = document.getElementById('settings-mesh-url');
    const meshGroupEl = document.getElementById('settings-mesh-group');
    const channelEl = document.getElementById('settings-update-channel');

    if (urlEl) urlEl.value = cfg.glpiUrl || '';
    if (appEl) appEl.value = cfg.appToken || '';
    if (userEl) userEl.value = cfg.userToken || '';
    if (meshUrlEl) meshUrlEl.value = cfg.meshUrl || 'https://rdp.intranet.coppead.ufrj.br';
    if (meshGroupEl) meshGroupEl.value = cfg.meshGroupId || '';
    if (channelEl) channelEl.value = cfg.updateChannel || 'stable';

    // Carrega preferências nos botões/checkboxes
    const fontScale = State.fontScale;
    const fontBtn = document.querySelector(`.font-scale-btn[data-scale="${fontScale}"]`);
    if (fontBtn) {
      document.querySelectorAll('.font-scale-btn').forEach(b => b.classList.remove('active'));
      fontBtn.classList.add('active');
    }

    const compactChk = document.getElementById('setting-compact-mode');
    if (compactChk) {
      compactChk.checked = State.compactMode;
    }
  } catch (e) {
    console.error('Erro ao carregar configurações:', e);
  }
}

export async function saveAgentSettings(event) {
  if (event) event.preventDefault();
  
  const glpiUrl = document.getElementById('settings-glpi-url')?.value.trim();
  const appToken = document.getElementById('settings-glpi-app-token')?.value.trim();
  const userToken = document.getElementById('settings-glpi-user-token')?.value.trim();
  const meshUrl = document.getElementById('settings-mesh-url')?.value.trim() || document.getElementById('settings-mesh-url')?.placeholder;
  const meshGroupId = document.getElementById('settings-mesh-group')?.value.trim();
  const updateChannel = document.getElementById('settings-update-channel')?.value || 'stable';

  if (!window.electronAPI) return;

  try {
    const res = await window.electronAPI.glpiSetConfig({
      glpiUrl,
      appToken,
      userToken,
      meshUrl,
      meshGroupId,
      updateChannel
    });
    
    if (res.ok) {
      alert('Configurações salvas com sucesso!');
    } else {
      alert('Falha ao salvar configurações.');
    }
  } catch (e) {
    alert(`Erro ao salvar: ${e.message}`);
  }
}

export async function testAllConnections() {
  const testBtn = document.getElementById('btn-test-connections');
  const originalHtml = testBtn ? testBtn.innerHTML : '';
  
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = 'Testando...';
  }

  if (window.electronAPI) {
    try {
      // 1. Test GLPI URL connection
      const glpiRes = await window.electronAPI.glpiTestConnection();
      const glpiMsg = glpiRes.ok 
        ? '✅ Conexão GLPI: Bem-sucedida!' 
        : `❌ Conexão GLPI: Falhou (${glpiRes.message})`;

      // 2. Test MeshCentral connection
      const meshUrlEl = document.getElementById('settings-mesh-url');
      const meshUrl = meshUrlEl.value.trim() || meshUrlEl.placeholder;
      const meshRes = await window.electronAPI.testMeshConnection(meshUrl);
      const meshMsg = meshRes.ok
        ? '✅ Conexão MeshCentral: Bem-sucedida!'
        : `❌ Conexão MeshCentral: Falhou (${meshRes.message})`;

      alert(`${glpiMsg}\n\n${meshMsg}`);
    } catch (e) {
      alert(`Erro de teste: ${e.message}`);
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.innerHTML = originalHtml;
      }
    }
  }
}

export function handleFontScaleChange(scale) {
  applyFontScale(scale);
  document.querySelectorAll('.font-scale-btn').forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('data-scale') === scale) {
      b.classList.add('active');
    }
  });
}

export function handleCompactModeChange(enabled) {
  applyCompactMode(enabled);
}

// Lógica do Auto-Updater e Changelog modal
let updateInfoCache = null;
let updateDownloadProgressSubscription = null;

export async function checkUpdatesSilently() {
  if (!window.electronAPI) return;
  try {
    const res = await window.electronAPI.checkForUpdates();
    if (res && res.updateAvailable) {
      updateInfoCache = res;
      displayUpdateBanner(res);
      
      // Envia notificação nativa do Windows
      window.electronAPI.showNotification({
        title: 'Nova atualização disponível!',
        body: `A versão ${res.latestVersion} está pronta. Clique para atualizar.`
      });
    }
  } catch (e) {
    console.warn('[AUTO-UPDATER] Falha silenciosa:', e.message);
  }
}

export function displayUpdateBanner(info) {
  const banner = document.getElementById('global-update-banner');
  const versionSpan = document.getElementById('banner-update-version');
  const changelogP = document.getElementById('banner-update-changelog');
  
  if (banner && versionSpan && changelogP) {
    versionSpan.textContent = info.latestVersion;
    changelogP.textContent = info.changelog || 'Novidades estão prontas para serem instaladas.';
    banner.style.display = 'flex';
  }
}

export function dismissUpdateBanner() {
  const banner = document.getElementById('global-update-banner');
  if (banner) banner.style.display = 'none';
}

export async function checkUpdatesManually() {
  const checkBtn = document.getElementById('btn-settings-check-update');
  const statusText = document.getElementById('settings-update-status-text');
  
  if (!window.electronAPI) {
    alert('A checagem de atualizações só está disponível no aplicativo Agente.');
    return;
  }
  
  if (checkBtn) checkBtn.disabled = true;
  if (statusText) statusText.textContent = 'Buscando atualizações no servidor Coppead...';
  
  try {
    const res = await window.electronAPI.checkForUpdates();
    if (checkBtn) checkBtn.disabled = false;
    
    if (res && res.updateAvailable) {
      updateInfoCache = res;
      displayUpdateBanner(res);
      if (statusText) {
        statusText.innerHTML = `<strong style="color: var(--accent-neon);">Nova versão ${res.latestVersion} disponível!</strong>`;
      }
      
      // Abre modal de changelog com opção "Instalar Agora" ou "Adiar / Baixar Depois"
      openChangelogModal(res);
    } else if (res && res.error) {
      if (statusText) statusText.textContent = `Falha: ${res.error}`;
      alert(`Falha ao checar atualizações: ${res.error}`);
    } else {
      if (statusText) statusText.textContent = 'O aplicativo está na versão mais recente.';
      alert('Seu agente já está na versão mais recente. Nenhuma ação é necessária!');
    }
  } catch (e) {
    if (checkBtn) checkBtn.disabled = false;
    if (statusText) statusText.textContent = 'Erro ao verificar atualizações.';
    alert(`Erro de conexão com o servidor de atualizações: ${e.message}`);
  }
}

export function refreshSettingsUpdateUI() {
  const statusText = document.getElementById('settings-update-status-text');
  if (!statusText) return;
  
  if (updateInfoCache && updateInfoCache.updateAvailable) {
    statusText.innerHTML = `<strong style="color: var(--accent-neon);">Nova versão ${updateInfoCache.latestVersion} disponível!</strong>`;
  } else {
    statusText.textContent = 'O aplicativo está na versão mais recente.';
  }
}

export function openChangelogModal(info) {
  const modal = document.getElementById('changelog-modal');
  const version = document.getElementById('changelog-version');
  const details = document.getElementById('changelog-details');

  if (modal && version && details) {
    version.textContent = info.latestVersion;
    details.textContent = info.changelog || 'Melhorias de desempenho e correções de segurança.';
    modal.style.display = 'flex';
  }
}

export function closeChangelogModal() {
  const modal = document.getElementById('changelog-modal');
  if (modal) modal.style.display = 'none';
}

export async function startUpdateWorkflow() {
  closeChangelogModal();
  dismissUpdateBanner();

  if (!updateInfoCache || !updateInfoCache.downloadUrl) {
    alert('Nenhuma atualização disponível no momento.');
    return;
  }

  const progressRow = document.getElementById('settings-update-progress-row');
  const progressLabel = document.getElementById('settings-update-progress-label');
  const progressPercent = document.getElementById('settings-update-progress-percent');
  const progressBar = document.getElementById('settings-update-progress-bar');
  
  // Abre aba de configurações para mostrar o progresso visual
  import('./dom.js').then(dom => dom.switchScreen('settings'));
  
  if (progressRow) progressRow.style.display = 'flex';
  if (progressLabel) progressLabel.textContent = 'Baixando instalador do Agente...';
  
  if (typeof updateDownloadProgressSubscription === 'function') {
    updateDownloadProgressSubscription();
  }
  
  updateDownloadProgressSubscription = window.electronAPI.onUpdateProgress((percent) => {
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
  });

  try {
    const downloadRes = await window.electronAPI.downloadUpdate(updateInfoCache.downloadUrl);
    
    if (downloadRes && downloadRes.success) {
      if (progressLabel) progressLabel.textContent = 'Instalando atualização...';
      
      const installRes = await window.electronAPI.installUpdate(downloadRes.installerPath);
      if (!installRes || installRes.error) {
        throw new Error(installRes ? installRes.error : 'Erro na instalação');
      }
    } else {
      throw new Error(downloadRes ? downloadRes.error : 'Erro no download');
    }
  } catch (err) {
    if (progressLabel) progressLabel.textContent = 'Erro ao instalar atualização.';
    alert(`Erro crítico durante a atualização: ${err.message}`);
  } finally {
    if (typeof updateDownloadProgressSubscription === 'function') {
      updateDownloadProgressSubscription();
      updateDownloadProgressSubscription = null;
    }
  }
}

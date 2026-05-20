import { State } from './state.js';

export function openRemoteChecklistModal() {
  const modal = document.getElementById('remote-checklist-modal');
  if (modal) {
    modal.style.display = 'flex';
    resetRemoteChecklistForm();
  }
}

export function closeRemoteChecklistModal() {
  const modal = document.getElementById('remote-checklist-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

export function resetRemoteChecklistForm() {
  const cb1 = document.getElementById('chk-save-work');
  const cb2 = document.getElementById('chk-close-private');
  const cb3 = document.getElementById('chk-aware-cancel');
  const cb4 = document.getElementById('chk-authorize');
  const btn = document.getElementById('btn-confirm-remote-checklist');

  if (cb1) cb1.checked = false;
  if (cb2) cb2.checked = false;
  if (cb3) cb3.checked = false;
  if (cb4) cb4.checked = false;
  if (btn) btn.disabled = true;
}

export function evaluateRemoteChecklistProgress() {
  const cb1 = document.getElementById('chk-save-work')?.checked;
  const cb2 = document.getElementById('chk-close-private')?.checked;
  const cb3 = document.getElementById('chk-aware-cancel')?.checked;
  const cb4 = document.getElementById('chk-authorize')?.checked;
  const btn = document.getElementById('btn-confirm-remote-checklist');

  if (btn) {
    btn.disabled = !(cb1 && cb2 && cb3 && cb4);
  }
}

export function confirmRemoteChecklist() {
  State.remoteChecklistAccepted = true;
  closeRemoteChecklistModal();
  
  executeRemoteSupportWorkflow();
}

export async function executeRemoteSupportWorkflow() {
  const terminalLog = document.getElementById('terminal-action-log');
  const sessionStatus = document.getElementById('remote-session-status');
  const reqBtn = document.getElementById('btn-request-remote');

  if (!terminalLog || !sessionStatus || !reqBtn) return;

  reqBtn.disabled = true;
  reqBtn.innerHTML = 'Inicializando...';

  terminalLog.innerHTML = '<div>[SYSTEM] Inicializando módulo QuickSupport Embutido...</div>';

  if (!window.electronAPI) {
    terminalLog.innerHTML += '<div style="color: #ef4444;">[ERRO] API do Agente não disponível.</div>';
    reqBtn.disabled = false;
    reqBtn.innerHTML = 'Solicitar Acesso Remoto Agora';
    return;
  }

  terminalLog.innerHTML += '<div>[USER] Consentimento e Checklist de Segurança: AUTORIZADO</div>';

  // 1. Start MeshAgent process
  terminalLog.innerHTML += '<div style="color: #66d9ef;">[SYSTEM] Preparando agente portátil embutido...</div>';
  sessionStatus.textContent = 'Conectando...';
  sessionStatus.style.color = 'var(--warning)';

  try {
    const startResult = await window.electronAPI.meshStart();
    if (!startResult.success) {
      throw new Error(startResult.error);
    }

    terminalLog.innerHTML += '<div style="color: #00d293;">[SUPPORT] Agente em execução! Sessão ativa e aguardando técnico.</div>';
    sessionStatus.textContent = 'Sessão Ativa (QuickSupport)';
    sessionStatus.style.color = 'var(--success)';

    // Update Button to "Stop"
    reqBtn.disabled = false;
    reqBtn.style.background = 'linear-gradient(135deg, var(--danger), #b91c1c)';
    reqBtn.style.boxShadow = '0 4px 10px rgba(239, 68, 68, 0.2)';
    reqBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 13.5l-1.41 1.41L12 13.41l-2.09 2.09-1.41-1.41L10.59 12 8.5 9.91l1.41-1.41L12 10.59l2.09-2.09 1.41 1.41L13.41 12l2.09 2.09z"/></svg>
      Encerrar Acesso Remoto
    `;
    reqBtn.onclick = stopRemoteSupportWorkflow;

  } catch (err) {
    console.error("Workflow Error:", err);
    alert("Falha Crítica: " + err.message + "\\nStack: " + err.stack);
    terminalLog.innerHTML += `<div style="color: #ef4444;">[ERRO] Falha: ${err.message}</div>`;
    sessionStatus.textContent = 'Falha ao Iniciar';
    sessionStatus.style.color = 'var(--danger)';
    reqBtn.disabled = false;
    reqBtn.innerHTML = 'Tentar Novamente';
  }
}

export async function stopRemoteSupportWorkflow() {
  const terminalLog = document.getElementById('terminal-action-log');
  const sessionStatus = document.getElementById('remote-session-status');
  const reqBtn = document.getElementById('btn-request-remote');

  reqBtn.disabled = true;
  reqBtn.innerHTML = 'Encerrando...';

  try {
    await window.electronAPI.meshStop();
    terminalLog.innerHTML += '<div style="color: #fbbf24;">[SYSTEM] Processo do MeshAgent encerrado. Sessão remota finalizada.</div>';
    sessionStatus.textContent = 'Nenhuma';
    sessionStatus.style.color = 'var(--text-muted)';
  } catch (err) {
    terminalLog.innerHTML += `<div style="color: #ef4444;">[ERRO] Falha ao encerrar: ${err.message}</div>`;
  } finally {
    // Reset Button
    reqBtn.disabled = false;
    reqBtn.style.background = ''; // reset to CSS class
    reqBtn.style.boxShadow = '';
    reqBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm8.57-5.07c-.17-.39-.55-.86-1.07-.86H15v-3c0-.55-.45-1-1-1h-6V8h2c.55 0 1-.45 1-1V5h2c1.13 0 2-.87 2-2 0-.29-.06-.56-.17-.81 3.51.92 6.17 4.1 6.17 7.93 0 1.57-.45 3.03-1.23 4.27z"/></svg>
      Solicitar Acesso Remoto Agora
    `;
    reqBtn.onclick = openRemoteChecklistModal;
  }
}

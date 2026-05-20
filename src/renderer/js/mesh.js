/**
 * mesh.js — Controle de Suporte Remoto, Logs e Checklist de Segurança Obrigatório
 */

import { State } from './state.js';

/**
 * Abre o Modal de Checklist de Segurança Obrigatório antes de liberar o acesso
 */
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
  
  // Prossegue para a ação de suporte remoto
  executeRemoteSupportWorkflow();
}

/**
 * Executa de fato a lógica de checagem do MeshAgent e solicitação
 */
export async function executeRemoteSupportWorkflow() {
  const terminalLog = document.getElementById('terminal-action-log');
  const sessionStatus = document.getElementById('remote-session-status');
  const reqBtn = document.getElementById('btn-request-remote');

  if (!terminalLog || !sessionStatus || !reqBtn) return;

  reqBtn.disabled = true;
  reqBtn.innerHTML = 'Conectando Suporte...';

  terminalLog.innerHTML = '<div>[SYSTEM] Inicializando verificação de suporte...</div>';

  if (!window.electronAPI) {
    terminalLog.innerHTML += '<div style="color: #ef4444;">[ERRO] API do Agente não disponível.</div>';
    reqBtn.disabled = false;
    reqBtn.innerHTML = 'Solicitar Acesso Remoto Agora';
    return;
  }

  // Pega configurações salvas
  let cfg = { meshUrl: 'https://rdp.intranet.coppead.ufrj.br', meshGroupId: '' };
  try {
    cfg = await window.electronAPI.glpiGetConfig();
  } catch (e) {
    console.error('Erro ao ler config:', e);
  }

  const meshServer = cfg.meshUrl || 'https://rdp.intranet.coppead.ufrj.br';

  setTimeout(() => {
    terminalLog.innerHTML += '<div>[USER] Consentimento e Checklist de Segurança: AUTORIZADO</div>';
  }, 400);

  setTimeout(async () => {
    terminalLog.innerHTML += '<div style="color: #66d9ef;">[SYSTEM] Verificando status do serviço local do MeshAgent...</div>';
    
    try {
      const status = await window.electronAPI.checkMeshAgent();
      
      if (status === 'Running' || status === true) {
        terminalLog.innerHTML += '<div style="color: #00d293;">[SYSTEM] MeshAgent instalado e rodando localmente!</div>';
        terminalLog.innerHTML += `<div style="color: #00d293;">[SUPPORT] Sessão ativa no servidor ${meshServer}</div>`;
        
        sessionStatus.textContent = 'Disponível / Aguardando';
        sessionStatus.style.color = 'var(--success)';
        
        alert('O Agente de Suporte Remoto está ativo no seu computador!\n\nAvise o analista técnico que seu terminal está pronto para conexão.');
      } else if (status === 'Stopped') {
        terminalLog.innerHTML += '<div style="color: #fbbf24;">[WARNING] O serviço "Mesh Agent" está instalado, mas está PARADO.</div>';
        terminalLog.innerHTML += '<div style="color: #66d9ef;">[SYSTEM] Solicitando inicialização do serviço...</div>';
        
        sessionStatus.textContent = 'Serviço Parado';
        sessionStatus.style.color = 'var(--warning)';
        
        alert('O serviço Mesh Agent está instalado, mas seu status é PARADO.\n\nPara iniciar:\n1. Abra o PowerShell como Administrador e execute:\n   Start-Service -Name "Mesh Agent"\n2. Certifique-se de que nenhum antivírus corporativo está bloqueando o binário.');
      } else {
        terminalLog.innerHTML += '<div style="color: #fbbf24;">[WARNING] MeshAgent não encontrado no computador.</div>';
        terminalLog.innerHTML += '<div style="color: #66d9ef;">[MESH] Acionando portal de download...</div>';
        
        sessionStatus.textContent = 'Download Requerido';
        sessionStatus.style.color = 'var(--warning)';
        
        let downloadUrl = meshServer;
        if (cfg.meshGroupId) {
          downloadUrl = `${meshServer}/meshagent.exe?id=${cfg.meshGroupId}`;
        }
        
        terminalLog.innerHTML += `<div style="color: #00b0ff;">[INFO] Baixando instalador: ${downloadUrl}</div>`;
        
        await window.electronAPI.openExternal(downloadUrl);
        
        alert(`O Agente de Suporte Remoto não está instalado.\n\nAbrimos a página oficial do MeshCentral (${meshServer}) para download.\n\nPor favor, faça o download, instale-o como Serviço e tente novamente.`);
      }
    } catch (err) {
      terminalLog.innerHTML += `<div style="color: #ef4444;">[ERRO] Falha ao verificar serviço: ${err.message}</div>`;
    } finally {
      reqBtn.disabled = false;
      reqBtn.innerHTML = 'Solicitar Acesso Remoto Agora';
    }
  }, 1000);
}

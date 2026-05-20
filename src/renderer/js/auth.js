/**
 * auth.js — Modal de Login GLPI via LDAP (credenciais Windows)
 * 
 * Fluxo:
 * 1. Na inicialização, verifica se há sessão GLPI ativa
 * 2. Se não houver, abre o modal automaticamente
 * 3. Usuário insere apenas a senha (login pre-preenchido com usuário Windows)
 * 4. Faz initSession via Basic Auth (LDAP) → salva session_token criptografado
 * 5. Senha NUNCA é armazenada
 */

/** Abre o modal de login GLPI */
export function openGlpiLoginModal() {
  const modal = document.getElementById('glpi-login-modal');
  if (modal) {
    modal.style.display = 'flex';
    preloadWindowsUser();
  }
}

/** Fecha o modal sem fazer login (modo limitado) */
export function closeGlpiLoginModal() {
  const modal = document.getElementById('glpi-login-modal');
  if (modal) modal.style.display = 'none';
}

/** Pre-preenche o campo de usuário com o login do Windows */
async function preloadWindowsUser() {
  if (!window.electronAPI?.glpiGetWindowsUser) return;
  try {
    const winUser = await window.electronAPI.glpiGetWindowsUser();
    const userField = document.getElementById('glpi-login-user');
    if (userField && winUser && !userField.value) {
      userField.value = winUser;
      // Foca no campo de senha, já que o usuário está preenchido
      setTimeout(() => {
        document.getElementById('glpi-login-pass')?.focus();
      }, 100);
    }
  } catch (e) { /* ignora */ }
}

/** Handler do submit do formulário de login */
export async function handleGlpiLogin(event) {
  event.preventDefault();

  const login    = document.getElementById('glpi-login-user')?.value?.trim();
  const password = document.getElementById('glpi-login-pass')?.value;
  const btn      = document.getElementById('glpi-login-btn');
  const btnText  = document.getElementById('glpi-login-btn-text');
  const errorEl  = document.getElementById('glpi-login-error');

  if (!login || !password) return;

  // Estado de carregamento
  btn.disabled = true;
  btnText.textContent = 'Autenticando...';
  errorEl.style.display = 'none';

  // Substitui ícone por spinner
  document.getElementById('glpi-login-icon').innerHTML = `
    <circle cx="12" cy="12" r="10" stroke="white" stroke-width="3" fill="none" stroke-dasharray="31.4" stroke-dashoffset="10">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  `;

  try {
    if (!window.electronAPI?.glpiLogin) {
      throw new Error('API do agente não disponível.');
    }

    const result = await window.electronAPI.glpiLogin(login, password);

    if (result.ok) {
      // Sucesso — fecha modal e atualiza UI
      closeGlpiLoginModal();
      document.getElementById('glpi-login-pass').value = ''; // limpa senha da memória

      // Atualiza o nome do usuário no header
      const userNameEl = document.getElementById('user-display-name');
      if (userNameEl) userNameEl.textContent = result.userName || login;

      // Atualiza o status de autenticação no header
      const statusEl = document.getElementById('user-glpi-status');
      if (statusEl) {
        statusEl.textContent = 'GLPI Autenticado ✓';
        statusEl.style.color = 'var(--success, #22c55e)';
      }

      // Troca ícone de cadeado fechado para aberto
      const authIcon = document.getElementById('user-auth-icon');
      if (authIcon) {
        authIcon.style.color = 'var(--success, #22c55e)';
        authIcon.innerHTML = '<path d="M12 1C8.676 1 6 3.676 6 7v1H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v1H8V7c0-2.276 1.724-4 4-4zm0 9c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/>';
      }

      // Muda o onclick do perfil para logout
      const profileEl = document.querySelector('.user-profile');
      if (profileEl) {
        profileEl.title = `Autenticado como ${login} — Clique para sair`;
        profileEl.onclick = async () => {
          if (!confirm(`Sair da conta ${login} no GLPI?`)) return;
          await window.electronAPI.glpiLogout?.();
          const st = document.getElementById('user-glpi-status');
          if (st) { st.textContent = 'Não autenticado'; st.style.color = ''; }
          const ai = document.getElementById('user-auth-icon');
          if (ai) {
            ai.style.color = '';
            ai.innerHTML = '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>';
          }
          profileEl.onclick = () => window.openGlpiLoginModal?.();
          profileEl.title = 'Clique para fazer login no GLPI';
        };
      }

      // Dispara evento para o resto do app recarregar dados do usuário
      window.dispatchEvent(new CustomEvent('glpi-authenticated', { detail: { login, userName: result.userName } }));

    } else {
      showLoginError(errorEl, result.message || 'Falha na autenticação.');
    }

  } catch (e) {
    showLoginError(errorEl, e.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Entrar no GLPI';
    document.getElementById('glpi-login-icon').innerHTML = `
      <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/>
    `;
  }
}

function showLoginError(el, message) {
  el.textContent = '⚠️ ' + message;
  el.style.display = 'block';
  // Shake animation
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.4s ease';
}

/**
 * Verifica na inicialização se o usuário já tem sessão GLPI.
 * Se não tiver, abre o modal de login automaticamente após 1s.
 */
export async function checkAndPromptLogin() {
  if (!window.electronAPI) return;

  try {
    const config = await window.electronAPI.glpiGetConfig();
    const sessionToken    = config?.sessionToken;
    const sessionExpiry   = config?.sessionExpiry;
    const now = Date.now();

    const sessionValid = sessionToken && sessionExpiry && now < sessionExpiry;

    if (!sessionValid) {
      // Sem sessão válida — mostra modal após pequeno delay (app ainda carregando)
      setTimeout(openGlpiLoginModal, 1500);
    }
  } catch (e) {
    setTimeout(openGlpiLoginModal, 1500);
  }
}

// Registra no escopo global para uso inline no HTML
window.handleGlpiLogin    = handleGlpiLogin;
window.openGlpiLoginModal = openGlpiLoginModal;
window.closeGlpiLoginModal = closeGlpiLoginModal;

// Adiciona CSS da animação shake dinamicamente
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-8px); }
    40%       { transform: translateX(8px); }
    60%       { transform: translateX(-5px); }
    80%       { transform: translateX(5px); }
  }
`;
document.head.appendChild(style);

/**
 * dom.js — Utilitários centrais de Renderização de UI e Manipulação do DOM
 */

import { State } from './state.js';

/**
 * Alterna entre tema claro e escuro
 */
export function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');

  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  if (isLight) {
    icon.innerHTML = '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2M20 13h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M17.66 4.93l-1.41 1.41M4.93 17.66l-1.41 1.41"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

/**
 * Sanitiza strings para exibição HTML segura protegendo contra XSS
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Aplica as preferências de tamanho de fonte no body da página
 */
export function applyFontScale(scale) {
  State.fontScale = scale;
  localStorage.setItem('font-scale', scale);
  
  // Remove classes anteriores
  document.body.classList.remove('font-medium', 'font-large');
  
  if (scale === 'medium') {
    document.body.classList.add('font-medium');
  } else if (scale === 'large') {
    document.body.classList.add('font-large');
  }
}

/**
 * Aplica/Toggle do Modo Compacto
 */
export function applyCompactMode(enabled) {
  State.compactMode = enabled;
  localStorage.setItem('compact-mode', enabled);
  
  if (enabled) {
    document.body.classList.add('compact-mode');
  } else {
    document.body.classList.remove('compact-mode');
  }
}

/**
 * Alterna as abas visíveis no layout do aplicativo
 */
export function switchScreen(screenName) {
  // Cancela polling de chat anterior se existir
  if (State.chatPollInterval) {
    clearInterval(State.chatPollInterval);
    State.chatPollInterval = null;
  }

  State.activeScreen = screenName;

  // Desativa todas as telas
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));

  // Desativa botões da barra lateral
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => btn.classList.remove('active'));

  // Ativa o botão da barra lateral correto
  navBtns.forEach(btn => {
    const clickAttr = btn.getAttribute('onclick') || '';
    if (clickAttr.includes(screenName)) {
      btn.classList.add('active');
    }
  });

  // Ativa a tela correta no DOM
  const targetScreen = document.getElementById(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Atualiza detalhes do cabeçalho
  const headerText = document.getElementById('header-text');
  const headerIcon = document.getElementById('header-icon');
  
  if (!headerText || !headerIcon) return;

  switch(screenName) {
    case 'dashboard':
      headerText.textContent = 'Painel Principal';
      headerIcon.innerHTML = '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>';
      break;
    case 'new-ticket':
      headerText.textContent = 'Abrir Novo Chamado';
      headerIcon.innerHTML = '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>';
      break;
    case 'tickets-list':
      headerText.textContent = 'Lista de Chamados';
      headerIcon.innerHTML = '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>';
      break;
    case 'telemetry':
      headerText.textContent = 'Métricas de Telemetria';
      headerIcon.innerHTML = '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H5v-2h5v2zm0-4H5v-2h5v2zm0-4H5V5h5v2zm9 8h-7v-2h7v2zm0-4h-7v-2h7v2zm0-4h-7V5h7v2z"/>';
      break;
    case 'remote-access':
      headerText.textContent = 'Suporte Remoto Criptografado';
      headerIcon.innerHTML = '<path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/>';
      break;
    case 'settings':
      headerText.textContent = 'Configurações do Agente';
      headerIcon.innerHTML = '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>';
      break;
    case 'ticket-detail':
      headerText.textContent = 'Detalhes do Chamado';
      headerIcon.innerHTML = '<path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>';
      break;
    case 'diagnostics':
      headerText.textContent = 'Diagnóstico Técnico';
      headerIcon.innerHTML = '<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.3C.5 6.7.9 9.8 2.9 11.8c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.4-2.4c.4-.4.4-1.1 0-1.4z"/>';
      break;
  }
}

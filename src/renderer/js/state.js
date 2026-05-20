/**
 * state.js — Camada simples de Gerenciamento de Estado para o Frontend
 */

export const State = {
  activeScreen: 'dashboard',
  ticketsList: [],
  categoriesList: [],
  locationsList: [],
  activeTicketId: null,
  userRoles: { isSuperAdmin: false, isTecnico: false },
  notificationCache: JSON.parse(localStorage.getItem('glpi_notifications_cache') || '{}'),
  
  // Acessibilidade e Preferências
  fontScale: localStorage.getItem('font-scale') || 'standard', // 'standard', 'medium', 'large'
  compactMode: localStorage.getItem('compact-mode') === 'true',
  
  // Polling e Atividade
  chatPollInterval: null,
  proxyPollInterval: null,
  isAppFocused: true,
  
  // Diagnósticos e Logs
  diagnostics: {},
  
  // Suporte Remoto
  remoteChecklistAccepted: false,
  
  // Métricas do Gráfico (CPU / Memória)
  cpuChart: null,
  memChart: null,
  memMiniChart: null,
  telemetryInterval: null,

  // FAQ Base de Conhecimento Local
  solutionsFAQ: [
    {
      id: 'faq-outlook',
      title: '📭 Como limpar o cache do Outlook?',
      category: 'E-mail/Outlook',
      problem: 'Outlook travando ou não atualizando e-mails.',
      steps: [
        'Feche totalmente o Microsoft Outlook.',
        'Pressione as teclas Windows + R para abrir a janela Executar.',
        'Digite %localappdata%\\Microsoft\\Outlook e clique em OK.',
        'Apague todos os arquivos contidos na pasta de cache OST.',
        'Abra o Outlook novamente para forçar o recarregamento limpo.'
      ]
    },
    {
      id: 'faq-internet',
      title: '🌐 Rede sem acesso à Internet?',
      category: 'Rede/Internet',
      problem: 'Computador exibe exclamação amarela ou sem conexão.',
      steps: [
        'Abra o menu iniciar e digite "Prompt de Comando".',
        'Clique com o botão direito e selecione "Executar como Administrador".',
        'Digite "ipconfig /release" e aguarde.',
        'Digite "ipconfig /renew" para adquirir novo IP na rede COPPEAD.',
        'Digite "ipconfig /flushdns" para limpar o cache DNS.'
      ]
    },
    {
      id: 'faq-impressora',
      title: '🖨️ Impressora travada na fila de impressão?',
      category: 'Impressora',
      problem: 'Impressões paradas na fila de espera impedindo novos envios.',
      steps: [
        'Abra a janela Executar (Windows + R).',
        'Digite "services.msc" e pressione Enter.',
        'Localize o serviço "Spooler de Impressão" (Print Spooler).',
        'Clique com o botão direito e selecione "Parar".',
        'Abra o Executar novamente e vá em "%windir%\\System32\\spool\\PRINTERS" e delete todos os arquivos.',
        'Volte na janela de serviços, clique no Spooler e selecione "Iniciar".'
      ]
    },
    {
      id: 'faq-lentidao',
      title: '⚡ Lentidão ou travamentos no Windows?',
      category: 'Lentidão',
      problem: 'O computador demora para responder comandos.',
      steps: [
        'Feche programas que não estão em uso.',
        'Pressione Ctrl + Shift + Esc para abrir o Gerenciador de Tarefas.',
        'Identifique processos consumindo alta porcentagem de CPU ou Memória.',
        'Selecione o processo pesado desnecessário e clique em "Finalizar Tarefa".',
        'Caso persista, clique em "Reiniciar Computador" para liberar a memória física RAM.'
      ]
    }
  ],

  // Cache para detecção de incidentes recorrentes
  checkRecurringIncident(categoryId) {
    if (!categoryId) return false;
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Filtra tickets da mesma categoria criados nos últimos 30 dias
    const matching = this.ticketsList.filter(t => {
      const isSameCat = String(t.itilcategories_id) === String(categoryId) || 
                        (t.category_name && t.category_name.toLowerCase().includes(categoryId.toLowerCase()));
      if (!isSameCat) return false;
      
      const createdDate = new Date(t.date_creation).getTime();
      return (now - createdDate) < ONE_MONTH;
    });
    
    return matching.length >= 2; // se houver 2 ou mais chamados recorrentes
  }
};

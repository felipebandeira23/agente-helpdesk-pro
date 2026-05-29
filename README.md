# Agente Helpdesk Pro

<div align="center">
  <img src="assets/icon.png" width="120" alt="Agente Helpdesk Pro Logo" />
  <h3>Agente Helpdesk Pro — COPPEAD/UFRJ</h3>
  <p>Suporte técnico inteligente com inventário automático, acesso remoto seguro e integração GLPI + HelpDesk Pro</p>
</div>

---

## Visão Geral

O **Agente Helpdesk Pro** é uma aplicação desktop para Windows desenvolvida para o Setor de TI do COPPEAD/UFRJ. Ela integra:

- **GLPI REST API** — autenticação LDAP Windows, abertura e acompanhamento de chamados
- **HelpDesk Pro** — novo backend NestJS/PostgreSQL para tickets e registro de inventário
- **MeshCentral** — acesso remoto criptografado via WebSocket seguro (porta 4430)
- **Inventário automático** — coleta de hardware/software via PowerShell com sincronização periódica
- **Notificações nativas** — alertas Windows sobre atualizações de chamados
- **Auto-updater** — download e instalação silenciosa via SHA-256 verificado

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Autenticação LDAP** | Login com credenciais Windows via GLPI + Basic Auth |
| **Chamados (Tickets)** | Criação, acompanhamento, followups e anexos via GLPI |
| **Templates de Chamado** | Modelos pré-configurados por categoria de problema |
| **Modal de Confirmação** | Pré-visualização completa antes de submeter o chamado |
| **Dashboard** | Resumo de chamados por status com gráfico Chart.js |
| **Chat / Followup** | Respostas em tempo real com polling adaptativo (3s/10s) |
| **Telemetria** | CPU, RAM, disco, temperatura e métricas do sistema |
| **Diagnósticos** | Verificação de rede, serviços e logs de diagnóstico |
| **Acesso Remoto** | Suporte remoto MeshCentral com consentimento explícito (LGPD) |
| **Inventário** | Coleta PowerShell + envio automático ao GLPI/HelpDesk Pro |
| **Notificações** | Polling a cada 5 minutos para atualizações de chamados |
| **Auto-Updater** | Verificação, download com progresso e instalação silenciosa |
| **Configurações** | URL GLPI, tokens, MeshCentral, HelpDesk Pro, canal de update |
| **Tema Escuro/Claro** | Toggle persistido via localStorage |
| **Modo Compacto** | Fonte e espaçamento reduzidos para telas menores |

---

## Requisitos do Sistema

- **SO:** Windows 10 (64-bit) ou superior
- **Processador:** x64 (Intel ou AMD)
- **RAM:** 4 GB mínimo
- **Disco:** 500 MB livre
- **Rede:** Acesso à intranet COPPEAD (`chamados.intranet.coppead.ufrj.br`)
- **Privilégios:** Administrador local (para instalação e coleta de inventário)

---

## Instalação

### Para usuários finais

1. Baixe `AgentHelpdeskPro-Setup-1.0.0.exe` disponibilizado pelo Setor de TI
2. Execute **como Administrador** (clique direito → "Executar como administrador")
3. Siga as instruções na tela
4. O agente inicia automaticamente após a instalação

### Para administradores de TI (instalação silenciosa)

```powershell
# Ideal para GPO, SCCM ou Intune
AgentHelpdeskPro-Setup-1.0.0.exe /S
```

---

## Desenvolvimento

### Pré-requisitos

```
Node.js >= 18
npm >= 9
Windows 10/11 (para funcionalidades nativas como safeStorage DPAPI)
```

### Setup

```bash
git clone https://github.com/felipebandeira23/agente-helpdesk-pro.git
cd agente-helpdesk-pro
npm install
npm start
```

### Build

```bash
# Instalador NSIS (.exe)
npm run dist

# Versão portátil (sem instalação)
npm run dist:portable

# Ambos
npm run dist:all
```

O instalador é gerado em `dist/`.

---

## Arquitetura

```
agente-helpdesk-pro/
├── assets/
│   ├── meshagent64.exe          # MeshAgent COPPEAD (acesso remoto)
│   ├── icon.ico / icon.png
│   └── meshagentarm64.exe       # Arm64 (futuro)
├── build/
│   └── installer.nsh            # Script NSIS customizado (pt-BR)
├── certs/                       # Certificados SSL da intranet COPPEAD
├── src/
│   ├── main.js                  # Entry point — Main Process Electron
│   ├── preload.js               # contextBridge segura Main↔Renderer
│   └── main/
│       ├── glpi-api.js          # Cliente GLPI REST API (tickets, auth, inventário)
│       ├── helpdesk-pro-api.js  # Cliente HelpDesk Pro NestJS API
│       ├── inventory-collector.js  # Coleta PowerShell (hardware/software)
│       ├── diagnostics-manager.js  # Verificações de rede e serviços
│       ├── logger.js            # Logger centralizado com rotação de arquivo
│       ├── update-manager.js    # Auto-updater com verificação SHA-256
│       ├── ipc/
│       │   ├── glpi.js          # Handlers IPC para GLPI (45+ canais)
│       │   ├── helpdesk-pro.js  # Handlers IPC para HelpDesk Pro
│       │   ├── mesh.js          # Handlers IPC para MeshCentral
│       │   ├── system.js        # Handlers IPC para sistema/OS
│       │   └── updates.js       # Handlers IPC para auto-updater
│       └── services/
│           ├── inventory-scheduler.js   # Scheduler de inventário (8h + backoff)
│           ├── notification-scheduler.js # Polling de notificações (5 min)
│           ├── mesh-runner.js           # Lifecycle do processo meshagent64.exe
│           ├── mesh-installer.js        # Instalação/verificação do MeshAgent
│           └── telemetry.js             # Coleta de métricas em tempo real
└── src/renderer/
    ├── index.html               # SPA — tela única com múltiplas seções
    ├── style.css                # Design system dark/light com CSS variables
    └── js/
        ├── app.js               # Bootstrap, status GLPI, polling, inicialização
        ├── auth.js              # Fluxo de login/logout LDAP
        ├── tickets.js           # Criação, listagem, templates, modal de confirmação
        ├── chat.js              # Followups e anexos com polling adaptativo
        ├── dashboard.js         # Gráfico Chart.js e resumo de chamados
        ├── mesh.js              # Interface de acesso remoto com checklist LGPD
        ├── settings.js          # Configurações, preferências e auto-updater UI
        ├── dom.js               # Navegação entre telas, temas, modo compacto
        ├── state.js             # Estado global compartilhado (ES Module)
        └── renderer.js          # Ponto de entrada do renderer (importa app.js)
```

---

## Modelo de Segurança IPC

Toda comunicação entre o renderer (browser) e o main process passa pelo `contextBridge`, garantindo que o renderer nunca tenha acesso direto ao Node.js.

### Validação de entrada (main process)

Todos os handlers IPC em `src/main/ipc/` aplicam validação antes de processar qualquer dado:

```javascript
// Todos os handlers validam entrada com estas funções:
function isString(v, maxLen = 2048) {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}
function isSafeInt(v) {
  return Number.isInteger(Number(v)) && Number(v) > 0;
}
```

### Whitelist de domínios

`glpi-api.js` e `ipc/system.js` validam URLs contra uma whitelist de domínios permitidos antes de fazer qualquer requisição ou abrir links externos. URLs fora da whitelist são rejeitadas com erro.

### Armazenamento seguro de credenciais

O session token GLPI é armazenado usando `electron.safeStorage` (DPAPI no Windows), nunca em plaintext.

---

## Integração GLPI

### Autenticação

O login usa **LDAP Basic Auth** via credenciais Windows do usuário. O token de sessão é obtido e cifrado via DPAPI.

### Endpoints utilizados

| Operação | Endpoint GLPI |
|---|---|
| Iniciar sessão | `GET /apirest.php/initSession` |
| Encerrar sessão | `GET /apirest.php/killSession` |
| Listar tickets | `GET /apirest.php/Ticket` |
| Criar ticket | `POST /apirest.php/Ticket` |
| Atualizar ticket | `PUT /apirest.php/Ticket/{id}` |
| Followups | `GET/POST /apirest.php/ITILFollowup` |
| Upload documento | `POST /apirest.php/Document` + link |
| Categorias | `GET /apirest.php/ITILCategory` |
| Localizações | `GET /apirest.php/Location` |
| Inventário | `POST /apirest.php/Inventory` |
| Perfil do usuário | `GET /apirest.php/getMyProfiles` |

### Campos enviados na criação de ticket

```json
{
  "name": "Título do chamado",
  "content": "Descrição detalhada",
  "itilcategories_id": 42,
  "locations_id": 7,
  "urgency": 3,
  "users_id_recipient": 123,
  "_hostname": "DESKTOP-ABC123",
  "_ip": "10.0.1.50",
  "_os": "Windows_NT 10.0.19045"
}
```

---

## Integração HelpDesk Pro

O HelpDesk Pro é o novo backend NestJS/Next.js/PostgreSQL do COPPEAD, destinado a substituir o GLPI progressivamente.

### Endpoints utilizados

| Operação | Endpoint |
|---|---|
| Health check | `GET /api/v1/health` |
| Registro de computador | `POST /api/v1/computers/agent` |
| Criar ticket | `POST /api/v1/tickets` |

### Payload de registro de computador

```json
{
  "hostname": "DESKTOP-ABC123",
  "ip": "10.0.1.50",
  "osType": "Windows_NT",
  "osRelease": "10.0.19045",
  "arch": "x64",
  "cpuModel": "Intel Core i7-10700",
  "cpuCores": 8,
  "totalMem": 17179869184,
  "csVendor": "Dell Inc.",
  "csModel": "OptiPlex 7080",
  "biosSerial": "ABC1234",
  "boardVendor": "Dell Inc.",
  "boardModel": "0MWYPT",
  "vm": false,
  "deviceType": "desktop",
  "agentVersion": "1.0.0"
}
```

O registro acontece automaticamente **15 segundos após a inicialização** do aplicativo (se a URL do HelpDesk Pro estiver configurada).

---

## Inventário Automático

### Coleta

`inventory-collector.js` executa scripts PowerShell para coletar:
- Hardware: CPU, RAM, disco, placa-mãe, BIOS, placa de vídeo
- Software: lista de aplicativos instalados (Win32_Product)
- Rede: interfaces, IPs, MACs

### Agendamento

`inventory-scheduler.js` agenda envios com backoff exponencial:
- Primeira execução: **ao iniciar** (se nunca enviado)
- Intervalo padrão: **a cada 8 horas**
- Em caso de falha: retry com backoff exponencial (máx. 4h)
- Fila offline: dados salvos em `offline-inventory.json` e reenviados quando online

---

## Acesso Remoto (MeshCentral)

O acesso remoto é implementado via `meshagent64.exe` (agente MeshCentral compilado para COPPEAD):

1. **Verificação**: o agente checa se o `meshagent64.exe` está presente
2. **Consentimento**: o usuário deve marcar um checklist de 4 itens LGPD
3. **Início**: `mesh-runner.js` inicia o processo como filho do main process
4. **Conexão**: o técnico acessa via `rdp.intranet.coppead.ufrj.br:4430` (WSS)
5. **Encerramento**: o usuário pode parar a sessão a qualquer momento via botão

---

## Notificações

`notification-scheduler.js` faz polling a cada **5 minutos** no GLPI para detectar:
- Novos followups em chamados abertos
- Mudanças de status de chamados

Ao detectar uma atualização, dispara uma notificação nativa do Windows (Toast).

O polling de chat na aba de detalhes é **adaptativo**:
- **3 segundos** quando a janela está em foco
- **10 segundos** quando a janela está minimizada ou desfocada

---

## Auto-Updater

O sistema de atualização funciona em quatro etapas:

1. **Verificação** (`check-for-updates`): consulta o servidor de updates e compara versões
2. **Banner**: exibe banner global no topo da janela com a nova versão e changelog
3. **Download** (`download-update`): baixa o instalador `.exe` com progresso em tempo real; verifica SHA-256
4. **Instalação** (`install-update`): executa o instalador NSIS em modo silencioso e encerra o app

Canais suportados: `stable` e `beta` (configurável em Configurações → Canal de Atualização).

---

## Configurações disponíveis

| Campo | Descrição |
|---|---|
| URL do GLPI | Endpoint base da instância GLPI (`https://chamados.intranet...`) |
| App Token | Token de aplicação GLPI |
| User Token | Token de usuário GLPI (fallback) |
| URL MeshCentral | Endpoint WSS do servidor MeshCentral |
| Grupo MeshCentral | ID do grupo de dispositivos no MeshCentral |
| Canal de Atualização | `stable` ou `beta` |
| URL HelpDesk Pro | Endpoint base do novo backend NestJS |
| API Key HelpDesk Pro | Chave de autenticação do HelpDesk Pro |

---

## Preferências de Interface

| Preferência | Opções | Persistência |
|---|---|---|
| Tema | Escuro / Claro | `localStorage` |
| Escala de fonte | Pequena / Normal / Grande | `localStorage` |
| Modo compacto | Ativado / Desativado | `localStorage` |

---

## Papéis de Usuário

O sistema detecta automaticamente o perfil do usuário logado no GLPI:

| Perfil | Acesso |
|---|---|
| **Usuário final** | Visualiza e abre apenas seus próprios chamados |
| **Técnico / Supervisor / Gerência** | Visualiza todos os chamados, pode alterar status e atribuição |
| **Super-Admin** | Acesso completo, mesma visão do técnico no agente |

---

## Segurança e LGPD

- O acesso remoto só é iniciado **com consentimento explícito** (checklist de 4 itens)
- Toda comunicação GLPI e HelpDesk Pro usa **TLS** (certificados da intranet aceitos via bundle em `certs/`)
- Credenciais nunca são armazenadas em texto claro (DPAPI via `safeStorage`)
- Nenhum dado é enviado sem ação do usuário ou agendamento explícito
- O usuário pode encerrar a sessão remota a qualquer momento
- URLs abertas externamente passam por whitelist de domínios

---

## Logs

O logger (`src/main/logger.js`) grava logs em:
- Console (desenvolvimento)
- Arquivo rotacionado em `%APPDATA%\Agente Helpdesk Pro\logs\`

Níveis: `info`, `warn`, `error`. Cada entrada inclui timestamp, nível, mensagem e módulo de origem.

---

## Suporte

**Setor de TI — COPPEAD/UFRJ**
- Email: ti@coppead.ufrj.br
- Portal: https://chamados.intranet.coppead.ufrj.br

---

<div align="center">
  <sub>Desenvolvido pelo Setor de TI do COPPEAD/UFRJ</sub>
</div>

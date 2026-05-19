# Agente Helpdesk Pro

> Uma central de atendimento técnica e suporte remoto de última geração, integrada nativamente com o GLPI Agent e MeshCentral, trazendo uma interface moderna com suporte a múltiplos temas.

---

## 🌟 Visão Geral

O **Agente Helpdesk Pro** é uma aplicação desktop desenvolvida em **Electron** e **Vanilla CSS/JS** de alto desempenho. Ele atua como um companheiro inteligente de suporte para o usuário final, substituindo soluções legadas e oferecendo uma ponte segura entre a máquina do cliente, o proxy local do **GLPI Agent** (via Perl na porta 62354) e sessões remotas assistidas do **MeshCentral**.

A aplicação foi desenhada sob rígidos padrões de estética moderna, empregando o conceito de **Glassmorphism**, transições suaves e adaptabilidade total entre os modos de cor Escuro e Claro.

---

## ✨ Principais Funcionalidades

*   **📊 Dashboard Central:** Visualização rápida com chamados recentes, monitoramento rápido de recursos e painel de status do agente.
*   **🎫 Abertura de Chamados Simplificada:** Envio direto de incidentes para o GLPI, incluindo classificação inteligente de categorias, seleção de urgência e anexo de arquivos/capturas de tela por zona de arrastar e soltar (drag & drop).
*   **💬 Timeline de Conversação (Chat):** Linha do tempo interativa e atualizada automaticamente para troca de mensagens e feedback em tempo real com o técnico encarregado do chamado.
*   **💻 Telemetria Completa de Hardware (PowerShell Seguro):** Coleta nativa e segura através de consultas `CIM/WMI` que mostram fabricante da placa-mãe, número de série da BIOS, fabricante, modelo, IP interno/externo, CPU e memória.
*   **📈 Gráficos de Desempenho em Tempo Real:** Gráficos interativos gerados via **Chart.js** exibindo oscilações de CPU e uso de memória RAM.
*   **🛡️ Suporte Remoto MeshCentral:** Consentimento de compartilhamento de tela com visualizador de logs seguro, gerando conformidade de segurança e controle manual.
*   **🌓 Alternador de Temas (Claro / Escuro):** Suporte nativo a Tema Claro projetado com paletas de cores de alto contraste que cumprem regras de acessibilidade e legibilidade visual, com persistência automática no sistema via `localStorage`.

---

## 📂 Estrutura do Projeto

A arquitetura do projeto é enxuta e modular:

```text
agente-helpdesk-pro/
├── assets/                  # Ativos estáticos (Ícones, Logos e Imagens)
├── src/
│   ├── main.js              # Processo principal (IPC, Ciclo de Vida, Chamadas PowerShell)
│   ├── preload.js           # Ponte de segurança isolada (ContextBridge)
│   └── renderer/
│       ├── index.html       # Estrutura HTML5 semântica e responsiva
│       ├── style.css        # Estilos, Grid Responsivo, Efeitos de Vidro e Temas
│       └── renderer.js      # Manipulação de DOM, requisições de API, gráficos e eventos
├── package.json             # Dependências (Electron, Chart.js, Axios) e scripts de build
└── README.md                # Este documento descritivo
```

---

## 🛠️ Tecnologias Utilizadas

*   **Electron:** Para empacotamento desktop multiplataforma nativo.
*   **HTML5 / Vanilla CSS:** Design customizado robusto, sem dependência de frameworks externos de CSS como Tailwind, garantindo carregamento instantâneo.
*   **Chart.js:** Biblioteca de renderização gráfica leve para gráficos lineares e donut.
*   **PowerShell Pipeline:** Integração nativa para extração de telemetria sem expor chaves inseguras.

---

## 🚀 Como Executar

### Pré-requisitos
Certifique-se de ter o [Node.js](https://nodejs.org/) instalado na máquina (versão 16+ recomendada).

### Instalação

1. Acesse o diretório do projeto:
   ```powershell
   cd "agente-helpdesk-pro"
   ```

2. Instale as dependências necessárias:
   ```powershell
   npm install
   ```

### Executando em Modo Desenvolvimento

Inicie a aplicação utilizando o script start:
```powershell
npm start
```

*Nota: Para rodar a partir da raiz do repositório pai, você pode utilizar:*
```powershell
npm start --prefix agente-helpdesk-pro
```

---

## 📦 Empacotamento para Produção

Para criar o instalador `.exe` nativo de produção otimizado para Windows, execute:
```powershell
npm run dist
```
O instalador compilado e portátil será gerado automaticamente na pasta `dist/`.

---

## 🔒 Segurança e Legibilidade
*   **Isolamento de Contexto:** A interface web não possui acesso direto aos módulos do Node.js ou comandos do shell, comunicando-se apenas via funções permitidas expostas no `preload.js`.
*   **Prevenção de Injeção de Código (XSS):** Todas as entradas e chats de suporte passam por pipelines de limpeza de caracteres antes da inserção na árvore de elementos DOM.

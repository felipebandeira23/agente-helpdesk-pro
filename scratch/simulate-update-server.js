/**
 * simulate-update-server.js
 * Servidor HTTP nativo simples para simular o fluxo de atualização do Agente.
 * Hospeda a versão 1.1.0 e fornece o instalador mock.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

// Cria um arquivo executável dummy para download caso não exista
const mockExePath = path.join(__dirname, 'dummy-installer.exe');
if (!fs.existsSync(mockExePath)) {
  fs.writeFileSync(mockExePath, 'MZdummyPEinstallerContentForTestingSilentInstallationFlowSuccessfullyReceivedAndExecuted');
}

const server = http.createServer((req, res) => {
  console.log(`[SIMULATOR] ${new Date().toLocaleTimeString()} - Requisição: ${req.url}`);

  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Endpoint do manifest de versão version.json
  if (req.url === '/agent/updates/version.json') {
    const versionData = {
      version: '1.1.0',
      url: `http://localhost:${PORT}/agent/updates/Agente-Helpdesk-Pro-Setup.exe`,
      changelog: 'Suporte completo a atualizações silenciosas na intranet e empacotamento premium para distribuição em lote com winget upgrade!'
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(versionData, null, 2));
    console.log('[SIMULATOR] Servido version.json para v1.1.0');
    return;
  }

  // 2. Endpoint do instalador executável
  if (req.url === '/agent/updates/Agente-Helpdesk-Pro-Setup.exe') {
    const stat = fs.statSync(mockExePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename=Agente-Helpdesk-Pro-Setup.exe'
    });

    const readStream = fs.createReadStream(mockExePath);
    readStream.pipe(res);
    console.log(`[SIMULATOR] Servindo instalador de tamanho ${stat.size} bytes...`);
    return;
  }

  // Rota padrão 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Rota de simulação não encontrada. Endpoints válidos: /agent/updates/version.json ou /agent/updates/Agente-Helpdesk-Pro-Setup.exe');
});

server.listen(PORT, () => {
  console.log('\n==================================================================');
  console.log(`🚀 Servidor de Simulação de Updates Ativo na porta ${PORT}!`);
  console.log(`🔗 Endpoint de versão: http://localhost:${PORT}/agent/updates/version.json`);
  console.log(`🔗 Endpoint do instalador: http://localhost:${PORT}/agent/updates/Agente-Helpdesk-Pro-Setup.exe`);
  console.log('==================================================================\n');
  console.log('Como testar no Agente Helpdesk Pro:\n');
  console.log('1. Vá em Configurações no Agente.');
  console.log(`2. Altere a URL do GLPI temporariamente para: http://localhost:${PORT}`);
  console.log('3. Clique em "Salvar Alterações".');
  console.log('4. Clique em "Buscar Atualizações" ou aguarde a checagem em segundo plano.');
  console.log('5. Veja o banner glassmorphic aparecer e teste o download 🚀\n');
  console.log('Pressione Ctrl+C para encerrar o servidor.');
});

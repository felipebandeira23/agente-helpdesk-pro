const glpiApi = require('./src/main/glpi-api.js');

async function test() {
  try {
    const config = glpiApi.getGlpiConfig();
    const sessionToken = await glpiApi.initSession();
    const axios = require('axios');
    const client = axios.create({
      timeout: 15000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    const headers = {
      'App-Token': config.appToken,
      'Session-Token': sessionToken,
      'Content-Type': 'application/json'
    };

    console.log('--- Teste 1: Buscar usuário "felipe.bandeira" com searchText simples ---');
    let res = await client.get(`${config.glpiUrl}/apirest.php/User`, {
      headers,
      params: { searchText: 'felipe.bandeira', range: '0-5' }
    });
    console.log('Resultado:', JSON.stringify(res.data, null, 2));

    console.log('--- Teste 2: Buscar todos os usuários ---');
    res = await client.get(`${config.glpiUrl}/apirest.php/User`, {
      headers,
      params: { range: '0-5' }
    });
    console.log('Primeiros 5 usuários:', res.data.map(u => ({ id: u.id, name: u.name, realname: u.realname })));
    
    console.log('--- Teste 3: Chamar getMyProfiles ---');
    res = await client.get(`${config.glpiUrl}/apirest.php/getMyProfiles`, { headers });
    console.log('Perfis da sessão atual:', JSON.stringify(res.data, null, 2));

    console.log('--- Teste 4: Chamar Full Session Info ---');
    try {
      res = await client.get(`${config.glpiUrl}/apirest.php/getActiveProfile`, { headers });
      console.log('Perfil ativo da sessão atual:', JSON.stringify(res.data, null, 2));
    } catch(e) {
      console.log('Falha ao obter perfil ativo:', e.message);
    }

  } catch (e) {
    console.error('Erro no teste:', e.message);
    if (e.response) console.error('Resposta erro:', e.response.data);
  }
}

test();

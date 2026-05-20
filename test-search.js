const glpiApi = require('./src/main/glpi-api.js');

async function test() {
  try {
    const config = glpiApi.getGlpiConfig();
    console.log('Testando busca de chamados usando a API de Search...');
    
    // Procura o ID do usuário logado
    const loggedUser = await glpiApi.findUserByLogin('felipe.bandeira');
    console.log('Usuário logado no GLPI:', loggedUser);
    
    if (loggedUser) {
      const uid = loggedUser.id;
      // Endpoint: search/Ticket com critério de Requerente (campo 4) = uid
      const axios = require('axios');
      const client = axios.create({
        timeout: 15000,
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      });
      
      const sessionToken = await glpiApi.initSession();
      const headers = {
        'App-Token': config.appToken,
        'Session-Token': sessionToken,
        'Content-Type': 'application/json'
      };
      
      const url = `${config.glpiUrl}/apirest.php/search/Ticket`;
      const params = {
        'criteria[0][field]': 4,
        'criteria[0][searchtype]': 'equals',
        'criteria[0][value]': uid,
        'range': '0-100'
      };
      
      console.log('Fazendo GET para:', url, 'com params:', params);
      const res = await client.get(url, { headers, params });
      
      console.log('Total de chamados encontrados na busca:', res.data.totalcount);
      if (res.data.data && res.data.data.length > 0) {
        console.log('Primeiro chamado retornado na busca:', JSON.stringify(res.data.data[0], null, 2));
      }
    }
  } catch (e) {
    console.error('Erro na busca:', e.message);
    if (e.response) {
      console.error('Dados do erro:', e.response.data);
    }
  }
}

test();

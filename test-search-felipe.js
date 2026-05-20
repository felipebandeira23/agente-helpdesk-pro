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

    console.log('--- Buscando chamados onde Felipe Bandeira (ID: 63) é o Requerente (campo 4) ---');
    const url = `${config.glpiUrl}/apirest.php/search/Ticket`;
    const params = {
      'criteria[0][field]': 4,
      'criteria[0][searchtype]': 'equals',
      'criteria[0][value]': 63,
      'range': '0-100'
    };
    
    const res = await client.get(url, { headers, params });
    console.log('Total encontrados:', res.data.totalcount);
    if (res.data.data) {
      console.log('Exemplo de chamado retornado:', JSON.stringify(res.data.data.slice(0, 2), null, 2));
    }
  } catch (e) {
    console.error('Erro no teste:', e.message);
  }
}

test();

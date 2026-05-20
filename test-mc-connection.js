const https = require('https');

const options = {
  hostname: 'rdp.intranet.coppead.ufrj.br',
  port: 443,
  path: '/',
  method: 'GET',
  rejectUnauthorized: false // we can check if it works first, but our electron app has the bypass
};

const req = https.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (data.includes('MeshCentral')) {
      console.log('SUCCESS: MeshCentral is serving the page!');
    } else {
      console.log('FAILURE: Response does not contain MeshCentral');
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.end();

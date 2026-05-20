const https = require('https');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function runTest() {
  const caPath = path.join(__dirname, 'certs', 'ca-cert.pem');
  const caExists = fs.existsSync(caPath);
  console.log(`Local CA Certificate exists: ${caExists}`);
  
  const caCert = caExists ? fs.readFileSync(caPath) : null;
  
  // Test GLPI (chamados.intranet.coppead.ufrj.br)
  try {
    console.log('\n--- TESTING GLPI CONNECTION ---');
    const agent = new https.Agent({
      rejectUnauthorized: true, // STRICT!
      ca: caCert
    });
    const res = await axios.get('https://chamados.intranet.coppead.ufrj.br', { httpsAgent: agent, timeout: 5000 });
    console.log(`GLPI connection SUCCESS! Status code: ${res.status}`);
  } catch (err) {
    console.error(`GLPI connection FAILED: ${err.message}`);
    if (err.code) console.error(`Error Code: ${err.code}`);
  }
  
  // Test MeshCentral (rdp.intranet.coppead.ufrj.br)
  try {
    console.log('\n--- TESTING MESHCENTRAL CONNECTION ---');
    const agent = new https.Agent({
      rejectUnauthorized: true, // STRICT!
      ca: caCert
    });
    const res = await axios.get('https://rdp.intranet.coppead.ufrj.br', { httpsAgent: agent, timeout: 5000 });
    console.log(`MeshCentral connection SUCCESS! Status code: ${res.status}`);
  } catch (err) {
    console.error(`MeshCentral connection FAILED: ${err.message}`);
    if (err.code) console.error(`Error Code: ${err.code}`);
  }
}

runTest();

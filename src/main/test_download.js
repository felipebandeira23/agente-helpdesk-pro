const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://rdp.intranet.coppead.ufrj.br/meshagents?id=SqLhnkz4tzPKII0PjJpAvZiyNkaG1pf2qdH%24kq4z8rKWyIudlu%24p1NJz9qji27f%24';
const dest = path.join(__dirname, 'meshagent_test.exe');

console.log('Tentando baixar do MeshCentral:', url);

const agent = new https.Agent({
  rejectUnauthorized: false
});

https.get(url, { agent }, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  if (res.statusCode === 200) {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Download concluído com sucesso!');
      console.log('Tamanho do arquivo:', fs.statSync(dest).size, 'bytes');
      fs.unlinkSync(dest);
    });
  } else {
    console.error('Erro no status code:', res.statusCode);
  }
}).on('error', (err) => {
  console.error('Erro de conexão:', err.message);
});

const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';

conn.on('ready', () => {
  console.log('Running diagnostics on remote server...\n');

  const cmd = `
    openssl verify -CAfile /etc/ssl/CA/ca-cert.pem /etc/ssl/certs/glpi.crt
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Erro:', err); conn.end(); process.exit(1); }
    stream.on('close', (code) => { conn.end(); process.exit(code ?? 0); })
      .on('data', (d) => process.stdout.write(d))
      .stderr.on('data', (d) => process.stderr.write(d));
  });
}).on('error', (err) => {
  console.error('FALHA:', err.message);
  process.exit(1);
}).connect({
  host: '172.28.100.12', port: 22,
  username: 'felipe', password: PASS,
  readyTimeout: 15000
});

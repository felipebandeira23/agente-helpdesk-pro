const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';
conn.on('ready', () => {
  const cmd = `
grep -i "GLPI_VERSION" /var/www/glpi/inc/define.php || grep -i "version" /var/www/glpi/inc/define.php || head -n 30 /var/www/glpi/CHANGELOG.md
`;

  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Erro:', err); conn.end(); process.exit(1); }
    stream.on('close', () => { conn.end(); })
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

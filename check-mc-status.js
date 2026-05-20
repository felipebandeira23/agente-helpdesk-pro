const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';

conn.on('ready', () => {
  const cmd = `
    echo "=== MESHCENTRAL STATUS ==="
    systemctl status meshcentral
    echo "=== MESHCENTRAL LOGS ==="
    journalctl -u meshcentral -n 50 --no-pager
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
          .on('data', data => process.stdout.write(data))
          .stderr.on('data', data => process.stderr.write(data));
  });
}).connect({ host: '172.28.100.12', port: 22, username: 'felipe', password: PASS });

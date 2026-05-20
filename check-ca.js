const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';

conn.on('ready', () => {
  console.log('SSH connection successful!\n');
  
  const cmd = `
    ls -l /etc/ssl/CA/ca-key.pem 2>/dev/null || echo "MISSING CA KEY"
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Error executing command:', err);
      conn.end();
      return;
    }
    
    stream.on('close', (code) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
}).connect({
  host: '172.28.100.12',
  port: 22,
  username: 'felipe',
  password: PASS,
  readyTimeout: 15000
});

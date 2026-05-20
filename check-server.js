const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';

conn.on('ready', () => {
  console.log('SSH connection successful! Running server state check...\n');
  
  const cmd = `
    echo "=== DATE & UPTIME ==="
    date
    uptime
    
    echo "=== MESHCENTRAL STATUS ==="
    systemctl status meshcentral || echo "MeshCentral service not found"
    ls -l /opt/meshcentral/meshcentral-data/ 2>/dev/null || echo "MeshCentral data directory not found"
    
    echo "=== NODE VERSION ==="
    node -v || echo "Node not found"
    npm -v || echo "NPM not found"
    
    echo "=== APACHE STATUS ==="
    systemctl status apache2 | grep Active
    ls -l /etc/apache2/sites-enabled/
    
    echo "=== CERTIFICATES ==="
    ls -l /etc/ssl/certs/rdp* /etc/ssl/private/rdp* 2>/dev/null || echo "No RDP certificates found"
    ls -l /etc/ssl/CA/ca-cert.pem 2>/dev/null || echo "Corporate CA not found"
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Error executing command:', err);
      conn.end();
      return;
    }
    
    stream.on('close', (code) => {
      console.log(`\nCheck completed with exit code: ${code}`);
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

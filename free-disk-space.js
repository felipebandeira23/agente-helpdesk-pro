const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';

conn.on('ready', () => {
  const cmd = `
    echo "=== DISK SPACE BEFORE ==="
    df -h /
    
    echo "=== CLEANING UP SPACE ==="
    sudo -S <<< "${PASS}" apt-get clean
    sudo -S <<< "${PASS}" apt-get autoremove -y
    sudo -S <<< "${PASS}" journalctl --vacuum-time=3d
    sudo -S <<< "${PASS}" rm -rf /var/log/*.gz /var/log/*/*.gz
    
    echo "=== DISK SPACE AFTER ==="
    df -h /
    
    echo "=== RESTARTING MESHCENTRAL ==="
    sudo -S <<< "${PASS}" systemctl restart meshcentral
    sleep 5
    systemctl status meshcentral
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
          .on('data', data => process.stdout.write(data))
          .stderr.on('data', data => process.stderr.write(data));
  });
}).connect({ host: '172.28.100.12', port: 22, username: 'felipe', password: PASS });

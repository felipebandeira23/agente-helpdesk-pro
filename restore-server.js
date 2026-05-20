const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';

conn.on('ready', () => {
  console.log('SSH connection successful! Starting server restore...\n');
  
  const cmd = `
    set -e
    
    sudo() {
      /usr/bin/sudo -S "$@" <<< "liplip22"
    }
    
    echo "=== 1. INSTALL NODE.JS ==="
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs npm
    fi
    node -v
    npm -v
    
    echo "=== 2. GENERATE CERTIFICATES ==="
    # Generate RDP certificate
    sudo openssl genrsa -out /etc/ssl/private/rdp.key 2048
    sudo openssl req -new -key /etc/ssl/private/rdp.key -out /tmp/rdp.csr -subj "/C=BR/ST=Rio de Janeiro/L=Rio de Janeiro/O=COPPEAD UFRJ/OU=TI/CN=rdp.intranet.coppead.ufrj.br"
    sudo bash -c 'openssl x509 -req -in /tmp/rdp.csr -CA /etc/ssl/CA/ca-cert.pem -CAkey /etc/ssl/CA/ca-key.pem -CAcreateserial -out /etc/ssl/certs/rdp.crt -days 3650 -extfile <(printf "subjectAltName=DNS:rdp.intranet.coppead.ufrj.br,DNS:rdp")'
    
    # Optional: ensure glpi.crt exists and is valid
    sudo openssl genrsa -out /etc/ssl/private/glpi.key 2048
    sudo openssl req -new -key /etc/ssl/private/glpi.key -out /tmp/glpi.csr -subj "/C=BR/ST=Rio de Janeiro/L=Rio de Janeiro/O=COPPEAD UFRJ/OU=TI/CN=chamados.intranet.coppead.ufrj.br"
    sudo bash -c 'openssl x509 -req -in /tmp/glpi.csr -CA /etc/ssl/CA/ca-cert.pem -CAkey /etc/ssl/CA/ca-key.pem -CAcreateserial -out /etc/ssl/certs/glpi.crt -days 3650 -extfile <(printf "subjectAltName=DNS:chamados.intranet.coppead.ufrj.br,DNS:chamados")'
    
    echo "=== 3. INSTALL MESHCENTRAL ==="
    sudo mkdir -p /opt/meshcentral/meshcentral-data
    cd /opt/meshcentral
    if [ ! -d "node_modules/meshcentral" ]; then
      sudo npm install meshcentral
    fi
    
    echo "=== 4. CONFIGURE MESHCENTRAL ==="
    sudo bash -c 'cat << "EOF" > /opt/meshcentral/meshcentral-data/config.json
{
  "settings": {
    "cert": "rdp.intranet.coppead.ufrj.br",
    "port": 4430,
    "redirPort": 8080,
    "sessionKey": "CoppeadMeshSecretSessionKey2026!",
    "allowagentupdates": true,
    "trustedProxies": "127.0.0.1",
    "agentTimeStampServer": false
  },
  "domains": {
    "": {
      "title": "Coppead Remote Support",
      "title2": "Helpdesk Pro",
      "minify": true,
      "newAccounts": true,
      "userNameIsEmail": false
    }
  }
}
EOF'
    sudo chown -R felipe:felipe /opt/meshcentral

    echo "=== 5. SETUP SYSTEMD SERVICE ==="
    sudo bash -c 'cat << "EOF" > /etc/systemd/system/meshcentral.service
[Unit]
Description=MeshCentral Server
After=network.target

[Service]
Type=simple
LimitNOFILE=8192
User=felipe
WorkingDirectory=/opt/meshcentral
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/meshcentral/node_modules/meshcentral
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF'

    sudo systemctl daemon-reload
    sudo systemctl enable meshcentral
    sudo systemctl restart meshcentral

    echo "=== 6. CONFIGURE APACHE VHOST ==="
    sudo bash -c 'cat << "EOF" > /etc/apache2/sites-available/meshcentral.conf
<VirtualHost *:80>
   ServerName rdp.intranet.coppead.ufrj.br
   Redirect permanent / https://rdp.intranet.coppead.ufrj.br/
</VirtualHost>

<VirtualHost *:443>
   ServerName rdp.intranet.coppead.ufrj.br

   SSLEngine on
   SSLCertificateFile /etc/ssl/certs/rdp.crt
   SSLCertificateKeyFile /etc/ssl/private/rdp.key
   SSLCACertificateFile /etc/ssl/CA/ca-cert.pem

   ProxyRequests Off
   ProxyPreserveHost On

   # SSL proxy config
   SSLProxyEngine On
   SSLProxyVerify none
   SSLProxyCheckPeerCN off
   SSLProxyCheckPeerName off
   SSLProxyCheckPeerExpire off

   # WebSocket Support
   RewriteEngine on
   RewriteCond %{HTTP:Upgrade} websocket [NC]
   RewriteCond %{HTTP:Connection} upgrade [NC]
   RewriteRule ^/?(.*) "wss://127.0.0.1:4430/$1" [P,L]

   ProxyPass / https://127.0.0.1:4430/
   ProxyPassReverse / https://127.0.0.1:4430/

   ErrorLog \${APACHE_LOG_DIR}/mesh_error.log
   CustomLog \${APACHE_LOG_DIR}/mesh_access.log combined
</VirtualHost>
EOF'

    sudo a2enmod proxy proxy_http proxy_wstunnel ssl rewrite
    sudo a2ensite meshcentral.conf
    sudo systemctl restart apache2
    
    echo "=== SERVER RESTORE COMPLETE ==="
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Error executing command:', err);
      conn.end();
      return;
    }
    
    stream.on('close', (code) => {
      console.log(`\nRestore completed with exit code: ${code}`);
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

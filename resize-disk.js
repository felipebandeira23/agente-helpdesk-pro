const { Client } = require('ssh2');
const conn = new Client();
const PASS = 'liplip22';

conn.on('ready', () => {
  const cmd = `
    echo "=== DISK LAYOUT ==="
    lsblk
    
    echo "=== RESIZING PARTITION ==="
    # Ensure cloud-guest-utils is installed for growpart
    sudo -S <<< "${PASS}" apt-get install -y cloud-guest-utils
    
    # Try to grow sda3 (assuming sda is the main disk and sda3 is the LVM partition, typical for Ubuntu)
    # We will detect the disk and partition holding the LVM
    VG_DEV=$(sudo -S <<< "${PASS}" pvs --noheadings -o pv_name | tr -d ' ')
    echo "Physical volume is $VG_DEV"
    
    DISK=\${VG_DEV%[0-9]*}
    PART_NUM=\${VG_DEV##*[a-z]}
    
    echo "Resizing partition $PART_NUM on disk $DISK"
    sudo -S <<< "${PASS}" growpart "$DISK" "$PART_NUM" || true
    
    echo "=== RESIZING PHYSICAL VOLUME ==="
    sudo -S <<< "${PASS}" pvresize "$VG_DEV"
    
    echo "=== RESIZING LOGICAL VOLUME ==="
    sudo -S <<< "${PASS}" lvextend -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
    
    echo "=== RESIZING FILESYSTEM ==="
    sudo -S <<< "${PASS}" resize2fs /dev/mapper/ubuntu--vg-ubuntu--lv
    
    echo "=== NEW DISK SPACE ==="
    df -h /
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
          .on('data', data => process.stdout.write(data))
          .stderr.on('data', data => process.stderr.write(data));
  });
}).connect({ host: '172.28.100.12', port: 22, username: 'felipe', password: PASS });

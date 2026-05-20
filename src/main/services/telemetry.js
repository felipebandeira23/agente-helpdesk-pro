/**
 * telemetry.js — Serviço de coleta de métricas de telemetria do sistema
 */

const os = require('os');
const { spawn } = require('child_process');

function getSystemMetrics() {
  return new Promise((resolve) => {
    const psScript = `
$os = Get-CimInstance Win32_OperatingSystem;
$cs = Get-CimInstance Win32_ComputerSystem;
$bios = Get-CimInstance Win32_BIOS;
$board = Get-CimInstance Win32_BaseBoard;
$extIp = try { (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 2) } catch { "Desconhecido" };
$vm = if ($cs.Model -match "Virtual|VMware|VirtualBox|Xen|Bochs|QEMU") { "Sim" } else { "Não" };
$type = if ($cs.PCSystemType -eq 2) { "Notebook" } else { "Computador" };

# Coleta adicionada para Diagnóstico Avançado
$cpuAvg = try { (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average } catch { 15 };
$cVolume = try { Get-Volume -DriveLetter C } catch { $null };
$diskFreePercent = if ($cVolume) { [Math]::Round(($cVolume.SizeRemaining / $cVolume.Size) * 100, 1) } else { 100 };

@{ 
  osName = $os.Caption; 
  osBuild = $os.BuildNumber; 
  osArch = $os.OSArchitecture; 
  csModel = $cs.Model; 
  csVendor = $cs.Manufacturer; 
  biosSerial = $bios.SerialNumber; 
  boardModel = $board.Product; 
  boardVendor = $board.Manufacturer; 
  boardSerial = $board.SerialNumber; 
  extIp = $extIp; 
  vm = $vm; 
  deviceType = $type;
  cpuUsage = $cpuAvg;
  diskFree = $diskFreePercent
} | ConvertTo-Json -Compress
`;

    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-']);
    let stdoutData = '';
    
    proc.stdout.on('data', (d) => { stdoutData += d.toString(); });
    
    proc.on('close', () => {
      let psData = {};
      try {
        const jsonStr = stdoutData.trim();
        if (jsonStr.startsWith('{')) psData = JSON.parse(jsonStr);
      } catch(e) {}
      
      const cpus = os.cpus();
      resolve({
        osType: psData.osName || (os.type() === 'Windows_NT' ? 'Microsoft Windows' : os.type()),
        osRelease: psData.osBuild || os.release(),
        arch: psData.osArch || os.arch(),
        totalMem: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
        cpuModel: (cpus && cpus.length > 0) ? cpus[0].model : 'Desconhecido',
        cpuCores: (cpus ? cpus.length : 0),
        hostname: os.hostname(),
        username: os.userInfo().username,
        ip: Object.values(os.networkInterfaces()).flat().find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || 'Desconhecido',
        extIp: psData.extIp || 'Desconhecido',
        vm: psData.vm || 'Não',
        deviceType: psData.deviceType || 'Computador',
        csVendor: psData.csVendor || 'Desconhecido',
        csModel: psData.csModel || 'Desconhecido',
        biosSerial: psData.biosSerial || 'Desconhecido',
        boardModel: psData.boardModel || 'Desconhecido',
        boardVendor: psData.boardVendor || 'Desconhecido',
        boardSerial: psData.boardSerial || 'Desconhecido',
        cpuUsage: psData.cpuUsage !== undefined ? Math.round(psData.cpuUsage) : 15,
        diskFree: psData.diskFree !== undefined ? psData.diskFree : 80
      });
    });
    
    proc.stdin.write(psScript);
    proc.stdin.end();
  });
}

function getOSUser() {
  return {
    username: os.userInfo().username,
    domain: process.env.USERDOMAIN || '',
    hostname: os.hostname(),
    ip: Object.values(os.networkInterfaces()).flat().find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || 'Desconhecido'
  };
}

module.exports = {
  getSystemMetrics,
  getOSUser
};

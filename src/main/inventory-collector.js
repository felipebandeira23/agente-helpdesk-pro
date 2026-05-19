const { spawn } = require('child_process');
const os = require('os');

/**
 * Normalizes a value to an array of objects.
 */
function ensureArray(val) {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

/**
 * Cleans string properties in an object or array recursively, removing null characters and trimming.
 */
function cleanData(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj.replace(/\0/g, '').trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanData);
  }
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      cleaned[key] = cleanData(obj[key]);
    }
    return cleaned;
  }
  return obj;
}

/**
 * Executes a PowerShell script to gather hardware and software telemetry,
 * formatted strictly in the GLPI Native Inventory JSON schema.
 * @returns {Promise<Object>} The collected inventory content.
 */
function collectInventory() {
  return new Promise((resolve, reject) => {
    const psScript = `
$ErrorActionPreference = "SilentlyContinue"

# 1. Computer System
$cs = Get-CimInstance Win32_ComputerSystem
$type = "Desktop"
if ($cs.PCSystemType -eq 2) { $type = "Notebook" }
elseif ($cs.PCSystemType -eq 1) { $type = "Desktop" }
elseif ($cs.PCSystemType -eq 3) { $type = "Workstation" }
elseif ($cs.PCSystemType -eq 4) { $type = "Enterprise Server" }
elseif ($cs.PCSystemType -eq 5) { $type = "SOHO Server" }

# 2. Operating System
$os = Get-CimInstance Win32_OperatingSystem

# 3. BIOS
$bios = Get-CimInstance Win32_BIOS

# 4. BaseBoard
$board = Get-CimInstance Win32_BaseBoard

# 5. UUID
$uuid = (Get-CimInstance Win32_ComputerSystemProduct).UUID

# 6. CPUs
$cpus = Get-CimInstance Win32_Processor | ForEach-Object {
    [PSCustomObject]@{
        arch = if ($_.AddressWidth -eq 64) { "x86_64" } else { "x86" }
        core = $_.NumberOfCores
        manufacturer = $_.Manufacturer
        name = if ($_.Name) { $_.Name.Trim() } else { "Desconhecido" }
        speed = $_.MaxClockSpeed
        thread = $_.NumberOfLogicalProcessors
    }
}

# 7. Memories
$memories = Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
    $capMB = [Math]::Round($_.Capacity / 1MB)
    [PSCustomObject]@{
        capacity = $capMB
        caption = $_.DeviceLocator
        description = $_.BankLabel
        speed = $_.Speed
        manufacturer = $_.Manufacturer
        serial = $_.SerialNumber
    }
}

# 8. Physical Disks for Media Type (SSD/HDD)
$physDisks = @{}
Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
    $physDisks[$_.DeviceId.ToString()] = $_.MediaType.ToString()
}

# 9. Storages
$storages = Get-CimInstance Win32_DiskDrive | ForEach-Object {
    $sizeMB = [Math]::Round($_.Size / 1MB)
    $indexStr = $_.Index.ToString()
    $mType = "HDD"
    if ($physDisks.ContainsKey($indexStr)) {
        $mType = $physDisks[$indexStr]
    } elseif ($_.Model -match "SSD" -or $_.Caption -match "SSD") {
        $mType = "SSD"
    }
    [PSCustomObject]@{
        name = $_.Caption
        model = $_.Model
        size = $sizeMB
        serial = $_.SerialNumber
        type = $mType
    }
}

# 10. Network adapters
$networks = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled } | ForEach-Object {
    [PSCustomObject]@{
        description = $_.Description
        mac = $_.MACAddress
        ipaddress = $_.IPAddress[0]
        ipmask = $_.IPSubnet[0]
        ipgateway = $_.DefaultIPGateway[0]
        dns = $_.DNSDomain
    }
}

# 11. Softwares (Registry-based, fast)
$softwareList = @()
$regPaths = @(
    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)
foreach ($path in $regPaths) {
    if (Test-Path (Split-Path $path)) {
        Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne "" -and $_.SystemComponent -ne 1 } | ForEach-Object {
            $softwareList += [PSCustomObject]@{
                name = $_.DisplayName.Trim()
                version = if ($_.DisplayVersion) { $_.DisplayVersion.ToString().Trim() } else { "1.0" }
                publisher = if ($_.Publisher) { $_.Publisher.ToString().Trim() } else { "" }
                install_date = if ($_.InstallDate) { $_.InstallDate.ToString().Trim() } else { "" }
            }
        }
    }
}

# Unique softwares by Name and Version
$uniqueSoftwares = @()
if ($softwareList.Count -gt 0) {
    $uniqueSoftwares = $softwareList | Group-Object name, version | ForEach-Object {
        $first = $_.Group[0]
        [PSCustomObject]@{
            name = $first.name
            version = $first.version
            publisher = $first.publisher
            install_date = $first.install_date
        }
    }
}

$bdate = $null
if ($bios.ReleaseDate) {
    try {
        $rawDate = $bios.ReleaseDate
        if ($rawDate -match "^\\d{8}") {
            $bdate = "$($rawDate.Substring(0,4))-$($rawDate.Substring(4,2))-$($rawDate.Substring(6,2))"
        } else {
            $bdate = [Management.ManagementDateTimeConverter]::ToDateTime($rawDate).ToString("yyyy-MM-dd")
        }
    } catch {}
}

$osInstall = $null
if ($os.InstallDate) {
    try {
        $rawDate = $os.InstallDate
        if ($rawDate -match "^\\d{8}") {
            $osInstall = "$($rawDate.Substring(0,4))-$($rawDate.Substring(4,2))-$($rawDate.Substring(6,2))"
        } else {
            $osInstall = [Management.ManagementDateTimeConverter]::ToDateTime($rawDate).ToString("yyyy-MM-dd")
        }
    } catch {}
}

# 12. Hardware/VM details
$vmSystem = "Physical"
if ($cs.Model -match "Virtual" -or $cs.Model -match "VMware" -or $cs.Model -match "VirtualBox" -or $cs.Model -match "Hyper-V" -or $cs.Model -match "QEMU" -or $cs.Model -match "KVM" -or $cs.Manufacturer -match "VMware" -or $cs.Manufacturer -match "Xen") {
    $vmSystem = "Virtual"
}
$totalMemoryMB = [Math]::Round($cs.TotalPhysicalMemory / 1MB)
$workgroupOrDomain = if ($cs.PartOfDomain) { $cs.Domain } else { $cs.Workgroup }
$activeDns = (Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.DNSServerSearchOrder } | Select-Object -First 1).DNSServerSearchOrder[0]
if (-not $activeDns) { $activeDns = $cs.DNSHostName }

$output = @{
    hardware = @{
        name = $env:COMPUTERNAME
        uuid = $uuid
        chassis_type = $type
        model = $cs.Model
        vmsystem = $vmSystem
        memory = $totalMemoryMB
        workgroup = $workgroupOrDomain
        dns = $activeDns
    }
    bios = @{
        bdate = $bdate
        bmanufacturer = $bios.Manufacturer
        bversion = $bios.SMBIOSBIOSVersion
        mmanufacturer = $board.Manufacturer
        mmodel = $board.Product
        msn = $board.SerialNumber
        smanufacturer = $cs.Manufacturer
        smodel = $cs.Model
        ssn = $bios.SerialNumber
    }
    cpus = $cpus
    memories = $memories
    storages = $storages
    networks = $networks
    operatingsystem = @{
        name = $os.Caption
        version = $os.Version
        arch = if ($os.OSArchitecture -match "64") { "x86_64" } else { "x86" }
        kernel_version = $os.BuildNumber
        installdate = $osInstall
    }
    softwares = $uniqueSoftwares
}

$output | ConvertTo-Json -Depth 5 -Compress
`;

    console.log('[INVENTORY] Starting PowerShell collection...');
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-']);
    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (d) => {
      stdoutData += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    proc.on('close', (code) => {
      console.log(`[INVENTORY] PowerShell finished with exit code ${code}`);
      if (code !== 0) {
        reject(new Error(`PowerShell collection exited with code ${code}. Error: ${stderrData}`));
        return;
      }

      try {
        const jsonStr = stdoutData.trim();
        if (!jsonStr) {
          reject(new Error('PowerShell returned empty output.'));
          return;
        }
        let data = JSON.parse(jsonStr);

        // Normalize arrays
        data.cpus = ensureArray(data.cpus);
        data.memories = ensureArray(data.memories);
        data.storages = ensureArray(data.storages);
        data.networks = ensureArray(data.networks);
        data.softwares = ensureArray(data.softwares);

        // Add versionclient
        data.versionclient = "GLPI-Agent_v1.11";

        // Sanitize softwares install_date
        if (Array.isArray(data.softwares)) {
          data.softwares = data.softwares.map(sw => {
            const newSw = { ...sw };
            if (newSw.install_date) {
              const matches = newSw.install_date.match(/^(\d{4})(\d{2})(\d{2})$/);
              if (matches) {
                newSw.install_date = `${matches[1]}-${matches[2]}-${matches[3]}`;
              } else if (!/^\d{4}-\d{2}-\d{2}/.test(newSw.install_date)) {
                delete newSw.install_date;
              }
            } else {
              delete newSw.install_date;
            }
            return newSw;
          });
        }

        // Sanitize memories speed to string
        if (Array.isArray(data.memories)) {
          data.memories = data.memories.map(m => {
            const newM = { ...m };
            if (newM.speed !== undefined && newM.speed !== null) {
              newM.speed = String(newM.speed);
            }
            return newM;
          });
        }

        // Clean null characters and whitespace recursively
        data = cleanData(data);

        // Recursive helper to remove nulls, undefined, and empty string properties
        function removeNullsAndEmpty(obj) {
          if (obj === null || obj === undefined) return undefined;
          if (Array.isArray(obj)) {
            return obj.map(removeNullsAndEmpty).filter(x => x !== undefined);
          }
          if (typeof obj === 'object') {
            const cleaned = {};
            for (const key of Object.keys(obj)) {
              const val = removeNullsAndEmpty(obj[key]);
              if (val !== undefined && val !== null && val !== '') {
                cleaned[key] = val;
              }
            }
            return cleaned;
          }
          return obj;
        }

        data = removeNullsAndEmpty(data);

        resolve(data);
      } catch (e) {
        reject(new Error(`Failed to parse PowerShell JSON output: ${e.message}\nRaw output: ${stdoutData.substring(0, 1000)}`));
      }
    });

    proc.stdin.write(psScript);
    proc.stdin.end();
  });
}

module.exports = {
  collectInventory
};

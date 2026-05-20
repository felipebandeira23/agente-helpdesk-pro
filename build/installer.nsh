; ============================================================
; Agente Helpdesk Pro — Script NSIS Customizado
; COPPEAD/UFRJ — Setor de TI
; ============================================================

; --- Após instalar: adicionar ao autostart, firewall e config GLPI ---
!macro customInstall
  ; Autostart: inicia com o Windows para o usuário que instalou
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" \
    "AgentHelpdeskPro" '"$INSTDIR\Agente Helpdesk Pro.exe"'

  ; Registro de informações do produto
  WriteRegStr HKLM "SOFTWARE\COPPEAD\HelpdeskPro" "Version" "1.0.0"
  WriteRegStr HKLM "SOFTWARE\COPPEAD\HelpdeskPro" "InstallPath" "$INSTDIR"
  WriteRegStr HKLM "SOFTWARE\COPPEAD\HelpdeskPro" "Publisher" "COPPEAD/UFRJ - Setor de TI"

  ; Cria pasta de configuração do usuário se não existir
  CreateDirectory "$APPDATA\agente-helpdesk-pro"

  ; Pré-configura o glpi-config.json com os tokens COPPEAD
  ; (só escreve se o arquivo não existir, para não sobrescrever config do usuário)
  IfFileExists "$APPDATA\agente-helpdesk-pro\glpi-config.json" config_exists config_create
  config_create:
    FileOpen $0 "$APPDATA\agente-helpdesk-pro\glpi-config.json" w
    FileWrite $0 '{$\n'
    FileWrite $0 '  "glpiUrl": "https://chamados.intranet.coppead.ufrj.br",$\n'
    FileWrite $0 '  "appToken": "KEFWiWcIFqIJNTpUOJksKMt6OmnBoGT6V1JCvX0F",$\n'
    FileWrite $0 '  "userToken": "",$\n'
    FileWrite $0 '  "meshUrl": "https://rdp.intranet.coppead.ufrj.br",$\n'
    FileWrite $0 '  "meshGroupId": "",$\n'
    FileWrite $0 '  "sessionToken": null,$\n'
    FileWrite $0 '  "sessionExpiry": null$\n'
    FileWrite $0 '}$\n'
    FileClose $0
  config_exists:

  ; Exceção no Firewall do Windows para o MeshAgent
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Agente Helpdesk Pro - MeshAgent" \
    dir=out action=allow program="$INSTDIR\resources\assets\meshagent64.exe" enable=yes profile=any'

  ; Exceção no Firewall para o app principal
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Agente Helpdesk Pro" \
    dir=out action=allow program="$INSTDIR\Agente Helpdesk Pro.exe" enable=yes profile=any'
!macroend

; --- Ao desinstalar: remover autostart e firewall ---
!macro customUnInstall
  ; Remove autostart
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AgentHelpdeskPro"
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AgentHelpdeskPro"

  ; Remove chaves de registro do produto
  DeleteRegKey HKLM "SOFTWARE\COPPEAD\HelpdeskPro"

  ; Remove exceções do Firewall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Agente Helpdesk Pro - MeshAgent"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Agente Helpdesk Pro"'

  ; Para o processo do MeshAgent se estiver rodando
  nsExec::ExecToLog 'taskkill /F /IM meshagent64.exe'
  nsExec::ExecToLog 'taskkill /F /IM "Agente Helpdesk Pro.exe"'
!macroend

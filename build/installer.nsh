; ============================================================
; Agente Helpdesk Pro — Script NSIS Customizado
; COPPEAD/UFRJ — Setor de TI
; ============================================================

; --- Após instalar: adicionar ao autostart do Windows ---
!macro customInstall
  ; Autostart: inicia com o Windows para todos os usuários
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" \
    "AgentHelpdeskPro" "$INSTDIR\Agente Helpdesk Pro.exe"

  ; Registro de informações do produto (aparece no Painel de Controle)
  WriteRegStr HKLM "SOFTWARE\COPPEAD\HelpdeskPro" "Version" "1.0.0"
  WriteRegStr HKLM "SOFTWARE\COPPEAD\HelpdeskPro" "InstallPath" "$INSTDIR"
  WriteRegStr HKLM "SOFTWARE\COPPEAD\HelpdeskPro" "Publisher" "COPPEAD/UFRJ - Setor de TI"

  ; Exceção no Firewall do Windows para o MeshAgent
  ExecWait 'netsh advfirewall firewall add rule name="Agente Helpdesk Pro - MeshAgent" \
    dir=out action=allow program="$INSTDIR\resources\assets\meshagent64.exe" enable=yes profile=any'

  ; Exceção no Firewall para o app principal
  ExecWait 'netsh advfirewall firewall add rule name="Agente Helpdesk Pro" \
    dir=out action=allow program="$INSTDIR\Agente Helpdesk Pro.exe" enable=yes profile=any'
!macroend

; --- Ao desinstalar: remover autostart e firewall ---
!macro customUnInstall
  ; Remove autostart
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AgentHelpdeskPro"

  ; Remove chaves de registro do produto
  DeleteRegKey HKLM "SOFTWARE\COPPEAD\HelpdeskPro"

  ; Remove exceções do Firewall
  ExecWait 'netsh advfirewall firewall delete rule name="Agente Helpdesk Pro - MeshAgent"'
  ExecWait 'netsh advfirewall firewall delete rule name="Agente Helpdesk Pro"'

  ; Para o processo do MeshAgent se estiver rodando
  ExecWait 'taskkill /F /IM meshagent64.exe'
!macroend

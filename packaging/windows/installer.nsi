Unicode True
RequestExecutionLevel user
ManifestDPIAware true
SetCompress off

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; --------------- Visual assets ---------------
; Place these files under packaging\windows\assets\:
;   app.ico              — 256x256 multi-res icon
!define ASSETS_DIR "${__FILEDIR__}\assets"

!define MUI_ICON   "${ASSETS_DIR}\app.ico"
!define MUI_UNICON "${ASSETS_DIR}\app.ico"

; Font size setting (use Segoe UI for clearer Win11/DPI rendering)
SetFont "Segoe UI" 9

; --------------- Abort warning ---------------
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "确定要取消安装 ${APP_NAME} 吗？"

!ifndef APP_VERSION
!define APP_VERSION "0.0.0"
!endif

!ifndef PAYLOAD_TAR
!error "PAYLOAD_TAR define is required"
!endif

!ifndef OUTPUT_EXE
!define OUTPUT_EXE "OfficeClaw-windows-x64-setup.exe"
!endif

!define APP_NAME "OfficeClaw"
!define COMPANY_KEY "ClowderLabs"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define INSTALL_KEY "Software\${COMPANY_KEY}\${APP_NAME}"
!define STARTMENU_DIR "$SMPROGRAMS\${APP_NAME}"
!define DEFAULT_INSTALL_DIR "$LOCALAPPDATA\Programs\${APP_NAME}"

Name "${APP_NAME}"
OutFile "${OUTPUT_EXE}"
InstallDir "${DEFAULT_INSTALL_DIR}"
InstallDirRegKey HKCU "${INSTALL_KEY}" "InstallDir"
BrandingText "${APP_NAME} Offline Installer"
ShowInstDetails show
ShowUninstDetails nevershow

; --------------- Welcome page (custom nsDialogs, no left bitmap) ---------------
Page custom WelcomePageCreate

; --------------- Directory page ---------------
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE VerifyInstallDirLeave
!insertmacro MUI_PAGE_DIRECTORY

; --------------- Install page ---------------
!insertmacro MUI_PAGE_INSTFILES

; --------------- Finish page (custom nsDialogs, no left bitmap) ---------------
Page custom FinishPageCreate FinishPageLeave

; --------------- Uninstaller pages ---------------
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; --------------- Language ---------------
!insertmacro MUI_LANGUAGE "SimpChinese"

Var WelcomeDialog
Var FinishDialog
Var FinishLaunchCheckbox

Function WelcomePageCreate
  !insertmacro MUI_HEADER_TEXT "欢迎安装 ${APP_NAME}" "本向导将引导您完成 ${APP_NAME} v${APP_VERSION} 的安装"
  nsDialogs::Create 1018
  Pop $WelcomeDialog
  ${If} $WelcomeDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 80% "欢迎使用 ${APP_NAME} v${APP_VERSION} 安装向导。$\r$\n$\r$\n${APP_NAME} 是一套开箱即用的本地 AI 运行环境，安装完成后即可使用。$\r$\n$\r$\n本安装包包含以下组件：$\r$\n  - Node.js 运行时$\r$\n  - Python 运行时$\r$\n  - Redis 数据库$\r$\n  - Web 管理界面$\r$\n  - MCP Server$\r$\n$\r$\n点击「下一步」选择安装位置。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function FinishPageCreate
  !insertmacro MUI_HEADER_TEXT "安装完成" "${APP_NAME} 已成功安装"
  nsDialogs::Create 1018
  Pop $FinishDialog
  ${If} $FinishDialog == error
    Abort
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:完成"

  ${NSD_CreateLabel} 0 0 100% 60% "${APP_NAME} 已成功安装到您的计算机。$\r$\n$\r$\n点击「完成」退出安装向导。"
  Pop $0

  ${NSD_CreateCheckbox} 0 65% 100% 12u "立即启动 ${APP_NAME}"
  Pop $FinishLaunchCheckbox
  ${NSD_Check} $FinishLaunchCheckbox

  nsDialogs::Show
FunctionEnd

Function FinishPageLeave
  ${NSD_GetState} $FinishLaunchCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    Exec "$INSTDIR\OfficeClaw.exe"
  ${EndIf}
FunctionEnd

Function .onInit
  SetShellVarContext current
FunctionEnd

Function un.onInit
  SetShellVarContext current
FunctionEnd

Function .onVerifyInstDir
  StrLen $0 $INSTDIR
  ${If} $0 > 200
    Abort
  ${EndIf}
FunctionEnd

Function VerifyInstallDirLeave
  StrLen $0 $INSTDIR
  ${If} $0 > 200
    MessageBox MB_ICONEXCLAMATION|MB_OK "安装路径过长（$0 字符），请选择较短的路径。"
    Abort
  ${EndIf}
FunctionEnd

; Force-kill every process related to $INSTDIR (launcher, node API, Redis).
; Uses env var to pass the path safely (avoids quoting issues with spaces/parens).
!macro _ForceKillInstalledProcesses
  ; 1. Kill desktop launcher by name only when it exists
  nsExec::ExecToLog 'cmd /c tasklist /FI "IMAGENAME eq OfficeClaw.exe" | find /I "OfficeClaw.exe" >nul && taskkill /F /IM OfficeClaw.exe >nul 2>&1'
  Pop $0
  ; 2. Kill Redis server by name only when it exists
  nsExec::ExecToLog 'cmd /c tasklist /FI "IMAGENAME eq redis-server.exe" | find /I "redis-server.exe" >nul && taskkill /F /IM redis-server.exe >nul 2>&1'
  Pop $0
  ; 3. Kill all node.exe processes whose executable path starts with $INSTDIR
  ;    (covers start-entry, API server, Next.js — anything spawned from tools\node)
  System::Call 'Kernel32::SetEnvironmentVariable(t "OFFICECLAW_INSTDIR", t "$INSTDIR")i'
  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$env:OFFICECLAW_INSTDIR, [System.StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Pop $0
  ; 4. Wait long enough for SQLite WAL/shm to be released before any file ops
  Sleep 3000
!macroend

Function CloseRunningServices
  !insertmacro _ForceKillInstalledProcesses
FunctionEnd

Function un.CloseRunningServices
  !insertmacro _ForceKillInstalledProcesses
FunctionEnd

; Delete all managed dirs/files in $INSTDIR, preserving user-data (.cat-cafe, data, logs, .env, cat-config.json).
; Uses cmd /c rd /s /q for speed — handles tens of thousands of files near-instantly.
!macro _CleanupManagedPayload
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\packages" rd /s /q "$INSTDIR\packages"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\tools" rd /s /q "$INSTDIR\tools"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\vendor" rd /s /q "$INSTDIR\vendor"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\scripts" rd /s /q "$INSTDIR\scripts"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\docs" rd /s /q "$INSTDIR\docs"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\cat-cafe-skills" rd /s /q "$INSTDIR\cat-cafe-skills"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\installer-seed" rd /s /q "$INSTDIR\installer-seed"'
  Pop $0
  Delete "$INSTDIR\.clowder-release.json"
  Delete "$INSTDIR\.env.example"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\pnpm-lock.yaml"
  Delete "$INSTDIR\pnpm-workspace.yaml"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\SETUP.md"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\AGENTS.md"
  Delete "$INSTDIR\CLA.md"
  Delete "$INSTDIR\CLAUDE.md"
  Delete "$INSTDIR\GEMINI.md"
  Delete "$INSTDIR\SECURITY.md"
  Delete "$INSTDIR\CONTRIBUTING.md"
  Delete "$INSTDIR\MAINTAINERS.md"
  Delete "$INSTDIR\TRADEMARKS.md"
  Delete "$INSTDIR\biome.json"
  Delete "$INSTDIR\tsconfig.base.json"
  Delete "$INSTDIR\.npmrc"
  Delete "$INSTDIR\cat-template.json"
  Delete "$INSTDIR\pnpm-workspace.yaml"
!macroend

Function CleanupManagedPayload
  !insertmacro _CleanupManagedPayload
FunctionEnd

Function un.CleanupManagedPayload
  !insertmacro _CleanupManagedPayload
FunctionEnd

Function WriteShellShortcuts
  CreateDirectory "${STARTMENU_DIR}"
  CreateShortCut "${STARTMENU_DIR}\${APP_NAME}.lnk" "$INSTDIR\OfficeClaw.exe" "" "$INSTDIR\assets\app.ico"
  CreateShortCut "${STARTMENU_DIR}\Stop ${APP_NAME}.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop-windows.ps1"' "$INSTDIR\assets\app.ico"
  CreateShortCut "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\OfficeClaw.exe" "" "$INSTDIR\assets\app.ico"
FunctionEnd

Function WriteUninstallRegistry
  WriteRegStr HKCU "${INSTALL_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Clowder Labs"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\assets\app.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
FunctionEnd

Section "Install"
  DetailPrint "正在准备安装环境..."
  Call CloseRunningServices
  CreateDirectory "$INSTDIR"
  Call CleanupManagedPayload
  DetailPrint "安装环境就绪..."

  ; Extract payload tar to a temp location then unpack via Windows tar.exe
  DetailPrint "正在释放安装文件..."
  SetOutPath "$INSTDIR"
  File "${PAYLOAD_TAR}"
  DetailPrint "正在解压安装文件..."
  nsExec::ExecToLog '"$WINDIR\System32\tar.exe" -xzf "$INSTDIR\payload.tar.gz" -C "$INSTDIR"'
  Pop $0
  Delete "$INSTDIR\payload.tar.gz"

  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\.cat-cafe"

  IfFileExists "$INSTDIR\.env" +2 0
    CopyFiles /SILENT "$INSTDIR\.env.example" "$INSTDIR\.env"
  IfFileExists "$INSTDIR\cat-config.json" +2 0
    CopyFiles /SILENT "$INSTDIR\installer-seed\cat-config.json" "$INSTDIR\cat-config.json"

  ; 检查并安装 WebView2 运行时
  DetailPrint "正在检查 WebView2 运行时..."
  ; 检查 HKLM (per-machine) 注册表
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 webview2_installed
  
  ; 检查 HKCU (per-user) 注册表
  ReadRegStr $1 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $1 "" webview2_not_installed webview2_installed

webview2_not_installed:
  DetailPrint "正在安装 WebView2 运行时..."
  ; 使用 /silent /install 参数静默安装
  nsExec::ExecToLog '"$INSTDIR\tools\webview2\MicrosoftEdgeWebview2Setup.exe" /silent /install'
  Pop $0
  ; 验证安装结果
  ReadRegStr $2 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $2 "" webview2_install_failed webview2_installed

webview2_install_failed:
  DetailPrint "警告: WebView2 安装失败，桌面启动器可能无法使用"
  Goto webview2_done

webview2_installed:
  StrCmp $0 "" webview2_check_hkcu webview2_found
webview2_check_hkcu:
  StrCmp $1 "" webview2_not_found webview2_found
webview2_not_found:
  DetailPrint "WebView2 未安装"
  Goto webview2_done
webview2_found:
  DetailPrint "WebView2 已安装 (版本: $0$1)"
webview2_done:

  ; Run post-install configuration (generate provider-profiles, cat-catalog, etc.)
  DetailPrint "正在初始化配置..."
  nsExec::ExecToLog '"$INSTDIR\tools\node\node.exe" "$INSTDIR\scripts\install-auth-config.mjs" modelarts-preset apply --project-dir "$INSTDIR"'
  Pop $0

  WriteUninstaller "$INSTDIR\uninstall.exe"
  Call WriteShellShortcuts
  Call WriteUninstallRegistry
SectionEnd

Var RemoveUserData

Section "Uninstall"
  Call un.CloseRunningServices

  Delete "${STARTMENU_DIR}\${APP_NAME}.lnk"
  Delete "${STARTMENU_DIR}\Stop ${APP_NAME}.lnk"
  Delete "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk"
  RMDir "${STARTMENU_DIR}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "${INSTALL_KEY}"

  ; Skip firewall rule cleanup: user-level installs do not create the rule.

  ; Ask user whether to remove user data
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除所有用户数据？$\r$\n$\r$\n将删除：$\r$\n  · 安装目录下的配置、数据库、日志（.cat-cafe、data、logs、.env）$\r$\n  · 全局配置目录（$PROFILE\.cat-cafe）$\r$\n$\r$\n选择「否」将保留以上数据，但可能影响下次安装的配置初始化。" IDYES +3
    StrCpy $RemoveUserData "0"
    Goto +2
    StrCpy $RemoveUserData "1"

  ; Remove entire install dir via cmd rd for speed
  Delete "$INSTDIR\uninstall.exe"
  ${If} $RemoveUserData == "1"
    ; Remove install dir (includes .cat-cafe, data, logs, SQLite files)
    nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR"'
    Pop $0
    ; Remove global user profiles (~/.cat-cafe) — provider keys, model profiles, project roots
    nsExec::ExecToLog 'cmd /c rd /s /q "$PROFILE\.cat-cafe"'
    Pop $0
  ${Else}
    Call un.CleanupManagedPayload
    RMDir "$INSTDIR"
  ${EndIf}
SectionEnd
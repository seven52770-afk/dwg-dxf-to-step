$ErrorActionPreference = 'Stop'
try {
    $ollamaExe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 3 }
    catch { Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden }
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    if (!(Test-Path -LiteralPath $nodeExe)) { $nodeExe = (Get-Command node -ErrorAction Stop).Source }
    try { $null = Invoke-RestMethod 'http://127.0.0.1:17863/api/status' -TimeoutSec 3 }
    catch {
        $serverFile = Join-Path $PSScriptRoot 'interface\server.mjs'
        Start-Process -FilePath $nodeExe -ArgumentList ('"' + $serverFile + '"') -WindowStyle Hidden -WorkingDirectory $PSScriptRoot
    }
    $ready = $false
    for ($i=0; $i -lt 20; $i++) {
        try { $null = Invoke-WebRequest 'http://127.0.0.1:17863/' -UseBasicParsing -TimeoutSec 2; $ready = $true; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (!$ready) { throw '無法啟動中文介面，請稍後重試。' }
    Start-Process 'http://127.0.0.1:17863/'
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('啟動失敗。請確認 Ollama 與本地 AI 資料夾仍存在，或請我協助檢查。','本地創作工作室') | Out-Null
}

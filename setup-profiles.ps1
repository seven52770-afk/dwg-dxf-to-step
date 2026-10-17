$ErrorActionPreference = 'Stop'
$ollamaExe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (!(Test-Path -LiteralPath $ollamaExe)) { throw 'Ollama is not installed.' }
& $ollamaExe pull qwen3:4b-instruct-2507-q4_K_M
if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }
foreach ($role in @('creator', 'cad', 'orders')) {
    & $ollamaExe create "jimmy-$role" -f (Join-Path $PSScriptRoot "profiles\$role.Modelfile")
    if ($LASTEXITCODE -ne 0) { throw "Profile creation failed: $role" }
}
& $ollamaExe list


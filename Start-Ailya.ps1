$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & bun scripts/runtime.ts start
    if ($LASTEXITCODE -ne 0) { throw 'Ailya 启动失败，请查看以上错误。' }
    $ailyaPort = if ($env:AILYA_PORT) { $env:AILYA_PORT } else { '4317' }
    Start-Process "http://127.0.0.1:$ailyaPort" -WindowStyle Hidden
} finally { Pop-Location }

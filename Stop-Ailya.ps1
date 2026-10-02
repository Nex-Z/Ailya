$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & bun scripts/runtime.ts stop
    if ($LASTEXITCODE -ne 0) { throw 'Ailya 尚未停止，请查看以上错误。' }
} finally { Pop-Location }

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
if (Test-Path ".tools\node\node.exe") {
  $env:Path = "$(Resolve-Path '.tools\node');$env:Path"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node not found. Run Install-and-Open.bat first."
  exit 1
}
node "$PSScriptRoot\scripts\update-app.mjs"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Update failed."
  exit $LASTEXITCODE
}

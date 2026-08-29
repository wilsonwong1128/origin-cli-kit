$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$Version = "v22.18.0"
$ZipName = "node-$Version-win-x64.zip"
$Url = "https://nodejs.org/dist/$Version/$ZipName"
$Tools = Join-Path $Root ".tools"
$Dest = Join-Path $Tools "node"
$Extract = Join-Path $Tools "_node_extract"
$Zip = Join-Path $env:TEMP $ZipName

if (Test-Path (Join-Path $Dest "node.exe")) {
  Write-Host "已有便撤 Node：$Dest"
  exit 0
}

Write-Host "正在下載 Node $Version（只需一次，唔使系統安裝）…"
New-Item -ItemType Directory -Force -Path $Tools | Out-Null
Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing

if (Test-Path $Extract) {
  Remove-Item $Extract -Recurse -Force
}
Expand-Archive -Path $Zip -DestinationPath $Extract -Force

$Inner = Get-ChildItem $Extract | Select-Object -First 1
if (-not $Inner) {
  throw "解壓 Node 失敗"
}
if (Test-Path $Dest) {
  Remove-Item $Dest -Recurse -Force
}
Move-Item $Inner.FullName $Dest
Remove-Item $Extract -Recurse -Force

if (-not (Test-Path (Join-Path $Dest "node.exe"))) {
  throw "找不到 node.exe"
}

Write-Host "Node 已就緒：$Dest"

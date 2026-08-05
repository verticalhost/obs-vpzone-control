$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules')) { npm install }
if (-not (Test-Path -LiteralPath 'dist/index.html')) { npm run build }
npm start

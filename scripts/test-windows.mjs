import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const executable = path.join(root, 'release', 'VPZONE-Control-Windows-x64', 'VPZONE-Control.exe')
const testPort = '14876'
const child = spawn(executable, [], { cwd: path.dirname(executable), windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: testPort } })

try {
  let response
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${testPort}/api/settings`)
      if (response.ok) break
    } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!response?.ok) throw new Error(`Le serveur Windows ne répond pas sur le port de test ${testPort}.`)
  const metrics = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${child.pid}) | Select-Object @{Name='RAM_MB';Expression={[math]::Round($_.WorkingSet64/1MB,1)}},@{Name='CPU_SECONDS';Expression={[math]::Round($_.CPU,2)}} | ConvertTo-Json -Compress`], { encoding: 'utf8' }).trim()
  console.log(`Test Windows réussi: HTTP ${response.status}, PID ${child.pid}, ressources ${metrics}`)
} finally {
  child.kill()
}

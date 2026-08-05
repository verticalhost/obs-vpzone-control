import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const work = path.join(root, '.sea-build')
const output = path.join(root, 'release', 'VPZONE-Control-Windows-x64')
const bundle = path.join(work, 'vpzone-control.cjs')
const blob = path.join(work, 'vpzone-control.blob')
const executable = path.join(output, 'VPZONE-Control.exe')
const archive = path.join(root, 'release', 'VPZONE-Control-v1.0.1-Windows-x64.zip')

await fs.rm(work, { recursive: true, force: true })
await fs.rm(output, { recursive: true, force: true })
await fs.rm(archive, { force: true })
await fs.mkdir(work, { recursive: true })
await fs.mkdir(output, { recursive: true })

execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: root, stdio: 'inherit' })

await build({
  entryPoints: [path.join(root, 'server', 'index.js')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  minify: true,
  legalComments: 'none',
})

const assetFiles = []
async function collectAssets(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) await collectAssets(absolute)
    else assetFiles.push(absolute)
  }
}
await collectAssets(path.join(root, 'dist'))
const assets = Object.fromEntries(assetFiles.map(file => [path.relative(path.join(root, 'dist'), file).replaceAll('\\', '/'), file]))

const seaConfig = path.join(work, 'sea-config.json')
await fs.writeFile(seaConfig, JSON.stringify({ main: bundle, output: blob, assets, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }))
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { cwd: root, stdio: 'inherit' })
await fs.copyFile(process.execPath, executable)

const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js')
execFileSync(process.execPath, [postject, executable, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { cwd: root, stdio: 'inherit' })

await fs.writeFile(path.join(output, 'README.txt'), [
  'VPZONE Control for OBS',
  '',
  '1. Run VPZONE-Control.exe and leave its window open.',
  '2. In OBS, open Docks > Custom Browser Docks.',
  '3. Use http://127.0.0.1:4876',
  '4. Alerts overlay: http://127.0.0.1:4876/?overlay=alerts',
  '',
  'OAuth data is stored in %APPDATA%\\VPZONE Control.',
].join('\r\n'))

execFileSync('tar.exe', ['-a', '-c', '-f', archive, '.'], { cwd: output, stdio: 'inherit' })

console.log(`Windows release created: ${archive}`)

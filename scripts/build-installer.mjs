import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const candidates = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env.ProgramFiles || '', 'Inno Setup 6', 'ISCC.exe'),
]
const compiler = candidates.find(candidate => fs.existsSync(candidate))
if (!compiler) throw new Error('Inno Setup 6 was not found. Install JRSoftware.InnoSetup with winget.')

execFileSync(compiler, [path.join(root, 'packaging', 'VPZONE-Control.iss')], { cwd: root, stdio: 'inherit' })

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

// src/devtools 是可抽成独立库的中立层：只许依赖 phaser 与目录内模块
const root = resolve('src/devtools')
const files: string[] = []
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.ts')) files.push(p)
  }
}
walk(root)

const IMPORT = /\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s*['"]([^'"]+)['"]/g
const errors: string[] = []
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (spec === undefined || spec === 'phaser') continue
    if (!spec.startsWith('.')) {
      errors.push(`${file}: devtools 只能依赖 phaser：${spec}`)
      continue
    }
    const target = resolve(dirname(file), spec)
    if (target !== root && !target.startsWith(root + sep)) errors.push(`${file}: devtools 不得引用目录之外的模块：${spec}`)
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

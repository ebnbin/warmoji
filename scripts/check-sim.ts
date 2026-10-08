import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

// 模拟层是 src/ecs 里表现层之外的部分：不碰引擎、渲染、界面、音频、存档与开发面板，运行期（含间接）只依赖 bitecs；声音与画面经 outbox 交给表现层，开发面板的开关经注入
const ecs = resolve('src/ecs')
const VIEW = ['EcsBattleScene.ts', 'atlas.ts', 'decor.ts', 'devProvider.ts', 'lens.ts', 'presentation.ts', 'render', 'viewRegistry.ts', 'views.ts'].map((p) => join(ecs, p))
const BANNED = [...VIEW, ...['src/audio', 'src/dev', 'src/devtools', 'src/editor', 'src/save', 'src/scene', 'src/ui'].map((p) => resolve(p))]
const PACKAGES = new Set(['bitecs'])

const under = (file: string, roots: readonly string[]): boolean => roots.some((r) => file === r || file.startsWith(r + sep))
const isSim = (file: string): boolean => under(file, [ecs]) && !under(file, VIEW)

const files: string[] = []
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.ts')) files.push(p)
  }
}
walk(ecs)

// 第 1 组是 type 关键字，第 4 组是 import('…') 后面接的类型名
const IMPORT = /\b(?:import|export)\b(\s+type\b)?[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)(\s*\.\s*(?!then\b)[A-Za-z_$])?|\bimport\s*['"]([^'"]+)['"]/g

interface Import {
  readonly spec: string
  readonly typeOnly: boolean
}

function importsOf(file: string): Import[] {
  const out: Import[] = []
  for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    if (m[2] !== undefined) out.push({ spec: m[2], typeOnly: m[1] !== undefined })
    else if (m[3] !== undefined) out.push({ spec: m[3], typeOnly: m[4] !== undefined })
    else if (m[5] !== undefined) out.push({ spec: m[5], typeOnly: false })
  }
  return out
}

function resolveFile(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec.replace(/\?.*$/, ''))
  for (const p of [base + '.ts', join(base, 'index.ts'), base]) if (existsSync(p) && statSync(p).isFile()) return p
  return null
}

const errors: string[] = []
const via = new Map<string, string | null>(files.filter(isSim).map((f) => [f, null]))
const queue = [...via.keys()]
const where = (file: string): string => {
  const chain: string[] = []
  for (let f: string | null | undefined = file; f; f = via.get(f)) chain.push(relative('.', f))
  return chain.length > 1 ? `${chain[0]}（由 ${chain.slice(1).join(' ← ')} 引入）` : chain[0]!
}

while (queue.length > 0) {
  const file = queue.shift()!
  if (!file.endsWith('.ts')) continue
  const sim = isSim(file)
  for (const { spec, typeOnly } of importsOf(file)) {
    if (typeOnly && !sim) continue
    if (!spec.startsWith('.')) {
      if (!PACKAGES.has(spec)) errors.push(`${where(file)}: 模拟层只许依赖 bitecs：${spec}`)
      continue
    }
    const target = resolveFile(file, spec)
    if (target === null) {
      errors.push(`${where(file)}: 解析不到：${spec}`)
      continue
    }
    if (under(target, BANNED)) {
      errors.push(`${where(file)}: 模拟层不得引用表现层、界面、音频、存档或开发工具：${spec}`)
      continue
    }
    if (!typeOnly && !via.has(target)) {
      via.set(target, file)
      queue.push(target)
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// 守卫：循环 import 能否运行取决于模块求值次序，改无关文件的 import 顺序就可能翻转成 ReferenceError；tsc 与 eslint 都不查

const ROOT = 'src'
/** import type 会被 TS 擦掉，不构成运行时环，故排除 */
const IMPORT = /^import\s+(type\s+)?[^'"]*from\s+'(\.[^']+)'/gm

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsFiles(p)
    return p.endsWith('.ts') ? [p] : []
  })
}

/** .ts 或目录 index.ts */
function resolve(from: string, spec: string): string | null {
  const base = normalize(join(dirname(from), spec))
  for (const cand of [`${base}.ts`, join(base, 'index.ts'), base]) {
    try {
      if (statSync(cand).isFile()) return normalize(cand)
    } catch {
      // 不存在就试下一种
    }
  }
  return null
}

/** 返回每条环的路径 */
function findCycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const cycles: string[][] = []
  const state = new Map<string, 1 | 2>()
  const stack: string[] = []
  const walk = (n: string): void => {
    state.set(n, 1)
    stack.push(n)
    for (const m of graph.get(n) ?? []) {
      if (state.get(m) === 1) cycles.push([...stack.slice(stack.indexOf(m)), m])
      else if (!state.has(m)) walk(m)
    }
    stack.pop()
    state.set(n, 2)
  }
  for (const n of [...graph.keys()].sort()) if (!state.has(n)) walk(n)
  return cycles
}

describe('模块图', () => {
  it('没有循环 import', () => {
    const files = tsFiles(ROOT)
    const graph = new Map<string, readonly string[]>()
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const outs = new Set<string>()
      for (const m of src.matchAll(IMPORT)) {
        if (m[1]) continue // import type
        const t = resolve(f, m[2]!)
        if (t && t !== normalize(f)) outs.add(t)
      }
      graph.set(normalize(f), [...outs].sort())
    }
    // 自检：图得真的连起来了，否则这条守卫等于没跑
    expect([...graph.values()].reduce((n, o) => n + o.length, 0)).toBeGreaterThan(200)

    const cycles = findCycles(graph).map((c) => c.map((p) => relative(ROOT, p)).join(' → '))
    expect(cycles, `发现循环 import：\n  ${cycles.join('\n  ')}`).toEqual([])
  })
})

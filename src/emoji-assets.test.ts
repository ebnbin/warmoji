import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emojiCodepoints } from './core/emoji'

const srcDir = dirname(fileURLToPath(import.meta.url))

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFiles(p))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

describe('twemoji 资产完整性', () => {
  it('源码用到的每个 emoji 在 twemoji-svg 全集中都有对应文件', () => {
    const emojiRe = new RegExp('\\p{RGI_Emoji}', 'gv')
    const used = new Set<string>()
    for (const file of tsFiles(srcDir)) {
      for (const m of readFileSync(file, 'utf8').matchAll(emojiRe)) {
        used.add(emojiCodepoints(m[0]))
      }
    }
    const available = new Set(
      readdirSync(join(srcDir, '../node_modules/twemoji-svg/dist'))
        .filter((f) => f.endsWith('.svg'))
        .map((f) => f.replace('.svg', '')),
    )
    expect([...used].filter((c) => !available.has(c)).sort()).toEqual([])
  })
})

import type Phaser from 'phaser'
import type { DevItem } from './types'

const TOP = 12
const CACHES = ['text', 'json', 'audio', 'video', 'xml', 'html', 'binary', 'bitmapFont', 'tilemap', 'atlas', 'shader', 'physics'] as const

const mb = (bytes: number): string => (bytes / 1048576).toFixed(1)

interface TextureRow {
  readonly key: string
  readonly w: number
  readonly h: number
  readonly bytes: number
  readonly frames: number
}

/** 引擎内置纹理（__ 前缀）不计入 */
function textureText(game: Phaser.Game): string {
  const tm = game.textures
  const rows: TextureRow[] = []
  let builtin = 0
  for (const key of Object.keys(tm.list)) {
    if (key.startsWith('__')) {
      builtin++
      continue
    }
    const t = tm.get(key)
    let bytes = 0
    let w = 0
    let h = 0
    for (const s of t.source) {
      bytes += s.width * s.height * 4
      w = Math.max(w, s.width)
      h = Math.max(h, s.height)
    }
    rows.push({ key, w, h, bytes, frames: t.frameTotal })
  }
  rows.sort((a, b) => b.bytes - a.bytes)
  const total = rows.reduce((s, r) => s + r.bytes, 0)
  const frames = rows.reduce((s, r) => s + r.frames, 0)
  const lines = [`${rows.length} 个 · 帧 ${frames} · 估算显存 ${mb(total)} MB · 引擎内置 ${builtin} 个未计`]
  for (const r of rows.slice(0, TOP)) lines.push(`${mb(r.bytes).padStart(6)} MB  ${r.w}×${r.h}  ${r.key}`)
  if (rows.length > TOP) lines.push(`… 其余 ${rows.length - TOP} 个`)
  return lines.join('\n')
}

function cacheText(game: Phaser.Game): string {
  const parts: string[] = []
  for (const name of CACHES) {
    const n = game.cache[name].getKeys().length
    if (n > 0) parts.push(`${name} ${n}`)
  }
  for (const [name, cache] of Object.entries(game.cache.custom)) {
    const n = cache.getKeys().length
    if (n > 0) parts.push(`${name} ${n}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '全部为空'
}

function loaderText(game: Phaser.Game): string {
  const lines: string[] = []
  for (const s of game.scene.getScenes(false)) {
    const l = s.load
    if (!l.isLoading()) continue
    lines.push(`${s.scene.key}  ${l.totalComplete}/${l.totalToLoad} · 在途 ${l.inflight.size} · ${Math.round(l.progress * 100)}%`)
  }
  return lines.length > 0 ? lines.join('\n') : '没有正在加载的 scene'
}

export function resourceItems(game: Phaser.Game): DevItem[] {
  return [
    { kind: 'text', label: '纹理 · 按估算显存降序', mono: true, read: () => textureText(game) },
    { kind: 'text', label: '缓存 · 各类型条目数', mono: true, read: () => cacheText(game) },
    { kind: 'text', label: '加载中', mono: true, read: () => loaderText(game) },
  ]
}

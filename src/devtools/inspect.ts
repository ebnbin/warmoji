import Phaser from 'phaser'
import { COLOR } from './draw'
import { addOverlayPainter, canvasToWorld } from './overlay'
import type { OverlayCtx } from './overlay'
import { refreshDevPanel } from './registry'
import type { DevItem } from './types'

type Bounded = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.GetBounds

interface Picked {
  readonly scene: Phaser.Scene
  readonly obj: Bounded
  readonly label: string
  readonly desc: string
}

const MAX_DRAW = 400

let game: Phaser.Game | undefined
let devKey = ''
let pickMode = false
let picked: Picked[] = []
let selected = 0
let showHitAreas = false
let showBounds = false

export function installInspect(g: Phaser.Game, devSceneKey: string): void {
  game = g
  devKey = devSceneKey
  addOverlayPainter(paint)
}

export function isPickMode(): boolean {
  return pickMode
}

function businessScenes(): Phaser.Scene[] {
  return game ? game.scene.getScenes(true).filter((s) => s.scene.key !== devKey) : []
}

function hasBounds(o: Phaser.GameObjects.GameObject): o is Bounded {
  return typeof (o as { getBounds?: unknown }).getBounds === 'function'
}

function walk(list: readonly Phaser.GameObjects.GameObject[], out: Phaser.GameObjects.GameObject[]): void {
  for (const o of list) {
    out.push(o)
    if (o instanceof Phaser.GameObjects.Container || o instanceof Phaser.GameObjects.Layer) walk(o.list, out)
  }
}

function allObjects(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const out: Phaser.GameObjects.GameObject[] = []
  walk(scene.children.list, out)
  return out
}

function scrollFactor(o: Phaser.GameObjects.GameObject): { x: number; y: number } {
  const sf = o as { scrollFactorX?: number; scrollFactorY?: number }
  return { x: sf.scrollFactorX ?? 1, y: sf.scrollFactorY ?? 1 }
}

function prop<T>(o: object, key: string): T | undefined {
  return (o as Record<string, unknown>)[key] as T | undefined
}

function describe(o: Phaser.GameObjects.GameObject): string {
  const parts = [o.type]
  if (o.name) parts.push(`"${o.name}"`)
  if (o instanceof Phaser.GameObjects.Text) parts.push(`“${o.text.replace(/\s+/g, ' ').slice(0, 24)}”`)
  const tex = prop<Phaser.Textures.Texture>(o, 'texture')
  if (tex?.key && !(o instanceof Phaser.GameObjects.Text)) parts.push(`[${tex.key}]`)
  return parts.join(' ')
}

function details(scene: Phaser.Scene, o: Phaser.GameObjects.GameObject, b: Phaser.Geom.Rectangle): string {
  const r = Math.round
  const alpha = prop<number>(o, 'alpha')
  const depth = prop<number>(o, 'depth')
  const bits = [
    scene.scene.key,
    `深度 ${depth ?? '-'}`,
    `(${r(b.x)}, ${r(b.y)}) ${r(b.width)}×${r(b.height)}`,
    alpha === undefined ? '' : `α ${alpha.toFixed(2)}`,
    prop<boolean>(o, 'visible') === false ? '隐藏' : '',
    o.input?.enabled ? '可交互' : '',
    o.parentContainer ? '容器内' : '',
  ]
  return bits.filter((x) => x !== '').join(' · ')
}

export function setPickMode(on: boolean): void {
  pickMode = on
}

export function pickAt(px: number, py: number): void {
  const found: { p: Picked; depth: number; index: number }[] = []
  let index = 0
  for (const scene of businessScenes()) {
    const cam = scene.cameras.main
    for (const o of allObjects(scene)) {
      index++
      if (!hasBounds(o) || prop<boolean>(o, 'visible') === false) continue
      const sf = scrollFactor(o)
      const w = canvasToWorld(cam, px, py, sf.x, sf.y)
      const b = o.getBounds()
      if (b.width <= 0 || b.height <= 0) continue
      if (w.x < b.x || w.x > b.right || w.y < b.y || w.y > b.bottom) continue
      found.push({ p: { scene, obj: o, label: describe(o), desc: details(scene, o, b) }, depth: prop<number>(o, 'depth') ?? 0, index })
    }
  }
  found.sort((a, b) => b.depth - a.depth || b.index - a.index)
  picked = found.map((f) => f.p)
  selected = 0
  pickMode = false
  refreshDevPanel()
}

function drawBounds(
  g: Phaser.GameObjects.Graphics,
  ctx: OverlayCtx,
  scene: Phaser.Scene,
  b: Phaser.Geom.Rectangle,
  sf: { x: number; y: number },
  color: number,
  alpha: number,
  width: number,
): void {
  const p0 = ctx.toLocal(scene, b.x, b.y, sf.x, sf.y)
  const p1 = ctx.toLocal(scene, b.right, b.bottom, sf.x, sf.y)
  g.lineStyle(width, color, alpha)
  g.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)
}

function paint(g: Phaser.GameObjects.Graphics, ctx: OverlayCtx): void {
  if (showHitAreas || showBounds) {
    let n = 0
    for (const scene of businessScenes()) {
      for (const o of allObjects(scene)) {
        if (n >= MAX_DRAW) break
        if (!hasBounds(o) || prop<boolean>(o, 'visible') === false) continue
        const interactive = o.input?.enabled === true
        if (!(showBounds || (showHitAreas && interactive))) continue
        drawBounds(g, ctx, scene, o.getBounds(), scrollFactor(o), interactive ? COLOR.warn : 0x80cbc4, interactive ? 0.8 : 0.35, 1)
        n++
      }
    }
  }
  picked.forEach((p, i) => {
    if (!p.obj.active || !p.scene.sys.isActive()) return
    const on = i === selected
    drawBounds(g, ctx, p.scene, p.obj.getBounds(), scrollFactor(p.obj), on ? 0xffffff : COLOR.danger, on ? 1 : 0.5, on ? 3 : 1)
  })
}

function breakdownText(): string {
  const lines: string[] = []
  for (const scene of businessScenes()) {
    const counts = new Map<string, number>()
    const all = allObjects(scene)
    for (const o of all) counts.set(o.type, (counts.get(o.type) ?? 0) + 1)
    const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`)
    lines.push(`${scene.scene.key} (${all.length}): ${parts.join(' · ')}`)
  }
  return lines.length > 0 ? lines.join('\n') : '没有活动的业务 scene'
}

export function inspectItems(): DevItem[] {
  const items: DevItem[] = [
    {
      kind: 'toggle',
      label: '拾取模式',
      desc: '开启后点一下面板外的画面，列出该点下的对象并画出边界；拾取一次后自动关闭',
      get: () => pickMode,
      set: setPickMode,
    },
    { kind: 'toggle', label: '显示命中区', desc: '活动 scene 里所有可交互对象的边界', get: () => showHitAreas, set: (on) => (showHitAreas = on) },
    { kind: 'toggle', label: '显示全部对象边界', desc: `最多画 ${MAX_DRAW} 个`, get: () => showBounds, set: (on) => (showBounds = on) },
  ]
  if (picked.length > 0) {
    items.push(
      {
        kind: 'choice',
        label: `拾取到 ${picked.length} 个对象 · 上层在前 · 点选高亮`,
        options: picked.map((p, i) => ({ id: String(i), label: p.label, desc: p.desc })),
        get: () => String(selected),
        set: (id) => (selected = Number(id)),
      },
      { kind: 'action', label: '清除拾取结果', run: () => (picked = []) },
    )
  }
  items.push({ kind: 'text', label: '显示列表 · 按类型计数（含容器内）', mono: true, read: breakdownText })
  return items
}

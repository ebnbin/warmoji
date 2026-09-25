import Phaser from 'phaser'
import { COLOR, roundRect, textStyle } from './draw'
import type { DevButtonsItem, DevChoiceItem, DevCustomItem, DevItem, DevOption, DevTextItem, DevTheme, DevToggleItem, DevWidget } from './types'

export interface RenderCtx {
  readonly scene: Phaser.Scene
  readonly theme: DevTheme
  readonly width: number
  /** 包装点击：跳过拖拽误触、播放反馈、执行后重建 */
  readonly tap: (fn: () => void) => () => void
}

/** objects 以条目左上角为原点 */
export interface Rendered {
  readonly objects: Phaser.GameObjects.GameObject[]
  readonly height: number
  readonly polled?: { readonly text: Phaser.GameObjects.Text; readonly read: () => string }
  readonly widget?: DevWidget
}

function zone(ctx: RenderCtx, x: number, y: number, w: number, h: number, onUp: () => void): Phaser.GameObjects.Zone {
  return ctx.scene.add
    .zone(x, y, w, h)
    .setOrigin(0)
    .setInteractive({ useHandCursor: true })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onUp)
}

function caption(ctx: RenderCtx, label: string): { obj: Phaser.GameObjects.Text; bottom: number } {
  const obj = ctx.scene.add.text(0, 0, label, textStyle(ctx.theme, ctx.theme.caption, { bold: true, color: COLOR.muted, wrap: ctx.width }))
  return { obj, bottom: obj.height + ctx.theme.body * 0.3 }
}

function renderText(item: DevTextItem, ctx: RenderCtx): Rendered {
  const objects: Phaser.GameObjects.GameObject[] = []
  let top = 0
  if (item.label !== undefined) {
    const c = caption(ctx, item.label)
    objects.push(c.obj)
    top = c.bottom
  }
  const text = ctx.scene.add.text(
    0,
    top,
    item.read(),
    textStyle(ctx.theme, item.mono ? ctx.theme.caption : ctx.theme.body, { mono: item.mono, wrap: ctx.width }),
  )
  objects.push(text)
  return { objects, height: top + text.height, polled: { text, read: item.read } }
}

interface RowStyle {
  readonly active?: boolean
  readonly reserveRight?: number
}

function renderRow(ctx: RenderCtx, y: number, label: string, desc: string | undefined, onTap: () => void, style: RowStyle = {}): Rendered {
  const u = ctx.theme.body
  const w = ctx.width
  const pad = u * 0.5
  const textW = w - u * 1.4 - (style.reserveRight ?? 0)
  const bg = ctx.scene.add.graphics()
  const labelObj = ctx.scene.add.text(u * 0.7, y + pad, label, textStyle(ctx.theme, ctx.theme.body, { bold: true, wrap: textW }))
  const objects: Phaser.GameObjects.GameObject[] = [bg, labelObj]
  let bottom = y + pad + labelObj.height
  if (desc) {
    const d = ctx.scene.add.text(u * 0.7, bottom + u * 0.15, desc, textStyle(ctx.theme, ctx.theme.caption, { color: COLOR.muted, wrap: textW }))
    objects.push(d)
    bottom = d.y + d.height
  }
  const h = Math.max(u * 2.2, bottom + pad - y)
  if (!desc) labelObj.setY(y + (h - labelObj.height) / 2)
  const accent = ctx.theme.accent
  roundRect(bg, 0, y, w, h, u * 0.55, {
    fill: style.active ? accent : COLOR.chip,
    fillAlpha: style.active ? 0.16 : 0.07,
    stroke: style.active ? accent : COLOR.line,
    strokeAlpha: style.active ? 0.7 : 0.12,
    strokeWidth: style.active ? 2 : 1,
  })
  objects.push(zone(ctx, 0, y, w, h, onTap))
  return { objects, height: y + h }
}

function renderToggle(item: DevToggleItem, ctx: RenderCtx): Rendered {
  const u = ctx.theme.body
  const tw = u * 2.6
  const th = u * 1.4
  const row = renderRow(ctx, 0, item.label, item.desc, ctx.tap(() => item.set(!item.get())), { reserveRight: tw + u * 0.6 })
  const on = item.get()
  const tx = ctx.width - u * 0.6 - tw
  const ty = row.height / 2 - th / 2
  const g = ctx.scene.add.graphics()
  roundRect(g, tx, ty, tw, th, th / 2, { fill: on ? ctx.theme.accent : COLOR.chip, fillAlpha: on ? 1 : 0.16 })
  g.fillStyle(on ? 0x1c1d24 : 0xc0c0cc, 1)
  g.fillCircle(on ? tx + tw - th / 2 : tx + th / 2, ty + th / 2, th / 2 - u * 0.2)
  const objects = [...row.objects]
  objects.splice(objects.length - 1, 0, g)
  return { objects, height: row.height }
}

function renderChips(
  label: string,
  options: readonly DevOption[],
  isOn: (o: DevOption) => boolean,
  pick: (o: DevOption) => void,
  ctx: RenderCtx,
): Rendered {
  const u = ctx.theme.body
  const c = caption(ctx, label)
  const objects: Phaser.GameObjects.GameObject[] = [c.obj]
  const chipH = u * 1.8
  const gap = u * 0.3
  const padX = u * 0.6
  let cx = 0
  let cy = c.bottom
  for (const o of options) {
    const on = isOn(o)
    const bg = ctx.scene.add.graphics()
    const t = ctx.scene.add.text(0, 0, o.label, textStyle(ctx.theme, ctx.theme.caption, { color: on ? COLOR.onAccent : COLOR.text }))
    const cw = Math.min(ctx.width, t.width + padX * 2)
    if (cx > 0 && cx + cw > ctx.width) {
      cx = 0
      cy += chipH + gap
    }
    roundRect(bg, cx, cy, cw, chipH, u * 0.45, {
      fill: on ? ctx.theme.accent : COLOR.chip,
      fillAlpha: on ? 0.92 : 0.09,
      stroke: COLOR.line,
      strokeAlpha: on ? 0 : 0.14,
    })
    t.setPosition(cx + cw / 2, cy + chipH / 2).setOrigin(0.5)
    objects.push(bg, t, zone(ctx, cx, cy, cw, chipH, ctx.tap(() => pick(o))))
    cx += cw + gap
  }
  return { objects, height: cy + chipH }
}

function renderButtons(item: DevButtonsItem, ctx: RenderCtx): Rendered {
  const u = ctx.theme.body
  const objects: Phaser.GameObjects.GameObject[] = []
  let cy = 0
  if (item.label !== undefined) {
    const c = caption(ctx, item.label)
    objects.push(c.obj)
    cy = c.bottom
  }
  const chipH = u * 1.8
  const gap = u * 0.3
  const padX = u * 0.6
  let cx = 0
  for (const b of item.buttons) {
    const bg = ctx.scene.add.graphics()
    const t = ctx.scene.add.text(0, 0, b.label, textStyle(ctx.theme, ctx.theme.caption))
    const cw = Math.min(ctx.width, t.width + padX * 2)
    if (cx > 0 && cx + cw > ctx.width) {
      cx = 0
      cy += chipH + gap
    }
    roundRect(bg, cx, cy, cw, chipH, u * 0.45, { fill: COLOR.chip, fillAlpha: 0.12, stroke: ctx.theme.accent, strokeAlpha: 0.45 })
    t.setPosition(cx + cw / 2, cy + chipH / 2).setOrigin(0.5)
    objects.push(bg, t, zone(ctx, cx, cy, cw, chipH, ctx.tap(b.run)))
    cx += cw + gap
  }
  return { objects, height: item.buttons.length > 0 ? cy + chipH : cy }
}

function renderChoiceRows(item: DevChoiceItem, ctx: RenderCtx): Rendered {
  const c = caption(ctx, item.label)
  const objects: Phaser.GameObjects.GameObject[] = [c.obj]
  const gap = ctx.theme.body * 0.35
  let cy = c.bottom
  const cur = item.get()
  for (const o of item.options) {
    const row = renderRow(ctx, cy, o.label, o.desc, ctx.tap(() => item.set(o.id)), { active: o.id === cur })
    objects.push(...row.objects)
    cy = row.height + gap
  }
  return { objects, height: cy - gap }
}

function renderCustom(item: DevCustomItem, ctx: RenderCtx): Rendered {
  const widget = item.mount({ scene: ctx.scene, width: ctx.width, theme: ctx.theme })
  return { objects: [...widget.objects], height: widget.height, widget }
}

export function renderItem(item: DevItem, ctx: RenderCtx): Rendered {
  switch (item.kind) {
    case 'text':
      return renderText(item, ctx)
    case 'action':
      return renderRow(ctx, 0, item.label, item.desc, ctx.tap(item.run))
    case 'toggle':
      return renderToggle(item, ctx)
    case 'choice':
      return item.options.some((o) => o.desc !== undefined)
        ? renderChoiceRows(item, ctx)
        : renderChips(item.label, item.options, (o) => item.get() === o.id, (o) => item.set(o.id), ctx)
    case 'flags':
      return renderChips(item.label, item.options, (o) => item.has(o.id), (o) => item.toggle(o.id), ctx)
    case 'buttons':
      return renderButtons(item, ctx)
    case 'custom':
      return renderCustom(item, ctx)
  }
}

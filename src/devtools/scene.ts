import Phaser from 'phaser'
import { devConfig, setCurrentLayout, themeOf } from './config'
import type { ResolvedConfig } from './config'
import { COLOR, hex, roundRect, textStyle } from './draw'
import { LOG_CHANGED, logEvents, unreadErrorCount } from './log'
import { listDevProviders, PANEL_REFRESH, REGISTRY_CHANGED, registryEvents } from './registry'
import type { DevProviderEntry } from './registry'
import { syncSceneHosts } from './sceneHosts'
import { ScrollRegion } from './scroll'
import type { Rect } from './scroll'
import { devSettings, SETTINGS_CHANGED, settingsEvents, updateDevSettings } from './settings'
import { enforceTimeControl, timeScale } from './timeControl'
import { isPickMode, pickAt } from './inspect'
import { sampleHistory } from './history'
import { canvasToWorld, paintOverlays, worldToCanvas } from './overlay'
import type { OverlayCtx } from './overlay'
import type { DevLayout, DevScope, DevSection, DevTheme, DevWidget } from './types'
import { renderItem } from './widgets'
import type { RenderCtx } from './widgets'

const DEPTH = { guides: 0, overlay: 2, picker: 5, pill: 10, panel: 20, blocker: 21, chrome: 22, content: 30 } as const
const POLL_MS = 250
const DRAG_SLOP = 12
const MARGIN = 12

interface Pill {
  readonly box: Phaser.GameObjects.Container
  readonly bg: Phaser.GameObjects.Graphics
  readonly text: Phaser.GameObjects.Text
  readonly badgeBg: Phaser.GameObjects.Graphics
  readonly badgeText: Phaser.GameObjects.Text
  readonly zone: Phaser.GameObjects.Zone
  readonly h: number
  w: number
  altered: boolean
}

interface PillDrag {
  readonly id: number
  readonly wx: number
  readonly wy: number
  readonly ox: number
  readonly oy: number
  moved: boolean
}

interface Entry {
  readonly box: Phaser.GameObjects.Container
  readonly height: () => number
}

interface Polled {
  readonly text: Phaser.GameObjects.Text
  readonly read: () => string
  last: string
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

const GROUPS: readonly { readonly scope: DevScope; readonly label: string }[] = [
  { scope: 'scene', label: '场景' },
  { scope: 'game', label: '游戏' },
  { scope: 'engine', label: '引擎' },
]

interface Tab {
  readonly key: string
  readonly label: string
  readonly section: DevSection
}

function tabsOf(entries: readonly DevProviderEntry[]): Tab[] {
  const multi = entries.length > 1
  return entries.flatMap((e) =>
    e.provider.sections.map((section) => ({
      key: `${e.scope}/${e.provider.id}/${section.id}`,
      label: multi && e.provider.sections.length > 1 ? `${e.provider.title}·${section.title}` : section.title,
      section,
    })),
  )
}

let open = false
const scrollByTab = new Map<string, number>()
const tabByGroup = new Map<DevScope, string>()

export class DevToolsScene extends Phaser.Scene {
  private cfg!: ResolvedConfig
  private layout!: DevLayout
  private theme!: DevTheme
  private panelCam!: Phaser.Cameras.Scene2D.Camera
  private guides!: Phaser.GameObjects.Graphics
  private overlay!: Phaser.GameObjects.Graphics
  private overlayCtx!: OverlayCtx
  private picker?: Phaser.GameObjects.Zone
  private pill?: Pill
  private drag?: PillDrag
  private chrome: Phaser.GameObjects.GameObject[] = []
  private region?: ScrollRegion
  private current?: Tab
  private entries: Entry[] = []
  private polled: Polled[] = []
  private widgets: DevWidget[] = []
  private contentH = -1
  private rebuildQueued = false
  private lastPoll = 0
  private shownUnread = -1

  constructor() {
    super(devConfig().key)
  }

  create(): void {
    this.cfg = devConfig()
    this.layout = this.cfg.layout(this)
    setCurrentLayout(this.layout)
    this.theme = themeOf(this.cfg, this.layout.textResolution)
    this.panelCam = this.cameras.add(0, 0, 2, 2)
    this.panelCam.setVisible(false)
    this.panelCam.inputEnabled = false
    this.guides = this.add.graphics().setDepth(DEPTH.guides)
    this.panelCam.ignore(this.guides)
    this.drawGuides()
    this.overlay = this.add.graphics().setDepth(DEPTH.overlay)
    this.panelCam.ignore(this.overlay)
    this.overlayCtx = {
      game: this.game,
      toLocal: (scene, x, y, sfx = 1, sfy = 1): { x: number; y: number } => {
        const c = worldToCanvas(scene.cameras.main, x, y, sfx, sfy)
        return canvasToWorld(this.cameras.main, c.x, c.y)
      },
      canvasToLocal: (px, py): { x: number; y: number } => canvasToWorld(this.cameras.main, px, py),
    }
    if (open) this.buildPanel()
    else this.buildPill()

    if (this.cfg.hotkey !== null) this.input.keyboard?.on(`keydown-${this.cfg.hotkey}`, () => this.togglePanel())
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPillMove, this)
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPillUp, this)
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPillUp, this)
    registryEvents.on(REGISTRY_CHANGED, this.queueRebuild, this)
    registryEvents.on(PANEL_REFRESH, this.queueRebuild, this)
    logEvents.on(LOG_CHANGED, this.refreshBadge, this)
    settingsEvents.on(SETTINGS_CHANGED, this.onSettingsChanged, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      registryEvents.off(REGISTRY_CHANGED, this.queueRebuild, this)
      registryEvents.off(PANEL_REFRESH, this.queueRebuild, this)
      logEvents.off(LOG_CHANGED, this.refreshBadge, this)
      settingsEvents.off(SETTINGS_CHANGED, this.onSettingsChanged, this)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this)
      if (this.current) this.rememberScroll(this.current)
      this.teardownPanel()
      this.pill = undefined
      this.picker = undefined
      this.drag = undefined
    })
  }

  /** 用墙钟而非引擎时间：慢放或暂停时面板照常刷新 */
  update(): void {
    syncSceneHosts()
    enforceTimeControl()
    this.overlay.clear()
    paintOverlays(this.overlay, this.overlayCtx)
    this.syncPicker()
    const now = performance.now()
    sampleHistory(now)
    if (this.rebuildQueued) {
      this.rebuildQueued = false
      if (open) this.rebuildPanel()
    }
    if (open) this.tickContent(now)
    else this.tickPill(now)
  }

  /** 拾取模式下铺一层全屏 zone 吃掉面板外的点击，业务 scene 收不到 */
  private syncPicker(): void {
    const want = isPickMode()
    if (want && !this.picker) {
      const L = this.layout
      this.picker = this.add
        .zone(0, 0, L.width, L.height)
        .setOrigin(0)
        .setDepth(DEPTH.picker)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (p: Phaser.Input.Pointer) => pickAt(p.x, p.y))
      this.panelCam.ignore(this.picker)
    } else if (!want && this.picker) {
      this.picker.destroy()
      this.picker = undefined
    }
  }

  private get gap(): number {
    return this.theme.body * 0.7
  }

  private queueRebuild(): void {
    this.rebuildQueued = true
  }

  private onResize(): void {
    this.scene.restart()
  }

  private onSettingsChanged(): void {
    this.drawGuides()
    if (this.pill) this.setPillText(this.pillLabel())
    if (open) this.queueRebuild()
  }

  private pillLabel(): string {
    const scale = timeScale()
    const tag = scale === 0 ? '暂停' : scale === 1 ? '' : `×${scale}`
    const body = devSettings().pillFps ? this.fpsText() : 'dev'
    return tag ? `${tag} ${body}` : body
  }

  private togglePanel(): void {
    this.cfg.onTap()
    open = !open
    if (open) {
      this.destroyPill()
      this.buildPanel()
    } else {
      if (this.current) this.rememberScroll(this.current)
      this.teardownPanel()
      this.buildPill()
    }
  }

  private drawGuides(): void {
    const g = this.guides
    g.clear()
    if (!devSettings().safeArea) return
    const L = this.layout
    const i = L.insets
    g.lineStyle(2, this.theme.accent, 0.7)
    g.strokeRect(i.left, i.top, L.width - i.left - i.right, L.height - i.top - i.bottom)
    g.lineStyle(1, 0xffffff, 0.3)
    g.strokeRect(0.5, 0.5, L.width - 1, L.height - 1)
  }

  private buildPill(): void {
    const u = this.theme.body
    const h = u * 2
    const text = this.add.text(0, 0, '', textStyle(this.theme, this.theme.body, { mono: true, bold: true })).setOrigin(0.5)
    const bg = this.add.graphics()
    const badgeBg = this.add.graphics()
    const badgeText = this.add.text(0, 0, '', textStyle(this.theme, this.theme.caption, { bold: true })).setOrigin(0.5)
    const zone = this.add.zone(0, 0, 1, 1).setOrigin(0).setInteractive({ useHandCursor: true })
    const box = this.add.container(0, 0, [bg, text, badgeBg, badgeText, zone]).setDepth(DEPTH.pill)
    this.panelCam.ignore(box)
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      const w = this.cameras.main.getWorldPoint(p.x, p.y)
      this.drag = { id: p.id, wx: w.x, wy: w.y, ox: box.x, oy: box.y, moved: false }
    })
    this.pill = { box, bg, text, badgeBg, badgeText, zone, h, w: 0, altered: false }
    this.setPillText(this.pillLabel())
    this.shownUnread = -1
    this.refreshBadge()
  }

  private destroyPill(): void {
    this.pill?.box.destroy()
    this.pill = undefined
    this.drag = undefined
  }

  private fpsText(): string {
    return `${Math.round(this.game.loop.actualFps)} fps`
  }

  private setPillText(s: string): void {
    const pill = this.pill
    if (!pill || pill.text.text === s) return
    pill.text.setText(s)
    const u = this.theme.body
    const w = Math.max(u * 3.2, pill.text.width + u * 1.4)
    const altered = timeScale() !== 1
    if (Math.abs(w - pill.w) > 1 || altered !== pill.altered) {
      pill.w = w
      pill.altered = altered
      pill.bg.clear()
      roundRect(pill.bg, -w / 2, -pill.h / 2, w, pill.h, pill.h / 2, {
        fill: COLOR.bg, fillAlpha: 0.72, stroke: altered ? COLOR.warn : this.theme.accent, strokeAlpha: altered ? 0.9 : 0.5, strokeWidth: 2,
      })
      pill.zone.setPosition(-w / 2, -pill.h / 2).setSize(w, pill.h)
      if (!this.drag) {
        const home = this.pillHome(pill)
        pill.box.setPosition(home.x, home.y)
      }
      this.shownUnread = -1
      this.refreshBadge()
    }
  }

  private usableHeight(pill: Pill): number {
    const L = this.layout
    return Math.max(0, L.height - L.insets.top - L.insets.bottom - pill.h - MARGIN * 2)
  }

  private pillHome(pill: Pill): { x: number; y: number } {
    const L = this.layout
    const s = devSettings()
    return {
      x: s.side === 'right' ? L.width - L.insets.right - MARGIN - pill.w / 2 : L.insets.left + MARGIN + pill.w / 2,
      y: L.insets.top + MARGIN + pill.h / 2 + s.y * this.usableHeight(pill),
    }
  }

  private onPillMove(p: Phaser.Input.Pointer): void {
    const d = this.drag
    const pill = this.pill
    if (!d || !pill || p.id !== d.id) return
    const w = this.cameras.main.getWorldPoint(p.x, p.y)
    if (!d.moved && Math.hypot(w.x - d.wx, w.y - d.wy) > DRAG_SLOP) d.moved = true
    if (!d.moved) return
    const L = this.layout
    pill.box.setPosition(
      clamp(d.ox + w.x - d.wx, L.insets.left + MARGIN + pill.w / 2, L.width - L.insets.right - MARGIN - pill.w / 2),
      clamp(d.oy + w.y - d.wy, L.insets.top + MARGIN + pill.h / 2, L.height - L.insets.bottom - MARGIN - pill.h / 2),
    )
  }

  private onPillUp(p: Phaser.Input.Pointer): void {
    const d = this.drag
    if (!d || p.id !== d.id) return
    this.drag = undefined
    const pill = this.pill
    if (!pill) return
    if (!d.moved) {
      this.togglePanel()
      return
    }
    const L = this.layout
    const usable = this.usableHeight(pill)
    updateDevSettings({
      side: pill.box.x < L.width / 2 ? 'left' : 'right',
      y: usable > 0 ? clamp((pill.box.y - (L.insets.top + MARGIN + pill.h / 2)) / usable, 0, 1) : 1,
    })
    const home = this.pillHome(pill)
    pill.box.setPosition(home.x, home.y)
  }

  private refreshBadge(): void {
    const n = unreadErrorCount()
    if (n === this.shownUnread) return
    this.shownUnread = n
    const pill = this.pill
    if (!pill) return
    pill.badgeBg.clear()
    pill.badgeText.setText(n > 0 ? (n > 99 ? '99+' : String(n)) : '')
    if (n === 0) return
    const r = Math.max(this.theme.body * 0.62, pill.badgeText.width / 2 + 4)
    const bx = pill.w / 2 - r * 0.4
    const by = -pill.h / 2 + r * 0.4
    pill.badgeBg.fillStyle(COLOR.danger, 1)
    pill.badgeBg.fillCircle(bx, by, r)
    pill.badgeText.setPosition(bx, by)
  }

  private tickPill(time: number): void {
    if (!this.pill || time - this.lastPoll < POLL_MS) return
    this.lastPoll = time
    this.setPillText(this.pillLabel())
  }

  private buildPanel(): void {
    const L = this.layout
    const th = this.theme
    const u = th.body
    const s = devSettings()
    const availW = L.width - L.insets.left - L.insets.right - MARGIN * 2
    const w = Math.max(u * 8, Math.min(s.wide ? u * 36 : u * 22, availW))
    const x = s.side === 'right' ? L.width - L.insets.right - MARGIN - w : L.insets.left + MARGIN
    const y = L.insets.top + MARGIN
    const h = L.height - L.insets.top - L.insets.bottom - MARGIN * 2
    const chrome: Phaser.GameObjects.GameObject[] = []
    const bg = this.add.graphics().setDepth(DEPTH.panel)
    roundRect(bg, x, y, w, h, u * 0.7, { fill: COLOR.bg, fillAlpha: 0.93, stroke: th.accent, strokeAlpha: 0.35, strokeWidth: 2 })
    chrome.push(bg, this.add.zone(x, y, w, h).setOrigin(0).setDepth(DEPTH.blocker).setInteractive())
    const headH = u * 2.2
    chrome.push(
      this.add
        .text(x + u * 0.8, y + headH / 2, this.cfg.title, textStyle(th, th.strong, { bold: true, color: hex(th.accent) }))
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.chrome),
      this.add
        .text(x + w - u * 0.8, y + headH / 2, '收起 ×', textStyle(th, th.caption, { color: COLOR.muted }))
        .setOrigin(1, 0.5)
        .setDepth(DEPTH.chrome),
      this.add
        .zone(x, y, w, headH)
        .setOrigin(0)
        .setDepth(DEPTH.chrome)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.togglePanel()),
    )
    const groupsBottom = this.buildGroups(chrome, s.group, x + u * 0.6, y + headH, w - u * 1.2)
    const entries = listDevProviders(s.group)
    const tabs = tabsOf(entries)
    const current = tabs.find((t) => t.key === s.tab) ?? tabs[0]
    this.current = current
    let tabsBottom = this.buildTabs(chrome, tabs, current, x + u * 0.6, groupsBottom, w - u * 1.2)
    if (tabs.length === 0) {
      const hint =
        s.group === 'scene'
          ? '当前活动的 scene 都没有注册能力：让 scene 实现 devProvider()'
          : s.group === 'game'
            ? '游戏还没有注册能力：用 registerGameProvider'
            : '没有引擎能力'
      const t = this.add
        .text(x + u * 0.6, groupsBottom + u * 0.4, hint, textStyle(th, th.caption, { color: COLOR.muted, wrap: w - u * 1.2 }))
        .setDepth(DEPTH.chrome)
      chrome.push(t)
      tabsBottom = t.y + t.height
    }
    for (const o of chrome) this.panelCam.ignore(o)
    this.chrome = chrome
    const top = tabsBottom + u * 0.4
    const rect: Rect = { x: x + u * 0.6, y: top, w: w - u * 1.2, h: Math.max(u, y + h - top - u * 0.5) }
    this.region = new ScrollRegion(this, this.panelCam, rect, DEPTH.content)
    if (current) {
      this.renderContent(current.section)
      this.region.scrollTo(scrollByTab.get(current.key) ?? 0)
    }
  }

  /** 三组导航：场景（当前活动 scene 注册的）、游戏、引擎；场景组标出是哪些 scene */
  private buildGroups(chrome: Phaser.GameObjects.GameObject[], active: DevScope, x0: number, y0: number, maxW: number): number {
    const th = this.theme
    const u = th.body
    const chipH = u * 1.6
    const gap = u * 0.3
    const padX = u * 0.55
    let cx = 0
    const cy = y0 + u * 0.2
    for (const g of GROUPS) {
      const entries = listDevProviders(g.scope)
      const n = entries.reduce((sum, e) => sum + e.provider.sections.length, 0)
      const on = g.scope === active
      const owners = g.scope === 'scene' ? entries.map((e) => e.owner ?? e.provider.title).join('·') : ''
      const label = `${g.label} ${n}${owners ? ` · ${owners}` : ''}`
      const bg = this.add.graphics().setDepth(DEPTH.chrome)
      const t = this.add
        .text(0, 0, label, textStyle(th, th.caption, { color: on ? hex(th.accent) : COLOR.muted, bold: on }))
        .setDepth(DEPTH.chrome)
      const cw = Math.min(maxW, t.width + padX * 2)
      if (cx > 0 && cx + cw > maxW) break
      roundRect(bg, x0 + cx, cy, cw, chipH, u * 0.35, {
        fill: on ? th.accent : COLOR.chip, fillAlpha: on ? 0.16 : 0.05, stroke: on ? th.accent : COLOR.line, strokeAlpha: on ? 0.7 : 0.1,
      })
      t.setPosition(x0 + cx + cw / 2, cy + chipH / 2).setOrigin(0.5)
      const z = this.add
        .zone(x0 + cx, cy, cw, chipH)
        .setOrigin(0)
        .setDepth(DEPTH.chrome)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (on) return
          this.cfg.onTap()
          if (this.current) this.rememberScroll(this.current)
          updateDevSettings({ group: g.scope, tab: tabByGroup.get(g.scope) ?? null })
          this.queueRebuild()
        })
      chrome.push(bg, t, z)
      cx += cw + gap
    }
    return cy + chipH + u * 0.2
  }

  private buildTabs(
    chrome: Phaser.GameObjects.GameObject[],
    tabs: readonly Tab[],
    current: Tab | undefined,
    x0: number,
    y0: number,
    maxW: number,
  ): number {
    const th = this.theme
    const u = th.body
    const chipH = u * 1.8
    const gap = u * 0.3
    const padX = u * 0.6
    let cx = 0
    let cy = y0 + u * 0.2
    for (const tab of tabs) {
      const on = tab === current
      const badge = tab.section.badge?.() ?? ''
      const bg = this.add.graphics().setDepth(DEPTH.chrome)
      const t = this.add
        .text(0, 0, badge === '' ? tab.label : `${tab.label} ${badge}`, textStyle(th, th.caption, { color: on ? COLOR.onAccent : COLOR.text, bold: on }))
        .setDepth(DEPTH.chrome)
      const cw = Math.min(maxW, t.width + padX * 2)
      if (cx > 0 && cx + cw > maxW) {
        cx = 0
        cy += chipH + gap
      }
      roundRect(bg, x0 + cx, cy, cw, chipH, u * 0.45, {
        fill: on ? th.accent : COLOR.chip, fillAlpha: on ? 0.92 : 0.09, stroke: COLOR.line, strokeAlpha: on ? 0 : 0.14,
      })
      t.setPosition(x0 + cx + cw / 2, cy + chipH / 2).setOrigin(0.5)
      const z = this.add
        .zone(x0 + cx, cy, cw, chipH)
        .setOrigin(0)
        .setDepth(DEPTH.chrome)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (on) return
          this.cfg.onTap()
          if (current) this.rememberScroll(current)
          tabByGroup.set(devSettings().group, tab.key)
          updateDevSettings({ tab: tab.key })
          this.queueRebuild()
        })
      chrome.push(bg, t, z)
      cx += cw + gap
    }
    return tabs.length > 0 ? cy + chipH : y0
  }

  private renderContent(section: DevSection): void {
    const region = this.region
    if (!region) return
    this.destroyWidgets()
    region.clear()
    this.entries = []
    this.polled = []
    const ctx: RenderCtx = {
      scene: this,
      theme: this.theme,
      width: region.viewport.w,
      tap: (fn) => (): void => {
        if (region.wasDragged) return
        this.cfg.onTap()
        fn()
        this.queueRebuild()
      },
    }
    let y = 0
    for (const item of section.items()) {
      const r = renderItem(item, ctx)
      const box = this.add.container(0, y, r.objects)
      region.add([box])
      const widget = r.widget
      const polled = r.polled
      if (widget) this.widgets.push(widget)
      if (polled) this.polled.push({ text: polled.text, read: polled.read, last: polled.text.text })
      const fixed = r.height
      this.entries.push({
        box,
        height: widget ? (): number => widget.height : polled ? (): number => polled.text.y + polled.text.height : (): number => fixed,
      })
      y += r.height + this.gap
    }
    this.contentH = -1
    this.relayout()
  }

  private relayout(): void {
    let y = 0
    for (const e of this.entries) {
      if (e.box.y !== y) e.box.y = y
      y += e.height() + this.gap
    }
    const total = Math.max(0, y - this.gap) + this.theme.body * 0.5
    if (Math.abs(total - this.contentH) > 0.5) {
      this.contentH = total
      this.region?.setContentHeight(total)
    }
  }

  private tickContent(time: number): void {
    for (const w of this.widgets) w.update?.(time)
    if (time - this.lastPoll >= POLL_MS) {
      this.lastPoll = time
      for (const p of this.polled) {
        const s = p.read()
        if (s === p.last) continue
        p.last = s
        p.text.setText(s)
      }
    }
    this.relayout()
  }

  private rememberScroll(tab: Tab): void {
    if (this.region) scrollByTab.set(tab.key, this.region.offset)
  }

  private rebuildPanel(): void {
    if (this.current) this.rememberScroll(this.current)
    this.teardownPanel()
    this.buildPanel()
  }

  private destroyWidgets(): void {
    for (const w of this.widgets) w.destroy?.()
    this.widgets = []
  }

  private teardownPanel(): void {
    this.destroyWidgets()
    this.region?.destroy()
    this.region = undefined
    for (const o of this.chrome) o.destroy()
    this.chrome = []
    this.entries = []
    this.polled = []
    this.current = undefined
  }
}

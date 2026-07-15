import Phaser from 'phaser'
import { browserStorage } from '../core/highscore'
import type { MapId } from '../core/maps'
import { MAP_IDS, MAPS } from '../core/maps'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { loadMap, saveMap } from '../core/selection'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage } from '../ui/emoji'
import { EmojiGrid } from '../ui/grid'
import { FONT, UI_FONT } from '../ui/fonts'
import { playSfx } from '../ui/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 地图选择页 = 开始游戏第一步（主菜单 → 选地图 → 选队长 → 组队 → 战斗）。
// 地图即关卡：当前只有主题（色板 + 地面装饰）差异，难度/专属机制后续扩展。
// 布局沿用方向约定：竖屏「上」= 横屏「左」（详情），列表在下/右。
interface MapLayout {
  content: { w: number; h: number }
  headerY: number
  list: { x: number; y: number; w: number; h: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: MapLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  detail: { x: 40, y: 96, w: 730, h: 520 },
  list: { x: 810, y: 96, w: 430, h: 520 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: MapLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  detail: { x: 24, y: 100, w: 672, h: 480 },
  list: { x: 24, y: 604, w: 672, h: 520 },
  btn: { y: 1184, w: 360, h: 72 },
}

export class MapScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private selectedId: MapId = MAP_IDS[0]!
  private layout!: MapLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('map')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    if (!preserved) this.selectedId = loadMap(browserStorage())
    this.detailObjs = []

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const ox = this.origin.x
    const oy = this.origin.y

    this.add
      .text(ox + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('menu'))
    this.add
      .text(w / 2, oy + L.headerY, '选择地图', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 地图网格（单选；形象即含义，主题与装饰看详情面板）
    this.grid = new EmojiGrid(this, { x: ox + L.list.x, y: oy + L.list.y, w: L.list.w, h: L.list.h })
    this.grid.onTap = (key): void => {
      playSfx('click')
      this.selectedId = key as MapId
      saveMap(browserStorage(), this.selectedId)
      this.refresh()
    }
    this.grid.setItems(MAP_IDS.map((id) => ({ key: id, emoji: MAPS[id].emoji })))

    // 详情面板底板
    const D = L.detail
    const dx = ox + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)

    // 确认按钮
    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btn.y - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    const b = this.btnRect
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0xffd54f, 1)
    btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.add
      .text(w / 2, oy + L.btn.y, '选择队长', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    const confirm = (): void => {
      playSfx('click')
      this.scene.start('captain')
    }
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', confirm)
    this.input.keyboard?.on('keydown-ENTER', confirm)
    this.input.keyboard?.on('keydown-SPACE', confirm)
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))

    // Twemoji 图形许可（CC-BY 4.0）要求署名
    this.add
      .text(w / 2, h - safeInsets.bottom - 10, 'emoji graphics © Twemoji · CC-BY 4.0', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.28)

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const spec = MAPS[this.selectedId]

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, spec.emoji, 64),
      this.add
        .text(dx + 104, dy + 42, spec.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 76, '地图 · 决定战场的主题与景观', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    let cursor = dy + 132
    const group = (icon: string, title: string): void => {
      this.detailObjs.push(
        emojiImage(this, dx + 42, cursor, icon, 26),
        this.add
          .text(dx + 62, cursor, title, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      cursor += 40
    }
    const line = (text: string, color = '#d0d0d8'): void => {
      const t = this.add
        .text(dx + 62, cursor, text, {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color,
          wordWrap: { width: D.w - 104 },
          lineSpacing: 6,
          resolution: res,
        })
        .setOrigin(0, 0)
      this.detailObjs.push(t)
      cursor += Math.max(36, t.height + 8)
    }

    group('🗺️', '主题')
    line(spec.desc)
    cursor += 14
    group('🌿', '地面装饰')
    // 装饰 emoji 预览行（战斗中以极低透明度散布在地面）
    let px = dx + 62 + 16
    for (const e of spec.decor.emojis) {
      this.detailObjs.push(emojiImage(this, px, cursor + 10, e, 34))
      px += 46
    }
    cursor += 44
    line('战斗中以极低透明度随机散布，一局一景', '#9a9aa8')
    cursor += 14
    group('🚧', '差异')
    line('目前各地图仅主题不同；难度、专属怪物与增益后续开放', '#9a9aa8')
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedId)
    this.renderDetail(textRes())
    this.reportMap()
  }

  private reportMap(): void {
    reportDebug({
      scene: 'map',
      elapsed: 0,
      hp: 0,
      alive: 0,
      kills: 0,
      level: 1,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      map: {
        selected: this.selectedId,
        items: this.grid.cellRects().map((r) => ({ id: r.key, x: r.x, y: r.y, w: r.w, h: r.h })),
        start: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

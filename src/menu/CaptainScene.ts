import Phaser from 'phaser'
import { CAPTAINS, PICKABLE_CAPTAIN_IDS } from '../captains/registry'
import type { CaptainId } from '../captains/registry'
import { browserStorage } from '../core/storage'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { beginRun } from '../run/state'
import { loadCaptain, loadMap, saveCaptain } from '../run/selection'
import { captainStatGroups } from './stats'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage } from '../emoji/textures'
import { EmojiGrid } from './grid'
import { ScrollView } from './scroll'
import { FONT, UI_FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'

// 队长选择页 = 组队流程第一步（主菜单 → 选队长 → 组队 → 战斗）。
// 单选：点列表行即选定并展开详情；队长不参战，其编制/被动影响后续组队与商店。
// 布局沿用方向约定：竖屏「上」= 横屏「左」（详情），列表在下/右。
interface CaptainLayout {
  content: { w: number; h: number }
  headerY: number
  list: { x: number; y: number; w: number; h: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: CaptainLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  detail: { x: 40, y: 96, w: 730, h: 520 },
  list: { x: 810, y: 96, w: 430, h: 520 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: CaptainLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  detail: { x: 24, y: 100, w: 672, h: 480 },
  list: { x: 24, y: 604, w: 672, h: 520 },
  btn: { y: 1184, w: 360, h: 72 },
}

export class CaptainScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private selectedId: CaptainId = PICKABLE_CAPTAIN_IDS[0]!
  private layout!: CaptainLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailView!: ScrollView
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('captain')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    if (!preserved) this.selectedId = loadCaptain(browserStorage())

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
      .on('pointerup', () => this.scene.start('map'))
    this.add
      .text(w / 2, oy + L.headerY, '选择队长', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 队长网格（单选；形象即含义，名字与能力看详情面板）
    this.grid = new EmojiGrid(this, { x: ox + L.list.x, y: oy + L.list.y, w: L.list.w, h: L.list.h })
    this.grid.onTap = (key): void => {
      playSfx('click')
      this.selectedId = key as CaptainId
      saveCaptain(browserStorage(), this.selectedId)
      this.refresh()
    }
    this.grid.setItems(
      PICKABLE_CAPTAIN_IDS.map((id) => ({ key: id, emoji: CAPTAINS[id].emoji, outline: 'player' as const })),
    )

    // 详情面板底板
    const D = L.detail
    const dx = ox + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)
    // 队长增益/主动技能是变长文案，装进可滚动容器，绝不再靠收紧行距硬塞
    this.detailView = new ScrollView(this, { x: dx, y: dy, w: D.w, h: D.h })

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
      .text(w / 2, oy + L.btn.y, '组建队伍', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    const confirm = (): void => {
      playSfx('click')
      // 开局组队 = 第一次整编：空阵容起步，按队长开局点数强制招募/升级；
      // 地图在上一步已选定并持久化，这里读入本局
      beginRun(this.selectedId, [], loadMap(browserStorage()))
      this.scene.start('promote')
    }
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', confirm)
    this.input.keyboard?.on('keydown-ENTER', confirm)
    this.input.keyboard?.on('keydown-SPACE', confirm)
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('map'))

    // Twemoji 图形许可（CC-BY 4.0）要求署名
    this.add
      .text(w / 2, h - safeInsets.bottom - 10, 'emoji graphics © Twemoji · CC-BY 4.0 · 有改动', {
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
    // 内容坐标以详情面板左上为原点（0,0），滚动由 ScrollView 负责
    this.detailView.clear()
    const D = this.layout.detail
    const def = CAPTAINS[this.selectedId]

    this.detailView.add([
      emojiImage(this, 58, 56, def.emoji, 85, 'player'),
      this.add
        .text(104, 42, def.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(104, 76, '队长 · 提供团队增益，不参与战斗', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    ])

    let cursor = 122
    for (const group of captainStatGroups(def)) {
      this.detailView.add([
        emojiImage(this, 42, cursor, group.icon, 35),
        this.add
          .text(62, cursor, group.title, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      ])
      cursor += 36
      for (const line of group.lines) {
        const t = this.add
          .text(62, cursor, line, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: '#d0d0d8',
            wordWrap: { width: D.w - 104 },
            lineSpacing: 6,
            resolution: res,
          })
          .setOrigin(0, 0)
        this.detailView.add(t)
        cursor += Math.max(34, t.height + 6)
      }
      cursor += 10
    }
    this.detailView.setContentHeight(cursor + 12)
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedId)
    this.renderDetail(textRes())
    this.reportCaptain()
  }

  private reportCaptain(): void {
    reportDebug({
      scene: 'captain',
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
      captain: {
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

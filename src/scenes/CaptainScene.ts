import Phaser from 'phaser'
import type { CaptainId } from '../core/config'
import { CAPTAIN_IDS, CAPTAINS } from '../core/config'
import { browserStorage } from '../core/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { loadCaptain, saveCaptain } from '../core/selection'
import { captainStatGroups } from '../core/stats'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 队长选择页 = 组队流程第一步（主菜单 → 选队长 → 组队 → 战斗）。
// 单选：点列表行即选定并展开详情；队长不参战，其编制/被动影响后续组队与商店。
// 布局沿用方向约定：竖屏「上」= 横屏「左」（详情），列表在下/右。
interface CaptainLayout {
  content: { w: number; h: number }
  headerY: number
  list: { x: number; y: number; w: number; rowH: number; gap: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: CaptainLayout = {
  content: { w: 1280, h: 720 },
  headerY: 40,
  detail: { x: 40, y: 84, w: 730, h: 460 },
  list: { x: 810, y: 84, w: 430, rowH: 64, gap: 8 },
  btn: { y: 648, w: 300, h: 58 },
}

const PORTRAIT: CaptainLayout = {
  content: { w: 720, h: 1280 },
  headerY: 48,
  detail: { x: 24, y: 92, w: 672, h: 452 },
  list: { x: 24, y: 568, w: 672, rowH: 64, gap: 8 },
  btn: { y: 1176, w: 300, h: 60 },
}

interface Row {
  id: CaptainId
  x: number
  y: number
  bg: Phaser.GameObjects.Graphics
  badge: Phaser.GameObjects.Image
}

export class CaptainScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private selectedId: CaptainId = CAPTAIN_IDS[0]!
  private layout!: CaptainLayout
  private origin = { x: 0, y: 0 }
  private rows: Row[] = []
  private detailObjs: Phaser.GameObjects.GameObject[] = []
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
    this.rows = []
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
        fontSize: '18px',
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('menu'))
    this.add
      .text(w / 2, oy + L.headerY, '选择队长', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 队长列表（单选；人数多了再做滚动）
    const S = L.list
    const lx = ox + S.x
    const ly = oy + S.y
    const frame = this.add.graphics()
    frame.fillStyle(0x000000, 0.18)
    const frameH = CAPTAIN_IDS.length * (S.rowH + S.gap) - S.gap + 16
    frame.fillRoundedRect(lx - 8, ly - 8, S.w + 16, frameH, 14)
    CAPTAIN_IDS.forEach((id, i) => {
      const spec = CAPTAINS[id]
      const y = ly + i * (S.rowH + S.gap)
      const bg = this.add.graphics()
      emojiImage(this, lx + 38, y + S.rowH / 2, spec.emoji, 40, true)
      this.add
        .text(lx + 74, y + S.rowH / 2, spec.name, {
          fontFamily: UI_FONT,
          fontSize: '20px',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      const badge = emojiImage(this, lx + S.w - 32, y + S.rowH / 2, '✅', 24)
      this.add
        .zone(lx, y, S.w, S.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.selectedId = id
          saveCaptain(browserStorage(), id)
          this.refresh()
        })
      this.rows.push({ id, x: lx, y, bg, badge })
    })

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
      .text(w / 2, oy + L.btn.y, '组建队伍', {
        fontFamily: UI_FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('select'))
    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('select'))
    this.input.keyboard?.on('keydown-SPACE', () => this.scene.start('select'))
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))

    // Twemoji 图形许可（CC-BY 4.0）要求署名
    this.add
      .text(w / 2, h - safeInsets.bottom - 10, 'emoji graphics © Twemoji · CC-BY 4.0', {
        fontFamily: UI_FONT,
        fontSize: '11px',
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
    const spec = CAPTAINS[this.selectedId]

    this.detailObjs.push(
      emojiImage(this, dx + 52, dy + 46, spec.emoji, 52, true),
      this.add
        .text(dx + 92, dy + 34, spec.name, {
          fontFamily: UI_FONT,
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 92, dy + 60, '队长 · 提供团队增益，不参与战斗', {
          fontFamily: UI_FONT,
          fontSize: '14px',
          color: '#b9b9c6',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    let cursor = dy + 100
    for (const group of captainStatGroups(spec)) {
      this.detailObjs.push(
        emojiImage(this, dx + 38, cursor, group.icon, 20),
        this.add
          .text(dx + 56, cursor, group.title, {
            fontFamily: UI_FONT,
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      cursor += 27
      for (const line of group.lines) {
        this.detailObjs.push(
          this.add
            .text(dx + 56, cursor, line, {
              fontFamily: UI_FONT,
              fontSize: '15px',
              color: '#d0d0d8',
              wordWrap: { width: D.w - 96 },
              resolution: res,
            })
            .setOrigin(0, 0.5),
        )
        cursor += 23
      }
      cursor += 12
    }
  }

  private refresh(): void {
    const S = this.layout.list
    for (const row of this.rows) {
      const selected = row.id === this.selectedId
      const g = row.bg
      g.clear()
      g.fillStyle(selected ? 0xffffff : 0x000000, selected ? 0.16 : 0.25)
      g.fillRoundedRect(row.x, row.y, S.w, S.rowH, 12)
      g.lineStyle(selected ? 2 : 1, 0xffffff, selected ? 0.9 : 0.1)
      g.strokeRoundedRect(row.x, row.y, S.w, S.rowH, 12)
      row.badge.setVisible(selected)
    }
    this.renderDetail(textRes())
    this.reportCaptain()
  }

  private reportCaptain(): void {
    const S = this.layout.list
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
        items: this.rows.map((r) => ({ id: r.id, x: r.x, y: r.y, w: S.w, h: S.rowH })),
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

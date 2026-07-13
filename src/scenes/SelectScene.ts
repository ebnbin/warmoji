import Phaser from 'phaser'
import type { CharacterId } from '../core/config'
import { CHARACTERS, ROSTER_IDS, TEAM } from '../core/config'
import { browserStorage } from '../core/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { beginRun } from '../core/run'
import { loadLineup, saveLineup, toggleLineup } from '../core/selection'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiKey } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 组队页 = 游戏流程中的一步（主菜单 → 组队 → 战斗；战斗结束回到这里）。
// 「列表 + 详情」结构：花名册增长只影响列表长度（超出可滚动），详情区固定，
// 布局按最小可用空间设计（横 1280×720 左右分栏 / 竖 720×1280 上下分栏），内容块居中于实际视口。
interface SelectLayout {
  content: { w: number; h: number }
  headerY: number
  list: { x: number; y: number; w: number; h: number; rowH: number; gap: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（详情），竖屏「下」= 横屏「右」（列表）
const LANDSCAPE: SelectLayout = {
  content: { w: 1280, h: 720 },
  headerY: 40,
  detail: { x: 40, y: 84, w: 730, h: 460 },
  list: { x: 810, y: 84, w: 430, h: 552, rowH: 64, gap: 8 },
  btn: { y: 648, w: 280, h: 58 },
}

const PORTRAIT: SelectLayout = {
  content: { w: 720, h: 1280 },
  headerY: 48,
  detail: { x: 24, y: 92, w: 672, h: 452 },
  list: { x: 24, y: 568, w: 672, h: 540, rowH: 64, gap: 8 },
  btn: { y: 1176, w: 300, h: 60 },
}

interface Row {
  id: CharacterId
  relY: number
  bg: Phaser.GameObjects.Graphics
  name: Phaser.GameObjects.Text
  badge: Phaser.GameObjects.Image
}

export class SelectScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/焦点/滚动位置等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private lineup: CharacterId[] = []
  private focusedId: CharacterId = ROSTER_IDS[0]!
  private layout!: SelectLayout
  private origin = { x: 0, y: 0 }

  private rows: Row[] = []
  private listContainer!: Phaser.GameObjects.Container
  private scrollY = 0
  private maxScroll = 0
  private contentH = 0
  private dragging = false
  private dragMoved = false
  private dragStartY = 0
  private dragStartScroll = 0

  private detailEmoji!: Phaser.GameObjects.Image
  private detailName!: Phaser.GameObjects.Text
  private detailDesc!: Phaser.GameObjects.Text
  private toggleBg!: Phaser.GameObjects.Graphics
  private toggleText!: Phaser.GameObjects.Text
  private toggleRect = { x: 0, y: 0, w: 0, h: 0 }
  private btnBg!: Phaser.GameObjects.Graphics
  private btnText!: Phaser.GameObjects.Text
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('select')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.lineup = loadLineup(browserStorage())
    if (!preserved) {
      this.focusedId = this.lineup[0] ?? ROSTER_IDS[0]!
      this.scrollY = 0
    }
    this.rows = []
    this.dragging = false
    this.dragMoved = false

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const ox = this.origin.x
    const oy = this.origin.y

    // 头部：返回 + 标题
    this.add
      .text(ox + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: '18px',
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved) this.scene.start('menu')
      })
    this.add
      .text(w / 2, oy + L.headerY, '组建队伍', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    this.createList(res)
    this.createDetail(res)

    // 出发按钮
    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btn.y - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    this.btnBg = this.add.graphics()
    this.btnText = this.add
      .text(w / 2, oy + L.btn.y, '', {
        fontFamily: UI_FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(this.btnRect.x, this.btnRect.y, this.btnRect.w, this.btnRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved) this.startRun()
      })
    this.input.keyboard?.on('keydown-ENTER', () => this.startRun())
    this.input.keyboard?.on('keydown-SPACE', () => this.startRun())
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

  // ── 列表栏（可滚动） ────────────────────────────────────────

  private createList(res: number): void {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y

    const frame = this.add.graphics()
    frame.fillStyle(0x000000, 0.18)
    frame.fillRoundedRect(lx - 8, ly - 8, L.w + 16, L.h + 16, 14)

    this.listContainer = this.add.container(lx, ly)
    const maskShape = this.add.graphics().setVisible(false)
    maskShape.fillStyle(0xffffff, 1)
    maskShape.fillRect(lx, ly, L.w, L.h)
    this.listContainer.setMask(maskShape.createGeometryMask())

    const pitch = L.rowH + L.gap
    ROSTER_IDS.forEach((id, i) => {
      const spec = CHARACTERS[id]
      const relY = i * pitch
      const bg = this.add.graphics()
      const emoji = emojiImage(this, 38, relY + L.rowH / 2, spec.emoji, 40, true)
      const name = this.add
        .text(74, relY + L.rowH / 2, spec.name, {
          fontFamily: UI_FONT,
          fontSize: '20px',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      const badge = emojiImage(this, L.w - 32, relY + L.rowH / 2, '✅', 24)
      const zone = this.add
        .zone(0, relY, L.w, L.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
      zone.on('pointerup', () => this.onRowTap(id, relY))
      this.listContainer.add([bg, emoji, name, badge, zone])
      this.rows.push({ id, relY, bg, name, badge })
    })

    this.contentH = ROSTER_IDS.length * pitch - L.gap
    this.maxScroll = Math.max(0, this.contentH - L.h)
    // 视口重启后按新布局重新钳制滚动位置
    this.setScroll(this.scrollY)

    // 滚轮 + 拖动滚动；拖过阈值的抬手不算点击
    this.input.on(
      'wheel',
      (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        if (this.inList(p)) this.setScroll(this.scrollY + dy * 0.6)
      },
    )
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMoved = false
      if (this.inList(p)) {
        this.dragging = true
        this.dragStartY = p.worldY
        this.dragStartScroll = this.scrollY
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dy = this.dragStartY - p.worldY
      if (this.maxScroll > 0 && Math.abs(dy) > 10) this.dragMoved = true
      if (this.dragMoved) this.setScroll(this.dragStartScroll + dy)
    })
    this.input.on('pointerup', () => {
      this.dragging = false
    })
  }

  private inList(p: Phaser.Input.Pointer): boolean {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    return p.worldX >= lx && p.worldX <= lx + L.w && p.worldY >= ly && p.worldY <= ly + L.h
  }

  private setScroll(y: number): void {
    this.scrollY = Math.max(0, Math.min(this.maxScroll, y))
    this.listContainer.y = this.origin.y + this.layout.list.y - this.scrollY
    this.reportSelect()
  }

  private onRowTap(id: CharacterId, relY: number): void {
    if (this.dragMoved) return
    // 被裁剪到列表视口外的行不响应
    const L = this.layout.list
    const centerY = this.origin.y + L.y + relY - this.scrollY + L.rowH / 2
    if (centerY < this.origin.y + L.y || centerY > this.origin.y + L.y + L.h) return
    this.focusedId = id
    this.refresh()
  }

  // ── 详情栏 ──────────────────────────────────────────────────

  private createDetail(res: number): void {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const cx = dx + D.w / 2
    const portrait = this.layout === PORTRAIT

    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.22)
    bg.fillRoundedRect(dx, dy, D.w, D.h, 14)
    bg.lineStyle(1, 0xffffff, 0.1)
    bg.strokeRoundedRect(dx, dy, D.w, D.h, 14)

    this.detailEmoji = emojiImage(
      this,
      cx,
      dy + (portrait ? 92 : 96),
      CHARACTERS[this.focusedId].emoji,
      portrait ? 104 : 110,
      true,
    )
    this.detailName = this.add
      .text(cx, dy + (portrait ? 188 : 196), '', {
        fontFamily: UI_FONT,
        fontSize: portrait ? '28px' : '30px',
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
    this.detailDesc = this.add
      .text(cx, dy + (portrait ? 230 : 240), '', {
        fontFamily: UI_FONT,
        fontSize: portrait ? '18px' : '19px',
        color: '#d6d6de',
        align: 'center',
        wordWrap: { width: D.w - (portrait ? 72 : 90) },
        lineSpacing: 6,
        resolution: res,
      })
      .setOrigin(0.5, 0)

    const tw = 220
    const th = 50
    const tcy = dy + D.h - 56
    this.toggleRect = { x: cx - tw / 2, y: tcy - th / 2, w: tw, h: th }
    this.toggleBg = this.add.graphics()
    this.toggleText = this.add
      .text(cx, tcy, '', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(this.toggleRect.x, this.toggleRect.y, tw, th)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved) this.onToggle()
      })
  }

  private toggleMode(): 'add' | 'remove' | 'full' {
    if (this.lineup.includes(this.focusedId)) return 'remove'
    return this.lineup.length >= TEAM.size ? 'full' : 'add'
  }

  private onToggle(): void {
    if (this.toggleMode() === 'full') return
    this.lineup = toggleLineup(this.lineup, this.focusedId)
    saveLineup(browserStorage(), this.lineup)
    this.refresh()
  }

  private startRun(): void {
    if (this.lineup.length !== TEAM.size) return
    beginRun(this.lineup.length)
    this.scene.start('arena')
  }

  // ── 状态刷新 ────────────────────────────────────────────────

  private refresh(): void {
    const L = this.layout.list
    for (const row of this.rows) {
      const focused = row.id === this.focusedId
      const inLineup = this.lineup.includes(row.id)
      const g = row.bg
      g.clear()
      g.fillStyle(focused ? 0xffffff : 0x000000, focused ? 0.16 : 0.25)
      g.fillRoundedRect(0, row.relY, L.w, L.rowH, 12)
      g.lineStyle(focused ? 2 : 1, 0xffffff, focused ? 0.9 : 0.1)
      g.strokeRoundedRect(0, row.relY, L.w, L.rowH, 12)
      row.badge.setVisible(inLineup)
      row.name.setAlpha(inLineup || focused ? 1 : 0.7)
    }

    const spec = CHARACTERS[this.focusedId]
    const size = this.layout === PORTRAIT ? 104 : 110
    this.detailEmoji.setTexture(emojiKey(spec.emoji, true)).setDisplaySize(size, size)
    this.detailName.setText(spec.name)
    this.detailDesc.setText(spec.desc)

    const mode = this.toggleMode()
    const t = this.toggleRect
    this.toggleBg.clear()
    if (mode === 'add') {
      this.toggleBg.fillStyle(0xffd54f, 1)
      this.toggleText.setText('加入出战').setColor('#25262e')
    } else if (mode === 'remove') {
      this.toggleBg.fillStyle(0xffffff, 0.12)
      this.toggleBg.lineStyle(1, 0xffffff, 0.35)
      this.toggleText.setText('移出出战').setColor('#ffffff')
    } else {
      this.toggleBg.fillStyle(0xffffff, 0.07)
      this.toggleText.setText('阵容已满').setColor('#8f8f9a')
    }
    this.toggleBg.fillRoundedRect(t.x, t.y, t.w, t.h, t.h / 2)
    if (mode === 'remove') this.toggleBg.strokeRoundedRect(t.x, t.y, t.w, t.h, t.h / 2)

    const ready = this.lineup.length === TEAM.size
    const b = this.btnRect
    this.btnBg.clear()
    this.btnBg.fillStyle(ready ? 0xffd54f : 0xffffff, ready ? 1 : 0.14)
    this.btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.btnText
      .setText(ready ? '出 发' : `出发（${this.lineup.length}/${TEAM.size}）`)
      .setColor(ready ? '#25262e' : '#9a9aa8')

    this.reportSelect()
  }

  private reportSelect(): void {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    reportDebug({
      scene: 'select',
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
      select: {
        selected: this.lineup.length,
        size: TEAM.size,
        focusedId: this.focusedId,
        items: this.rows.map((r) => ({
          id: r.id,
          x: lx,
          y: ly + r.relY - this.scrollY,
          w: L.w,
          h: L.rowH,
          inLineup: this.lineup.includes(r.id),
        })),
        list: { x: lx, y: ly, w: L.w, h: L.h, scrollY: this.scrollY, contentH: this.contentH },
        detail: {
          x: this.origin.x + this.layout.detail.x,
          y: this.origin.y + this.layout.detail.y,
          w: this.layout.detail.w,
          h: this.layout.detail.h,
        },
        toggle: {
          x: this.toggleRect.x + this.toggleRect.w / 2,
          y: this.toggleRect.y + this.toggleRect.h / 2,
          w: this.toggleRect.w,
          h: this.toggleRect.h,
          mode: this.toggleMode(),
        },
        start: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
          enabled: this.lineup.length === TEAM.size,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

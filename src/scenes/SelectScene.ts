import Phaser from 'phaser'
import type { CaptainId, CharacterId } from '../core/config'
import { CAPTAINS, CHARACTERS, ROSTER_IDS } from '../core/config'
import { browserStorage } from '../core/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { beginRun } from '../core/run'
import { loadCaptain, loadLineup, saveLineup, toggleLineup } from '../core/selection'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiKey } from '../ui/emoji'
import { EmojiGrid } from '../ui/grid'
import { FONT, UI_FONT } from '../ui/fonts'
import { playSfx } from '../ui/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 组队页 = 游戏流程中的一步（主菜单 → 组队 → 战斗；战斗结束回到这里）。
// 「网格 + 详情」结构：花名册用 emoji 网格呈现（形象即含义，✅ 角标 = 已入首发），
// 名字/介绍在详情面板；花名册增长只是网格变长（可滚动）。
// 布局按最小可用空间设计（横 1280×720 左右分栏 / 竖 720×1280 上下分栏），内容块居中于实际视口。
interface SelectLayout {
  content: { w: number; h: number }
  headerY: number
  list: { x: number; y: number; w: number; h: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（详情），竖屏「下」= 横屏「右」（网格）
const LANDSCAPE: SelectLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  detail: { x: 40, y: 96, w: 730, h: 520 },
  list: { x: 810, y: 96, w: 430, h: 520 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: SelectLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  detail: { x: 24, y: 100, w: 672, h: 500 },
  list: { x: 24, y: 624, w: 672, h: 500 },
  btn: { y: 1188, w: 360, h: 72 },
}

export class SelectScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/焦点/滚动位置等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private captainId: CaptainId = 'angel'
  private starterCount = 1
  private lineup: CharacterId[] = []
  private focusedId: CharacterId = ROSTER_IDS[0]!
  private layout!: SelectLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private scrollY = 0

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
    this.captainId = loadCaptain(browserStorage())
    // 首发人数 = 队长开局等级（点数）；其余角色靠波次间招募
    this.starterCount = CAPTAINS[this.captainId].startLevel
    this.lineup = loadLineup(browserStorage(), this.starterCount)
    if (!preserved) {
      this.focusedId = this.lineup[0] ?? ROSTER_IDS[0]!
      this.scrollY = 0
    }

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
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.grid.wasDragged) this.scene.start('captain')
      })
    this.add
      .text(w / 2, oy + L.headerY, `选择首发（${this.starterCount} 人）`, {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)
    // 当前队长（点击回队长页更换）
    const captain = CAPTAINS[this.captainId]
    const capText = this.add
      .text(ox + L.content.w - 40, oy + L.headerY, `队长 ${captain.name}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.grid.wasDragged) this.scene.start('captain')
      })
    emojiImage(this, capText.x - capText.width - 22, oy + L.headerY, captain.emoji, 32, 'player')

    // 花名册网格
    this.grid = new EmojiGrid(
      this,
      { x: ox + L.list.x, y: oy + L.list.y, w: L.list.w, h: L.list.h },
      { initialScroll: this.scrollY },
    )
    this.grid.onTap = (key): void => {
      playSfx('click')
      this.focusedId = key as CharacterId
      this.refresh()
    }
    this.grid.onScroll = (): void => {
      this.scrollY = this.grid.scrollY
      this.reportSelect()
    }

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
        fontSize: FONT.lead,
        fontStyle: 'bold',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(this.btnRect.x, this.btnRect.y, this.btnRect.w, this.btnRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.grid.wasDragged) this.startRun()
      })
    this.input.keyboard?.on('keydown-ENTER', () => this.startRun())
    this.input.keyboard?.on('keydown-SPACE', () => this.startRun())
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('captain'))

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
      dy + (portrait ? 112 : 120),
      CHARACTERS[this.focusedId].emoji,
      portrait ? 116 : 124,
      'player',
    )
    this.detailName = this.add
      .text(cx, dy + (portrait ? 224 : 236), '', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
    this.detailDesc = this.add
      .text(cx, dy + (portrait ? 268 : 284), '', {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#d6d6de',
        align: 'center',
        wordWrap: { width: D.w - (portrait ? 72 : 90) },
        lineSpacing: 8,
        resolution: res,
      })
      .setOrigin(0.5, 0)

    const tw = 280
    const th = 64
    const tcy = dy + D.h - 62
    this.toggleRect = { x: cx - tw / 2, y: tcy - th / 2, w: tw, h: th }
    this.toggleBg = this.add.graphics()
    this.toggleText = this.add
      .text(cx, tcy, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(this.toggleRect.x, this.toggleRect.y, tw, th)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.grid.wasDragged) this.onToggle()
      })
  }

  private toggleMode(): 'add' | 'remove' | 'full' {
    // 满员时点选未选中角色 = 替换最早选入的，因此不存在 full 态
    return this.lineup.includes(this.focusedId) ? 'remove' : 'add'
  }

  private onToggle(): void {
    playSfx('click')
    this.lineup = toggleLineup(this.lineup, this.focusedId, this.starterCount)
    saveLineup(browserStorage(), this.lineup)
    this.refresh()
  }

  private startRun(): void {
    if (this.lineup.length !== this.starterCount) return
    playSfx('click')
    beginRun(this.captainId, this.lineup)
    this.scene.start('arena')
  }

  // ── 状态刷新 ────────────────────────────────────────────────

  private refresh(): void {
    this.grid.setItems(
      ROSTER_IDS.map((id) => ({
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player' as const,
        badge: this.lineup.includes(id) ? '✅' : undefined,
      })),
    )
    this.grid.setSelected(this.focusedId)

    const spec = CHARACTERS[this.focusedId]
    const size = this.layout === PORTRAIT ? 116 : 124
    this.detailEmoji.setTexture(emojiKey(spec.emoji, 'player')).setDisplaySize(size, size)
    this.detailName.setText(spec.name)
    this.detailDesc.setText(spec.desc)

    const mode = this.toggleMode()
    const t = this.toggleRect
    this.toggleBg.clear()
    if (mode === 'add') {
      this.toggleBg.fillStyle(0xffd54f, 1)
      this.toggleText.setText('选为首发').setColor('#25262e')
    } else {
      this.toggleBg.fillStyle(0xffffff, 0.12)
      this.toggleBg.lineStyle(1, 0xffffff, 0.35)
      this.toggleText.setText('移出首发').setColor('#ffffff')
    }
    this.toggleBg.fillRoundedRect(t.x, t.y, t.w, t.h, t.h / 2)
    if (mode === 'remove') this.toggleBg.strokeRoundedRect(t.x, t.y, t.w, t.h, t.h / 2)

    const ready = this.lineup.length === this.starterCount
    const b = this.btnRect
    this.btnBg.clear()
    this.btnBg.fillStyle(ready ? 0xffd54f : 0xffffff, ready ? 1 : 0.14)
    this.btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.btnText
      .setText(ready ? '出 发' : `出发（${this.lineup.length}/${this.starterCount}）`)
      .setColor(ready ? '#25262e' : '#9a9aa8')

    this.reportSelect()
  }

  private reportSelect(): void {
    const L = this.layout.list
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
        size: this.starterCount,
        focusedId: this.focusedId,
        items: this.grid.cellRects().map((r) => ({
          id: r.key,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          inLineup: this.lineup.includes(r.key as CharacterId),
        })),
        list: {
          x: this.origin.x + L.x,
          y: this.origin.y + L.y,
          w: L.w,
          h: L.h,
          scrollY: this.grid.scrollY,
          contentH: this.grid.contentH,
        },
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
          enabled: this.lineup.length === this.starterCount,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

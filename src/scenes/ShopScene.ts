import Phaser from 'phaser'
import type { CaptainId, CharacterId } from '../core/config'
import { CAPTAINS, CHARACTERS, COIN, MEMBER } from '../core/config'
import { browserStorage } from '../core/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { endRun, getRun, waveStartHp } from '../core/run'
import type { RunState } from '../core/run'
import { loadTeam } from '../core/selection'
import { captainStatGroups, characterStatGroups } from '../core/stats'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, iconLabel } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 波次间商店：左（竖屏为下）为角色上架位列表——每个出战角色固定占一个位，
// 未来的道具购买/刷新都发生在自己的位置上互不影响；右（竖屏为上）为选中角色的属性面板。
// 布局按最小可用空间设计（横 1280×720 / 竖 720×1280），内容块居中于实际视口。
interface ShopLayout {
  content: { w: number; h: number }
  titleY: number
  coinsY: number
  slots: { x: number; y: number; w: number; rowH: number; gap: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（详情），竖屏「下」= 横屏「右」（上架位列表）
const LANDSCAPE: ShopLayout = {
  content: { w: 1280, h: 720 },
  titleY: 42,
  coinsY: 86,
  detail: { x: 40, y: 122, w: 730, h: 458 },
  slots: { x: 810, y: 122, w: 430, rowH: 66, gap: 8 },
  btn: { y: 648, w: 280, h: 58 },
}

const PORTRAIT: ShopLayout = {
  content: { w: 720, h: 1280 },
  titleY: 52,
  coinsY: 96,
  detail: { x: 24, y: 130, w: 672, h: 418 },
  slots: { x: 24, y: 572, w: 672, rowH: 66, gap: 8 },
  btn: { y: 1150, w: 300, h: 62 },
}

// 上架位：队长固定占第一位，id 用 'captain' 哨兵；队员按阵容槽位排列
type SlotId = 'captain' | CharacterId

interface SlotRow {
  id: SlotId
  x: number
  y: number
  bg: Phaser.GameObjects.Graphics
}

export class ShopScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/焦点等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private captainId: CaptainId = 'angel'
  private lineup: CharacterId[] = []
  private focusedId: SlotId = 'captain'
  private layout!: ShopLayout
  private origin = { x: 0, y: 0 }
  private rows: SlotRow[] = []
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private quitArmed = false

  constructor() {
    super('shop')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    const team = loadTeam(browserStorage())
    this.captainId = team.captainId
    this.lineup = team.lineup
    this.run = getRun(this.lineup.length)
    // 天使队长：进商店全员复活并恢复满血（默认规则见 core/run waveStartHp）
    if (CAPTAINS[this.captainId].reviveInShop) {
      this.run.memberHp = this.run.memberHp.map(() => MEMBER.maxHp)
    }
    if (!preserved || (this.focusedId !== 'captain' && !this.lineup.includes(this.focusedId))) {
      this.focusedId = 'captain'
    }
    this.rows = []
    this.detailObjs = []
    this.quitArmed = false

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = this.origin.y

    this.add
      .text(w / 2, oy + L.titleY, `第 ${this.run.wave - 1} 波完成`, {
        fontFamily: UI_FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 结束本局回主界面：二次点击确认，防误触弃局
    const quit = this.add
      .text(this.origin.x + 40, oy + L.titleY, '✕ 结束本局', {
        fontFamily: UI_FONT,
        fontSize: '18px',
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
    quit.on('pointerup', () => {
      if (this.quitArmed) {
        endRun()
        this.scene.start('menu')
        return
      }
      this.quitArmed = true
      quit.setText('确认结束？再点一次').setColor('#ef9a9a')
      this.time.delayedCall(2500, () => {
        this.quitArmed = false
        if (quit.active) quit.setText('✕ 结束本局').setColor('#c8c8d4')
      })
    })
    iconLabel(this, w / 2, oy + L.coinsY, COIN.emoji, 26, `${this.run.coins}`, {
      fontFamily: UI_FONT,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffd54f',
      resolution: res,
    })

    this.createSlots(res)

    // 详情面板底板
    const D = L.detail
    const dx = this.origin.x + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)
    this.add
      .text(dx + D.w / 2, dy + D.h - 20, '道具即将上架 · 每个角色一个专属上架位', {
        fontFamily: UI_FONT,
        fontSize: '13px',
        color: '#8a8a96',
        resolution: res,
      })
      .setOrigin(0.5)

    // 继续按钮
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
      .text(w / 2, oy + L.btn.y, `开始第 ${this.run.wave} 波`, {
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
      .on('pointerup', () => this.nextWave())
    this.input.keyboard?.on('keydown-ENTER', () => this.nextWave())
    this.input.keyboard?.on('keydown-SPACE', () => this.nextWave())

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

  // ── 上架位列表（队长 + 队员） ───────────────────────────────

  private createSlots(res: number): void {
    const S = this.layout.slots
    const sx = this.origin.x + S.x
    const sy = this.origin.y + S.y

    const slotRow = (
      id: SlotId,
      index: number,
      emoji: string,
      name: string,
      extra: (y: number) => void,
    ): void => {
      const y = sy + index * (S.rowH + S.gap)
      const bg = this.add.graphics()
      emojiImage(this, sx + 36, y + S.rowH / 2, emoji, 40, true)
      this.add
        .text(sx + 70, y + S.rowH / 2 - 12, name, {
          fontFamily: UI_FONT,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      extra(y)
      // 道具上架位占位（未来：道具卡 + 价格 + 刷新）
      const chip = this.add.graphics()
      chip.fillStyle(0xffffff, 0.06)
      chip.fillRoundedRect(sx + S.w - 148, y + S.rowH / 2 - 17, 134, 34, 10)
      chip.lineStyle(1, 0xffffff, 0.12)
      chip.strokeRoundedRect(sx + S.w - 148, y + S.rowH / 2 - 17, 134, 34, 10)
      this.add
        .text(sx + S.w - 81, y + S.rowH / 2, '道具位 · 待上架', {
          fontFamily: UI_FONT,
          fontSize: '12px',
          color: '#9a9aa8',
          resolution: res,
        })
        .setOrigin(0.5)
      this.add
        .zone(sx, y, S.w, S.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.focusedId = id
          this.refresh()
        })
      this.rows.push({ id, x: sx, y, bg })
    }

    // 队长固定占第一个上架位（团队道具池）
    const captain = CAPTAINS[this.captainId]
    slotRow('captain', 0, captain.emoji, captain.name, (y) => {
      this.add
        .text(sx + 70, y + S.rowH / 2 + 10, '队长 · 团队道具', {
          fontFamily: UI_FONT,
          fontSize: '12px',
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0.5)
    })

    this.lineup.forEach((id, i) => {
      const spec = CHARACTERS[id]
      slotRow(id, i + 1, spec.emoji, spec.name, (y) => {
        // 下一波开局血量
        const hp = waveStartHp(this.run.memberHp[i] ?? MEMBER.maxHp, MEMBER.maxHp)
        const ratio = hp / MEMBER.maxHp
        const bar = this.add.graphics()
        bar.fillStyle(0x000000, 0.45)
        bar.fillRect(sx + 70, y + S.rowH / 2 + 6, 96, 6)
        bar.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.3 ? 0xffb300 : 0xef5350, 1)
        bar.fillRect(sx + 71, y + S.rowH / 2 + 7, 94 * ratio, 4)
      })
    })
  }

  // ── 属性面板 ────────────────────────────────────────────────

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const isCaptain = this.focusedId === 'captain'
    const spec = isCaptain ? CAPTAINS[this.captainId] : CHARACTERS[this.focusedId as CharacterId]
    let subtitle: { text: string; color: string }
    if (isCaptain) {
      subtitle = { text: '队长 · 提供团队增益，不参与战斗', color: '#b9b9c6' }
    } else {
      const idx = this.lineup.indexOf(this.focusedId as CharacterId)
      const hp = waveStartHp(this.run.memberHp[idx] ?? MEMBER.maxHp, MEMBER.maxHp)
      subtitle = {
        text: `生命 ${hp}/${MEMBER.maxHp}（下一波开局）`,
        color: hp / MEMBER.maxHp > 0.5 ? '#9ccc9c' : '#ffb74d',
      }
    }

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
        .text(dx + 92, dy + 60, subtitle.text, {
          fontFamily: UI_FONT,
          fontSize: '14px',
          color: subtitle.color,
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    const groups = isCaptain
      ? captainStatGroups(CAPTAINS[this.captainId])
      : characterStatGroups(CHARACTERS[this.focusedId as CharacterId])
    let cursor = dy + 100
    for (const group of groups) {
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
    const S = this.layout.slots
    for (const row of this.rows) {
      const focused = row.id === this.focusedId
      const g = row.bg
      g.clear()
      g.fillStyle(focused ? 0xffffff : 0x000000, focused ? 0.16 : 0.25)
      g.fillRoundedRect(row.x, row.y, S.w, S.rowH, 12)
      g.lineStyle(focused ? 2 : 1, 0xffffff, focused ? 0.9 : 0.1)
      g.strokeRoundedRect(row.x, row.y, S.w, S.rowH, 12)
    }
    this.renderDetail(textRes())
    this.reportShop()
  }

  private nextWave(): void {
    this.scene.start('arena')
  }

  private reportShop(): void {
    const S = this.layout.slots
    reportDebug({
      scene: 'shop',
      elapsed: 0,
      hp: 0,
      alive: 0,
      kills: this.run.kills,
      level: this.run.xp.level,
      wave: this.run.wave,
      coins: this.run.coins,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      shop: {
        wave: this.run.wave,
        coins: this.run.coins,
        focusedId: this.focusedId,
        slots: this.rows.map((r) => ({ id: r.id, x: r.x, y: r.y, w: S.w, h: S.rowH })),
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

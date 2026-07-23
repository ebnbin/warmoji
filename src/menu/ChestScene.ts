import Phaser from 'phaser'
import { CHARACTERS } from '../characters/registry'
import { ITEMS, RARITIES, itemPrice } from '../items/registry'
import { chestTargets } from '../pickups/chest'
import { characterLevel } from '../run/charLevel'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { getRun, promoteStep } from '../run/state'
import type { RunState } from '../run/state'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage } from '../emoji/textures'
import { EmojiGrid } from './grid'
import { ScrollView } from './scroll'
import { FONT, UI_FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'

// 开箱页：战斗中拾取的宝箱（run.chests）在此逐个开启。每个宝箱亮出一件道具，
// 玩家从「这件道具能用的角色」里选一个应用，或丢弃换当前波次价一半的金币。
// 一个都不能用（唯一适用者满层/升级档未解锁）时只能丢弃。全部开完 → 招募/商店。
// 布局按最小可用空间设计（横 1280×720 / 竖 720×1280），内容块居中于实际视口。
interface ChestLayout {
  content: { w: number; h: number }
  titleY: number
  progressY: number
  detail: { x: number; y: number; w: number; h: number }
  grid: { x: number; y: number; w: number; h: number }
  discard: { y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（道具详情），竖屏「下」= 横屏「右」（可选角色）
const LANDSCAPE: ChestLayout = {
  content: { w: 1280, h: 720 },
  titleY: 46,
  progressY: 96,
  detail: { x: 40, y: 132, w: 730, h: 452 },
  grid: { x: 810, y: 132, w: 430, h: 452 },
  discard: { y: 654, w: 420, h: 64 },
}

const PORTRAIT: ChestLayout = {
  content: { w: 720, h: 1280 },
  titleY: 54,
  progressY: 106,
  detail: { x: 24, y: 148, w: 672, h: 360 },
  grid: { x: 24, y: 528, w: 672, h: 560 },
  discard: { y: 1170, w: 440, h: 72 },
}

export class ChestScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private descView!: ScrollView
  private targets: number[] = []
  private discardRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('chests')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.run = getRun()
    // 宝箱全开完（或误入）：直接走正常下一站（招募优先，否则商店）
    if (this.run.chests.length === 0) {
      this.scene.start(promoteStep(this.run) ? 'promote' : 'shop')
      return
    }
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = h > w ? PORTRAIT : LANDSCAPE
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const ox = this.origin.x
    const oy = this.origin.y

    const itemId = this.run.chests[0]!
    const item = ITEMS[itemId]
    this.targets = chestTargets(
      this.run.roster,
      this.run.memberItems,
      this.run.memberXp.map(characterLevel),
      itemId,
    )
    const refund = Math.floor(itemPrice(itemId, this.run.wave) / 2)

    this.add
      .text(w / 2, oy + L.titleY, '开启宝箱', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)
    // 剩余数（含当前这个）：开一个少一个，无「共 N」是为了旋转重启也不失真
    this.add
      .text(w / 2, oy + L.progressY, `还剩 ${this.run.chests.length} 个宝箱`, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        fontStyle: 'bold',
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0.5)

    // ── 道具详情卡 ──
    const D = L.detail
    const dx = ox + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    const rarityColor = Number.parseInt(RARITIES[item.rarity].color.slice(1), 16)
    panel.lineStyle(item.rarity === 'common' ? 1 : 2, rarityColor, item.rarity === 'common' ? 0.25 : 0.8)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)

    emojiImage(this, dx + 66, dy + 66, item.emoji, 92)
    this.add
      .text(dx + 128, dy + 48, item.name, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: item.rarity === 'common' ? '#ffffff' : RARITIES[item.rarity].color,
        resolution: res,
      })
      .setOrigin(0, 0.5)
    this.add
      .text(dx + 128, dy + 84, RARITIES[item.rarity].label, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: RARITIES[item.rarity].color,
        resolution: res,
      })
      .setOrigin(0, 0.5)

    // 介绍（变长）装进可滚动区
    this.descView = new ScrollView(this, { x: dx, y: dy + 124, w: D.w, h: D.h - 124 })
    const desc = this.add
      .text(24, 4, item.desc, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#d0d0d8',
        wordWrap: { width: D.w - 48 },
        lineSpacing: 6,
        resolution: res,
      })
      .setOrigin(0, 0)
    this.descView.add(desc)
    this.descView.setContentHeight(desc.height + 16)

    // ── 可选角色网格 ──
    const G = L.grid
    this.add
      .text(ox + G.x, oy + G.y - 30, this.targets.length > 0 ? '应用给谁？' : '没有可用角色，只能丢弃', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: this.targets.length > 0 ? '#b9b9c6' : '#ffab91',
        resolution: res,
      })
      .setOrigin(0, 0.5)
    this.grid = new EmojiGrid(this, { x: ox + G.x, y: oy + G.y, w: G.w, h: G.h })
    this.grid.onTap = (key): void => this.apply(Number(key))
    this.grid.setItems(
      this.targets.map((slot) => ({
        key: String(slot),
        emoji: CHARACTERS[this.run.roster[slot]!].emoji,
        outline: 'player' as const,
      })),
    )

    // ── 丢弃按钮 ──
    const b = L.discard
    this.discardRect = { x: w / 2 - b.w / 2, y: oy + b.y - b.h / 2, w: b.w, h: b.h }
    const r = this.discardRect
    const btn = this.add.graphics()
    btn.fillStyle(0xffffff, 0.12)
    btn.fillRoundedRect(r.x, r.y, r.w, r.h, r.h / 2)
    btn.lineStyle(1, 0xffffff, 0.35)
    btn.strokeRoundedRect(r.x, r.y, r.w, r.h, r.h / 2)
    this.add
      .text(w / 2, oy + b.y, `丢弃 · +${refund} 金币`, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#f0f0f5',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(r.x, r.y, r.w, r.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.grid.wasDragged) this.discard()
      })

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

    this.reportChests(refund)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  /** 应用当前宝箱道具到某角色槽位，下一波建队时重算生效 */
  private apply(slot: number): void {
    if (this.grid.wasDragged) return
    const itemId = this.run.chests[0]
    if (itemId === undefined) return
    ;(this.run.memberItems[slot] ??= []).push(itemId)
    playSfx('recruit')
    this.advance()
  }

  /** 丢弃当前宝箱：返还当前波次价的一半金币 */
  private discard(): void {
    const itemId = this.run.chests[0]
    if (itemId === undefined) return
    this.run.coins += Math.floor(itemPrice(itemId, this.run.wave) / 2)
    playSfx('coin')
    this.advance()
  }

  /** 开完当前宝箱：出队并重建页面（create 里空箱即进下一站） */
  private advance(): void {
    this.run.chests.shift()
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private reportChests(refund: number): void {
    const itemId = this.run.chests[0] ?? null
    reportDebug({
      scene: 'chests',
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
      chests: {
        remaining: this.run.chests.length,
        item: itemId,
        rarity: itemId ? ITEMS[itemId].rarity : null,
        targets: this.grid.cellRects().map((c) => ({
          slot: Number(c.key),
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
        })),
        discard: {
          x: this.discardRect.x + this.discardRect.w / 2,
          y: this.discardRect.y + this.discardRect.h / 2,
          w: this.discardRect.w,
          h: this.discardRect.h,
          refund,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

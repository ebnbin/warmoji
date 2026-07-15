import Phaser from 'phaser'
import type { CharacterId } from '../core/config'
import { CAPTAINS, CHARACTERS, LEVELS } from '../core/config'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import {
  endRun,
  getRun,
  pointsAvailable,
  promoteStep,
  recruitCandidates,
  recruitMember,
  upgradeMember,
} from '../core/run'
import type { RunState } from '../core/run'
import { characterStatGroups } from '../core/stats'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage } from '../ui/emoji'
import { EmojiGrid } from '../ui/grid'
import { FONT, UI_FONT } from '../ui/fonts'
import { playSfx } from '../ui/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 整编页：每波战斗前的强制点数结算——经验不可延迟消费。开局组队与波末整编
// 完全复用本页：队长确认后带着开局点数进来（wave=1，可返回重选队长），
// 波末带着升级点数进来（wave>1，队长不可重选，只能结束本局）。
// 每 1 点为一步：未满编必须招募（网格 = 候选角色），满编后必须升级（网格 = 未满级队员）；
// 点数花完后的去向：wave=1 看队长 firstWaveShop（默认直接开战），wave>1 进商店。
// 布局沿用「详情 + 网格」方向约定：竖屏「上」= 横屏「左」（详情）。
interface PromoteLayout {
  content: { w: number; h: number }
  headerY: number
  stepY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: PromoteLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  stepY: 96,
  detail: { x: 40, y: 132, w: 730, h: 484 },
  list: { x: 810, y: 132, w: 430, h: 484 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: PromoteLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  stepY: 106,
  detail: { x: 24, y: 144, w: 672, h: 460 },
  list: { x: 24, y: 628, w: 672, h: 470 },
  btn: { y: 1184, w: 360, h: 72 },
}

export class PromoteScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/选中等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private mode: 'recruit' | 'upgrade' = 'recruit'
  /** recruit 模式为候选角色 id；upgrade 模式为 `slot:N` */
  private selectedKey = ''
  private layout!: PromoteLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private backRect = { x: 0, y: 0, w: 0, h: 0 }
  private quitArmed = false

  constructor() {
    super('promote')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.run = getRun()
    this.detailObjs = []
    this.quitArmed = false

    // 兜底：无事可办直接去下一站（正常由队长页/Arena 决定是否进入本页）
    const step = promoteStep(this.run)
    if (!step) {
      this.scene.start(this.nextScene())
      return
    }
    this.mode = step
    if (!preserved || !this.validSelection()) {
      this.selectedKey = this.defaultSelection()
    }

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = this.origin.y

    this.add
      .text(w / 2, oy + L.headerY, this.isInitial() ? '组建队伍' : '队伍整编', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    if (this.isInitial()) {
      // 开局组队：可反悔，返回重选队长（本局作废）
      const back = this.add
        .text(this.origin.x + 40, oy + L.headerY, '← 返回', {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#c8c8d4',
          resolution: res,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
      back.on('pointerup', () => {
        if (this.grid.wasDragged) return
        endRun()
        this.scene.start('captain')
      })
      this.backRect = { x: back.x, y: back.y - back.height / 2, w: back.width, h: back.height }
      this.input.keyboard?.on('keydown-ESC', () => {
        endRun()
        this.scene.start('captain')
      })
    } else {
      // 波末整编：队长不可重选，只能结束本局（二次点击确认，防误触弃局）
      const quit = this.add
        .text(this.origin.x + 40, oy + L.headerY, '✕ 结束', {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#c8c8d4',
          resolution: res,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
      quit.on('pointerup', () => {
        if (this.grid.wasDragged) return
        if (this.quitArmed) {
          endRun()
          this.scene.start('menu')
          return
        }
        this.quitArmed = true
        quit.setText('再点一次确认').setColor('#ef9a9a')
        this.time.delayedCall(2500, () => {
          this.quitArmed = false
          if (quit.active) quit.setText('✕ 结束').setColor('#c8c8d4')
        })
      })
      this.backRect = { x: quit.x, y: quit.y - quit.height / 2, w: quit.width, h: quit.height }
    }

    // 步骤说明：剩余点数 + 当前必须执行的动作
    const points = pointsAvailable(this.run)
    this.add
      .text(
        w / 2,
        oy + L.stepY,
        this.mode === 'recruit'
          ? `剩余 ${points} 点 · 必须招募新队员（未满编不可升级）`
          : `剩余 ${points} 点 · 已满编，选择一名队员升级`,
        {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          fontStyle: 'bold',
          color: '#b3e5fc',
          resolution: res,
        },
      )
      .setOrigin(0.5)

    // 候选网格
    this.grid = new EmojiGrid(this, {
      x: this.origin.x + L.list.x,
      y: oy + L.list.y,
      w: L.list.w,
      h: L.list.h,
    })
    this.grid.onTap = (key): void => {
      playSfx('click')
      this.selectedKey = key
      this.refresh()
    }
    this.grid.setItems(this.buildItems())

    // 详情面板底板
    const D = L.detail
    const dx = this.origin.x + D.x
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
    btnBg.fillStyle(0x81d4fa, 1)
    btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.add
      .text(w / 2, oy + L.btn.y, this.mode === 'recruit' ? '招募（花 1 点）' : '升级（花 1 点）', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#17323f',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.grid.wasDragged) this.confirm()
      })
    this.input.keyboard?.on('keydown-ENTER', () => this.confirm())
    this.input.keyboard?.on('keydown-SPACE', () => this.confirm())

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

  /** 开局组队（第 1 波开战前）还是波末整编 */
  private isInitial(): boolean {
    return this.run.wave === 1
  }

  /** 点数花完后的去向：开局看队长 firstWaveShop（默认直接开战），波末必进商店 */
  private nextScene(): 'arena' | 'shop' {
    if (this.isInitial() && !CAPTAINS[this.run.captainId].firstWaveShop) return 'arena'
    return 'shop'
  }

  // ── 数据 ────────────────────────────────────────────────────

  private buildItems(): { key: string; emoji: string; outline: 'player'; badge?: string }[] {
    if (this.mode === 'recruit') {
      return recruitCandidates(this.run).map((id) => ({
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player' as const,
      }))
    }
    // 升级模式：仅列出未满级的队员（满级不可选）
    return this.run.roster
      .map((id, slot) => ({ id, slot }))
      .filter((m) => this.upgradeable(m.slot))
      .map((m) => ({
        key: `slot:${m.slot}`,
        emoji: CHARACTERS[m.id].emoji,
        outline: 'player' as const,
      }))
  }

  private upgradeable(slot: number): boolean {
    return (this.run.memberLevels[slot] ?? 1) < LEVELS.max
  }

  private defaultSelection(): string {
    const items = this.buildItems()
    return items[0]?.key ?? ''
  }

  private validSelection(): boolean {
    return this.buildItems().some((i) => i.key === this.selectedKey)
  }

  private selectedSlot(): number {
    return this.selectedKey.startsWith('slot:') ? Number(this.selectedKey.slice(5)) : -1
  }

  // ── 确认执行 ────────────────────────────────────────────────

  private confirm(): void {
    if (!this.selectedKey) return
    if (this.mode === 'recruit') {
      const id = this.selectedKey as CharacterId
      if (recruitMember(this.run, id) < 0) return
      playSfx('recruit')
    } else {
      const slot = this.selectedSlot()
      if (slot < 0 || !upgradeMember(this.run, slot)) return
      playSfx('upgrade')
    }
    // 下一步或去下一站（重建页面刷新模式/候选；保留背景色）
    if (promoteStep(this.run)) {
      this.selectedKey = ''
      this.preserveOnRestart = true
      this.scene.restart()
    } else {
      this.scene.start(this.nextScene())
    }
  }

  // ── 详情 ────────────────────────────────────────────────────

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    if (!this.selectedKey) return
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const isRecruit = this.mode === 'recruit'
    const slot = this.selectedSlot()
    const id = isRecruit ? (this.selectedKey as CharacterId) : this.run.roster[slot]!
    const spec = CHARACTERS[id]
    const level = isRecruit ? 1 : (this.run.memberLevels[slot] ?? 1)
    const items = isRecruit ? [] : (this.run.memberItems[slot] ?? [])

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, spec.emoji, 64, 'player'),
      this.add
        .text(dx + 104, dy + 44, isRecruit ? spec.name : `${spec.name} Lv.${level} → Lv.${level + 1}`, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 80, isRecruit ? spec.desc : '升级提升伤害与生命上限', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          wordWrap: { width: D.w - 130 },
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    let cursor = dy + 128
    for (const group of characterStatGroups(spec, items, level)) {
      this.detailObjs.push(
        emojiImage(this, dx + 42, cursor, group.icon, 26),
        this.add
          .text(dx + 62, cursor, group.title, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      cursor += 38
      for (const line of group.lines) {
        const t = this.add
          .text(dx + 62, cursor, line, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: '#d0d0d8',
            wordWrap: { width: D.w - 104 },
            lineSpacing: 6,
            resolution: res,
          })
          .setOrigin(0, 0)
        this.detailObjs.push(t)
        cursor += Math.max(34, t.height + 8)
      }
      cursor += 10
      if (cursor > dy + D.h - 60) break
    }
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedKey || null)
    this.renderDetail(textRes())
    this.reportPromote()
  }

  private reportPromote(): void {
    reportDebug({
      scene: 'promote',
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
      promote: {
        mode: this.mode,
        points: pointsAvailable(this.run),
        selected: this.selectedKey,
        items: this.grid.cellRects().map((r) => ({ id: r.key, x: r.x, y: r.y, w: r.w, h: r.h })),
        confirm: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
          enabled: this.selectedKey !== '',
        },
        back: {
          x: this.backRect.x + this.backRect.w / 2,
          y: this.backRect.y + this.backRect.h / 2,
          w: this.backRect.w,
          h: this.backRect.h,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

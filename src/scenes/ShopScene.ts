import Phaser from 'phaser'
import type { CaptainId, CharacterId } from '../core/config'
import { CAPTAINS, CHARACTERS, COIN, LEVELS, SHOP } from '../core/config'
import {
  aggregateCharacterEffects,
  captainPool,
  characterPool,
  ITEMS,
  rollItem,
  stackCount,
} from '../core/items'
import type { ItemId, ItemSpec } from '../core/items'
import { memberMaxHp } from '../core/levels'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import {
  canRecruit,
  canUpgrade,
  endRun,
  getRun,
  pointsAvailable,
  recruitCandidates,
  recruitMember,
  rosterCap,
  upgradeMember,
  waveStartHp,
} from '../core/run'
import type { RunState } from '../core/run'
import { captainStatGroups, characterStatGroups } from '../core/stats'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiKey } from '../ui/emoji'
import { FONT, UI_FONT } from '../ui/fonts'
import { playSfx } from '../ui/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 波次间商店：左（竖屏为下）为上架位列表——队长占首位、每个出战角色一个位，
// 各自从自己的道具池随机上架，可购买（自动补货）或付费刷新（队长可提供免费次数）；
// 右（竖屏为上）为选中对象的属性面板（道具修正后数值）+ 当前上架道具卡。
// 布局按最小可用空间设计（横 1280×720 / 竖 720×1280），内容块居中于实际视口。
interface ShopLayout {
  content: { w: number; h: number }
  titleY: number
  coinsY: number
  slots: { x: number; y: number; w: number; h: number; rowH: number; gap: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（详情），竖屏「下」= 横屏「右」（上架位列表）
const LANDSCAPE: ShopLayout = {
  content: { w: 1280, h: 720 },
  titleY: 46,
  coinsY: 98,
  detail: { x: 40, y: 132, w: 730, h: 488 },
  slots: { x: 810, y: 132, w: 430, h: 488, rowH: 96, gap: 10 },
  btn: { y: 660, w: 340, h: 64 },
}

const PORTRAIT: ShopLayout = {
  content: { w: 720, h: 1280 },
  titleY: 54,
  coinsY: 106,
  detail: { x: 24, y: 144, w: 672, h: 460 },
  slots: { x: 24, y: 628, w: 672, h: 470, rowH: 96, gap: 10 },
  btn: { y: 1162, w: 360, h: 72 },
}

// 上架位：队长固定占第一位（'captain' 哨兵），队员按阵容槽位排列，
// 未满编时末尾追加招募位（'recruit' 哨兵）——点数在此花掉（招募新人/给角色升级）
type SlotId = 'captain' | CharacterId | 'recruit'

interface SlotRow {
  id: SlotId
  /** offers/持有列表的下标：0 = 队长，1.. = 阵容槽位+1 */
  index: number
  /** 列表容器内的相对 Y（列表可滚动） */
  relY: number
  bg: Phaser.GameObjects.Graphics
  chipBg: Phaser.GameObjects.Graphics
  chipEmoji: Phaser.GameObjects.Image
  chipText: Phaser.GameObjects.Text
}

export class ShopScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/焦点/上架结果等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private captainId: CaptainId = 'angel'
  private lineup: CharacterId[] = []
  private focusedId: SlotId = 'captain'
  private offers: (ItemId | null)[] = []
  private layout!: ShopLayout
  private origin = { x: 0, y: 0 }
  private rows: SlotRow[] = []
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private coinsText!: Phaser.GameObjects.Text
  private pointsText!: Phaser.GameObjects.Text
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private buyRect = { x: 0, y: 0, w: 0, h: 0 }
  private refreshRect = { x: 0, y: 0, w: 0, h: 0 }
  private upgradeRect = { x: 0, y: 0, w: 0, h: 0 }
  /** 招募位详情里当前挑中的候选角色 */
  private candidateId?: CharacterId
  private candidateRects: { id: CharacterId; x: number; y: number; w: number; h: number }[] = []
  private quitArmed = false
  // 字号放大后满编上架位/属性行可能超出面板：两个区域各自可滚动
  private slotContainer!: Phaser.GameObjects.Container
  private slotScroll = 0
  private slotMax = 0
  private statsContainer!: Phaser.GameObjects.Container
  private statsScroll = 0
  private statsMax = 0
  private statsTop = 0
  private statsH = 0
  private dragging: 'slots' | 'stats' | null = null
  private dragMoved = false
  private dragStartY = 0
  private dragStartScroll = 0

  constructor() {
    super('shop')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.run = getRun()
    this.captainId = this.run.captainId
    this.lineup = [...this.run.roster]
    if (!preserved) {
      // 进店结算：天使复活满血；免费刷新次数按队长重置；全部上架位重新随机
      if (CAPTAINS[this.captainId].reviveInShop) {
        this.run.memberHp = this.run.memberHp.map((_, slot) => this.slotMaxHp(slot))
      }
      this.run.freeRefreshes = CAPTAINS[this.captainId].freeRefreshes
      this.offers = Array.from({ length: this.lineup.length + 1 }, (_, i) =>
        rollItem(this.poolFor(i), this.ownedFor(i), Math.random),
      )
      this.focusedId = 'captain'
      this.candidateId = undefined
    }
    this.rows = []
    this.detailObjs = []
    this.quitArmed = false
    this.dragging = null
    this.dragMoved = false

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = this.origin.y

    this.add
      .text(w / 2, oy + L.titleY, `第 ${this.run.wave - 1} 波完成`, {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 结束本局回主界面：二次点击确认，防误触弃局
    const quit = this.add
      .text(this.origin.x + 40, oy + L.titleY, '✕ 结束', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
    quit.on('pointerup', () => {
      if (this.dragMoved) return
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

    emojiImage(this, w / 2 - 150, oy + L.coinsY, COIN.emoji, 32, 'player')
    this.coinsText = this.add
      .text(w / 2 - 128, oy + L.coinsY, `${this.run.coins}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0, 0.5)
    // 队伍等级与可点数：点数是招募/升级的唯一货币
    this.pointsText = this.add
      .text(w / 2 - 30, oy + L.coinsY, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        fontStyle: 'bold',
        color: '#b3e5fc',
        resolution: res,
      })
      .setOrigin(0, 0.5)

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

    // 属性区滚动容器：夹在详情头部与底部道具卡之间，行数多时可拖动/滚轮
    this.statsTop = dy + 112
    this.statsH = D.h - 112 - 118
    this.statsContainer = this.add.container(0, 0)
    const statsMask = this.add.graphics().setVisible(false)
    statsMask.fillStyle(0xffffff, 1)
    statsMask.fillRect(dx, this.statsTop, D.w, this.statsH)
    this.statsContainer.setMask(statsMask.createGeometryMask())

    // 上架道具卡的购买/刷新按钮命中区（内容随 refresh 重绘）；
    // 聚焦招募位时购买位变为「招募」，刷新不可用
    const cardY = dy + D.h - 110
    this.buyRect = { x: dx + D.w - 26 - 140, y: cardY + 21, w: 140, h: 54 }
    this.refreshRect = { x: this.buyRect.x - 8 - 150, y: cardY + 21, w: 150, h: 54 }
    this.add
      .zone(this.buyRect.x, this.buyRect.y, this.buyRect.w, this.buyRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.dragMoved) return
        if (this.focusedId === 'recruit') this.recruitFocused()
        else this.buyFocused()
      })
    this.add
      .zone(this.refreshRect.x, this.refreshRect.y, this.refreshRect.w, this.refreshRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved) this.refreshFocused()
      })
    // 升级按钮（详情头部右侧；仅聚焦队员时可用）
    this.upgradeRect = { x: dx + D.w - 14 - 150, y: dy + 26, w: 150, h: 52 }
    this.add
      .zone(this.upgradeRect.x, this.upgradeRect.y, this.upgradeRect.w, this.upgradeRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved) this.upgradeFocused()
      })

    // 滚动：上架位列表 / 详情属性区，滚轮 + 拖动（拖过阈值的抬手不算点击）
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy2: number) => {
      if (this.inSlots(p)) this.setSlotScroll(this.slotScroll + dy2 * 0.6)
      else if (this.inStats(p)) this.setStatsScroll(this.statsScroll + dy2 * 0.6)
    })
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMoved = false
      this.dragging = this.inSlots(p) ? 'slots' : this.inStats(p) ? 'stats' : null
      if (this.dragging) {
        this.dragStartY = p.worldY
        this.dragStartScroll = this.dragging === 'slots' ? this.slotScroll : this.statsScroll
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dyDrag = this.dragStartY - p.worldY
      const max = this.dragging === 'slots' ? this.slotMax : this.statsMax
      if (max > 0 && Math.abs(dyDrag) > 10) this.dragMoved = true
      if (this.dragMoved) {
        if (this.dragging === 'slots') this.setSlotScroll(this.dragStartScroll + dyDrag)
        else this.setStatsScroll(this.dragStartScroll + dyDrag)
      }
    })
    this.input.on('pointerup', () => {
      this.dragging = null
    })

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
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved) this.nextWave()
      })
    this.input.keyboard?.on('keydown-ENTER', () => this.nextWave())
    this.input.keyboard?.on('keydown-SPACE', () => this.nextWave())

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

  // ── 上架/购买 ───────────────────────────────────────────────

  private poolFor(index: number): ItemId[] {
    if (index === 0) return captainPool()
    return characterPool(CHARACTERS[this.lineup[index - 1]!])
  }

  private ownedFor(index: number): ItemId[] {
    if (index === 0) return this.run.captainItems
    return (this.run.memberItems[index - 1] ??= [])
  }

  /** 0 = 队长，1.. = 队员槽位+1，-1 = 招募位 */
  private focusedIndex(): number {
    if (this.focusedId === 'captain') return 0
    if (this.focusedId === 'recruit') return -1
    return this.lineup.indexOf(this.focusedId) + 1
  }

  private buyFocused(): void {
    const idx = this.focusedIndex()
    if (idx < 0) return
    const offer = this.offers[idx]
    if (!offer) return
    const item = ITEMS[offer]
    if (this.run.coins < item.price) return
    this.run.coins -= item.price
    playSfx('buy')
    const owned = this.ownedFor(idx)
    owned.push(offer)
    // 购买后自动补货下一件
    this.offers[idx] = rollItem(this.poolFor(idx), owned, Math.random)
    this.refresh()
  }

  private refreshFocused(): void {
    const idx = this.focusedIndex()
    if (idx < 0) return
    const free = this.run.freeRefreshes > 0
    if (!free && this.run.coins < SHOP.refreshPrice) return
    if (free) this.run.freeRefreshes -= 1
    else this.run.coins -= SHOP.refreshPrice
    playSfx('click')
    this.offers[idx] = rollItem(this.poolFor(idx), this.ownedFor(idx), Math.random)
    this.refresh()
  }

  /** 花 1 点招募详情里挑中的候选；扩编后重建页面（保留焦点与上架结果） */
  private recruitFocused(): void {
    const id = this.candidateId
    if (!id || !canRecruit(this.run, id)) return
    const slot = recruitMember(this.run, id)
    if (slot < 0) return
    playSfx('recruit')
    // 先同步 lineup 再补上架：poolFor 按 lineup 找角色
    this.lineup = [...this.run.roster]
    this.offers.push(rollItem(this.poolFor(slot + 1), [], Math.random))
    this.focusedId = id
    this.candidateId = undefined
    this.preserveOnRestart = true
    this.scene.restart()
  }

  /** 花 1 点给聚焦队员升 1 级；重建页面同步血条/属性 */
  private upgradeFocused(): void {
    const idx = this.focusedIndex()
    if (idx < 1) return
    if (!upgradeMember(this.run, idx - 1)) return
    playSfx('upgrade')
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private slotMaxHp(slot: number): number {
    return memberMaxHp(
      this.run.memberLevels[slot] ?? 1,
      aggregateCharacterEffects(this.run.memberItems[slot] ?? []).hpAdd,
    )
  }

  // ── 上架位列表（队长 + 队员；超出面板可滚动） ───────────────

  private createSlots(res: number): void {
    const S = this.layout.slots
    const sx = this.origin.x + S.x
    const sy = this.origin.y + S.y

    const frame = this.add.graphics()
    frame.fillStyle(0x000000, 0.18)
    frame.fillRoundedRect(sx - 8, sy - 8, S.w + 16, S.h + 16, 14)

    this.slotContainer = this.add.container(sx, sy)
    const mask = this.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1)
    mask.fillRect(sx, sy, S.w, S.h)
    this.slotContainer.setMask(mask.createGeometryMask())

    const slotRow = (
      id: SlotId,
      index: number,
      emoji: string,
      name: string,
      extra: (relY: number) => Phaser.GameObjects.GameObject[],
    ): void => {
      const relY = index * (S.rowH + S.gap)
      const bg = this.add.graphics()
      const icon = emojiImage(this, 44, relY + S.rowH / 2, emoji, 48, 'player')
      const nameText = this.add
        .text(84, relY + S.rowH / 2 - 17, name, {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      // 上架位道具卡（内容随 refresh 重绘）
      const chipBg = this.add.graphics()
      const chipEmoji = emojiImage(this, S.w - 146, relY + S.rowH / 2, COIN.emoji, 30).setVisible(false)
      const chipText = this.add
        .text(S.w - 124, relY + S.rowH / 2, '', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      const zone = this.add
        .zone(0, relY, S.w, S.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.dragMoved) return
          // 被裁剪到列表视口外的行不响应
          const cy = sy + relY - this.slotScroll + S.rowH / 2
          if (cy < sy || cy > sy + S.h) return
          if (this.focusedId !== id) this.statsScroll = 0
          playSfx('click')
          this.focusedId = id
          this.refresh()
        })
      this.slotContainer.add([bg, icon, nameText, chipBg, chipEmoji, chipText, zone, ...extra(relY)])
      this.rows.push({ id, index, relY, bg, chipBg, chipEmoji, chipText })
    }

    // 队长固定占第一个上架位（团队道具池）
    const captain = CAPTAINS[this.captainId]
    slotRow('captain', 0, captain.emoji, captain.name, (relY) => [
      this.add
        .text(84, relY + S.rowH / 2 + 19, '队长 · 团队道具', {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    ])

    this.lineup.forEach((id, i) => {
      const spec = CHARACTERS[id]
      const level = this.run.memberLevels[i] ?? 1
      slotRow(id, i + 1, spec.emoji, `${spec.name} Lv.${level}`, (relY) => {
        // 下一波开局血量（按等级+道具修正后的上限）
        const max = this.slotMaxHp(i)
        const hp = waveStartHp(this.run.memberHp[i] ?? max, max)
        const ratio = hp / max
        const bar = this.add.graphics()
        bar.fillStyle(0x000000, 0.45)
        bar.fillRect(84, relY + S.rowH / 2 + 12, 130, 8)
        bar.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.3 ? 0xffb300 : 0xef5350, 1)
        bar.fillRect(85, relY + S.rowH / 2 + 13, 128 * ratio, 6)
        return [bar]
      })
    })

    // 未满编：末尾追加招募位
    if (this.lineup.length < rosterCap(this.run)) {
      slotRow('recruit', this.lineup.length + 1, '➕', '招募队员', (relY) => [
        this.add
          .text(84, relY + S.rowH / 2 + 19, `花 1 点招募（上限 ${rosterCap(this.run)} 人）`, {
            fontFamily: UI_FONT,
            fontSize: FONT.caption,
            color: '#b3e5fc',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      ])
    }

    const contentH = this.rows.length * (S.rowH + S.gap) - S.gap
    this.slotMax = Math.max(0, contentH - S.h)
    // 视口重启/扩编后按新布局重新钳制滚动位置
    this.setSlotScroll(this.slotScroll)
  }

  private inSlots(p: Phaser.Input.Pointer): boolean {
    const S = this.layout.slots
    const sx = this.origin.x + S.x
    const sy = this.origin.y + S.y
    return p.worldX >= sx && p.worldX <= sx + S.w && p.worldY >= sy && p.worldY <= sy + S.h
  }

  private inStats(p: Phaser.Input.Pointer): boolean {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    return (
      p.worldX >= dx &&
      p.worldX <= dx + D.w &&
      p.worldY >= this.statsTop &&
      p.worldY <= this.statsTop + this.statsH
    )
  }

  private setSlotScroll(y: number): void {
    this.slotScroll = Math.max(0, Math.min(this.slotMax, y))
    this.slotContainer.y = this.origin.y + this.layout.slots.y - this.slotScroll
    this.reportShop()
  }

  private setStatsScroll(y: number): void {
    this.statsScroll = Math.max(0, Math.min(this.statsMax, y))
    this.statsContainer.y = -this.statsScroll
  }

  // ── 属性面板 + 上架道具卡 ──────────────────────────────────

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.candidateRects = []
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    if (this.focusedId === 'recruit') {
      this.renderRecruitDetail(res)
      return
    }

    const isCaptain = this.focusedId === 'captain'
    const idx = this.focusedIndex()
    const owned = this.ownedFor(idx)
    const spec = isCaptain ? CAPTAINS[this.captainId] : CHARACTERS[this.focusedId as CharacterId]
    const level = isCaptain ? 0 : (this.run.memberLevels[idx - 1] ?? 1)
    let subtitle: { text: string; color: string }
    if (isCaptain) {
      subtitle = { text: '队长 · 提供团队增益，不参与战斗', color: '#b9b9c6' }
    } else {
      const slot = idx - 1
      const max = this.slotMaxHp(slot)
      const hp = waveStartHp(this.run.memberHp[slot] ?? max, max)
      subtitle = {
        text: `生命 ${hp}/${max}（下一波开局）`,
        color: hp / max > 0.5 ? '#9ccc9c' : '#ffb74d',
      }
    }

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, spec.emoji, 64, 'player'),
      this.add
        .text(dx + 104, dy + 44, isCaptain ? spec.name : `${spec.name} Lv.${level}`, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 80, subtitle.text, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: subtitle.color,
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    // 升级按钮（仅队员）：花 1 点 +1 级
    if (!isCaptain) {
      const can = canUpgrade(this.run, idx - 1)
      const maxed = level >= LEVELS.max
      const u = this.upgradeRect
      const ug = this.add.graphics()
      ug.fillStyle(can ? 0x81d4fa : 0xffffff, can ? 1 : 0.08)
      ug.fillRoundedRect(u.x, u.y, u.w, u.h, 26)
      this.detailObjs.push(
        ug,
        this.add
          .text(u.x + u.w / 2, u.y + u.h / 2, maxed ? '已满级' : '升级 1点', {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            fontStyle: 'bold',
            color: can ? '#17323f' : '#8f8f9a',
            resolution: res,
          })
          .setOrigin(0.5),
      )
    }

    // 属性区（可滚动）：已购道具行 + 属性组
    const statObjs: Phaser.GameObjects.GameObject[] = []
    let cursor = this.statsTop + 16
    if (owned.length > 0) {
      let x = dx + 42
      const uniq = [...new Set(owned)]
      for (const id of uniq.slice(0, 10)) {
        statObjs.push(emojiImage(this, x, cursor, ITEMS[id].emoji, 26))
        const n = stackCount(owned, id)
        const t = this.add
          .text(x + 17, cursor + 3, `×${n}`, {
            fontFamily: UI_FONT,
            fontSize: FONT.caption,
            color: '#e8e8f0',
            resolution: res,
          })
          .setOrigin(0, 0.5)
        statObjs.push(t)
        x += 40 + t.width
      }
      cursor += 40
    }

    const groups = isCaptain
      ? captainStatGroups(CAPTAINS[this.captainId], owned)
      : characterStatGroups(CHARACTERS[this.focusedId as CharacterId], owned, level)
    for (const group of groups) {
      statObjs.push(
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
        statObjs.push(t)
        cursor += Math.max(34, t.height + 8)
      }
      cursor += 10
    }
    this.statsContainer.add(statObjs)
    this.detailObjs.push(...statObjs)
    this.statsMax = Math.max(0, cursor - 6 - (this.statsTop + this.statsH))
    this.setStatsScroll(this.statsScroll)

    this.renderOfferCard(res)
  }

  private renderOfferCard(res: number): void {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const cardY = dy + D.h - 110
    const idx = this.focusedIndex()
    const offer = this.offers[idx] ?? null
    const owned = this.ownedFor(idx)

    const card = this.add.graphics()
    card.fillStyle(0xffffff, 0.07)
    card.fillRoundedRect(dx + 14, cardY, D.w - 28, 96, 12)
    card.lineStyle(1, 0xffd54f, 0.35)
    card.strokeRoundedRect(dx + 14, cardY, D.w - 28, 96, 12)
    this.detailObjs.push(card)

    if (offer) {
      const item: ItemSpec = ITEMS[offer]
      const held = stackCount(owned, offer)
      const stackNote =
        item.maxStacks === undefined
          ? held > 0
            ? ` · 已持有 ×${held}`
            : ''
          : ` · 已持有 ${held}/${item.maxStacks}`
      this.detailObjs.push(
        emojiImage(this, dx + 52, cardY + 48, item.emoji, 48),
        this.add
          .text(dx + 88, cardY + 28, item.name, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(dx + 88, cardY + 64, `${item.desc}${stackNote}`, {
            fontFamily: UI_FONT,
            fontSize: FONT.caption,
            color: '#b9b9c6',
            wordWrap: { width: this.refreshRect.x - (dx + 88) - 12 },
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
    } else {
      this.detailObjs.push(
        this.add
          .text(dx + 52, cardY + 48, '道具池已购罄，可刷新其他位', {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: '#9a9aa8',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
    }

    // 购买按钮
    const canBuy = offer !== null && this.run.coins >= ITEMS[offer].price
    const bb = this.buyRect
    const buyBg = this.add.graphics()
    buyBg.fillStyle(canBuy ? 0xffd54f : 0xffffff, canBuy ? 1 : 0.1)
    buyBg.fillRoundedRect(bb.x, bb.y, bb.w, bb.h, 27)
    this.detailObjs.push(
      buyBg,
      this.add
        .text(bb.x + bb.w / 2, bb.y + bb.h / 2, offer ? `购买 ${ITEMS[offer].price}` : '购买', {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          fontStyle: 'bold',
          color: canBuy ? '#25262e' : '#8f8f9a',
          resolution: res,
        })
        .setOrigin(0.5),
    )

    // 刷新按钮
    const free = this.run.freeRefreshes > 0
    const canRefresh = free || this.run.coins >= SHOP.refreshPrice
    const rb = this.refreshRect
    const refBg = this.add.graphics()
    refBg.fillStyle(0xffffff, canRefresh ? 0.14 : 0.07)
    refBg.fillRoundedRect(rb.x, rb.y, rb.w, rb.h, 27)
    if (canRefresh) {
      refBg.lineStyle(1, 0xffffff, 0.3)
      refBg.strokeRoundedRect(rb.x, rb.y, rb.w, rb.h, 27)
    }
    this.detailObjs.push(
      refBg,
      this.add
        .text(
          rb.x + rb.w / 2,
          rb.y + rb.h / 2,
          free ? `刷新 免费×${this.run.freeRefreshes}` : `刷新 ${SHOP.refreshPrice}`,
          {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: canRefresh ? '#ffffff' : '#8f8f9a',
            resolution: res,
          },
        )
        .setOrigin(0.5),
    )
  }

  /** 招募位详情：候选角色三列网格 + 底部招募卡（挑中者简介与招募按钮）；
   * 当前花名册下网格必定放得下（列数×行高按 8 人算过），花名册扩容后再考虑滚动 */
  private renderRecruitDetail(res: number): void {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const points = pointsAvailable(this.run)
    const candidates = recruitCandidates(this.run)
    if (!this.candidateId || !candidates.includes(this.candidateId)) {
      this.candidateId = candidates[0]
    }
    this.statsMax = 0
    this.setStatsScroll(0)

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, '➕', 52, 'player'),
      this.add
        .text(dx + 104, dy + 44, '招募新队员', {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 80, `花 1 点 · 可用点数 ${points}（升级得点）`, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: points > 0 ? '#b3e5fc' : '#ffb74d',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    // 候选网格：三列卡片，点选查看/切换
    this.candidateRects = []
    const cols = 3
    const gap = 10
    const cw = (D.w - 28 - gap * (cols - 1)) / cols
    const ch = 64
    candidates.forEach((id, i) => {
      const spec = CHARACTERS[id]
      const cx = dx + 14 + (i % cols) * (cw + gap)
      const cy = dy + 118 + Math.floor(i / cols) * (ch + gap)
      const picked = id === this.candidateId
      const g = this.add.graphics()
      g.fillStyle(picked ? 0xffffff : 0x000000, picked ? 0.16 : 0.25)
      g.fillRoundedRect(cx, cy, cw, ch, 12)
      g.lineStyle(picked ? 2 : 1, 0xffffff, picked ? 0.9 : 0.1)
      g.strokeRoundedRect(cx, cy, cw, ch, 12)
      const zone = this.add
        .zone(cx, cy, cw, ch)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.dragMoved) return
          playSfx('click')
          this.candidateId = id
          this.refresh()
        })
      this.detailObjs.push(
        g,
        emojiImage(this, cx + 34, cy + ch / 2, spec.emoji, 38, 'player'),
        this.add
          .text(cx + 62, cy + ch / 2, spec.name, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        zone,
      )
      this.candidateRects.push({ id, x: cx, y: cy, w: cw, h: ch })
    })

    // 底部招募卡：挑中者简介 + 招募按钮（复用购买按钮位）
    const cardY = dy + D.h - 110
    const card = this.add.graphics()
    card.fillStyle(0xffffff, 0.07)
    card.fillRoundedRect(dx + 14, cardY, D.w - 28, 96, 12)
    card.lineStyle(1, 0x81d4fa, 0.35)
    card.strokeRoundedRect(dx + 14, cardY, D.w - 28, 96, 12)
    this.detailObjs.push(card)
    const picked = this.candidateId
    if (picked) {
      const spec = CHARACTERS[picked]
      this.detailObjs.push(
        emojiImage(this, dx + 52, cardY + 48, spec.emoji, 48, 'player'),
        this.add
          .text(dx + 88, cardY + 28, spec.name, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(dx + 88, cardY + 64, spec.desc, {
            fontFamily: UI_FONT,
            fontSize: FONT.caption,
            color: '#b9b9c6',
            wordWrap: { width: this.buyRect.x - (dx + 88) - 12 },
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
    }
    const can = !!picked && canRecruit(this.run, picked)
    const bb = this.buyRect
    const bg = this.add.graphics()
    bg.fillStyle(can ? 0x81d4fa : 0xffffff, can ? 1 : 0.1)
    bg.fillRoundedRect(bb.x, bb.y, bb.w, bb.h, 27)
    this.detailObjs.push(
      bg,
      this.add
        .text(bb.x + bb.w / 2, bb.y + bb.h / 2, '招募 1点', {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          fontStyle: 'bold',
          color: can ? '#17323f' : '#8f8f9a',
          resolution: res,
        })
        .setOrigin(0.5),
    )
  }

  private refresh(): void {
    const S = this.layout.slots
    this.coinsText.setText(`${this.run.coins}`)
    this.pointsText.setText(`等级 ${this.run.xp.level} · 点数 ${pointsAvailable(this.run)}`)
    this.pointsText.setColor(pointsAvailable(this.run) > 0 ? '#b3e5fc' : '#8f8f9a')
    for (const row of this.rows) {
      const focused = row.id === this.focusedId
      const g = row.bg
      g.clear()
      g.fillStyle(focused ? 0xffffff : 0x000000, focused ? 0.16 : 0.25)
      g.fillRoundedRect(0, row.relY, S.w, S.rowH, 12)
      g.lineStyle(focused ? 2 : 1, 0xffffff, focused ? 0.9 : 0.1)
      g.strokeRoundedRect(0, row.relY, S.w, S.rowH, 12)
      // 上架道具卡：emoji + 价格；招募位显示点数开销
      const offer = row.id === 'recruit' ? null : (this.offers[row.index] ?? null)
      const cb = row.chipBg
      cb.clear()
      cb.fillStyle(0xffffff, 0.06)
      cb.fillRoundedRect(S.w - 174, row.relY + S.rowH / 2 - 22, 160, 44, 12)
      cb.lineStyle(1, row.id === 'recruit' ? 0x81d4fa : 0xffd54f, offer || row.id === 'recruit' ? 0.4 : 0.1)
      cb.strokeRoundedRect(S.w - 174, row.relY + S.rowH / 2 - 22, 160, 44, 12)
      if (row.id === 'recruit') {
        row.chipEmoji.setVisible(false)
        row.chipText
          .setText(pointsAvailable(this.run) > 0 ? '花 1 点' : '点数不足')
          .setColor(pointsAvailable(this.run) > 0 ? '#b3e5fc' : '#8f8f9a')
      } else if (offer) {
        const item = ITEMS[offer]
        row.chipEmoji.setTexture(emojiKey(item.emoji)).setVisible(true)
        row.chipText.setText(`${item.price} 金币`).setColor('#ffd54f')
      } else {
        row.chipEmoji.setVisible(false)
        row.chipText.setText('已购罄').setColor('#8f8f9a')
      }
    }
    // 招募位以外的聚焦对象变化时，属性区滚动位置由 renderDetail 重新钳制
    this.renderDetail(textRes())
    this.reportShop()
  }

  private nextWave(): void {
    playSfx('click')
    this.scene.start('arena')
  }

  private reportShop(): void {
    const S = this.layout.slots
    const idx = this.focusedIndex()
    const offer = this.offers[idx] ?? null
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
        freeRefreshes: this.run.freeRefreshes,
        level: this.run.xp.level,
        points: pointsAvailable(this.run),
        slots: this.rows.map((r) => ({
          id: r.id,
          x: this.origin.x + S.x,
          y: this.origin.y + S.y + r.relY - this.slotScroll,
          w: S.w,
          h: S.rowH,
          offer: r.id === 'recruit' ? null : (this.offers[r.index] ?? null),
          price:
            r.id !== 'recruit' && this.offers[r.index] ? ITEMS[this.offers[r.index]!].price : null,
          owned: r.id === 'recruit' ? 0 : this.ownedFor(r.index).length,
          memberLevel: r.id === 'captain' || r.id === 'recruit' ? null : (this.run.memberLevels[r.index - 1] ?? 1),
        })),
        buy: {
          x: this.buyRect.x + this.buyRect.w / 2,
          y: this.buyRect.y + this.buyRect.h / 2,
          w: this.buyRect.w,
          h: this.buyRect.h,
          enabled:
            this.focusedId === 'recruit'
              ? !!this.candidateId && canRecruit(this.run, this.candidateId)
              : offer !== null && this.run.coins >= ITEMS[offer].price,
        },
        refresh: {
          x: this.refreshRect.x + this.refreshRect.w / 2,
          y: this.refreshRect.y + this.refreshRect.h / 2,
          w: this.refreshRect.w,
          h: this.refreshRect.h,
          enabled:
            this.focusedId !== 'recruit' &&
            (this.run.freeRefreshes > 0 || this.run.coins >= SHOP.refreshPrice),
        },
        upgrade: {
          x: this.upgradeRect.x + this.upgradeRect.w / 2,
          y: this.upgradeRect.y + this.upgradeRect.h / 2,
          w: this.upgradeRect.w,
          h: this.upgradeRect.h,
          enabled: idx >= 1 && canUpgrade(this.run, idx - 1),
        },
        recruit: {
          candidates: this.candidateRects.map((c) => ({
            id: c.id,
            x: c.x,
            y: c.y,
            w: c.w,
            h: c.h,
          })),
          selected: this.candidateId ?? null,
        },
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

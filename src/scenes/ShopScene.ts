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
import { UI_FONT } from '../ui/fonts'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 波次间商店：左（竖屏为下）为上架位列表——队长占首位、每个出战角色一个位，
// 各自从自己的道具池随机上架，可购买（自动补货）或付费刷新（队长可提供免费次数）；
// 右（竖屏为上）为选中对象的属性面板（道具修正后数值）+ 当前上架道具卡。
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

// 上架位：队长固定占第一位（'captain' 哨兵），队员按阵容槽位排列，
// 未满编时末尾追加招募位（'recruit' 哨兵）——点数在此花掉（招募新人/给角色升级）
type SlotId = 'captain' | CharacterId | 'recruit'

interface SlotRow {
  id: SlotId
  /** offers/持有列表的下标：0 = 队长，1.. = 阵容槽位+1 */
  index: number
  x: number
  y: number
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

    emojiImage(this, w / 2 - 118, oy + L.coinsY, COIN.emoji, 26, true)
    this.coinsText = this.add
      .text(w / 2 - 100, oy + L.coinsY, `${this.run.coins}`, {
        fontFamily: UI_FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0, 0.5)
    // 队伍等级与可点数：点数是招募/升级的唯一货币
    this.pointsText = this.add
      .text(w / 2 - 20, oy + L.coinsY, '', {
        fontFamily: UI_FONT,
        fontSize: '18px',
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

    // 上架道具卡的购买/刷新按钮命中区（内容随 refresh 重绘）；
    // 聚焦招募位时购买位变为「招募」，刷新不可用
    const cardY = dy + D.h - 92
    this.buyRect = { x: dx + D.w - 14 - 104, y: cardY + 20, w: 104, h: 40 }
    this.refreshRect = { x: this.buyRect.x - 8 - 96, y: cardY + 20, w: 96, h: 40 }
    this.add
      .zone(this.buyRect.x, this.buyRect.y, this.buyRect.w, this.buyRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => (this.focusedId === 'recruit' ? this.recruitFocused() : this.buyFocused()))
    this.add
      .zone(this.refreshRect.x, this.refreshRect.y, this.refreshRect.w, this.refreshRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.refreshFocused())
    // 升级按钮（详情头部右侧；仅聚焦队员时可用）
    this.upgradeRect = { x: dx + D.w - 14 - 118, y: dy + 24, w: 118, h: 40 }
    this.add
      .zone(this.upgradeRect.x, this.upgradeRect.y, this.upgradeRect.w, this.upgradeRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.upgradeFocused())

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
    this.offers[idx] = rollItem(this.poolFor(idx), this.ownedFor(idx), Math.random)
    this.refresh()
  }

  /** 花 1 点招募详情里挑中的候选；扩编后重建页面（保留焦点与上架结果） */
  private recruitFocused(): void {
    const id = this.candidateId
    if (!id || !canRecruit(this.run, id)) return
    const slot = recruitMember(this.run, id)
    if (slot < 0) return
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
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private slotMaxHp(slot: number): number {
    return memberMaxHp(
      this.run.memberLevels[slot] ?? 1,
      aggregateCharacterEffects(this.run.memberItems[slot] ?? []).hpAdd,
    )
  }

  // ── 上架位列表（队长 + 队员） ───────────────────────────────

  private createSlots(res: number): void {
    const S = this.layout.slots
    const sx = this.origin.x + S.x
    const sy = this.origin.y + S.y

    const slotRow = (id: SlotId, index: number, emoji: string, name: string, extra: (y: number) => void): void => {
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
      // 上架位道具卡（内容随 refresh 重绘）
      const chipBg = this.add.graphics()
      const chipEmoji = emojiImage(this, sx + S.w - 122, y + S.rowH / 2, COIN.emoji, 26).setVisible(false)
      const chipText = this.add
        .text(sx + S.w - 100, y + S.rowH / 2, '', {
          fontFamily: UI_FONT,
          fontSize: '13px',
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      this.add
        .zone(sx, y, S.w, S.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.focusedId = id
          this.refresh()
        })
      this.rows.push({ id, index, x: sx, y, bg, chipBg, chipEmoji, chipText })
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
      const level = this.run.memberLevels[i] ?? 1
      slotRow(id, i + 1, spec.emoji, `${spec.name} Lv.${level}`, (y) => {
        // 下一波开局血量（按等级+道具修正后的上限）
        const max = this.slotMaxHp(i)
        const hp = waveStartHp(this.run.memberHp[i] ?? max, max)
        const ratio = hp / max
        const bar = this.add.graphics()
        bar.fillStyle(0x000000, 0.45)
        bar.fillRect(sx + 70, y + S.rowH / 2 + 6, 96, 6)
        bar.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.3 ? 0xffb300 : 0xef5350, 1)
        bar.fillRect(sx + 71, y + S.rowH / 2 + 7, 94 * ratio, 4)
      })
    })

    // 未满编：末尾追加招募位
    if (this.lineup.length < rosterCap(this.run)) {
      slotRow('recruit', this.lineup.length + 1, '➕', '招募队员', (y) => {
        this.add
          .text(sx + 70, y + S.rowH / 2 + 10, `花 1 点招募新角色（上限 ${rosterCap(this.run)} 人）`, {
            fontFamily: UI_FONT,
            fontSize: '12px',
            color: '#b3e5fc',
            resolution: res,
          })
          .setOrigin(0, 0.5)
      })
    }
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
      emojiImage(this, dx + 52, dy + 46, spec.emoji, 52, true),
      this.add
        .text(dx + 92, dy + 34, isCaptain ? spec.name : `${spec.name} Lv.${level}`, {
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

    // 升级按钮（仅队员）：花 1 点 +1 级
    if (!isCaptain) {
      const can = canUpgrade(this.run, idx - 1)
      const maxed = level >= LEVELS.max
      const u = this.upgradeRect
      const ug = this.add.graphics()
      ug.fillStyle(can ? 0x81d4fa : 0xffffff, can ? 1 : 0.08)
      ug.fillRoundedRect(u.x, u.y, u.w, u.h, 20)
      this.detailObjs.push(
        ug,
        this.add
          .text(u.x + u.w / 2, u.y + u.h / 2, maxed ? '已满级' : '升级 1点', {
            fontFamily: UI_FONT,
            fontSize: '15px',
            fontStyle: 'bold',
            color: can ? '#17323f' : '#8f8f9a',
            resolution: res,
          })
          .setOrigin(0.5),
      )
    }

    // 已购道具：图标 ×N 一行
    let cursor = dy + 92
    if (owned.length > 0) {
      let x = dx + 38
      const uniq = [...new Set(owned)]
      for (const id of uniq.slice(0, 10)) {
        this.detailObjs.push(emojiImage(this, x, cursor, ITEMS[id].emoji, 20))
        const n = stackCount(owned, id)
        const t = this.add
          .text(x + 13, cursor + 2, `×${n}`, {
            fontFamily: UI_FONT,
            fontSize: '11px',
            color: '#e8e8f0',
            resolution: res,
          })
          .setOrigin(0, 0.5)
        this.detailObjs.push(t)
        x += 30 + t.width
      }
      cursor += 28
    }

    const groups = isCaptain
      ? captainStatGroups(CAPTAINS[this.captainId], owned)
      : characterStatGroups(CHARACTERS[this.focusedId as CharacterId], owned, level)
    for (const group of groups) {
      this.detailObjs.push(
        emojiImage(this, dx + 38, cursor, group.icon, 20),
        this.add
          .text(dx + 56, cursor, group.title, {
            fontFamily: UI_FONT,
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      cursor += 24
      for (const line of group.lines) {
        this.detailObjs.push(
          this.add
            .text(dx + 56, cursor, line, {
              fontFamily: UI_FONT,
              fontSize: '14px',
              color: '#d0d0d8',
              wordWrap: { width: D.w - 96 },
              resolution: res,
            })
            .setOrigin(0, 0.5),
        )
        cursor += 20
      }
      cursor += 8
    }

    this.renderOfferCard(res)
  }

  private renderOfferCard(res: number): void {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const cardY = dy + D.h - 92
    const idx = this.focusedIndex()
    const offer = this.offers[idx] ?? null
    const owned = this.ownedFor(idx)

    const card = this.add.graphics()
    card.fillStyle(0xffffff, 0.07)
    card.fillRoundedRect(dx + 14, cardY, D.w - 28, 78, 12)
    card.lineStyle(1, 0xffd54f, 0.35)
    card.strokeRoundedRect(dx + 14, cardY, D.w - 28, 78, 12)
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
        emojiImage(this, dx + 48, cardY + 39, item.emoji, 40),
        this.add
          .text(dx + 80, cardY + 22, item.name, {
            fontFamily: UI_FONT,
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(dx + 80, cardY + 47, `${item.desc}${stackNote}`, {
            fontFamily: UI_FONT,
            fontSize: '12px',
            color: '#b9b9c6',
            wordWrap: { width: D.w - 28 - 66 - 230 },
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
    } else {
      this.detailObjs.push(
        this.add
          .text(dx + 48, cardY + 39, '道具池已购罄，可刷新其他位', {
            fontFamily: UI_FONT,
            fontSize: '14px',
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
    buyBg.fillRoundedRect(bb.x, bb.y, bb.w, bb.h, 20)
    this.detailObjs.push(
      buyBg,
      this.add
        .text(bb.x + bb.w / 2, bb.y + bb.h / 2, offer ? `购买 ${ITEMS[offer].price}` : '购买', {
          fontFamily: UI_FONT,
          fontSize: '16px',
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
    refBg.fillRoundedRect(rb.x, rb.y, rb.w, rb.h, 20)
    if (canRefresh) {
      refBg.lineStyle(1, 0xffffff, 0.3)
      refBg.strokeRoundedRect(rb.x, rb.y, rb.w, rb.h, 20)
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
            fontSize: '13px',
            color: canRefresh ? '#ffffff' : '#8f8f9a',
            resolution: res,
          },
        )
        .setOrigin(0.5),
    )
  }

  /** 招募位详情：候选角色两列网格 + 底部招募卡（挑中者简介与招募按钮） */
  private renderRecruitDetail(res: number): void {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const points = pointsAvailable(this.run)
    const candidates = recruitCandidates(this.run)
    if (!this.candidateId || !candidates.includes(this.candidateId)) {
      this.candidateId = candidates[0]
    }

    this.detailObjs.push(
      emojiImage(this, dx + 52, dy + 46, '➕', 44, true),
      this.add
        .text(dx + 92, dy + 34, '招募新队员', {
          fontFamily: UI_FONT,
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 92, dy + 60, `招募花费 1 点 · 可用点数 ${points}（升级得点）`, {
          fontFamily: UI_FONT,
          fontSize: '14px',
          color: points > 0 ? '#b3e5fc' : '#ffb74d',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    // 候选网格：两列卡片，点选查看/切换
    this.candidateRects = []
    const cols = 2
    const gap = 10
    const cw = (D.w - 28 - gap) / cols
    const ch = 46
    candidates.forEach((id, i) => {
      const spec = CHARACTERS[id]
      const cx = dx + 14 + (i % cols) * (cw + gap)
      const cy = dy + 88 + Math.floor(i / cols) * (ch + gap)
      const picked = id === this.candidateId
      const g = this.add.graphics()
      g.fillStyle(picked ? 0xffffff : 0x000000, picked ? 0.16 : 0.25)
      g.fillRoundedRect(cx, cy, cw, ch, 10)
      g.lineStyle(picked ? 2 : 1, 0xffffff, picked ? 0.9 : 0.1)
      g.strokeRoundedRect(cx, cy, cw, ch, 10)
      const zone = this.add
        .zone(cx, cy, cw, ch)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.candidateId = id
          this.refresh()
        })
      this.detailObjs.push(
        g,
        emojiImage(this, cx + 26, cy + ch / 2, spec.emoji, 30, true),
        this.add
          .text(cx + 48, cy + ch / 2, spec.name, {
            fontFamily: UI_FONT,
            fontSize: '16px',
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
    const cardY = dy + D.h - 92
    const card = this.add.graphics()
    card.fillStyle(0xffffff, 0.07)
    card.fillRoundedRect(dx + 14, cardY, D.w - 28, 78, 12)
    card.lineStyle(1, 0x81d4fa, 0.35)
    card.strokeRoundedRect(dx + 14, cardY, D.w - 28, 78, 12)
    this.detailObjs.push(card)
    const picked = this.candidateId
    if (picked) {
      const spec = CHARACTERS[picked]
      this.detailObjs.push(
        emojiImage(this, dx + 48, cardY + 39, spec.emoji, 40, true),
        this.add
          .text(dx + 80, cardY + 22, spec.name, {
            fontFamily: UI_FONT,
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(dx + 80, cardY + 47, spec.desc, {
            fontFamily: UI_FONT,
            fontSize: '12px',
            color: '#b9b9c6',
            wordWrap: { width: D.w - 28 - 66 - 130 },
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
    }
    const can = !!picked && canRecruit(this.run, picked)
    const bb = this.buyRect
    const bg = this.add.graphics()
    bg.fillStyle(can ? 0x81d4fa : 0xffffff, can ? 1 : 0.1)
    bg.fillRoundedRect(bb.x, bb.y, bb.w, bb.h, 20)
    this.detailObjs.push(
      bg,
      this.add
        .text(bb.x + bb.w / 2, bb.y + bb.h / 2, '招募 1点', {
          fontFamily: UI_FONT,
          fontSize: '16px',
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
      g.fillRoundedRect(row.x, row.y, S.w, S.rowH, 12)
      g.lineStyle(focused ? 2 : 1, 0xffffff, focused ? 0.9 : 0.1)
      g.strokeRoundedRect(row.x, row.y, S.w, S.rowH, 12)
      // 上架道具卡：emoji + 价格；招募位显示点数开销
      const offer = row.id === 'recruit' ? null : (this.offers[row.index] ?? null)
      const cb = row.chipBg
      cb.clear()
      cb.fillStyle(0xffffff, 0.06)
      cb.fillRoundedRect(row.x + S.w - 148, row.y + S.rowH / 2 - 17, 134, 34, 10)
      cb.lineStyle(1, row.id === 'recruit' ? 0x81d4fa : 0xffd54f, offer || row.id === 'recruit' ? 0.4 : 0.1)
      cb.strokeRoundedRect(row.x + S.w - 148, row.y + S.rowH / 2 - 17, 134, 34, 10)
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
    this.renderDetail(textRes())
    this.reportShop()
  }

  private nextWave(): void {
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
          x: r.x,
          y: r.y,
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

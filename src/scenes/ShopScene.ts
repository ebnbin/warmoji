import Phaser from 'phaser'
import type { CaptainId, CharacterId } from '../core/config'
import { CAPTAINS, CHARACTERS, COIN, SHOP } from '../core/config'
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
import { endRun, getRun, waveStartHp } from '../core/run'
import type { RunState } from '../core/run'
import { captainStatGroups, characterStatGroups } from '../core/stats'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage } from '../ui/emoji'
import { EmojiGrid } from '../ui/grid'
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

// 上架位：队长固定占第一位（'captain' 哨兵），队员按阵容槽位排列。
// 招募/升级已拆分到整编页（PromoteScene），商店只管道具购物
type SlotId = 'captain' | CharacterId

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
  private grid!: EmojiGrid
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private coinsText!: Phaser.GameObjects.Text
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private buyRect = { x: 0, y: 0, w: 0, h: 0 }
  private refreshRect = { x: 0, y: 0, w: 0, h: 0 }
  private quitArmed = false
  // 上架位网格自带滚动；详情属性区行数多时也可滚动
  private slotScroll = 0
  private statsContainer!: Phaser.GameObjects.Container
  private statsScroll = 0
  private statsMax = 0
  private statsTop = 0
  private statsH = 0
  private dragging = false
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
    }
    this.detailObjs = []
    this.quitArmed = false
    this.dragging = false
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
      if (this.dragMoved || this.grid.wasDragged) return
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

    emojiImage(this, w / 2 - 28, oy + L.coinsY, COIN.emoji, 32, 'player')
    this.coinsText = this.add
      .text(w / 2 - 4, oy + L.coinsY, `${this.run.coins}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0, 0.5)

    this.createSlots()

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

    // 上架道具卡的购买/刷新按钮命中区（内容随 refresh 重绘）
    const cardY = dy + D.h - 110
    this.buyRect = { x: dx + D.w - 26 - 140, y: cardY + 21, w: 140, h: 54 }
    this.refreshRect = { x: this.buyRect.x - 8 - 150, y: cardY + 21, w: 150, h: 54 }
    this.add
      .zone(this.buyRect.x, this.buyRect.y, this.buyRect.w, this.buyRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved && !this.grid.wasDragged) this.buyFocused()
      })
    this.add
      .zone(this.refreshRect.x, this.refreshRect.y, this.refreshRect.w, this.refreshRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved && !this.grid.wasDragged) this.refreshFocused()
      })

    // 详情属性区滚动（上架位网格的滚动由 EmojiGrid 自理）
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy2: number) => {
      if (this.inStats(p)) this.setStatsScroll(this.statsScroll + dy2 * 0.6)
    })
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMoved = false
      this.dragging = this.inStats(p)
      if (this.dragging) {
        this.dragStartY = p.worldY
        this.dragStartScroll = this.statsScroll
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dyDrag = this.dragStartY - p.worldY
      if (this.statsMax > 0 && Math.abs(dyDrag) > 10) this.dragMoved = true
      if (this.dragMoved) this.setStatsScroll(this.dragStartScroll + dyDrag)
    })
    this.input.on('pointerup', () => {
      this.dragging = false
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
        if (!this.dragMoved && !this.grid.wasDragged) this.nextWave()
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

  /** 0 = 队长，1.. = 队员槽位+1 */
  private focusedIndex(): number {
    if (this.focusedId === 'captain') return 0
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

  private slotMaxHp(slot: number): number {
    return memberMaxHp(
      this.run.memberLevels[slot] ?? 1,
      aggregateCharacterEffects(this.run.memberItems[slot] ?? []).hpAdd,
    )
  }

  // ── 上架位网格（队长 + 队员 + 招募；形象即含义，角标 = 当前上架道具） ──

  /** 网格条目：id 即 key；角标显示该位当前上架道具，队员带血条 */
  private buildSlotItems(): { key: string; emoji: string; outline: 'player'; badge?: string; hpRatio?: number }[] {
    const items: { key: string; emoji: string; outline: 'player'; badge?: string; hpRatio?: number }[] = [
      {
        key: 'captain',
        emoji: CAPTAINS[this.captainId].emoji,
        outline: 'player',
        badge: this.offers[0] ? ITEMS[this.offers[0]].emoji : undefined,
      },
    ]
    this.lineup.forEach((id, i) => {
      const max = this.slotMaxHp(i)
      const hp = waveStartHp(this.run.memberHp[i] ?? max, max)
      const offer = this.offers[i + 1]
      items.push({
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player',
        badge: offer ? ITEMS[offer].emoji : undefined,
        hpRatio: hp / max,
      })
    })
    return items
  }

  private createSlots(): void {
    const S = this.layout.slots
    this.grid = new EmojiGrid(
      this,
      { x: this.origin.x + S.x, y: this.origin.y + S.y, w: S.w, h: S.h },
      { initialScroll: this.slotScroll },
    )
    this.grid.onTap = (key): void => {
      if (this.focusedId !== key) this.statsScroll = 0
      playSfx('click')
      this.focusedId = key as SlotId
      this.refresh()
    }
    this.grid.onScroll = (): void => {
      this.slotScroll = this.grid.scrollY
    }
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

  private setStatsScroll(y: number): void {
    this.statsScroll = Math.max(0, Math.min(this.statsMax, y))
    this.statsContainer.y = -this.statsScroll
  }

  // ── 属性面板 + 上架道具卡 ──────────────────────────────────

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

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

  private refresh(): void {
    this.coinsText.setText(`${this.run.coins}`)
    // 购买/刷新会换上架、升级/招募会变血条：整格重建 + 选中态
    this.grid.setItems(this.buildSlotItems())
    this.grid.setSelected(this.focusedId)
    // 招募位以外的聚焦对象变化时，属性区滚动位置由 renderDetail 重新钳制
    this.renderDetail(textRes())
    this.reportShop()
  }

  private nextWave(): void {
    playSfx('click')
    this.scene.start('arena')
  }

  private reportShop(): void {
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
        slots: this.grid.cellRects().map((r) => {
          const id = r.key as SlotId
          const index = id === 'captain' ? 0 : this.lineup.indexOf(id) + 1
          return {
            id,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            offer: this.offers[index] ?? null,
            price: this.offers[index] ? ITEMS[this.offers[index]!].price : null,
            owned: this.ownedFor(index).length,
            memberLevel: index === 0 ? null : (this.run.memberLevels[index - 1] ?? 1),
          }
        }),
        buy: {
          x: this.buyRect.x + this.buyRect.w / 2,
          y: this.buyRect.y + this.buyRect.h / 2,
          w: this.buyRect.w,
          h: this.buyRect.h,
          enabled: offer !== null && this.run.coins >= ITEMS[offer].price,
        },
        refresh: {
          x: this.refreshRect.x + this.refreshRect.w / 2,
          y: this.refreshRect.y + this.refreshRect.h / 2,
          w: this.refreshRect.w,
          h: this.refreshRect.h,
          enabled: this.run.freeRefreshes > 0 || this.run.coins >= SHOP.refreshPrice,
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

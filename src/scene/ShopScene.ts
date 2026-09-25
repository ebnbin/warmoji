import Phaser from 'phaser'
import { CAPTAINS } from '../data/captains'
import { CHARACTERS } from '../data/characters'
import type { CaptainId } from '../types/captains'
import type { CharacterId } from '../types/characters'
import { SHOP } from '../data/items'
import { PICKUPS } from '../data/pickups'
import {
  aggregateCharacterEffects,
  characterXp,
  ITEMS,
  RARITIES,
  itemPrice,
} from '../data/items'
import type { ItemId, ItemDef, CharacterEffects } from '../types/items'
import { characterLevel } from '../data/charLevel'
import { levelStatsFor, LEVEL_STATS } from '../data/levels'
import { upgradeCardsFor } from '../data/characters'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { endRun, getRun, waveStartHp } from '../run/state'
import type { RunState } from '../run/state'
import { characterStatGroups } from '../scene/statLines'
import { memberMaxHp } from '../data/stats'
import { applyBackground } from '../util/background'
import { emojiImage } from '../emoji/hold'
import { EmojiGrid } from '../ui/grid'
import type { EmojiGridItem } from '../ui/grid'
import { ScrollView } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { clipTo } from '../util/mask'
import { roundRect } from '../ui/shapes'
import { characterPoolFor, levelProgress, rollItem, stackCount } from '../run/draft'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'

interface ShopLayout {
  content: { w: number; h: number }
  titleY: number
  coinsY: number
  slots: { x: number; y: number; w: number; h: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: ShopLayout = {
  content: { w: 1280, h: 720 },
  titleY: 46,
  coinsY: 98,
  detail: { x: 40, y: 132, w: 730, h: 488 },
  slots: { x: 810, y: 132, w: 430, h: 488 },
  btn: { y: 660, w: 340, h: 64 },
}

const PORTRAIT: ShopLayout = {
  content: { w: 720, h: 1280 },
  titleY: 54,
  coinsY: 106,
  detail: { x: 24, y: 144, w: 672, h: 460 },
  slots: { x: 24, y: 628, w: 672, h: 470 },
  btn: { y: 1162, w: 360, h: 72 },
}

export class ShopScene extends Phaser.Scene implements DevProviderHost {
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private captainId: CaptainId = 'angel'
  private lineup: CharacterId[] = []
  private focusedId: CharacterId = 'juggler'
  private offers: (ItemId | null)[] = []
  private layout!: ShopLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid<CharacterId>
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private offerDescView!: ScrollView
  private coinsText!: Phaser.GameObjects.Text
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private buyRect = { x: 0, y: 0, w: 0, h: 0 }
  private refreshRect = { x: 0, y: 0, w: 0, h: 0 }
  private quitArmed = false
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
    super(SceneKey.Shop)
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
      if (CAPTAINS[this.captainId].reviveInShop) {
        this.run.memberHp = this.run.memberHp.map((_, slot) => this.slotMaxHp(slot))
      }
      this.run.freeRefreshes = CAPTAINS[this.captainId].freeRefreshes
      this.offers = this.lineup.map((_, slot) =>
        rollItem(this.poolFor(slot), this.ownedFor(slot), Math.random, this.run.wave, this.levelOf(slot)),
      )
      this.focusedId = this.lineup[0] ?? this.focusedId
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

    const quit = this.add
      .text(this.origin.x + 40, oy + L.titleY, '✕ 结束', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
    quit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (this.dragMoved || this.grid.wasDragged) return
      if (this.quitArmed) {
        endRun()
        this.scene.start(SceneKey.Menu)
        return
      }
      this.quitArmed = true
      quit.setText('再点一次确认').setColor('#ef9a9a')
      this.time.delayedCall(2500, () => {
        this.quitArmed = false
        if (quit.active) quit.setText('✕ 结束').setColor('#c8c8d4')
      })
    })



    emojiImage(this, w / 2 - 28, oy + L.coinsY, PICKUPS.coin.emoji, 42, 'player')
    this.coinsText = this.add
      .text(w / 2 - 4, oy + L.coinsY, `${this.run.coins}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffdc5d',
        resolution: res,
      })
      .setOrigin(0, 0.5)

    this.createSlots()

    const D = L.detail
    const dx = this.origin.x + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    roundRect(panel, dx, dy, D.w, D.h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })

    this.statsTop = dy + 112
    this.statsH = D.h - 112 - 118
    this.statsContainer = this.add.container(0, 0)
    const statsMask = this.add.graphics().setVisible(false)
    statsMask.fillStyle(0xffffff, 1)
    statsMask.fillRect(dx, this.statsTop, D.w, this.statsH)
    clipTo(this.statsContainer, statsMask)

    const cardY = dy + D.h - 110
    this.buyRect = { x: dx + D.w - 26 - 140, y: cardY + 21, w: 140, h: 54 }
    this.refreshRect = { x: this.buyRect.x - 8 - 150, y: cardY + 21, w: 150, h: 54 }
    this.add
      .zone(this.buyRect.x, this.buyRect.y, this.buyRect.w, this.buyRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.dragMoved && !this.grid.wasDragged) this.buyFocused()
      })
    this.add
      .zone(this.refreshRect.x, this.refreshRect.y, this.refreshRect.w, this.refreshRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.dragMoved && !this.grid.wasDragged) this.refreshFocused()
      })

    this.offerDescView = new ScrollView(
      this,
      { x: dx + 88, y: cardY + 42, w: this.refreshRect.x - (dx + 88) - 12, h: 52 },
      { scrollbar: true },
    )

    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy2: number) => {
      if (this.inStats(p)) this.setStatsScroll(this.statsScroll + dy2 * 0.6)
    })
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragMoved = false
      this.dragging = this.inStats(p)
      if (this.dragging) {
        this.dragStartY = p.worldY
        this.dragStartScroll = this.statsScroll
      }
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dyDrag = this.dragStartY - p.worldY
      if (this.statsMax > 0 && Math.abs(dyDrag) > 10) this.dragMoved = true
      if (this.dragMoved) this.setStatsScroll(this.dragStartScroll + dyDrag)
    })
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.dragging = false
    })

    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btn.y - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    const b = this.btnRect
    const btnBg = this.add.graphics()
    roundRect(btnBg, b.x, b.y, b.w, b.h, b.h / 2, { fill: 0xffdc5d })
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
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.dragMoved && !this.grid.wasDragged) this.nextWave()
      })
    this.input.keyboard?.on('keydown-ENTER', () => this.nextWave())
    this.input.keyboard?.on('keydown-SPACE', () => this.nextWave())

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private levelOf(slot: number): number {
    return characterLevel(characterXp(this.run.memberItems[slot] ?? []))
  }

  private poolFor(slot: number): ItemId[] {
    const id = this.lineup[slot]!
    return characterPoolFor(CHARACTERS[id], this.levelOf(slot))
  }

  private ownedFor(slot: number): ItemId[] {
    return (this.run.memberItems[slot] ??= [])
  }

  private focusedIndex(): number {
    return this.lineup.indexOf(this.focusedId)
  }

  private price(offer: ItemId): number {
    return Math.max(1, Math.round(itemPrice(offer, this.run.wave)))
  }

  private buyFocused(): void {
    const idx = this.focusedIndex()
    if (idx < 0) return
    const offer = this.offers[idx]
    if (!offer) return
    const price = this.price(offer)
    if (this.run.coins < price) return
    this.run.coins -= price
    playSfx('buy')
    const beforeLevel = this.levelOf(idx)
    const owned = this.ownedFor(idx)
    owned.push(offer)
    const afterLevel = this.levelOf(idx)
    this.offers[idx] = rollItem(this.poolFor(idx), owned, Math.random, this.run.wave, afterLevel)
    this.refresh()
    if (afterLevel > beforeLevel) this.showLevelUp(idx, afterLevel)
  }

  private refreshFocused(): void {
    const idx = this.focusedIndex()
    if (idx < 0) return
    const free = this.run.freeRefreshes > 0
    if (!free && this.run.coins < SHOP.refreshPrice) return
    if (free) this.run.freeRefreshes -= 1
    else this.run.coins -= SHOP.refreshPrice
    playSfx('click')
    this.offers[idx] = rollItem(this.poolFor(idx), this.ownedFor(idx), Math.random, this.run.wave, this.levelOf(idx))
    this.refresh()
  }

  private slotMaxHp(slot: number): number {
    const id = this.lineup[slot]!
    const owned = this.run.memberItems[slot] ?? []
    return memberMaxHp(aggregateCharacterEffects(owned, levelStatsFor(id, this.levelOf(slot))).hpAdd)
  }

  private buildSlotItems(): EmojiGridItem<CharacterId>[] {
    return this.lineup.map((id, slot) => {
      const max = this.slotMaxHp(slot)
      const hp = waveStartHp(this.run.memberHp[slot] ?? max, max)
      const offer = this.offers[slot]
      return {
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player' as const,
        badge: offer ? ITEMS[offer].emoji : undefined,
        hpRatio: hp / max,
      }
    })
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
      this.focusedId = key
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

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const idx = this.focusedIndex()
    const owned = this.ownedFor(idx)
    const def = CHARACTERS[this.focusedId]
    const level = this.levelOf(idx)
    const prog = levelProgress(characterXp(this.run.memberItems[idx] ?? []))
    const max = this.slotMaxHp(idx)
    const hp = waveStartHp(this.run.memberHp[idx] ?? max, max)
    const subtitle = {
      text: `生命 ${hp}/${max}（下一波开局）`,
      color: hp / max > 0.5 ? '#9ccc9c' : '#ffb74d',
    }

    const barX = dx + 104
    const barW = dx + D.w - 24 - barX
    const barY = dy + 92
    const xpBar = this.add.graphics()
    roundRect(xpBar, barX, barY, barW, 9, 4, { fill: 0x000000, fillAlpha: 0.4 })
    roundRect(xpBar, barX + 1, barY + 1, Math.max(2, (barW - 2) * prog.ratio), 7, 3, { fill: prog.maxed ? 0xffdc5d : 0x7cc5ff })

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 52, def.emoji, 85, 'player'),
      this.add
        .text(dx + 104, dy + 40, def.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(
          dx + D.w - 24,
          dy + 40,
          prog.maxed ? `Lv ${level} · 满级` : `Lv ${level} · 经验 ${prog.cur}/${prog.need}`,
          {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            fontStyle: 'bold',
            color: '#ffdc5d',
            resolution: res,
          },
        )
        .setOrigin(1, 0.5),
      this.add
        .text(dx + 104, dy + 70, subtitle.text, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: subtitle.color,
          resolution: res,
        })
        .setOrigin(0, 0.5),
      xpBar,
    )

    const statObjs: Phaser.GameObjects.GameObject[] = []
    let cursor = this.statsTop + 16
    if (owned.length > 0) {
      const startX = dx + 42
      const maxX = dx + D.w - 42
      let x = startX
      const uniq = [...new Set(owned)]
      for (const id of uniq) {
        const n = stackCount(owned, id)
        const t = this.add
          .text(x + 17, cursor + 3, `×${n}`, {
            fontFamily: UI_FONT,
            fontSize: FONT.caption,
            color: '#e8e8f0',
            resolution: res,
          })
          .setOrigin(0, 0.5)
        const cellW = 40 + t.width
        if (x > startX && x + cellW > maxX) {
          x = startX
          cursor += 40
          t.setPosition(x + 17, cursor + 3)
        }
        statObjs.push(emojiImage(this, x, cursor, ITEMS[id].emoji, 35), t)
        x += cellW
      }
      cursor += 40
    }

    const groups = characterStatGroups(this.focusedId, owned, level)
    for (const group of groups) {
      statObjs.push(
        emojiImage(this, dx + 42, cursor, group.icon, 35),
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

    const rarity = offer ? ITEMS[offer].rarity : 'common'
    const rarityColor = Number.parseInt(RARITIES[rarity].color.slice(1), 16)
    const card = this.add.graphics()
    roundRect(card, dx + 14, cardY, D.w - 28, 96, 12, { fill: 0xffffff, fillAlpha: 0.07 })
    if (offer && rarity !== 'common') card.lineStyle(2, rarityColor, 0.8)
    else card.lineStyle(1, 0xffdc5d, 0.35)
    card.strokeRoundedRect(dx + 14, cardY, D.w - 28, 96, 12)
    this.detailObjs.push(card)

    if (offer) {
      const item: ItemDef = ITEMS[offer]
      const held = stackCount(owned, offer)
      const stackNote =
        item.maxStacks === undefined
          ? held > 0
            ? ` · 已持有 ×${held}`
            : ''
          : ` · 已持有 ${held}/${item.maxStacks}`
      const name = this.add
        .text(dx + 88, cardY + 28, item.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          fontStyle: 'bold',
          color: item.rarity === 'common' ? '#ffffff' : RARITIES[item.rarity].color,
          resolution: res,
        })
        .setOrigin(0, 0.5)
      this.detailObjs.push(
        emojiImage(this, dx + 52, cardY + 48, item.emoji, 64),
        name,
        this.add
          .text(name.x + name.width + 10, cardY + 28, RARITIES[item.rarity].label, {
            fontFamily: UI_FONT,
            fontSize: FONT.caption,
            color: RARITIES[item.rarity].color,
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      this.offerDescView.clear()
      const desc = this.add
        .text(0, 0, `${item.desc}${stackNote}`, {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#b9b9c6',
          wordWrap: { width: this.offerDescView.viewport.w - 8 },
          lineSpacing: 4,
          resolution: res,
        })
        .setOrigin(0, 0)
      this.offerDescView.add(desc)
      this.offerDescView.scrollTo(0)
      this.offerDescView.setContentHeight(desc.height)
    } else {
      this.offerDescView.clear()
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

    const canBuy = offer !== null && this.run.coins >= this.price(offer)
    const bb = this.buyRect
    const buyBg = this.add.graphics()
    roundRect(buyBg, bb.x, bb.y, bb.w, bb.h, 27, { fill: canBuy ? 0xffdc5d : 0xffffff, fillAlpha: canBuy ? 1 : 0.1 })
    this.detailObjs.push(
      buyBg,
      this.add
        .text(bb.x + bb.w / 2, bb.y + bb.h / 2, offer ? `购买 ${this.price(offer)}` : '购买', {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          fontStyle: 'bold',
          color: canBuy ? '#25262e' : '#8f8f9a',
          resolution: res,
        })
        .setOrigin(0.5),
    )

    const free = this.run.freeRefreshes > 0
    const canRefresh = free || this.run.coins >= SHOP.refreshPrice
    const rb = this.refreshRect
    const refBg = this.add.graphics()
    roundRect(refBg, rb.x, rb.y, rb.w, rb.h, 27, { fill: 0xffffff, fillAlpha: canRefresh ? 0.14 : 0.07 })
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

  private formatEffects(fx: Partial<CharacterEffects>): string {
    const parts: string[] = []
    if (fx.hpAdd) parts.push(`生命 ${fx.hpAdd > 0 ? '+' : ''}${fx.hpAdd}`)
    if (fx.damageMul && fx.damageMul !== 1) parts.push(`伤害 ×${+fx.damageMul.toFixed(2)}`)
    if (fx.cooldownMul && fx.cooldownMul !== 1) parts.push(`攻速 ×${+(1 / fx.cooldownMul).toFixed(2)}`)
    if (fx.critChance) parts.push(`暴击 +${Math.round(fx.critChance * 100)}%`)
    if (fx.rangeMul && fx.rangeMul !== 1) parts.push(`范围 ×${+fx.rangeMul.toFixed(2)}`)
    return parts.join(' · ')
  }

  private showLevelUp(slot: number, level: number): void {
    playSfx('levelup')
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    const id = this.lineup[slot]!
    const def = CHARACTERS[id]
    const card = upgradeCardsFor(def)[level - 2]
    const statLine = level >= 2 ? this.formatEffects(LEVEL_STATS[id][level - 2]!) : ''
    const pw = Math.min(560, viewport.logicalWidth - 60)
    const ph = 300

    const overlay = this.add.rectangle(cx, cy, 6000, 6000, 0x000000, 0.55).setDepth(400)
    const panel = this.add.graphics()
    roundRect(panel, -pw / 2, -ph / 2, pw, ph, 20, { fill: 0x2a2540, fillAlpha: 0.98, strokeWidth: 3, stroke: 0xffdc5d, strokeAlpha: 0.9 })
    const items: Phaser.GameObjects.GameObject[] = [
      panel,
      this.add
        .text(0, -ph / 2 + 34, '升级！', {
          fontFamily: UI_FONT,
          fontSize: FONT.title,
          fontStyle: 'bold',
          color: '#ffdc5d',
          resolution: res,
        })
        .setOrigin(0.5),
      emojiImage(this, -pw / 2 + 74, -34, def.emoji, 92, 'player'),
      this.add
        .text(-pw / 2 + 132, -52, def.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(-pw / 2 + 132, -18, `Lv ${level - 1} → Lv ${level}`, {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          fontStyle: 'bold',
          color: '#7cc5ff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    ]
    if (card) {
      items.push(
        this.add
          .text(0, 34, `新能力 · ${card.name}`, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ce93d8',
            align: 'center',
            wordWrap: { width: pw - 48 },
            resolution: res,
          })
          .setOrigin(0.5),
        this.add
          .text(0, 66, card.desc, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: '#d0d0d8',
            align: 'center',
            wordWrap: { width: pw - 48 },
            resolution: res,
          })
          .setOrigin(0.5, 0),
      )
    }
    if (statLine) {
      items.push(
        this.add
          .text(0, ph / 2 - 28, statLine, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: '#9ccc9c',
            align: 'center',
            wordWrap: { width: pw - 48 },
            resolution: res,
          })
          .setOrigin(0.5),
      )
    }
    const box = this.add.container(cx, cy, items).setDepth(401)
    box.setScale(0.7)
    this.tweens.add({ targets: box, scale: 1, duration: 280, ease: 'Back.easeOut' })
    const dismiss = (): void => {
      overlay.destroy()
      box.destroy()
    }
    overlay.setInteractive().on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, dismiss)
    this.time.delayedCall(3400, () => {
      if (box.active) dismiss()
    })
  }

  private refresh(): void {
    this.coinsText.setText(`${this.run.coins}`)
    this.grid.setItems(this.buildSlotItems())
    this.grid.setSelected(this.focusedId)
    this.renderDetail(textRes())
  }

  private nextWave(): void {
    playSfx('click')
    this.scene.start(SceneKey.Battle)
  }


  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  devProvider(): DevProvider {
    return {
      id: 'shop',
      title: '商店页',
      sections: [
        {
          id: 'shop',
          title: '商店页',
          items: () => [
            {
              kind: 'buttons',
              buttons: [
                {
                  label: '金币 +1000',
                  run: (): void => {
                    this.run.coins += 1000
                    this.refresh()
                  },
                },
                {
                  label: '免费刷新当前格',
                  run: (): void => {
                    this.run.freeRefreshes += 1
                    this.refreshFocused()
                  },
                },
              ],
            },
          ],
        },
      ],
    }
  }
}

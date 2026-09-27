import Phaser from 'phaser'
import { CHARACTERS, upgradeCardsFor } from '../data/characters'
import { characterLevel } from '../data/charLevel'
import { characterXp, ITEMS, itemPrice, itemXp, RARITIES, rerollPrice } from '../data/items'
import { LEVEL_STATS } from '../data/levels'
import { PICKUPS } from '../data/pickups'
import { modTexts } from '../data/stats'
import { playSfx } from '../audio/sfx'
import { characterPoolFor, levelProgress, rollItem, stackCount } from '../run/draft'
import { memberLevel, memberLook, memberOutStats } from '../run/members'
import { getRun } from '../run/state'
import type { RunState } from '../run/state'
import type { ItemDef, ItemId } from '../types/items'
import type { StatValues } from '../types/stats'
import { beginPage, Button, Dialog, Icon, Label, OfferCard, PageHeader, pageFrame, Pill } from '../ui'
import type { OfferGoods, OfferLine, OfferOwner, OfferState, PageFrame, Rect } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { itemEffects } from './itemLines'
import { openPause } from './pause'
import { runExit } from './teamPage'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'

/** 这一轮摆给一名队员的货；id 为 null 是他能买的都买满了 */
interface Offer {
  readonly id: ItemId | null
  sold: boolean
}

const COIN = `{${PICKUPS.coin.emoji}}`
/** 卡片的间距与尺寸上限：竖卡最宽 colW、竖屏上最高 colH，横卡最高 rowH；竖屏 rowsFrom 人起一人一行 */
const CARDS = { gap: 18, colW: 360, colH: 560, rowH: 260, rowsFrom: 3 } as const
/** 刷新后卡片逐张亮出的间隔 */
const REVEAL_STEP = 60

/** 商店：每名队员一格货，全队一起刷新 */
export class ShopScene extends Phaser.Scene implements DevProviderHost {
  private preserveOnRestart = false
  private run!: RunState
  private offers: Offer[] = []
  /** 这次进店全队还剩几次免费刷新 */
  private freeRerolls = 0
  /** 这次进店已花钱刷新的次数，刷新价随之上涨 */
  private paidRerolls = 0
  /** 最近看过或买过的队员：打开暂停页先看他 */
  private lastSlot: number | undefined
  /** 刚买下、要盖戳的那一格 */
  private freshSlot = -1
  private shownCoins = 0
  private frame!: PageFrame
  private coins!: Pill
  private hint!: Label
  private rerollBtn!: Button
  private cards: OfferCard[] = []

  constructor() {
    super(SceneKey.Shop)
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.run = getRun()
    if (!preserved) {
      this.offers = this.rollAll()
      this.freeRerolls = this.run.roster.reduce((sum, _, slot) => sum + Math.floor(this.slotStats(slot).freeRerolls), 0)
      this.paidRerolls = 0
      this.lastSlot = undefined
    }
    this.freshSlot = -1
    this.cards = []

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    new PageHeader(this, f, {
      title: `{1f6d2} 商店 · 第 ${this.run.wave - 1} 波完成`,
      ...runExit(this, this.run, () => ({ from: SceneKey.Shop, slot: this.lastSlot })),
    })
    this.shownCoins = this.run.coins
    this.coins = new Pill(this, f.centerX, f.subY, { icon: PICKUPS.coin.emoji, outline: 'player', text: `${this.run.coins}`, color: 'accent' })
    this.hint = new Label(this, f.body.x + f.body.w, f.subY, '', { kind: 'caption', color: 'faint' }).setOrigin(1, 0.5)

    const btnW = 300
    const gap = 24
    this.rerollBtn = new Button(this, f.centerX - btnW / 2 - gap / 2, f.footerY, { label: '', variant: 'secondary', width: btnW, keys: ['R'], onTap: () => this.reroll() })
    new Button(this, f.centerX + btnW / 2 + gap / 2, f.footerY, {
      label: `开始第 ${this.run.wave} 波`,
      width: btnW,
      keys: ['ENTER', 'SPACE'],
      onTap: () => this.scene.start(SceneKey.Battle),
    })

    this.render(true)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private levelOf(slot: number): number {
    return memberLevel(this.run, slot)
  }

  private slotStats(slot: number): StatValues {
    return memberOutStats(this.run, slot)
  }

  private ownedFor(slot: number): ItemId[] {
    return (this.run.memberItems[slot] ??= [])
  }

  /** 给这名队员刷一件：道具池看他的打法与等级，稀有度看波次、等级与他的幸运 */
  private roll(slot: number): ItemId | null {
    const level = this.levelOf(slot)
    const pool = characterPoolFor(CHARACTERS[this.run.roster[slot]!], level)
    return rollItem(pool, this.ownedFor(slot), Math.random, this.run.wave, level, this.slotStats(slot).luck)
  }

  private rollAll(): Offer[] {
    return this.run.roster.map((_, slot) => ({ id: this.roll(slot), sold: false }))
  }

  /** 这名队员买它的价格：按他自己的商店价格 */
  private price(slot: number, id: ItemId): number {
    return Math.max(1, Math.round(itemPrice(id, this.run.wave) * this.slotStats(slot).shopPrice))
  }

  /** 这一轮的货都买下了：下一次刷新免费 */
  private cleared(): boolean {
    return this.offers.some((o) => o.id !== null) && this.offers.every((o) => o.id === null || o.sold)
  }

  private nextRerollPrice(): number {
    return rerollPrice(this.run.wave - 1, this.paidRerolls)
  }

  private buy(slot: number): void {
    const offer = this.offers[slot]
    if (!offer?.id || offer.sold) return
    const price = this.price(slot, offer.id)
    if (this.run.coins < price) return
    this.run.coins -= price
    playSfx('buy')
    const before = this.levelOf(slot)
    this.ownedFor(slot).push(offer.id)
    offer.sold = true
    this.lastSlot = slot
    this.freshSlot = slot
    this.render(false)
    const after = this.levelOf(slot)
    if (after > before) this.showLevelUp(slot, after)
  }

  /** 全队一起换下一轮：买空了这一轮就免费，其次用免费次数，再次花钱 */
  private reroll(): void {
    if (!this.cleared()) {
      if (this.freeRerolls > 0) {
        this.freeRerolls -= 1
      } else {
        const price = this.nextRerollPrice()
        if (this.run.coins < price) return
        this.run.coins -= price
        this.paidRerolls += 1
      }
    }
    this.offers = this.rollAll()
    this.render(true)
  }

  /** 点主人一栏：在暂停页看这名队员 */
  private inspect(slot: number): void {
    this.lastSlot = slot
    openPause(this, { from: SceneKey.Shop, slot })
  }

  private render(reveal: boolean): void {
    this.coins.setText(`${this.run.coins}`)
    if (this.run.coins !== this.shownCoins) {
      this.shownCoins = this.run.coins
      this.tweens.killTweensOf(this.coins)
      this.coins.setScale(1.18)
      this.tweens.add({ targets: this.coins, scale: 1, duration: 200, ease: 'Quad.easeOut' })
    }
    this.renderRefresh()
    for (const c of this.cards) c.destroy()
    const rects = this.cardRects()
    this.cards = rects.map((rect, slot) => {
      const card = new OfferCard(this, rect, { owner: this.ownerOf(slot), state: this.stateOf(slot) })
      return reveal ? card.reveal(slot * REVEAL_STEP) : card
    })
    this.freshSlot = -1
  }

  /** 刷新键与它的提示：买空了这一轮就免费，其次用免费次数，再次按价 */
  private renderRefresh(): void {
    const offered = this.offers.filter((o) => o.id !== null)
    const cleared = this.cleared()
    const sold = offered.filter((o) => o.sold).length
    this.hint.setText(cleared ? '已买空 · 这次刷新免费' : `已买 ${sold}/${offered.length} · 买空后免费刷新`).setInk(cleared ? 'good' : 'faint')
    const btn = this.rerollBtn
    if (cleared) {
      btn.setLabel('{1f504} 免费刷新').setVariant('good').setEnabled(true)
    } else if (this.freeRerolls > 0) {
      btn.setLabel(`{1f504} 免费刷新 ×${this.freeRerolls}`).setVariant('good').setEnabled(true)
    } else {
      const price = this.nextRerollPrice()
      btn.setLabel(`{1f504} 刷新 ${COIN} ${price}`).setVariant('secondary').setEnabled(this.run.coins >= price)
    }
  }

  /** 一人一张竖卡并排，竖屏人多时改成一人一行；整组居中 */
  private cardRects(): Rect[] {
    const { body: B, portrait } = this.frame
    const n = this.run.roster.length
    const { gap } = CARDS
    const spread = (along: number, max: number): { size: number; start: number } => {
      const size = Math.min(max, (along - gap * (n - 1)) / n)
      return { size, start: (along - (size * n + gap * (n - 1))) / 2 }
    }
    if (portrait && n >= CARDS.rowsFrom) {
      const { size, start } = spread(B.h, CARDS.rowH)
      return Array.from({ length: n }, (_, i) => ({ x: B.x, y: B.y + start + i * (size + gap), w: B.w, h: size }))
    }
    const { size, start } = spread(B.w, CARDS.colW)
    const h = portrait ? Math.min(CARDS.colH, B.h) : B.h
    return Array.from({ length: n }, (_, i) => ({ x: B.x + start + i * (size + gap), y: B.y + (B.h - h) / 2, w: size, h }))
  }

  /** 主人一栏：等级与经验，经验条预告买下这件后涨到哪 */
  private ownerOf(slot: number): OfferOwner {
    const xp = characterXp(this.ownedFor(slot))
    const level = characterLevel(xp)
    const prog = levelProgress(xp)
    const base = {
      emoji: memberLook(this.run, slot),
      outline: 'player' as const,
      name: CHARACTERS[this.run.roster[slot]!].name,
      level: `Lv ${level}`,
      onTap: () => this.inspect(slot),
    }
    if (prog.maxed) return { ...base, xp: 1, xpTone: 'accent', note: '满级', noteColor: 'accent' }
    const offer = this.offers[slot]
    if (!offer?.id || offer.sold) return { ...base, xp: prog.ratio, xpTone: 'info' }
    const gain = itemXp(ITEMS[offer.id])
    const up = characterLevel(xp + gain) > level
    return {
      ...base,
      xp: prog.ratio,
      xpAfter: up ? 1 : levelProgress(xp + gain).ratio,
      xpTone: 'info',
      note: up ? '升级！' : `+${gain}`,
      noteColor: up ? 'accent' : 'info',
    }
  }

  private stateOf(slot: number): OfferState {
    const offer = this.offers[slot]
    if (!offer?.id) return { kind: 'empty', note: '能买的道具都买满了' }
    const id = offer.id
    const def: ItemDef = ITEMS[id]
    const rarity = RARITIES[def.rarity]
    const goods: OfferGoods = {
      emoji: def.emoji,
      name: def.name,
      tone: def.rarity === 'common' ? null : rarity.tone,
      tag: rarity.label,
      tagTone: rarity.tone,
      lines: itemEffects(def).map((l): OfferLine => ({ text: l.text, color: l.good === null ? undefined : l.good ? 'good' : 'bad' })),
      aside: this.stackNote(def, stackCount(this.ownedFor(slot), id)),
    }
    if (offer.sold) return { kind: 'sold', goods, stamp: '已买下', fresh: slot === this.freshSlot }
    const price = this.price(slot, id)
    return { kind: 'open', goods, price: `购买 ${COIN} ${price}`, canBuy: this.run.coins >= price, onBuy: () => this.buy(slot) }
  }

  /** 唯一的道具与已经有了的道具才注明 */
  private stackNote(def: ItemDef, held: number): string | undefined {
    const max = def.maxStacks
    if (max === 1) return '唯一'
    if (held === 0) return undefined
    return max === undefined ? `已持有 ×${held}` : `已持有 ${held}/${max}`
  }

  private showLevelUp(slot: number, level: number): void {
    playSfx('levelup')
    const id = this.run.roster[slot]!
    const def = CHARACTERS[id]
    const card = upgradeCardsFor(def)[level - 2]
    const statLine = level >= 2 ? modTexts(LEVEL_STATS[id][level - 2]!).join(' · ') : ''
    const w = Math.min(560, this.frame.content.w - 60)
    const h = 320
    const d = new Dialog(this, { width: w, height: h, title: '升级！', titleColor: 'accent', autoCloseMs: 3400 })
    const left = -w / 2
    d.add([
      new Icon(this, left + 80, d.bodyTop + 38, memberLook(this.run, slot), 88, 'player'),
      new Label(this, left + 140, d.bodyTop + 20, def.name, { kind: 'lead' }).setOrigin(0, 0.5),
      new Label(this, left + 140, d.bodyTop + 58, `Lv ${level - 1} → Lv ${level}`, { kind: 'heading', color: 'info' }).setOrigin(0, 0.5),
    ])
    let y = d.bodyTop + 100
    if (card) {
      d.add(new Label(this, 0, y, `新能力 · ${card.name}`, { kind: 'heading', color: 'epic', align: 'center', wrap: w - 48 }).setOrigin(0.5, 0))
      const desc = new Label(this, 0, y + 38, card.desc, { kind: 'body', color: 'soft', align: 'center', wrap: w - 48 }).setOrigin(0.5, 0)
      d.add(desc)
      y = desc.y + desc.height + 10
    }
    if (statLine) d.add(new Label(this, 0, Math.max(y, h / 2 - 44), statLine, { kind: 'body', color: 'good', align: 'center', wrap: w - 48 }).setOrigin(0.5, 0))
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
                    this.render(false)
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

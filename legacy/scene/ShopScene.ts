import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import { ITEMS, itemPrice, RARITIES, rerollPrice, teamOnce, teamStats } from '../data/items'
import { PICKUPS } from '../data/pickups'
import { playSfx } from '../audio/sfx'
import { characterTraits, rollItem, stackCount, useful } from '../run/draft'
import { memberLevel, memberLook, memberOutStats } from '../run/members'
import { getRun, stepOf } from '../run/state'
import { lastFight, nextFight } from '../run/flow'
import type { RunState } from '../run/state'
import type { ItemDef, ItemId } from '../types/items'
import type { StatKey } from '../types/stats'
import { beginPage, Button, Label, OfferCard, PageHeader, pageFrame, Pill } from '../ui'
import type { OfferFaces, OfferGoods, OfferLine, OfferState, PageFrame, Rect } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { itemEffects } from './itemLines'
import { finishStep, runExit } from './teamPage'
import { SceneKey } from './keys'
import type { DevSceneTabs, DevTabsHost } from '../devtools'

/** 货架上的一格；id 为 null 是能买的都买满了 */
interface Offer {
  readonly id: ItemId | null
  sold: boolean
}

const COIN = `{${PICKUPS.coin.emoji}}`
/** 卡片的间距与尺寸上限：竖卡最宽 colW、竖屏上最高 colH，横卡最高 rowH；竖屏 rowsFrom 格起一格一行 */
const CARDS = { gap: 18, colW: 360, colH: 560, rowH: 260, rowsFrom: 3 } as const
/** 刷新后卡片逐张亮出的间隔 */
const REVEAL_STEP = 60

/** 这一轮商店的加成：队伍道具的一份，加上进店这一刻场上站着的人各自的；倒下的不算 */
interface ShopStats {
  readonly luck: number
  readonly shopPrice: number
  readonly freeRerolls: number
}

/** 商店：货架有几格就摆几件，买下的都是队伍道具，一起刷新 */
export class ShopScene extends Phaser.Scene implements DevTabsHost {
  private preserveOnRestart = false
  private run!: RunState
  private offers: Offer[] = []
  private stats: ShopStats = { luck: 0, shopPrice: 1, freeRerolls: 0 }
  /** 这次进店全队还剩几次免费刷新 */
  private freeRerolls = 0
  /** 这次进店已花钱刷新的次数，刷新价随之上涨 */
  private paidRerolls = 0
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
      this.stats = this.shopStats()
      this.offers = this.rollAll()
      this.freeRerolls = Math.floor(this.stats.freeRerolls)
      this.paidRerolls = 0
    }
    this.freshSlot = -1
    this.cards = []

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    new PageHeader(this, f, {
      title: `{1f6d2} 商店${this.doneLabel()}`,
      ...runExit(this, this.run, () => ({ from: SceneKey.Shop })),
    })
    this.shownCoins = this.run.coins
    this.coins = new Pill(this, f.centerX, f.subY, { icon: PICKUPS.coin.emoji, outline: 'player', text: `${this.run.coins}`, color: 'accent' })
    this.hint = new Label(this, f.body.x + f.body.w, f.subY, '', { kind: 'caption', color: 'faint' }).setOrigin(1, 0.5)

    const btnW = 300
    const gap = 24
    this.rerollBtn = new Button(this, f.centerX - btnW / 2 - gap / 2, f.footerY, { label: '', variant: 'secondary', width: btnW, keys: ['R'], onTap: () => this.reroll() })
    new Button(this, f.centerX + btnW / 2 + gap / 2, f.footerY, {
      label: `开始${nextFight(this.run)?.name ?? '战斗'}`,
      width: btnW,
      keys: ['ENTER', 'SPACE'],
      onTap: () => finishStep(this, this.run),
    })

    this.render(true)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  /** 标题里刚打完的那一场 */
  private doneLabel(): string {
    const name = lastFight(this.run)?.name
    return name ? ` · ${name}完成` : ''
  }

  /** 进店这一刻的商店加成：队伍道具的一份，加上场上站着的人各自的 */
  private shopStats(): ShopStats {
    const run = this.run
    const team = teamStats(run.items)
    const up = run.roster.flatMap((_, slot) => (run.memberHp[slot] === 0 ? [] : [memberOutStats(run, slot)]))
    return {
      luck: up.reduce((sum, st) => sum + st.luck, team.luck),
      shopPrice: up.reduce((mul, st) => mul * st.shopPrice, team.shopPrice),
      freeRerolls: up.reduce((sum, st) => sum + st.freeRerolls, team.freeRerolls),
    }
  }

  /** 物价与稀有度按这家商店写的第几档算 */
  private get tier(): number {
    const step = stepOf(this.run)
    if (step?.kind !== 'shop') throw new Error('商店页只在商店这一步打开')
    return step.tier
  }

  /** 摆满货架：一格一件不重样，稀有度看物价档位与幸运 */
  private rollAll(): Offer[] {
    const shown: ItemId[] = []
    return Array.from({ length: this.run.shelf }, () => {
      const id = rollItem(this.run.items, shown, Math.random, this.tier, this.stats.luck)
      if (id) shown.push(id)
      return { id, sold: false }
    })
  }

  private price(id: ItemId): number {
    return Math.max(1, Math.round(itemPrice(id, this.tier) * this.stats.shopPrice))
  }

  /** 这一轮的货都买下了：下一次刷新免费 */
  private cleared(): boolean {
    return this.offers.some((o) => o.id !== null) && this.offers.every((o) => o.id === null || o.sold)
  }

  private nextRerollPrice(): number {
    return rerollPrice(this.tier - 1, this.paidRerolls)
  }

  private buy(slot: number): void {
    const offer = this.offers[slot]
    if (!offer?.id || offer.sold) return
    const price = this.price(offer.id)
    if (this.run.coins < price) return
    this.run.coins -= price
    playSfx('buy')
    this.run.items.push(offer.id)
    offer.sold = true
    this.freshSlot = slot
    this.render(false)
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
      const card = new OfferCard(this, rect, { faces: this.facesOf(slot), state: this.stateOf(slot) })
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

  /** 一格一张竖卡并排，竖屏格多时改成一格一行；整组居中 */
  private cardRects(): Rect[] {
    const { body: B, portrait } = this.frame
    const n = this.offers.length
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

  /** 场上谁吃得到这一格的货：只对某种打法有用的看各人的打法；只写经济与全场类属性的全队算一份 */
  private facesOf(slot: number): OfferFaces {
    const run = this.run
    const id = this.offers[slot]?.id
    const def = id ? ITEMS[id] : undefined
    const on = run.roster.map((c, i) => !def || useful(def, characterTraits(CHARACTERS[c], memberLevel(run, i))))
    const faces = run.roster.map((_, i) => ({ emoji: memberLook(run, i), outline: 'player' as const, on: on[i]! }))
    if (!def) return { faces, note: '场上的队员' }
    const st = def.stats
    const keys = [st?.add, st?.pct, st?.mul].flatMap((r) => Object.keys(r ?? {})) as StatKey[]
    if (keys.length > 0 && !def.when && keys.every(teamOnce)) return { faces, note: '全队算一份' }
    const n = on.filter(Boolean).length
    return { faces, note: n === faces.length ? '全队都吃得到' : n === 0 ? '场上没人吃得到' : `${n} 人吃得到` }
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
      aside: this.stackNote(def, stackCount(this.run.items, id)),
    }
    if (offer.sold) return { kind: 'sold', goods, stamp: '已买下', fresh: slot === this.freshSlot }
    const price = this.price(id)
    return { kind: 'open', goods, price: `购买 ${COIN} ${price}`, canBuy: this.run.coins >= price, onBuy: () => this.buy(slot) }
  }

  /** 全队唯一的道具与队伍已经有了的道具才注明 */
  private stackNote(def: ItemDef, held: number): string | undefined {
    const max = def.maxStacks
    if (max === 1) return '全队唯一'
    if (held === 0) return undefined
    return max === undefined ? `队伍已有 ×${held}` : `队伍已有 ${held}/${max}`
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  devTabs(): DevSceneTabs {
    return {
      title: '商店',
      tabs: [
        {
          id: 'shop',
          title: '商店',
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

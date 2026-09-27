import Phaser from 'phaser'
import { CHARACTERS, upgradeCardsFor } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { SHOP, characterXp, ITEMS, RARITIES, itemPrice } from '../data/items'
import { PICKUPS } from '../data/pickups'
import type { ItemId } from '../types/items'
import type { StatValues } from '../types/stats'
import { LEVEL_STATS } from '../data/levels'
import { memberLevel, memberOutStats } from '../run/members'
import { getRun, waveStartHp } from '../run/state'
import type { RunState } from '../run/state'
import { characterStatGroups } from './statLines'
import { itemLines } from './itemLines'
import { modTexts } from '../data/stats'
import { playSfx } from '../audio/sfx'
import {
  beginPage,
  Button,
  Chip,
  Dialog,
  EmojiGrid,
  Flow,
  Icon,
  Label,
  PageHeader,
  pageFrame,
  Panel,
  Pill,
  ProgressBar,
  ScrollView,
} from '../ui'
import type { GridItem, PageFrame } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { characterPoolFor, levelProgress, rollItem, stackCount } from '../run/draft'
import { flowStatGroups, runExit } from './teamPage'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'

/** 详情面板顶部的角色头与底部的报价卡各占的高度 */
const HEAD_H = 112
const CARD_H = 104

export class ShopScene extends Phaser.Scene implements DevProviderHost {
  private preserveOnRestart = false
  private run!: RunState
  private lineup: CharacterId[] = []
  private focusedId: CharacterId = 'juggler'
  private offers: (ItemId | null)[] = []
  /** 这次进店每人还剩几次免费刷新 */
  private freeRerolls: number[] = []
  private frame!: PageFrame
  private grid!: EmojiGrid<CharacterId>
  private coins!: Pill
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private stats!: ScrollView
  private offerDesc!: ScrollView
  private slotScroll = 0
  private statsScroll = 0

  constructor() {
    super(SceneKey.Shop)
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.run = getRun()
    this.lineup = [...this.run.roster]
    if (!preserved) {
      this.offers = this.lineup.map((_, slot) => this.roll(slot))
      this.freeRerolls = this.lineup.map((_, slot) => Math.floor(this.slotStats(slot).freeRerolls))
      this.focusedId = this.lineup[0] ?? this.focusedId
    }
    this.detailObjs = []

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    new PageHeader(this, f, { title: `第 ${this.run.wave - 1} 波完成`, ...runExit(this, this.run, () => ({ from: SceneKey.Shop, slot: this.focusedIndex() })) })
    this.coins = new Pill(this, f.centerX, f.subY, { icon: PICKUPS.coin.emoji, outline: 'player', text: '', color: 'accent' })

    const D = f.detail
    new Panel(this, D.x, D.y, D.w, D.h)
    this.stats = new ScrollView(this, { x: D.x, y: D.y + HEAD_H, w: D.w, h: D.h - HEAD_H - CARD_H - 12 }, {
      onScroll: (pos) => (this.statsScroll = pos),
    })
    // 报价卡每次重画，说明文字要压在卡片上面
    this.offerDesc = new ScrollView(this, { x: D.x + 96, y: D.y + D.h - CARD_H + 44, w: D.w - 96 - 330, h: 48 }).setDepth(1)

    this.grid = new EmojiGrid(this, f.list, { initialScroll: this.slotScroll, onScroll: (pos) => (this.slotScroll = pos) })
    this.grid.onTap = (key): void => {
      if (this.focusedId !== key) this.statsScroll = 0
      this.focusedId = key
      this.refresh()
    }

    new Button(this, f.centerX, f.footerY, {
      label: `开始第 ${this.run.wave} 波`,
      keys: ['ENTER', 'SPACE'],
      onTap: () => this.scene.start(SceneKey.Battle),
    })

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private levelOf(slot: number): number {
    return memberLevel(this.run, slot)
  }

  private poolFor(slot: number): ItemId[] {
    return characterPoolFor(CHARACTERS[this.lineup[slot]!], this.levelOf(slot))
  }

  private ownedFor(slot: number): ItemId[] {
    return (this.run.memberItems[slot] ??= [])
  }

  private focusedIndex(): number {
    return this.lineup.indexOf(this.focusedId)
  }

  /** 给这名队员刷一件：按等级与幸运定稀有度 */
  private roll(slot: number): ItemId | null {
    return rollItem(this.poolFor(slot), this.ownedFor(slot), Math.random, this.run.wave, this.levelOf(slot), this.slotStats(slot).luck)
  }

  /** 这名队员买它的价格：商店价格按队员自己的属性 */
  private price(slot: number, offer: ItemId): number {
    return Math.max(1, Math.round(itemPrice(offer, this.run.wave) * this.slotStats(slot).shopPrice))
  }

  private buyFocused(): void {
    const idx = this.focusedIndex()
    if (idx < 0) return
    const offer = this.offers[idx]
    if (!offer) return
    const price = this.price(idx, offer)
    if (this.run.coins < price) return
    this.run.coins -= price
    playSfx('buy')
    const beforeLevel = this.levelOf(idx)
    this.ownedFor(idx).push(offer)
    const afterLevel = this.levelOf(idx)
    this.offers[idx] = this.roll(idx)
    this.refresh()
    if (afterLevel > beforeLevel) this.showLevelUp(idx, afterLevel)
  }

  /** 刷新：先用这次进店的免费次数，用完再花钱 */
  private refreshFocused(): void {
    const idx = this.focusedIndex()
    if (idx < 0) return
    const free = (this.freeRerolls[idx] ?? 0) > 0
    if (!free && this.run.coins < SHOP.refreshPrice) return
    if (free) this.freeRerolls[idx]! -= 1
    else this.run.coins -= SHOP.refreshPrice
    playSfx('click')
    this.offers[idx] = this.roll(idx)
    this.refresh()
  }

  private slotStats(slot: number): StatValues {
    return memberOutStats(this.run, slot)
  }

  private slotMaxHp(slot: number): number {
    return this.slotStats(slot).maxHp
  }

  private buildSlotItems(): GridItem<CharacterId>[] {
    return this.lineup.map((id, slot) => {
      const max = this.slotMaxHp(slot)
      const hp = waveStartHp(this.run.memberHp[slot] ?? max, max)
      const offer = this.offers[slot]
      return {
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player' as const,
        badge: offer ? ITEMS[offer].emoji : undefined,
        hp: hp / max,
      }
    })
  }

  private keep<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.detailObjs.push(obj)
    return obj
  }

  private renderDetail(): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    const D = this.frame.detail
    const idx = this.focusedIndex()
    const owned = this.ownedFor(idx)
    const def = CHARACTERS[this.focusedId]
    const level = this.levelOf(idx)
    const prog = levelProgress(characterXp(this.run.memberItems[idx] ?? []))
    const max = this.slotMaxHp(idx)
    const hp = waveStartHp(this.run.memberHp[idx] ?? max, max)

    const barX = D.x + 112
    this.keep(new Icon(this, D.x + 60, D.y + 54, def.emoji, 85, 'player'))
    this.keep(new Label(this, barX, D.y + 36, def.name, { kind: 'lead' }).setOrigin(0, 0.5))
    this.keep(
      new Label(this, D.x + D.w - 24, D.y + 36, prog.maxed ? `Lv ${level} · 满级` : `Lv ${level} · 经验 ${prog.cur}/${prog.need}`, {
        kind: 'label',
        bold: true,
        color: 'accent',
      }).setOrigin(1, 0.5),
    )
    this.keep(
      new Label(this, barX, D.y + 66, `生命 ${hp}/${max}（下一波开局）`, { kind: 'label', color: hp / max > 0.5 ? 'good' : 'warn' }).setOrigin(0, 0.5),
    )
    this.keep(new ProgressBar(this, barX, D.y + 84, D.x + D.w - 24 - barX, 14, { tone: prog.maxed ? 'accent' : 'info', value: prog.ratio }))

    const view = this.stats.clear()
    const flow = new Flow(this, view, { x: 24, y: 4, width: D.w - 48 })
    if (owned.length > 0) {
      let x = 24
      let y = flow.y + 20
      for (const id of [...new Set(owned)]) {
        const count = new Label(this, 0, y, `×${stackCount(owned, id)}`, { kind: 'caption', color: 'soft' }).setOrigin(0, 0.5)
        const cellW = 40 + count.width
        if (x > 24 && x + cellW > D.w - 24) {
          x = 24
          y += 40
        }
        count.setPosition(x + 18, y + 2)
        view.add([new Icon(this, x, y, ITEMS[id].emoji, 34), count])
        x += cellW
      }
      flow.y = y + 30
    }
    flowStatGroups(flow, characterStatGroups(this.focusedId, owned, level, { growth: this.run.memberGrowth[idx] }))
    flow.finish(0)
    this.stats.scrollTo(this.statsScroll)
    this.renderOfferCard()
  }

  private renderOfferCard(): void {
    const D = this.frame.detail
    const cardX = D.x + 14
    const cardY = D.y + D.h - CARD_H - 4
    const cardW = D.w - 28
    const idx = this.focusedIndex()
    const offer = this.offers[idx] ?? null
    const item = offer ? ITEMS[offer] : null
    const rarity = item ? RARITIES[item.rarity] : null
    this.keep(new Panel(this, cardX, cardY, cardW, CARD_H - 8, { tone: item && item.rarity !== 'common' ? rarity!.tone : null }))
    this.offerDesc.clear()
    if (item && rarity) {
      const held = stackCount(this.ownedFor(idx), offer!)
      const stackNote = item.maxStacks === undefined ? (held > 0 ? ` · 已持有 ×${held}` : '') : ` · 已持有 ${held}/${item.maxStacks}`
      this.keep(new Icon(this, cardX + 44, cardY + 46, item.emoji, 62))
      const name = this.keep(
        new Label(this, cardX + 82, cardY + 26, item.name, { kind: 'heading', color: item.rarity === 'common' ? 'ink' : rarity.tone }).setOrigin(0, 0.5),
      )
      this.keep(new Chip(this, name.x + name.width + 10, cardY + 26, rarity.label, { tone: rarity.tone, originX: 0 }))
      const desc = new Label(this, 0, 0, `${itemLines(item).join(' · ')}${stackNote}`, { kind: 'caption', color: 'soft', wrap: this.offerDesc.viewport.w - 8, spacing: 4 })
      this.offerDesc.add(desc).setContentSize(desc.height)
    } else {
      this.keep(new Label(this, cardX + 30, cardY + 46, '道具池已购罄，可刷新其他位', { kind: 'body', color: 'muted' }).setOrigin(0, 0.5))
    }
    const canBuy = offer !== null && this.run.coins >= this.price(idx, offer)
    const btnY = cardY + (CARD_H - 8) / 2 - 2
    this.keep(
      new Button(this, cardX + cardW - 16 - 75, btnY, {
        label: offer ? `购买 ${this.price(idx, offer)}` : '购买',
        size: 'sm',
        width: 150,
        enabled: canBuy,
        sfx: null,
        onTap: () => this.buyFocused(),
      }),
    )
    const free = this.freeRerolls[idx] ?? 0
    this.keep(
      new Button(this, cardX + cardW - 16 - 150 - 12 - 70, btnY, {
        label: free > 0 ? `免费刷新 ${free}` : `刷新 ${SHOP.refreshPrice}`,
        size: 'sm',
        variant: 'secondary',
        width: 140,
        enabled: free > 0 || this.run.coins >= SHOP.refreshPrice,
        sfx: null,
        onTap: () => this.refreshFocused(),
      }),
    )
  }

  private showLevelUp(slot: number, level: number): void {
    playSfx('levelup')
    const id = this.lineup[slot]!
    const def = CHARACTERS[id]
    const card = upgradeCardsFor(def)[level - 2]
    const statLine = level >= 2 ? modTexts(LEVEL_STATS[id][level - 2]!).join(' · ') : ''
    const w = Math.min(560, this.frame.content.w - 60)
    const h = 320
    const d = new Dialog(this, { width: w, height: h, title: '升级！', titleColor: 'accent', autoCloseMs: 3400 })
    const left = -w / 2
    d.add([
      new Icon(this, left + 80, d.bodyTop + 38, def.emoji, 88, 'player'),
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

  private refresh(): void {
    this.coins.setText(`${this.run.coins}`)
    this.grid.setItems(this.buildSlotItems())
    this.grid.setSelected(this.focusedId)
    this.renderDetail()
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
              ],
            },
          ],
        },
      ],
    }
  }
}

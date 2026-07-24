import Phaser from 'phaser'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import type { CaptainId } from '../captains/registry'
import type { CharacterId } from '../characters/registry'
import { SHOP } from '../items/registry'
import { PICKUPS } from '../pickups/registry'
import {
  aggregateCharacterEffects,
  characterPoolFor,
  characterXp,
  ITEMS,
  RARITIES,
  rollItem,
  itemPrice,
  stackCount,
} from '../items/registry'
import type { ItemId, ItemDef, CharacterEffects } from '../items/registry'
import { characterLevel, levelProgress } from '../run/charLevel'
import { levelStatsFor, LEVEL_STATS } from '../characters/levels'
import { upgradeCardsFor } from '../characters/registry'
import { aggregateTeamCards } from '../cards/registry'
import type { TeamEffects } from '../items/registry'
import { battleSceneFor } from '../ecs/route'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { endRun, getRun, hasCenter, waveStartHp } from '../run/state'
import type { RunState } from '../run/state'
import { characterStatGroups } from './stats'
import { memberMaxHp } from '../characters/stats'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage } from '../emoji/textures'
import { EmojiGrid } from './grid'
import { ScrollView } from './scroll'
import { FONT, UI_FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'

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

// 上架位：每个出战角色一个，按阵容槽位排列（团队增益已迁到升级卡，商店只卖角色装备）。
// 招募/升级已拆分到整编页（PromoteScene），商店只管道具购物
export class ShopScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/焦点/上架结果等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private captainId: CaptainId = 'angel'
  private lineup: CharacterId[] = []
  private focusedId: CharacterId = 'juggler'
  private offers: (ItemId | null)[] = []
  /** 团队升级卡效果（本局）：商店折扣 / 额外免费刷新 从这里取 */
  private teamFx!: TeamEffects
  private layout!: ShopLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  /** 上架道具卡的介绍文字区（变长）——固定卡高装不下就在卡内滚动，不再压到购买/刷新键 */
  private offerDescView!: ScrollView
  private coinsText!: Phaser.GameObjects.Text
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private buyRect = { x: 0, y: 0, w: 0, h: 0 }
  private refreshRect = { x: 0, y: 0, w: 0, h: 0 }
  private formationRect: { x: number; y: number; w: number; h: number } | null = null
  /** 沉睡（阵型页打开）期间视口变过，唤醒时需要重排 */
  private wakeDirty = false
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
    this.teamFx = aggregateTeamCards(this.run.teamCards)
    if (!preserved) {
      // 进店结算：天使复活满血；免费刷新次数按队长重置（+团队调货卡）；全部上架位重新随机
      if (CAPTAINS[this.captainId].reviveInShop) {
        this.run.memberHp = this.run.memberHp.map((_, slot) => this.slotMaxHp(slot))
      }
      this.run.freeRefreshes = CAPTAINS[this.captainId].freeRefreshes + this.teamFx.freeRerolls
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

    // 阵型入口：达 5 人后常驻——商店睡眠等待，从阵型页返回时货架原样保留
    this.formationRect = null
    if (hasCenter(this.run)) {
      const fm = this.add
        .text(this.origin.x + L.content.w - 40, oy + L.titleY, '⛨ 队形', {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#ffdc5d',
          resolution: res,
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true })
      fm.on('pointerup', () => {
        if (this.dragMoved || this.grid.wasDragged) return
        this.openFormation()
      })
      this.formationRect = { x: fm.x - fm.width, y: fm.y - fm.height / 2, w: fm.width, h: fm.height }
    }
    this.events.on(Phaser.Scenes.Events.WAKE, this.onWake, this)

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

    // 卡内介绍滚动区（图标右侧、刷新键左侧的一条带）——只创建一次，renderOfferCard 复用
    this.offerDescView = new ScrollView(
      this,
      { x: dx + 88, y: cardY + 42, w: this.refreshRect.x - (dx + 88) - 12, h: 52 },
      { scrollbar: true },
    )

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
    btnBg.fillStyle(0xffdc5d, 1)
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
      .text(w / 2, h - safeInsets.bottom - 10, 'emoji graphics © Twemoji · CC-BY 4.0 · 有改动', {
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

  /** 该槽位角色当前等级：由已装备道具的 upgradeXp 之和推导（来源无关） */
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

  /** 当前聚焦角色的阵容槽位（-1 = 无效） */
  private focusedIndex(): number {
    return this.lineup.indexOf(this.focusedId)
  }

  /** 折后价：基础波次价 × 团队砍价卡倍率（四舍五入，至少 1） */
  private price(offer: ItemId): number {
    return Math.max(1, Math.round(itemPrice(offer, this.run.wave) * this.teamFx.shopDiscountMul))
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
    // 装备道具即累加该角色专属经验（等级由 memberItems 纯函数推导）；跨阈值即自动质变升级
    const afterLevel = this.levelOf(idx)
    // 购买后自动补货：用新等级的池 + 概率
    this.offers[idx] = rollItem(this.poolFor(idx), owned, Math.random, this.run.wave, afterLevel)
    this.refresh()
    // 升级弹窗在刷新之后（盖在最上层）；跨多级则以最终等级为准
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

  // ── 上架位网格（每个出战角色一个；形象即含义，角标 = 当前上架道具） ──

  /** 网格条目：id 即 key；角标显示该位当前上架道具，带血条 */
  private buildSlotItems(): { key: string; emoji: string; outline: 'player'; badge?: string; hpRatio?: number }[] {
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
      this.focusedId = key as CharacterId
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

    // 角色专属经验进度条：进店即见、每次购买当场推进（满档在购买瞬间弹升级窗）
    const barX = dx + 104
    const barW = dx + D.w - 24 - barX
    const barY = dy + 92
    const xpBar = this.add.graphics()
    xpBar.fillStyle(0x000000, 0.4)
    xpBar.fillRoundedRect(barX, barY, barW, 9, 4)
    xpBar.fillStyle(prog.maxed ? 0xffdc5d : 0x7cc5ff, 1)
    xpBar.fillRoundedRect(barX + 1, barY + 1, Math.max(2, (barW - 2) * prog.ratio), 7, 3)

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

    // 属性区（可滚动）：已购道具行 + 属性组
    const statObjs: Phaser.GameObjects.GameObject[] = []
    let cursor = this.statsTop + 16
    if (owned.length > 0) {
      // 已购道具行：按面板宽自动换行，道具再多也不会横向溢出（纵向靠属性区滚动）
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

    // 卡片边框随稀有度着色：普通保持原金色弱描边，稀有/史诗用档位色加亮
    const rarity = offer ? ITEMS[offer].rarity : 'common'
    const rarityColor = Number.parseInt(RARITIES[rarity].color.slice(1), 16)
    const card = this.add.graphics()
    card.fillStyle(0xffffff, 0.07)
    card.fillRoundedRect(dx + 14, cardY, D.w - 28, 96, 12)
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
      // 介绍文字装进卡内滚动区：再长也不会撑破卡片、压住购买/刷新键
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

    // 购买按钮（价格已含团队砍价折扣）
    const canBuy = offer !== null && this.run.coins >= this.price(offer)
    const bb = this.buyRect
    const buyBg = this.add.graphics()
    buyBg.fillStyle(canBuy ? 0xffdc5d : 0xffffff, canBuy ? 1 : 0.1)
    buyBg.fillRoundedRect(bb.x, bb.y, bb.w, bb.h, 27)
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

  /** 效果片段 → 人读串（升级弹窗展示基础属性质变，只列有变化的轴） */
  private formatEffects(fx: Partial<CharacterEffects>): string {
    const parts: string[] = []
    if (fx.hpAdd) parts.push(`生命 ${fx.hpAdd > 0 ? '+' : ''}${fx.hpAdd}`)
    if (fx.damageMul && fx.damageMul !== 1) parts.push(`伤害 ×${+fx.damageMul.toFixed(2)}`)
    if (fx.cooldownMul && fx.cooldownMul !== 1) parts.push(`攻速 ×${+(1 / fx.cooldownMul).toFixed(2)}`)
    if (fx.critChance) parts.push(`暴击 +${Math.round(fx.critChance * 100)}%`)
    if (fx.rangeMul && fx.rangeMul !== 1) parts.push(`范围 ×${+fx.rangeMul.toFixed(2)}`)
    return parts.join(' · ')
  }

  /** 质变升级弹窗：购买跨阈值当场弹出——新等级 + 新能力 + 基础属性质变。
   * 点任意处或 ~3.4 秒后淡出；盖在最上层，期间挡住购买误触 */
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
    panel.fillStyle(0x2a2540, 0.98)
    panel.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 20)
    panel.lineStyle(3, 0xffdc5d, 0.9)
    panel.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 20)
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
    overlay.setInteractive().on('pointerup', dismiss)
    this.time.delayedCall(3400, () => {
      if (box.active) dismiss()
    })
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
    this.scene.start(battleSceneFor(this.run.mapId))
  }

  /** 打开阵型页（本场景睡眠，返回时唤醒，货架/金币/免费刷新原样保留）。
   * 必须先入睡再启动阵型页：promote 的 init 以「商店确实在沉睡」验证 fromShop */
  private openFormation(): void {
    playSfx('click')
    this.scene.sleep()
    this.scene.run('promote', { fromShop: true })
  }

  /** 从阵型页返回：沉睡期间视口变过则重排（保留货架），否则仅恢复调试上报 */
  private onWake(): void {
    if (this.wakeDirty) {
      this.wakeDirty = false
      this.preserveOnRestart = true
      this.scene.restart()
      return
    }
    this.reportShop()
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
        focusedLevel: idx >= 0 ? this.levelOf(idx) : 1,
        focusedXp: idx >= 0 ? characterXp(this.run.memberItems[idx] ?? []) : 0,
        slots: this.grid.cellRects().map((r) => {
          const id = r.key as CharacterId
          const index = this.lineup.indexOf(id)
          return {
            id,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            offer: this.offers[index] ?? null,
            price: this.offers[index] ? this.price(this.offers[index]!) : null,
            owned: this.ownedFor(index).length,
            level: this.levelOf(index),
          }
        }),
        buy: {
          x: this.buyRect.x + this.buyRect.w / 2,
          y: this.buyRect.y + this.buyRect.h / 2,
          w: this.buyRect.w,
          h: this.buyRect.h,
          enabled: offer !== null && this.run.coins >= this.price(offer),
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
        formation: this.formationRect
          ? {
              x: this.formationRect.x + this.formationRect.w / 2,
              y: this.formationRect.y + this.formationRect.h / 2,
              w: this.formationRect.w,
              h: this.formationRect.h,
            }
          : null,
      },
    })
  }

  private onViewportChanged(): void {
    // 阵型页打开期间（本场景沉睡）不能 restart，否则会顶掉上层页面；唤醒时补排
    if (this.scene.isSleeping()) {
      this.wakeDirty = true
      return
    }
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

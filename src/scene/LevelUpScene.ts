import Phaser from 'phaser'
import { CHARACTERS, upgradeCardsFor } from '../data/characters'
import { LEVEL_STATS } from '../data/levels'
import { PICKUPS } from '../data/pickups'
import { modTexts } from '../data/stats'
import { DUTY_TAGS, TAGS } from '../data/tags'
import { playSfx } from '../audio/sfx'
import { canJoin, fieldFull, onlySwap, slotChoices } from '../run/levelUp'
import type { Claim, SlotChoice } from '../run/levelUp'
import { memberLevel, memberLook } from '../run/members'
import { getRun, recruitCandidates } from '../run/state'
import type { RunState } from '../run/state'
import { Button, ChoiceCard, Label, MOTION, Panel, RichLabel, Scrim } from '../ui'
import type { ChoiceCardOptions, Rect } from '../ui'
import { applyCamera, safeInsets, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'
import type { LevelUpData, LevelUpResult, LevelUpWake } from './levelUp'

/** 升级弹窗盖住时停住的场景，HUD 另外藏起来 */
const HOSTS = [SceneKey.Battle, SceneKey.Ui] as const
/** 数字键依次选中第几项 */
const KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'] as const
/** 横屏最多三列、竖屏两列；弹窗贴着屏幕底边，head 与 foot 是标题与确定键占的高 */
const LAYOUT = {
  landscape: { cols: 3, cardH: 200, maxW: 1180, side: 40 },
  portrait: { cols: 2, cardH: 224, maxW: 720, side: 16 },
  gap: 16,
  pad: 24,
  head: 92,
  foot: 92,
  bottom: 16,
  soloW: 520,
  /** 确定键与旁边的第二个键（恢复或跳过） */
  confirmW: 360,
  altW: 200,
} as const
/** 卡片与按键出现后这段时间内不响应：走过去捡道具时还按着的手指别落到这里 */
const ARM_MS = 350

/** 选中的一项：给场上一格升级或恢复，或者去全角色页挑人上场 */
type Choice = { readonly kind: 'upgrade' | 'restore'; readonly slot: number } | { readonly kind: 'join' }

/** 卡片：场上每人一张，再加一张招募或替换 */
type CardOf = { readonly kind: 'member'; readonly slot: number } | { readonly kind: 'join' }

/** 升级弹窗：盖在停住的战斗上，从屏幕底边升起；给场上一人升级或恢复，或让角色池里的一人上场（招募、替换），选中后确定，上场先去全角色页 */
export class LevelUpScene extends Phaser.Scene {
  private opened: LevelUpData = { queued: 1, field: [] }
  private preserveOnRestart = false
  /** 睡着时视口变了，醒来重排 */
  private relayout = false
  private leaving = false
  private run!: RunState
  private choices: SlotChoice[] = []
  private layout: CardOf[] = []
  private picked: Choice | null = null
  private cards: ChoiceCard[] = []
  private confirm!: Button
  /** 确定键旁边的第二个键：选中的队员还能恢复时是恢复，只剩替换可选时是跳过 */
  private alt!: Button
  private panelW = 0
  private innerW = 0

  constructor() {
    super(SceneKey.LevelUp)
  }

  init(data: LevelUpData): void {
    this.opened = data
  }

  create(): void {
    applyCamera(this)
    for (const k of HOSTS) if (this.scene.isActive(k)) this.scene.pause(k)
    this.scene.setVisible(false, SceneKey.Ui)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.relayout = false
    this.leaving = false
    this.run = getRun()
    this.choices = slotChoices(this.run, this.opened.field)
    this.layout = [...this.run.roster.map((_, slot): CardOf => ({ kind: 'member', slot })), ...(canJoin(this.run) ? [{ kind: 'join' } as const] : [])]
    if (!preserved) this.picked = null
    new Scrim(this, { depth: -1, alpha: 0.45, block: false })
    this.build()
    this.refresh()
    this.events.on(Phaser.Scenes.Events.WAKE, this.onWake, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.WAKE, this.onWake, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      if (this.leaving) this.scene.setVisible(true, SceneKey.Ui)
    })
  }

  /** 弹窗：标题一行，各张卡片按列排开、末行居中，确定键压底，旁边按需要多一个恢复或跳过 */
  private build(): void {
    const W = viewport.logicalWidth
    const H = viewport.logicalHeight
    const L = H > W ? LAYOUT.portrait : LAYOUT.landscape
    const { gap, pad } = LAYOUT
    const n = this.layout.length
    const cols = Math.min(L.cols, n)
    const rows = Math.ceil(n / cols)
    const panelW = Math.min(L.maxW, W - safeInsets.left - safeInsets.right - L.side * 2)
    const innerW = panelW - pad * 2
    const cardW = n === 1 ? Math.min(innerW, LAYOUT.soloW) : (innerW - gap * (cols - 1)) / cols
    const panelH = LAYOUT.head + rows * L.cardH + (rows - 1) * gap + LAYOUT.foot
    const x = (W + safeInsets.left - safeInsets.right - panelW) / 2
    const y = H - safeInsets.bottom - LAYOUT.bottom - panelH
    const panel = new Panel(this, x, y, panelW, panelH, { variant: 'dialog' })
    const more = this.opened.queued - 1
    const sub = [`全队 Lv ${this.run.xp.level}`, '选一项，立刻生效', ...(more > 0 ? [`还有 ${more} 次待选`] : [])].join(' · ')
    panel.add([
      new RichLabel(this, panelW / 2, 38, `{${PICKUPS.levelUp.emoji}} 升级！`, { kind: 'title', shadow: true, originX: 0.5, maxWidth: innerW }),
      new Label(this, panelW / 2, 76, sub, { kind: 'label', color: 'muted' }).setOrigin(0.5).fit(innerW),
    ])
    this.cards = this.layout.map((c, i) => {
      const row = Math.floor(i / cols)
      const inRow = Math.min(cols, n - row * cols)
      const rowW = inRow * cardW + (inRow - 1) * gap
      const rect: Rect = { x: pad + (innerW - rowW) / 2 + (i % cols) * (cardW + gap), y: LAYOUT.head + row * (L.cardH + gap), w: cardW, h: L.cardH }
      const key = KEYS[i]
      const card = new ChoiceCard(this, rect, { ...this.cardOf(c), keys: key ? [key] : [], armMs: ARM_MS, onTap: () => this.tap(c) })
      panel.add(card)
      if (c.kind === 'member' && !this.usable(c)) card.setAlpha(0.45)
      return card
    })
    this.panelW = panelW
    this.innerW = innerW
    const footY = panelH - LAYOUT.foot / 2
    const confirmW = Math.min(LAYOUT.confirmW, innerW - LAYOUT.altW - gap)
    this.confirm = new Button(this, panelW / 2, footY, { label: '', size: 'md', width: confirmW, keys: ['ENTER', 'SPACE'], armMs: ARM_MS, onTap: () => this.decide() })
    this.alt = new Button(this, panelW / 2, footY, { label: '', size: 'md', width: LAYOUT.altW, variant: 'good', armMs: ARM_MS, onTap: () => this.decideAlt() })
    panel.add([this.confirm, this.alt])
    panel.setAlpha(0).setY(y + 60)
    this.tweens.add({ targets: panel, y, alpha: 1, duration: MOTION.pop, ease: 'Cubic.easeOut' })
  }

  /** 这张卡有没有能做的 */
  private usable(c: CardOf): boolean {
    if (c.kind === 'join') return true
    const ch = this.choices[c.slot]
    return !!ch && (ch.upgrade || ch.restore)
  }

  /** 一张卡：上场写去全角色页挑人；队员能升级写新能力与升到这一级的等级加成，倒下了或到了上限写只能恢复；受了伤的生命写在恢复键上 */
  private cardOf(c: CardOf): Pick<ChoiceCardOptions, 'icon' | 'outline' | 'title' | 'aside' | 'lines' | 'tone'> {
    const run = this.run
    if (c.kind === 'join') {
      const n = run.roster.length
      const pool = recruitCandidates(run).length
      if (fieldFull(run)) {
        return {
          icon: '1f504',
          title: '替换队员',
          aside: `${pool} 人可换`,
          tone: 'info',
          lines: [{ text: '去全角色页挑一人，再选换下谁' }, { text: '换上来的满生命上场，等级按这一局记住的', color: 'info' }],
        }
      }
      const lack = DUTY_TAGS.filter((t) => !run.roster.some((id) => CHARACTERS[id].tags.includes(t)))
      return {
        icon: '2795',
        title: '招募新队员',
        aside: `${n} → ${n + 1} 人`,
        tone: 'good',
        lines: [
          { text: '去全角色页挑一人，满生命加入战斗' },
          ...(lack.length > 0 ? [{ text: `队伍还缺${lack.map((t) => TAGS[t].name).join('、')}`, color: 'info' as const }] : []),
        ],
      }
    }
    const slot = c.slot
    const id = run.roster[slot]!
    const def = CHARACTERS[id]
    const lv = memberLevel(run, slot)
    const ch = this.choices[slot]
    const f = this.opened.field[slot]
    const base = { icon: memberLook(run, slot), outline: 'player' as const, title: def.name }
    if (!f?.alive) return { ...base, aside: `Lv ${lv} · 倒下`, tone: 'bad', lines: [{ text: '复活后生命回满，等级不变', color: 'bad' }] }
    const hp = { text: `生命 ${Math.round(f.hp * 100)}%`, color: f.hp >= 1 ? ('good' as const) : ('warn' as const) }
    if (!ch?.upgrade) return { ...base, aside: `Lv ${lv} · 满级`, tone: 'good', lines: [hp, ...(ch?.restore ? [{ text: '只能恢复：生命回满' }] : [])] }
    const card = upgradeCardsFor(def)[lv - 1]
    const stats = LEVEL_STATS[id][lv - 1]
    return {
      ...base,
      aside: `Lv ${lv} → ${lv + 1}`,
      tone: 'accent',
      lines: [
        ...(card ? [{ text: `新能力「${card.name}」`, color: 'epic' as const }, { text: card.desc }] : []),
        ...(stats ? [{ text: modTexts(stats).join('、'), color: 'good' as const }] : []),
      ],
    }
  }

  /** 点卡片：队员能升级就选升级，不能就选恢复；上场的卡就是上场 */
  private tap(c: CardOf): void {
    if (c.kind === 'join') return this.choose({ kind: 'join' })
    const ch = this.choices[c.slot]
    if (ch?.upgrade) this.choose({ kind: 'upgrade', slot: c.slot })
    else if (ch?.restore) this.choose({ kind: 'restore', slot: c.slot })
  }

  /** 选中一项，再选一次同一项就是确定 */
  private choose(p: Choice): void {
    const same = this.picked && this.picked.kind === p.kind && (p.kind === 'join' || (this.picked.kind !== 'join' && this.picked.slot === p.slot))
    if (same) {
      this.decide()
      return
    }
    this.picked = p
    this.refresh()
  }

  private refresh(): void {
    const p = this.picked
    this.cards.forEach((card, i) => {
      const c = this.layout[i]!
      card.setSelected(!!p && (c.kind === 'join' ? p.kind === 'join' : p.kind !== 'join' && p.slot === c.slot))
    })
    this.confirm.setLabel(this.label(p)).setEnabled(p !== null)
    const alt = this.altLabel()
    this.alt.setVisible(alt !== null)
    if (alt !== null) this.alt.setLabel(alt)
    const { gap } = LAYOUT
    const confirmW = Math.min(LAYOUT.confirmW, this.innerW - LAYOUT.altW - gap)
    const rowW = confirmW + (alt !== null ? gap + LAYOUT.altW : 0)
    this.confirm.setX((this.panelW - rowW) / 2 + confirmW / 2)
    this.alt.setX((this.panelW + rowW) / 2 - LAYOUT.altW / 2)
  }

  /** 选中的队员升级之外还能恢复：第二个键是恢复，写上他还剩几成生命；只剩替换可选时是跳过；都不是就不出这个键 */
  private altLabel(): string | null {
    const p = this.picked
    if (p?.kind === 'upgrade' && this.choices[p.slot]?.restore) return `恢复 · 生命 ${Math.round((this.opened.field[p.slot]?.hp ?? 0) * 100)}%`
    return onlySwap(this.run, this.opened.field) ? '跳过' : null
  }

  /** 第二个键：恢复选中的队员，或跳过这一次 */
  private decideAlt(): void {
    const p = this.picked
    if (this.leaving) return
    if (p?.kind === 'upgrade' && this.choices[p.slot]?.restore) {
      playSfx('revive')
      this.close({ kind: 'restore', slot: p.slot })
      return
    }
    if (onlySwap(this.run, this.opened.field)) this.close({ kind: 'skip' })
  }

  private label(p: Choice | null): string {
    if (!p) return '先选一项'
    if (p.kind === 'join') return fieldFull(this.run) ? '去替换' : '去招募'
    const name = CHARACTERS[this.run.roster[p.slot]!].name
    if (p.kind === 'upgrade') return `升级${name}`
    return `${this.opened.field[p.slot]?.alive ? '恢复' : '复活'}${name}`
  }

  /** 升级与恢复当场领了回到战斗；上场先去全角色页，弹窗睡着等它回来 */
  private decide(): void {
    const p = this.picked
    if (!p || this.leaving) return
    if (p.kind === 'join') {
      this.scene.launch(SceneKey.LevelUpRecruit)
      this.scene.sleep()
      return
    }
    playSfx(p.kind === 'upgrade' ? 'upgrade' : 'revive')
    this.close(p)
  }

  /** 挑好人就回到战斗；没挑就留在弹窗，视口在睡着时变过就重排 */
  private onWake(_sys: Phaser.Scenes.Systems, data?: LevelUpWake): void {
    if (data?.join) {
      this.close(data.join)
      return
    }
    if (!this.relayout) return
    this.preserveOnRestart = true
    this.scene.restart()
  }

  /** 先关掉自己再让下层带着领到的接着跑：下层可能马上弹出下一次升级 */
  private close(claim: Claim): void {
    if (this.leaving) return
    this.leaving = true
    this.scene.stop()
    const result: LevelUpResult = { claim }
    for (const k of HOSTS) this.scene.resume(k, result)
  }

  private onViewportChanged(): void {
    if (!this.scene.isActive()) {
      this.relayout = true
      return
    }
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

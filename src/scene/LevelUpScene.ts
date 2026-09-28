import Phaser from 'phaser'
import { CHARACTERS, upgradeCardsFor } from '../data/characters'
import { LEVEL_STATS } from '../data/levels'
import { PICKUPS } from '../data/pickups'
import { modTexts } from '../data/stats'
import { DUTY_TAGS, TAGS } from '../data/tags'
import { playSfx } from '../audio/sfx'
import { claimUpgrade, levelUpOptions } from '../run/levelUp'
import type { LevelUpOption } from '../run/levelUp'
import { memberLevel, memberLook } from '../run/members'
import { getRun } from '../run/state'
import type { RunState } from '../run/state'
import { Button, ChoiceCard, Label, MOTION, Panel, RichLabel, Scrim } from '../ui'
import type { ChoiceCardOptions } from '../ui'
import { applyCamera, safeInsets, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'
import type { LevelUpData, LevelUpWake } from './levelUp'

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
} as const
/** 卡片与按键出现后这段时间内不响应：走过去捡道具时还按着的手指别落到这里 */
const ARM_MS = 350

/** 升级弹窗：盖在停住的战斗上，从屏幕底边升起；招一名新队员或给一名队员升一级，选中后确定，招人先去招募页 */
export class LevelUpScene extends Phaser.Scene {
  private opened: LevelUpData = { settling: false, queued: 1 }
  private preserveOnRestart = false
  /** 睡着时视口变了，醒来重排 */
  private relayout = false
  private leaving = false
  private run!: RunState
  private options: LevelUpOption[] = []
  private picked = -1
  private cards: ChoiceCard[] = []
  private confirm!: Button

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
    this.options = levelUpOptions(this.run)
    if (!preserved) this.picked = -1
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

  /** 弹窗：标题一行，各项卡片按列排开、末行居中，确定键压底 */
  private build(): void {
    const W = viewport.logicalWidth
    const H = viewport.logicalHeight
    const L = H > W ? LAYOUT.portrait : LAYOUT.landscape
    const { gap, pad } = LAYOUT
    const n = this.options.length
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
    this.cards = this.options.map((o, i) => {
      const row = Math.floor(i / cols)
      const inRow = Math.min(cols, n - row * cols)
      const rowW = inRow * cardW + (inRow - 1) * gap
      const rect = { x: pad + (innerW - rowW) / 2 + (i % cols) * (cardW + gap), y: LAYOUT.head + row * (L.cardH + gap), w: cardW, h: L.cardH }
      const key = KEYS[i]
      const card = new ChoiceCard(this, rect, { ...this.cardOf(o), keys: key ? [key] : [], armMs: ARM_MS, onTap: () => this.pick(i) })
      panel.add(card)
      return card
    })
    this.confirm = new Button(this, panelW / 2, panelH - LAYOUT.foot / 2, { label: '', size: 'md', width: 360, keys: ['ENTER', 'SPACE'], armMs: ARM_MS, onTap: () => this.decide() })
    panel.add(this.confirm)
    panel.setAlpha(0).setY(y + 60)
    this.tweens.add({ targets: panel, y, alpha: 1, duration: MOTION.pop, ease: 'Cubic.easeOut' })
  }

  /** 一项的卡片：招人写队伍会到几人、还缺什么职责；升级写新能力与升到这一级的等级加成 */
  private cardOf(o: LevelUpOption): Pick<ChoiceCardOptions, 'icon' | 'outline' | 'title' | 'aside' | 'lines' | 'tone'> {
    const run = this.run
    if (o.kind === 'recruit') {
      const n = run.roster.length
      const lack = DUTY_TAGS.filter((t) => !run.roster.some((id) => CHARACTERS[id].tags.includes(t)))
      return {
        icon: '2795',
        title: '招募新队员',
        aside: `${n} → ${n + 1} 人`,
        tone: 'good',
        lines: [
          { text: this.opened.settling ? '去招募页挑一名角色，下一场一起出战' : '去招募页挑一名角色，立刻加入战斗' },
          ...(lack.length > 0 ? [{ text: `队伍还缺${lack.map((t) => TAGS[t].name).join('、')}`, color: 'info' as const }] : []),
        ],
      }
    }
    const id = run.roster[o.slot]!
    const def = CHARACTERS[id]
    const lv = memberLevel(run, o.slot)
    const card = upgradeCardsFor(def)[lv - 1]
    const stats = LEVEL_STATS[id][lv - 1]
    return {
      icon: memberLook(run, o.slot),
      outline: 'player',
      title: def.name,
      aside: `Lv ${lv} → ${lv + 1}`,
      tone: 'accent',
      lines: [
        ...(card ? [{ text: `新能力「${card.name}」`, color: 'epic' as const }, { text: card.desc }] : []),
        ...(stats ? [{ text: modTexts(stats).join('、'), color: 'good' as const }] : []),
      ],
    }
  }

  /** 点一项选中它，再点一次就是确定 */
  private pick(i: number): void {
    if (i === this.picked) {
      this.decide()
      return
    }
    this.picked = i
    this.refresh()
  }

  private refresh(): void {
    this.cards.forEach((c, i) => c.setSelected(i === this.picked))
    const o = this.options[this.picked]
    const label = !o ? '先选一项' : o.kind === 'recruit' ? '去招募' : `升级${CHARACTERS[this.run.roster[o.slot]!].name}`
    this.confirm.setLabel(label).setEnabled(o !== undefined)
  }

  /** 升级当场领了回到战斗；招人先去招募页，弹窗睡着等它回来 */
  private decide(): void {
    const o = this.options[this.picked]
    if (!o || this.leaving) return
    if (o.kind === 'recruit') {
      this.scene.launch(SceneKey.LevelUpRecruit)
      this.scene.sleep()
      return
    }
    claimUpgrade(this.run, o.slot)
    playSfx('upgrade')
    this.close()
  }

  /** 招到人就回到战斗；没招就留在弹窗，视口在睡着时变过就重排 */
  private onWake(_sys: Phaser.Scenes.Systems, data?: LevelUpWake): void {
    if (data?.recruited) {
      this.close()
      return
    }
    if (!this.relayout) return
    this.preserveOnRestart = true
    this.scene.restart()
  }

  /** 先关掉自己再让下层接着跑：下层可能马上弹出下一次升级 */
  private close(): void {
    if (this.leaving) return
    this.leaving = true
    this.scene.stop()
    for (const k of HOSTS) this.scene.resume(k)
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

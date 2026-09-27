import Phaser from 'phaser'
import { PICKUPS } from '../data/pickups'
import { formatTime } from '../util/format'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, viewport, VIEWPORT_CHANGED } from '../util/apply'
import type { FieldCollected, HudInput, HudSnapshot, LeaderChanged, SquadMember, SquadSnapshot, WaveSummary, WaveWarning } from '../run/hudHost'
import { activeHudHost, HudEvent, setActiveHudInput } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import { AimGuide, Announcer, ArcTrack, Chip, DialButton, hasModal, Icon, IconButton, Joystick, Label, LAYER, Pill, ProgressBar, Scrim } from '../ui'
import { SceneKey } from './keys'
import { openPause } from './pause'
import type { DevProvider, DevProviderHost } from '../devtools'
import { handoverMs } from '../ecs/systems/shared/squad'

type IconState = 'ready' | 'cooling' | 'dead'

interface SquadIcon {
  readonly dial: DialButton
  shownState: IconState
}

/** 阵亡优先于冷却：倒地的人不显示技能冷却 */
function stateOf(m: SquadMember): IconState {
  return !m.alive ? 'dead' : m.cdRemainMs > 0 ? 'cooling' : 'ready'
}

/** 右下角的队伍环：队长贴角落放大并显示他的主动技能，队员沿四分之一圆弧从正上方排到正左方 */
const RING = { r: 27, emoji: 38, leaderScale: 2, radius: 140, inset: 24 } as const
const SQUAD_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const
const AIM_DEADZONE = 24
const DEPTH = { bar: LAYER.hud + 20, fx: LAYER.hud + 21, waveEnd: LAYER.toast + 10, squad: 300, leader: 302, aim: 305 } as const
/** 这一场的目标排在右上角计数的下方，一条一行 */
const GOALS = { top: 124, step: 42 } as const

export class UIScene extends Phaser.Scene implements HudInput, DevProviderHost {
  private joystick?: Joystick
  private xpBar!: ProgressBar
  private timePill!: Pill
  private bossBar!: ProgressBar
  private killsPill!: Pill
  private coinsPill!: Pill
  private announcer!: Announcer
  private last!: HudSnapshot
  private fxIcons: { icon: Icon; bar: ProgressBar }[] = []
  private fxKey = ''
  private goalChips: Chip[] = []
  private goalKey = ''
  private squad: SquadIcon[] = []
  private squadArc: number[] = []
  private squadShown = { leader: -1, switching: false }
  private squadTrack?: ArcTrack
  private squadCenter = { x: 0, y: 0 }
  private aiming = false
  private aimDir: { x: number; y: number } | null = null
  private holdStart = 0
  private holdMs = 0
  private aimGuide!: AimGuide

  constructor() {
    super(SceneKey.Ui)
  }

  get moveVector(): { x: number; y: number } {
    return this.joystick?.vector ?? { x: 0, y: 0 }
  }

  private get arena(): HudHost {
    return activeHudHost()!
  }

  create(): void {
    applyCamera(this)
    const w = viewport.logicalWidth
    const { top: sT, right: sR, left: sL } = safeInsets
    this.last = {
      xp: -1,
      xpNext: -1,
      kills: -1,
      coins: -1,
      label: null,
      seconds: -1,
      remainMs: -1,
      goals: [],
      bossHp: null,
      bossMaxHp: 1,
      battleFx: [],
    }

    this.joystick = new Joystick(this)
    setActiveHudInput(this)

    this.xpBar = new ProgressBar(this, sL + 12, sT + 12, 200, 16, { tone: 'info' })
    this.timePill = new Pill(this, w / 2, sT + 32, { text: '' })
    this.bossBar = new ProgressBar(this, w / 2 - 160, sT + 64, 320, 18, { tone: 'bad' }).setDepth(DEPTH.bar).setVisible(false)
    const right = w - sR - 88
    this.killsPill = new Pill(this, right, sT + 32, { icon: '1f480', outline: 'player', text: '0', originX: 1 })
    this.coinsPill = new Pill(this, right, sT + 84, { icon: PICKUPS.coin.emoji, outline: 'player', text: '0', color: 'accent', originX: 1 })
    new IconButton(this, w - sR - 42, sT + 42, { glyph: 'pause', size: 56, onTap: () => this.pause() }).setDepth(DEPTH.aim + 1)
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!hasModal(this)) this.pause()
    })

    this.announcer = new Announcer(this)
    this.aimGuide = new AimGuide(this, DEPTH.aim)
    this.fxIcons = []
    this.fxKey = ''
    this.goalChips = []
    this.goalKey = ''
    this.squad = []
    this.squadArc = []
    this.squadShown = { leader: -1, switching: false }
    this.squadTrack = undefined
    this.aiming = false
    this.aimDir = null
    SQUAD_KEYS.forEach((k, i) =>
      this.input.keyboard?.on(`keydown-${k}`, () => {
        const slot = this.squadArc.indexOf(i)
        if (slot >= 0) this.trySwitchLeader(slot)
      }),
    )
    this.input.keyboard?.on('keydown-Q', () => this.arena.castLeaderSkill(null))

    const arenaEvents = this.arena.events
    arenaEvents.on(HudEvent.WaveComplete, this.onWaveComplete, this)
    arenaEvents.on(HudEvent.WaveWarning, this.onWaveWarning, this)
    arenaEvents.on(HudEvent.SkillCast, this.onSkillCast, this)
    arenaEvents.on(HudEvent.FieldCollected, this.onFieldCollected, this)
    arenaEvents.on(HudEvent.LeaderChanged, this.onLeaderChanged, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      arenaEvents.off(HudEvent.WaveComplete, this.onWaveComplete, this)
      arenaEvents.off(HudEvent.WaveWarning, this.onWaveWarning, this)
      arenaEvents.off(HudEvent.SkillCast, this.onSkillCast, this)
      arenaEvents.off(HudEvent.FieldCollected, this.onFieldCollected, this)
      arenaEvents.off(HudEvent.LeaderChanged, this.onLeaderChanged, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      setActiveHudInput(undefined)
    })
  }

  /** 打开暂停页：战斗与 HUD 一起停住，停住前放掉摇杆与瞄准，免得恢复时还按着 */
  private pause(): void {
    this.joystick?.release()
    if (this.aiming) {
      this.aiming = false
      this.aimDir = null
      this.arena.setSkillAim(null)
      this.drawAim()
    }
    openPause(this, { from: SceneKey.Battle })
  }

  update(): void {
    this.updateSquad()
    if (this.aiming && this.holdMs > 0) this.drawAim()
    const s = this.arena.hudSnapshot()
    this.updateFxIndicators(s.battleFx)
    this.updateGoals(s.goals)
    if (s.xp !== this.last.xp || s.xpNext !== this.last.xpNext) this.xpBar.setValue(s.xpNext > 0 ? s.xp / s.xpNext : 0)
    if (s.kills !== this.last.kills) this.killsPill.setText(String(s.kills))
    if (s.coins !== this.last.coins) this.coinsPill.setText(String(s.coins))
    const remainSec = s.remainMs === null ? null : Math.ceil(s.remainMs / 1000)
    const lastRemainSec = this.last.remainMs === null ? null : Math.ceil(this.last.remainMs / 1000)
    if (s.label !== this.last.label || remainSec !== lastRemainSec || s.seconds !== this.last.seconds) {
      const clock = formatTime(remainSec ?? s.seconds)
      this.timePill.setText(s.label ? `${s.label} ${clock}` : clock)
    }
    if (s.bossHp !== this.last.bossHp) {
      this.bossBar.setVisible(s.bossHp !== null)
      if (s.bossHp !== null) this.bossBar.setValue(s.bossHp / s.bossMaxHp)
    }
    this.last = s
  }

  private onWaveWarning(w: WaveWarning): void {
    playSfx('over')
    this.announcer.banner(w.title, { sub: w.sub, color: 'bad' })
  }

  private squadCorner(): { x: number; y: number } {
    const r = RING.r * RING.leaderScale
    return {
      x: viewport.logicalWidth - safeInsets.right - RING.inset - r,
      y: viewport.logicalHeight - safeInsets.bottom - RING.inset - r,
    }
  }

  /** 弧上第 i 个位置（共 m 个）：含两端从正上方排到正左方，只有一个时居中 */
  private arcPoint(i: number, m: number): { x: number; y: number } {
    const t = m > 1 ? i / (m - 1) : 0.5
    const a = -Math.PI / 2 - (Math.PI / 2) * t
    return { x: this.squadCenter.x + Math.cos(a) * RING.radius, y: this.squadCenter.y + Math.sin(a) * RING.radius }
  }

  private createSquad(s: SquadSnapshot): void {
    for (const b of this.squad) b.dial.destroy()
    this.squadTrack?.destroy()
    this.squadTrack = undefined
    this.squadCenter = this.squadCorner()
    const m = s.members.length - 1
    if (m >= 2) {
      this.squadTrack = new ArcTrack(this, this.squadCenter.x, this.squadCenter.y, RING.radius, (RING.r + 8) * 2, -Math.PI, -Math.PI / 2).setDepth(DEPTH.squad - 1)
    }
    let arc = 0
    this.squadArc = s.members.map((_, slot) => (slot === s.leaderSlot ? -1 : arc++))
    this.squad = s.members.map((member, slot) => {
      const isLeader = slot === s.leaderSlot
      const p = isLeader ? this.squadCenter : this.arcPoint(this.squadArc[slot]!, m)
      const dial = new DialButton(this, p.x, p.y, {
        radius: RING.r,
        icon: isLeader ? member.skillIcon : member.emoji,
        outline: 'player',
        iconSize: RING.emoji,
        onTap: () => this.onIconTap(slot),
        onHold: () => this.beginAim(slot),
        onDrag: (dx, dy) => this.moveAim(dx, dy),
        onRelease: () => this.releaseAim(),
      })
        .setScale(isLeader ? RING.leaderScale : 1)
        .setDepth(isLeader ? DEPTH.leader : DEPTH.squad)
      return { dial, shownState: 'ready' as IconState }
    })
    this.squadShown = { leader: s.leaderSlot, switching: false }
    this.squad.forEach((b, slot) => this.styleSquadIcon(b, s.members[slot]!, slot === s.leaderSlot, false))
  }

  private trySwitchLeader(slot: number): void {
    this.arena.switchLeader(slot)
  }

  private onIconTap(slot: number): void {
    if (slot !== this.squadShown.leader) this.trySwitchLeader(slot)
    else this.arena.castLeaderSkill(null)
  }

  /** 按住队长按钮开始瞄准或蓄力，只对方向型或蓄力型技能有效 */
  private beginAim(slot: number): boolean {
    if (slot !== this.squadShown.leader || this.aiming) return false
    const sk = this.arena.leaderSkill()
    if (!sk || (!sk.aim && sk.holdMs <= 0)) return false
    this.aiming = true
    this.aimDir = null
    this.holdStart = this.time.now
    this.holdMs = sk.holdMs
    return true
  }

  private moveAim(dx: number, dy: number): void {
    if (!this.aiming) return
    const len = Math.hypot(dx, dy)
    this.aimDir = len >= AIM_DEADZONE ? { x: dx / len, y: dy / len } : null
    this.arena.setSkillAim(this.aimDir)
    this.drawAim()
  }

  /** 松手即释放：拖出了方向就朝那个方向，没拖出就当作点按；蓄力型按住多久蓄多少 */
  private releaseAim(): void {
    if (!this.aiming) return
    this.aiming = false
    this.arena.castLeaderSkill(this.aimDir, this.holdRatio())
    this.aimDir = null
    this.arena.setSkillAim(null)
    this.drawAim()
  }

  private holdRatio(): number {
    return this.holdMs > 0 ? Math.min(1, (this.time.now - this.holdStart) / this.holdMs) : 0
  }

  private drawAim(): void {
    const c = this.squadCenter
    const hold = this.aiming && this.holdMs > 0 ? this.holdRatio() : null
    this.aimGuide.draw(c.x, c.y, this.aimDir, RING.radius * 0.8, hold, RING.r * RING.leaderScale + 10)
  }

  /** 新队长滑到角落放大，旧队长缩小滑到他空出的弧上位置，时长与交接期一致 */
  private swapLeader(oldSlot: number, newSlot: number): void {
    const a = this.squad[oldSlot]?.dial
    const b = this.squad[newSlot]?.dial
    if (!a || !b) return
    const pos = this.squadArc[newSlot]!
    this.squadArc[newSlot] = -1
    this.squadArc[oldSlot] = pos
    const p = this.arcPoint(pos, this.squad.length - 1)
    const ms = handoverMs()
    b.setDepth(DEPTH.leader)
    a.setDepth(DEPTH.squad)
    this.tweens.killTweensOf([a, b])
    this.tweens.add({ targets: b, x: this.squadCenter.x, y: this.squadCenter.y, scale: RING.leaderScale, duration: ms, ease: 'Cubic.easeInOut' })
    this.tweens.add({ targets: a, x: p.x, y: p.y, scale: 1, duration: ms, ease: 'Cubic.easeInOut' })
  }

  private styleSquadIcon(b: SquadIcon, m: SquadMember, isLeader: boolean, switching: boolean): void {
    const state = stateOf(m)
    const dead = state === 'dead'
    b.dial
      .setDim(switching)
      .setIcon(isLeader ? m.skillIcon : m.emoji, 'player')
      .setDead(dead, m.reviveSec)
      .setHp(dead ? null : Math.max(0, Math.min(1, m.max > 0 ? m.hp / m.max : 0)))
    // 徽章：队长显示头像，阵亡显示骷髅，冷却中的队员显示技能图标
    const badge = dead ? '1f480' : isLeader ? m.emoji : state === 'cooling' ? m.skillIcon : null
    b.dial.setBadge(badge, 'player')
    if (state !== 'cooling') b.dial.setCooldown(0, null)
    if (!isLeader) b.dial.setRim('idle')
  }

  private updateSquad(): void {
    const s = this.arena.squadSnapshot()
    if (!s) return
    if (s.members.length !== this.squad.length) this.createSquad(s)
    const leaderChanged = s.leaderSlot !== this.squadShown.leader
    if (leaderChanged) this.swapLeader(this.squadShown.leader, s.leaderSlot)
    const switchChanged = s.switching !== this.squadShown.switching
    this.squadShown = { leader: s.leaderSlot, switching: s.switching }
    const sk = this.arena.leaderSkill()
    s.members.forEach((m, i) => {
      const b = this.squad[i]!
      const isLeader = i === s.leaderSlot
      const state = stateOf(m)
      if (leaderChanged || switchChanged || state !== b.shownState) {
        b.shownState = state
        this.styleSquadIcon(b, m, isLeader, s.switching)
      }
      const dial = b.dial.setTired(m.tired)
      if (state === 'dead') {
        dial.setDead(true, m.reviveSec)
        return
      }
      if (state === 'cooling') dial.setCooldown(m.cdMs > 0 ? m.cdRemainMs / m.cdMs : 0, Math.ceil(m.cdRemainMs / 1000))
      const charges = isLeader ? (sk?.charges ?? -1) : -1
      dial.setCharges(charges >= 0 ? charges : null)
      if (isLeader) {
        if (sk && sk.recastMs > 0) dial.setRim('recast', 0.5 + 0.5 * Math.sin(this.time.now / 90))
        else dial.setRim('leader', state === 'cooling' ? 0.1 : 0.5 + 0.5 * Math.sin(this.time.now / 240))
      }
      dial.setHp(m.max > 0 ? Math.max(0, Math.min(1, m.hp / m.max)) : 0)
    })
  }

  private onLeaderChanged(e: LeaderChanged): void {
    this.announcer.toast(`{${e.emoji}} ${e.name} 接任队长`)
  }

  private updateFxIndicators(list: HudSnapshot['battleFx']): void {
    const x = safeInsets.left + 30
    const y0 = safeInsets.top + 56
    const step = 44
    const key = list.map((f) => `${f.emoji}${f.polarity}`).join(',')
    if (key !== this.fxKey) {
      this.fxKey = key
      for (const o of this.fxIcons) {
        o.icon.destroy()
        o.bar.destroy()
      }
      this.fxIcons = list.map((f, i) => ({
        icon: new Icon(this, x, y0 + i * step, f.emoji, 34, 'player').setDepth(DEPTH.fx),
        bar: new ProgressBar(this, x - 18, y0 + i * step + 18, 36, 8, { tone: f.polarity === 'buff' ? 'good' : 'bad' }).setDepth(DEPTH.fx),
      }))
    }
    list.forEach((f, i) => {
      this.fxIcons[i]?.bar.setValue(f.totalMs > 0 ? f.remainMs / f.totalMs : 0)
    })
  }

  private updateGoals(goals: HudSnapshot['goals']): void {
    const key = goals.map((g) => `${g.warn ? '!' : ''}${g.text}`).join('\n')
    if (key === this.goalKey) return
    this.goalKey = key
    while (this.goalChips.length > goals.length) this.goalChips.pop()!.destroy()
    goals.forEach((g, i) => {
      const chip = (this.goalChips[i] ??= new Chip(this, viewport.logicalWidth / 2, safeInsets.top + GOALS.top + i * GOALS.step, '', { size: 'md' }).setDepth(DEPTH.bar))
      chip.setText(g.text).setTone(g.warn ? 'warn' : 'steel')
    })
  }

  private onSkillCast(name: string): void {
    this.announcer.toast(`{26a1} ${name}`, { color: 'accent', holdMs: 900 })
  }

  private onFieldCollected(fx: FieldCollected): void {
    const buff = fx.polarity === 'buff'
    this.announcer.toast(`{${fx.emoji}} ${fx.name}`, { color: buff ? 'good' : 'bad', sub: `${buff ? '增益' : '减益'} · ${fx.desc}`, holdMs: 1600 })
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }

  private onWaveComplete(s: WaveSummary): void {
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    new Scrim(this, { depth: DEPTH.waveEnd, alpha: 0.55 })
    const title = new Label(this, cx, cy - 76, s.title, { kind: 'banner', color: 'accent', outline: true })
      .setOrigin(0.5)
      .setDepth(DEPTH.waveEnd + 1)
    title.setScale(0.6)
    this.tweens.add({ targets: title, scale: 1, duration: 320, ease: 'Back.easeOut' })
    new Pill(this, cx - 12, cy + 16, { icon: '1f480', outline: 'player', text: `击杀 ${s.kills}`, size: 'lg', originX: 1 }).setDepth(DEPTH.waveEnd + 1)
    new Pill(this, cx + 12, cy + 16, { icon: PICKUPS.coin.emoji, outline: 'player', text: `金币 +${s.coins}`, color: 'accent', size: 'lg', originX: 0 }).setDepth(
      DEPTH.waveEnd + 1,
    )
  }

  devProvider(): DevProvider {
    return {
      id: 'ui',
      title: 'HUD',
      sections: [
        {
          id: 'hud',
          title: 'HUD',
          items: () => [
            {
              kind: 'buttons',
              label: '预览提示 · 不必等战斗里真的发生',
              buttons: [
                { label: '波次预警', run: () => this.onWaveWarning({ title: '预览：精英来袭', sub: '开发者工具触发的预警文案' }) },
                { label: '拾取提示', run: () => this.onFieldCollected({ emoji: PICKUPS.coin.emoji, name: '预览拾取', desc: '开发者工具触发', polarity: 'buff' }) },
                { label: '技能提示', run: () => this.onSkillCast('预览技能') },
                { label: '队长交接', run: () => this.onLeaderChanged({ emoji: PICKUPS.coin.emoji, name: '预览' }) },
                { label: '波次完成', run: () => this.onWaveComplete({ title: '第 1 波完成！', kills: 12, coins: 34 }) },
              ],
            },
          ],
        },
      ],
    }
  }
}

import Phaser from 'phaser'
import { PICKUPS } from '../data/pickups'
import { formatTime } from '../util/format'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, viewport, VIEWPORT_CHANGED } from '../util/apply'
import type { FieldCollected, HudInput, HudSnapshot, LeaderChanged, SquadMember, SquadSnapshot, WaveSummary, WaveWarning } from '../run/hudHost'
import { activeHudHost, HudEvent, setActiveHudInput } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import { AimGuide, Announcer, BookDial, Chip, DialButton, hasModal, Icon, IconButton, Joystick, Label, LAYER, Pill, ProgressBar, Scrim, SubmarineDial, Sundial, TiltDial } from '../ui'
import { DEG2RAD } from '../util/units'
import { SceneKey } from './keys'
import { openPause } from './pause'
import type { DevProvider, DevProviderHost } from '../devtools'
import { handoverMs } from '../ecs/systems/shared/squad'
import { staminaTone } from './statLines'

type IconState = 'ready' | 'cooling' | 'dead'

interface SquadIcon {
  readonly dial: DialButton
  shownState: IconState
}

/** 阵亡优先于冷却：倒地的人不显示技能冷却 */
function stateOf(m: SquadMember): IconState {
  return !m.alive ? 'dead' : m.cdRemainMs > 0 ? 'cooling' : 'ready'
}

/** 左下角的摇杆与右下角的队长按钮离屏幕边留出的余地，给按住后往边上拖留空间 */
const EDGE = 70
/** 右下角的队伍环：队长放大并显示他的主动技能；队员按固定间隔 spread 沿圆弧排在他左上方；wheel 是施法轮盘的半径 */
const RING = { r: 34, emoji: 48, leaderScale: 1.6, radius: 135, spread: 42 * DEG2RAD, wheel: 115 } as const
const SQUAD_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const
const AIM_DEADZONE = 24
const DEPTH = { bar: LAYER.hud + 20, fx: LAYER.hud + 21, waveEnd: LAYER.toast + 10, stick: 150, squad: 300, leader: 302, aim: 305 } as const
/** 这一场的目标排在右上角计数的下方，一条一行 */
const GOALS = { top: 124, step: 42 } as const
/** 左上角的全队经验条，右边跟着等级与还没领的升级 */
const XP_BAR = { x: 12, y: 12, w: 200, h: 16, gap: 12 } as const
/** 船上的一局在右上角计数下方放倾斜仪：盘心离右边与上边多远、盘的半径 */
const TILT = { right: 64, top: 166, radius: 52 } as const

export class UIScene extends Phaser.Scene implements HudInput, DevProviderHost {
  private joystick?: Joystick
  private xpBar!: ProgressBar
  private levelLabel!: Label
  private levelUpsPill!: Pill
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
  private tiltDial?: TiltDial
  private submarineDial?: SubmarineDial
  private sundial?: Sundial
  private bookDial?: BookDial
  private squad: SquadIcon[] = []
  private squadArc: number[] = []
  private squadShown = { leader: -1, switching: false }
  private squadCenter = { x: 0, y: 0 }
  /** 这一场不能放主动技能 */
  private noSkill = false
  private aiming = false
  private aimDir: { x: number; y: number } | null = null
  private aimDrag = { x: 0, y: 0 }
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
    const { top: sT, right: sR, bottom: sB, left: sL } = safeInsets
    this.last = {
      xp: -1,
      xpNext: -1,
      level: null,
      levelUps: -1,
      kills: -1,
      coins: -1,
      label: null,
      seconds: -1,
      remainMs: -1,
      goals: [],
      bossHp: null,
      bossMaxHp: 1,
      battleFx: [],
      tilt: null,
      clock: null,
      submarine: null,
      book: null,
    }

    const stick = EDGE + Joystick.RADIUS
    this.joystick = new Joystick(this, sL + stick, viewport.logicalHeight - sB - stick, DEPTH.stick)
    setActiveHudInput(this)

    this.xpBar = new ProgressBar(this, sL + XP_BAR.x, sT + XP_BAR.y, XP_BAR.w, XP_BAR.h, { tone: 'info' })
    const barMid = sT + XP_BAR.y + XP_BAR.h / 2
    this.levelLabel = new Label(this, sL + XP_BAR.x + XP_BAR.w + XP_BAR.gap, barMid, '', { kind: 'label', bold: true, color: 'info', outline: true }).setOrigin(0, 0.5).setVisible(false)
    this.levelUpsPill = new Pill(this, 0, barMid + 4, { icon: PICKUPS.levelUp.emoji, outline: 'player', text: '', color: 'info', originX: 0 }).setVisible(false)
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
    this.tiltDial = undefined
    this.sundial = undefined
    this.submarineDial = undefined
    this.bookDial = undefined
    this.squad = []
    this.squadArc = []
    this.squadShown = { leader: -1, switching: false }
    this.noSkill = false
    this.aiming = false
    this.aimDir = null
    SQUAD_KEYS.forEach((k, i) =>
      this.input.keyboard?.on(`keydown-${k}`, () => {
        const slot = this.squadArc.indexOf(i)
        if (slot >= 0) this.trySwitchLeader(slot)
      }),
    )
    this.input.keyboard?.on('keydown-Q', () => this.tryCast())
    this.events.on(Phaser.Scenes.Events.PAUSE, this.releaseInput, this)

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
      this.events.off(Phaser.Scenes.Events.PAUSE, this.releaseInput, this)
      setActiveHudInput(undefined)
    })
  }

  /** 打开暂停页：战斗与 HUD 一起停住 */
  private pause(): void {
    this.releaseInput()
    openPause(this, { from: SceneKey.Battle })
  }

  /** 停住时放掉摇杆与瞄准，免得恢复时还按着 */
  private releaseInput(): void {
    this.joystick?.release()
    if (this.aiming) {
      this.aiming = false
      this.aimDir = null
      this.arena.setSkillAim(null)
      this.drawAim()
    }
  }

  update(): void {
    this.updateSquad()
    if (this.aiming && this.holdMs > 0) this.drawAim()
    const s = this.arena.hudSnapshot()
    this.updateFxIndicators(s.battleFx)
    this.updateGoals(s.goals)
    this.updateTilt(s.tilt)
    this.updateClock(s.clock)
    this.updateSubmarine(s.submarine)
    this.updateBook(s.book)
    if (s.xp !== this.last.xp || s.xpNext !== this.last.xpNext) this.xpBar.setValue(s.xpNext > 0 ? s.xp / s.xpNext : 0)
    if (s.level !== this.last.level || s.levelUps !== this.last.levelUps) this.updateLevel(s.level, s.levelUps)
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

  /** 经验条右边的等级，再往右是还没领的升级 */
  private updateLevel(level: number | null, levelUps: number): void {
    this.levelLabel.setVisible(level !== null).setText(level === null ? '' : `Lv ${level}`)
    this.levelUpsPill
      .setText(`×${levelUps}`)
      .setX(this.levelLabel.x + this.levelLabel.width + XP_BAR.gap)
      .setVisible(level !== null && levelUps > 0)
  }

  private onWaveWarning(w: WaveWarning): void {
    playSfx('over')
    this.announcer.banner(w.title, { sub: w.sub, color: 'bad' })
  }

  private squadCorner(): { x: number; y: number } {
    const r = RING.r * RING.leaderScale + EDGE
    return {
      x: viewport.logicalWidth - safeInsets.right - r,
      y: viewport.logicalHeight - safeInsets.bottom - r,
    }
  }

  /** 弧上第 i 个位置（共 m 个）：以左上方的对角线为中心排开，第 0 个最靠上 */
  private arcPoint(i: number, m: number): { x: number; y: number } {
    const a = (-3 * Math.PI) / 4 + ((m - 1) / 2 - i) * RING.spread
    return { x: this.squadCenter.x + Math.cos(a) * RING.radius, y: this.squadCenter.y + Math.sin(a) * RING.radius }
  }

  private createSquad(s: SquadSnapshot): void {
    this.noSkill = this.arena.skillBlock() !== null
    for (const b of this.squad) b.dial.destroy()
    this.squadCenter = this.squadCorner()
    const m = s.members.length - 1
    let arc = 0
    this.squadArc = s.members.map((_, slot) => (slot === s.leaderSlot ? -1 : arc++))
    this.squad = s.members.map((member, slot) => {
      const isLeader = slot === s.leaderSlot
      const p = isLeader ? this.squadCenter : this.arcPoint(this.squadArc[slot]!, m)
      const dial = new DialButton(this, p.x, p.y, {
        radius: RING.r,
        icon: isLeader && !this.noSkill ? member.skillIcon : member.emoji,
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

  /** 换不了队长时说明缘由：这一场不许换，或还在冷却 */
  private trySwitchLeader(slot: number): void {
    if (this.arena.switchLeader(slot)) return
    const why = this.arena.switchBlock()
    if (why) this.announcer.toast(why, { color: 'warn' })
  }

  private onIconTap(slot: number): void {
    if (slot !== this.squadShown.leader) this.trySwitchLeader(slot)
    else this.tryCast()
  }

  /** 放不了技能时说明缘由：这一场不许放 */
  private tryCast(): void {
    if (this.arena.castLeaderSkill(null)) return
    const why = this.arena.skillBlock()
    if (why) this.announcer.toast(why, { color: 'warn' })
  }

  /** 按住队长按钮开始瞄准或蓄力，只对方向型或蓄力型技能有效 */
  private beginAim(slot: number): boolean {
    if (slot !== this.squadShown.leader || this.aiming || this.noSkill) return false
    const sk = this.arena.leaderSkill()
    if (!sk || (!sk.aim && sk.holdMs <= 0)) return false
    this.aiming = true
    this.aimDir = null
    this.aimDrag = { x: 0, y: 0 }
    this.holdStart = this.time.now
    this.holdMs = sk.holdMs
    this.drawAim()
    return true
  }

  private moveAim(dx: number, dy: number): void {
    if (!this.aiming) return
    this.aimDrag = { x: dx, y: dy }
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
    if (!this.aiming) {
      this.aimGuide.clear()
      return
    }
    const c = this.squadCenter
    const hold = this.holdMs > 0 ? this.holdRatio() : null
    this.aimGuide.draw(c.x, c.y, RING.wheel, this.aimDrag.x, this.aimDrag.y, this.aimDir !== null, hold)
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

  /** 不能放技能的场次里不显示技能冷却 */
  private iconState(m: SquadMember): IconState {
    const state = stateOf(m)
    return state === 'cooling' && this.noSkill ? 'ready' : state
  }

  private styleSquadIcon(b: SquadIcon, m: SquadMember, isLeader: boolean, switching: boolean): void {
    const state = this.iconState(m)
    const dead = state === 'dead'
    const skill = isLeader && !this.noSkill
    b.dial
      .setDim(switching)
      .setIcon(skill ? m.skillIcon : m.emoji, 'player')
      .setDead(dead, m.reviveSec)
      .setHp(dead ? null : Math.max(0, Math.min(1, m.max > 0 ? m.hp / m.max : 0)))
      .setStamina(dead ? null : m.stamina, staminaTone(m.stamina))
    // 徽章：队长显示头像，不能放技能时显示禁止，阵亡显示骷髅，冷却中的队员显示技能图标
    const badge = dead ? '1f480' : isLeader ? (skill ? m.emoji : '1f6ab') : state === 'cooling' ? m.skillIcon : null
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
      const state = this.iconState(m)
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
      const charges = isLeader && !this.noSkill ? (sk?.charges ?? -1) : -1
      dial.setCharges(charges >= 0 ? charges : null)
      if (isLeader) {
        if (sk && sk.recastMs > 0) dial.setRim('recast', 0.5 + 0.5 * Math.sin(this.time.now / 90))
        else dial.setRim('leader', state === 'cooling' ? 0.1 : 0.5 + 0.5 * Math.sin(this.time.now / 240))
      }
      dial.setHp(m.max > 0 ? Math.max(0, Math.min(1, m.hp / m.max)) : 0)
      dial.setStamina(m.stamina, staminaTone(m.stamina))
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

  /** 在船上或梦幻乐园里打的一局：甲板或台面往哪边倾、倾多少，台子下一次往哪倾、哪个入口开着，随时看得见 */
  private updateTilt(t: HudSnapshot['tilt']): void {
    if (!t) return
    this.tiltDial ??= new TiltDial(this, viewport.logicalWidth - safeInsets.right - TILT.right, safeInsets.top + TILT.top, TILT.radius, t)
    this.tiltDial.setTilt(t, this.time.now)
  }

  /** 在溶洞里打的一局：太阳月亮走到哪、离天黑或天亮还有多久，随时看得见 */
  private updateClock(c: HudSnapshot['clock']): void {
    if (!c) return
    this.sundial ??= new Sundial(this, viewport.logicalWidth - safeInsets.right - TILT.right, safeInsets.top + TILT.top, TILT.radius)
    this.sundial.setSky(c.sun, c.moon, c.phase, c.night, c.inSec)
  }

  /** 在深海打的一局：潜艇还有多久开走、开走了还有多久停稳，随时看得见 */
  private updateSubmarine(b: HudSnapshot['submarine']): void {
    if (!b) return
    this.submarineDial ??= new SubmarineDial(this, viewport.logicalWidth - safeInsets.right - TILT.right, safeInsets.top + TILT.top, TILT.radius)
    this.submarineDial.setSubmarine(b.phase, b.ratio, b.inSec, this.time.now)
  }

  /** 在立体书里打的一局：离下一次换页还有多久、正在换还是快要换了，随时看得见 */
  private updateBook(b: HudSnapshot['book']): void {
    if (!b) return
    this.bookDial ??= new BookDial(this, viewport.logicalWidth - safeInsets.right - TILT.right, safeInsets.top + TILT.top, TILT.radius)
    this.bookDial.setBook(b.phase, b.ratio, b.inSec, b.title, this.time.now)
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
    if (s.reward) new Label(this, cx, cy + 84, s.reward, { kind: 'heading', color: 'good', outline: true }).setOrigin(0.5).setDepth(DEPTH.waveEnd + 1)
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
                { label: '波次完成', run: () => this.onWaveComplete({ title: '第 1 波完成！', kills: 12, coins: 34, reward: '过关奖励 金币 +60、全队回满血' }) },
              ],
            },
          ],
        },
      ],
    }
  }
}

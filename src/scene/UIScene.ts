import Phaser from 'phaser'
import { PICKUPS } from '../data/pickups'
import { formatTime } from '../util/format'
import { endRun } from '../run/state'
import { emojiImage } from '../emoji/hold'
import { emojiKey } from '../emoji/textures'
import { emojiText, iconLabel } from '../ui/emojiText'
import { FONT, UI_FONT } from '../util/fonts'
import { Joystick } from '../ui/Joystick'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import type { FieldCollected, HudInput, HudSnapshot, LeaderChanged, SquadMember, SquadSnapshot, WaveSummary, WaveWarning } from '../run/hudHost'
import { activeHudHost, HudEvent, setActiveHudInput } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import { roundRect } from '../ui/shapes'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'
import { handoverMs } from '../ecs/systems/shared/squad'

interface SquadIcon {
  c: Phaser.GameObjects.Container
  base: Phaser.GameObjects.Arc
  emoji: Phaser.GameObjects.Image
  badge: Phaser.GameObjects.Image
  hp: Phaser.GameObjects.Graphics
  cd: Phaser.GameObjects.Graphics
  cdText: Phaser.GameObjects.Text
  dead: Phaser.GameObjects.Text
  shownHp: number
  shownSec: number
  shownCd: number
  shownState: IconState
}

type IconState = 'ready' | 'cooling' | 'dead'

/** 阵亡优先于冷却：倒地的人不显示技能冷却 */
function stateOf(m: SquadMember): IconState {
  return !m.alive ? 'dead' : m.cdRemainMs > 0 ? 'cooling' : 'ready'
}

/** 右下角的队伍环：队长贴角落放大并显示他的主动技能，队员沿四分之一圆弧从正上方排到正左方 */
const RING = { r: 27, emoji: 38, leaderScale: 2, radius: 140, inset: 24 } as const
const SQUAD_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const
const AIM_DEADZONE = 24

export class UIScene extends Phaser.Scene implements HudInput, DevProviderHost {
  private joystick?: Joystick
  private xpBar!: Phaser.GameObjects.Graphics
  private timeText!: Phaser.GameObjects.Text
  private bossBar!: Phaser.GameObjects.Graphics
  private killsText!: Phaser.GameObjects.Text
  private coinsText!: Phaser.GameObjects.Text
  private last!: HudSnapshot
  private paused = false
  private pauseObjs: Phaser.GameObjects.GameObject[] = []
  private fxIcons: Phaser.GameObjects.Image[] = []
  private fxBars?: Phaser.GameObjects.Graphics
  private fxKey = ''
  private squad: SquadIcon[] = []
  private squadArc: number[] = []
  private squadShown = { leader: -1, switching: false }
  private squadTrack?: Phaser.GameObjects.Graphics
  private squadCenter = { x: 0, y: 0 }
  private aimPointer: number | null = null
  private aimOrigin = { x: 0, y: 0 }
  private aimDir: { x: number; y: number } | null = null
  private aimGfx?: Phaser.GameObjects.Graphics

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
    const res = textRes()
    const w = viewport.logicalWidth
    const { top: sT, right: sR } = safeInsets
    this.last = {
      xp: -1,
      xpNext: -1,
      kills: -1,
      coins: -1,
      wave: -1,
      seconds: -1,
      remainMs: -1,
      bossHp: null,
      bossMaxHp: 1,
      battleFx: [],
    }

    this.joystick = new Joystick(this)
    setActiveHudInput(this)

    this.xpBar = this.add.graphics()
    this.bossBar = this.add.graphics().setDepth(120)
    const hudText = {
      fontFamily: UI_FONT,
      color: '#2b2b33',
      stroke: '#ffffff',
      strokeThickness: 3,
      resolution: res,
    }
    this.timeText = this.add
      .text(w / 2, sT + 10, '', { ...hudText, fontSize: FONT.lead })
      .setOrigin(0.5, 0)
    emojiImage(this, w - sR - 26, sT + 26, '1f480', 35, 'player')
    this.killsText = this.add
      .text(w - sR - 46, sT + 10, '0', { ...hudText, fontSize: FONT.head })
      .setOrigin(1, 0)
    emojiImage(this, w - sR - 26, sT + 64, PICKUPS.coin.emoji, 35, 'player')
    this.coinsText = this.add
      .text(w - sR - 46, sT + 48, '0', { ...hudText, fontSize: FONT.head })
      .setOrigin(1, 0)

    emojiImage(this, w - sR - 26, sT + 112, '23f8', 48)
      .setDepth(300)
      .setAlpha(0.85)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.togglePause())
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.paused) this.togglePause()
    })

    this.createFxIndicators()
    this.squad = []
    this.squadArc = []
    this.squadShown = { leader: -1, switching: false }
    this.squadTrack = undefined
    this.aimPointer = null
    this.aimDir = null
    this.aimGfx = undefined
    SQUAD_KEYS.forEach((k, i) =>
      this.input.keyboard?.on(`keydown-${k}`, () => {
        const slot = this.squadArc.indexOf(i)
        if (slot >= 0) this.trySwitchLeader(slot)
      }),
    )
    this.input.keyboard?.on('keydown-Q', () => {
      if (!this.paused) this.arena.castLeaderSkill(null)
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onAimMove, this)
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onAimUp, this)

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

    if (this.arena.scene.isPaused()) {
      this.paused = true
      this.showPauseOverlay()
    }
  }

  private togglePause(): void {
    if (this.paused) {
      this.paused = false
      for (const o of this.pauseObjs) o.destroy()
      this.pauseObjs = []
      this.arena.scene.resume()
    } else {
      this.paused = true
      this.arena.scene.pause()
      this.showPauseOverlay()
    }
  }

  private showPauseOverlay(): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    const button = (
      y: number,
      label: string,
      filled: boolean,
      onTap: () => void,
    ): Phaser.GameObjects.GameObject[] => {
      const rect = { x: cx - 150, y: y - 36, w: 300, h: 72 }
      const g = this.add.graphics().setDepth(401)
      if (filled) {
        roundRect(g, rect.x, rect.y, rect.w, rect.h, 36, { fill: 0xffdc5d })
      } else {
        roundRect(g, rect.x, rect.y, rect.w, rect.h, 36, { fill: 0xffffff, fillAlpha: 0.12, stroke: 0xffffff, strokeAlpha: 0.35 })
      }
      const t = this.add
        .text(cx, y, label, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: filled ? '#25262e' : '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
        .setDepth(402)
      const z = this.add
        .zone(rect.x, rect.y, rect.w, rect.h)
        .setOrigin(0)
        .setDepth(402)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onTap)
      return [g, t, z]
    }
    this.pauseObjs = [
      this.add.rectangle(cx, cy, 6000, 6000, 0x000000, 0.6).setDepth(400),
      this.add
        .text(cx, cy - 116, '已暂停', {
          fontFamily: UI_FONT,
          fontSize: FONT.big,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: textRes(),
        })
        .setOrigin(0.5)
        .setDepth(401),
      ...button(cy + 8, '继 续', true, () => this.togglePause()),
      ...button(cy + 100, '结束本局', false, () => {
        endRun()
        this.arena.scene.start(SceneKey.Menu)
      }),
    ]
  }

  update(): void {
    this.updateSquad()
    const s = this.arena.hudSnapshot()
    this.updateFxIndicators(s.battleFx)
    if (s.xp !== this.last.xp || s.xpNext !== this.last.xpNext) this.drawXpBar(s)
    if (s.kills !== this.last.kills) this.killsText.setText(String(s.kills))
    if (s.coins !== this.last.coins) this.coinsText.setText(String(s.coins))
    const remainSec = Math.ceil(s.remainMs / 1000)
    const lastRemainSec = Math.ceil(this.last.remainMs / 1000)
    if (s.wave !== this.last.wave || remainSec !== lastRemainSec || s.seconds !== this.last.seconds) {
      this.timeText.setText(
        this.arena.sandbox ? formatTime(s.seconds) : `第${s.wave}波 ${formatTime(remainSec)}`,
      )
    }
    if (s.bossHp !== this.last.bossHp) this.drawBossBar(s)
    this.last = s
  }

  private drawBossBar(s: HudSnapshot): void {
    const g = this.bossBar
    g.clear()
    if (s.bossHp === null) return
    const w = 320
    const x = viewport.logicalWidth / 2 - w / 2
    const y = safeInsets.top + 56
    roundRect(g, x, y, w, 16, 8, { fill: 0x000000, fillAlpha: 0.55 })
    const ratio = Math.max(0, Math.min(1, s.bossHp / s.bossMaxHp))
    roundRect(g, x + 2, y + 2, Math.max(6, (w - 4) * ratio), 12, 6, { fill: 0xef5350 })
  }

  private onWaveWarning(w: WaveWarning): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight * 0.3
    playSfx('over')
    const wrapW = viewport.logicalWidth - 80
    const title = this.add
      .text(cx, cy, w.title, {
        fontFamily: UI_FONT,
        fontSize: FONT.banner,
        fontStyle: 'bold',
        color: '#ff8a80',
        stroke: '#2b0000',
        strokeThickness: 6,
        align: 'center',
        wordWrap: { width: wrapW },
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(226)
    const sub = this.add
      .text(cx, cy + 58, w.sub, {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        color: '#ffdc5d',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
        wordWrap: { width: wrapW },
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(226)
    title.setScale(0.5)
    this.tweens.add({ targets: title, scale: 1, duration: 300, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [title, sub],
      alpha: 0,
      delay: 2300,
      duration: 500,
      onComplete: () => {
        title.destroy()
        sub.destroy()
      },
    })
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

  private createSquad(s: SquadSnapshot, res: number): void {
    for (const b of this.squad) b.c.destroy()
    this.squadTrack?.destroy()
    this.squadCenter = this.squadCorner()
    const m = s.members.length - 1
    this.squadTrack = this.add.graphics().setDepth(299)
    if (m >= 2) {
      const g = this.squadTrack
      g.lineStyle((RING.r + 8) * 2, 0xffffff, 0.07)
      g.beginPath()
      g.arc(this.squadCenter.x, this.squadCenter.y, RING.radius, -Math.PI, -Math.PI / 2, false)
      g.strokePath()
    }
    let arc = 0
    this.squadArc = s.members.map((_, slot) => (slot === s.leaderSlot ? -1 : arc++))
    const label = {
      fontFamily: UI_FONT,
      fontSize: FONT.small,
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      resolution: res,
    }
    this.squad = s.members.map((member, slot) => {
      const isLeader = slot === s.leaderSlot
      const p = isLeader ? this.squadCenter : this.arcPoint(this.squadArc[slot]!, m)
      const base = this.add.circle(0, 0, RING.r, 0x000000, 0.38).setStrokeStyle(3, 0xffffff, 0.28)
      const emoji = emojiImage(this, 0, 0, isLeader ? member.skillIcon : member.emoji, RING.emoji, 'player')
      const hp = this.add.graphics()
      const cd = this.add.graphics()
      const cdText = this.add.text(0, 0, '', { ...label, color: '#ffdc5d' }).setOrigin(0.5).setVisible(false)
      const dead = this.add.text(0, 0, '', { ...label, color: '#ffcdd2' }).setOrigin(0.5).setVisible(false)
      const badge = emojiImage(this, -18, -18, member.emoji, 18, 'player').setVisible(isLeader)
      const c = this.add
        .container(p.x, p.y, [base, emoji, hp, cd, cdText, dead, badge])
        .setScale(isLeader ? RING.leaderScale : 1)
        .setDepth(isLeader ? 302 : 300)
        .setInteractive(new Phaser.Geom.Circle(0, 0, RING.r + 4), Phaser.Geom.Circle.Contains)
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.onIconDown(slot, pointer))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onIconUp(slot))
      return { c, base, emoji, badge, hp, cd, cdText, dead, shownHp: -1, shownSec: -1, shownCd: -1, shownState: 'ready' as IconState }
    })
    this.squadShown = { leader: s.leaderSlot, switching: false }
    this.squad.forEach((b, slot) => this.styleSquadIcon(b, s.members[slot]!, slot === s.leaderSlot, false))
  }

  private trySwitchLeader(slot: number): void {
    if (this.paused) return
    this.arena.switchLeader(slot)
  }

  /** 按住队长按钮开始瞄准，只对方向型技能有效 */
  private onIconDown(slot: number, pointer: Phaser.Input.Pointer): void {
    if (this.paused || slot !== this.squadShown.leader || this.aimPointer !== null) return
    const sk = this.arena.leaderSkill()
    if (!sk?.aim) return
    this.aimPointer = pointer.id
    this.aimOrigin = { x: pointer.worldX, y: pointer.worldY }
    this.aimDir = null
  }

  private onIconUp(slot: number): void {
    if (this.paused) return
    if (slot !== this.squadShown.leader) {
      this.trySwitchLeader(slot)
      return
    }
    // 瞄准中的抬起由 onAimUp 结算
    if (this.aimPointer !== null) return
    this.arena.castLeaderSkill(null)
  }

  private onAimMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.aimPointer) return
    const dx = pointer.worldX - this.aimOrigin.x
    const dy = pointer.worldY - this.aimOrigin.y
    const len = Math.hypot(dx, dy)
    this.aimDir = len >= AIM_DEADZONE ? { x: dx / len, y: dy / len } : null
    this.arena.setSkillAim(this.aimDir)
    this.drawAim()
  }

  /** 松手即释放：拖出了方向就朝那个方向，没拖出就当作点按 */
  private onAimUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.aimPointer) return
    this.aimPointer = null
    this.arena.castLeaderSkill(this.aimDir)
    this.aimDir = null
    this.arena.setSkillAim(null)
    this.drawAim()
  }

  private drawAim(): void {
    this.aimGfx ??= this.add.graphics().setDepth(305)
    const g = this.aimGfx
    g.clear()
    const d = this.aimDir
    if (!d) return
    const c = this.squadCenter
    const len = RING.radius * 0.8
    g.lineStyle(5, 0xffdc5d, 0.9)
    g.lineBetween(c.x, c.y, c.x + d.x * len, c.y + d.y * len)
    g.fillStyle(0xffdc5d, 0.9)
    g.fillCircle(c.x + d.x * len, c.y + d.y * len, 9)
  }

  /** 新队长滑到角落放大，旧队长缩小滑到他空出的弧上位置，时长与交接期一致 */
  private swapLeader(oldSlot: number, newSlot: number): void {
    const a = this.squad[oldSlot]
    const b = this.squad[newSlot]
    if (!a || !b) return
    const pos = this.squadArc[newSlot]!
    this.squadArc[newSlot] = -1
    this.squadArc[oldSlot] = pos
    const p = this.arcPoint(pos, this.squad.length - 1)
    const ms = handoverMs()
    b.c.setDepth(302)
    a.c.setDepth(300)
    this.tweens.killTweensOf([a.c, b.c])
    this.tweens.add({ targets: b.c, x: this.squadCenter.x, y: this.squadCenter.y, scale: RING.leaderScale, duration: ms, ease: 'Cubic.easeInOut' })
    this.tweens.add({ targets: a.c, x: p.x, y: p.y, scale: 1, duration: ms, ease: 'Cubic.easeInOut' })
  }

  private styleSquadIcon(b: SquadIcon, m: SquadMember, isLeader: boolean, switching: boolean): void {
    const dim = switching ? 0.55 : 1
    const state = stateOf(m)
    const dead = state === 'dead'
    b.base.setFillStyle(dead ? 0x3a0d0d : 0x000000, dead ? 0.85 : 0.38).setAlpha(dim)
    b.base.setStrokeStyle(3, dead ? 0xef5350 : 0xffffff, dead ? 0.9 : isLeader ? 0.6 : 0.28)
    b.emoji
      .setTexture(emojiKey(isLeader ? m.skillIcon : m.emoji, 'player'))
      .setDisplaySize(RING.emoji, RING.emoji)
      .setAlpha(dead ? 0.25 : dim)
    if (dead) b.emoji.setTint(0x777777)
    else b.emoji.clearTint()
    // 徽章：队长显示头像，阵亡显示骷髅，冷却中的队员显示技能图标
    const badge = dead ? '1f480' : isLeader ? m.emoji : state === 'cooling' ? m.skillIcon : null
    b.badge.setVisible(badge !== null).setAlpha(dim)
    if (badge !== null) b.badge.setTexture(emojiKey(badge, 'player')).setDisplaySize(18, 18)
    b.hp.setAlpha(dim).setVisible(!dead)
    b.dead.setVisible(dead)
    if (!dead) b.shownSec = -1
    if (state !== 'cooling') {
      b.cd.clear()
      b.cdText.setVisible(false)
      b.shownCd = -1
    }
  }

  private drawHpRing(b: SquadIcon, ratio: number): void {
    const g = b.hp
    const r = RING.r + 4
    g.clear()
    g.lineStyle(4, 0x000000, 0.45)
    g.beginPath()
    g.arc(0, 0, r, 0, Math.PI * 2, false)
    g.strokePath()
    if (ratio <= 0) return
    g.lineStyle(4, ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffdc5d : 0xef5350, 1)
    g.beginPath()
    g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false)
    g.strokePath()
  }

  /** 冷却扇形从十二点顺时针收拢，黄色数字；阵亡是红底浅红数字，两者不会同时出现 */
  private drawCooldown(b: SquadIcon, remainMs: number, cdMs: number): void {
    const sec = Math.ceil(remainMs / 1000)
    if (sec !== b.shownCd) {
      b.shownCd = sec
      b.cdText.setText(String(sec)).setVisible(true)
    }
    const ratio = cdMs > 0 ? remainMs / cdMs : 0
    const g = b.cd
    g.clear()
    g.fillStyle(0x000000, 0.6)
    g.slice(0, 0, RING.r - 1, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false)
    g.fillPath()
  }

  private updateSquad(): void {
    const s = this.arena.squadSnapshot()
    if (!s) return
    if (s.members.length !== this.squad.length) this.createSquad(s, textRes())
    const leaderChanged = s.leaderSlot !== this.squadShown.leader
    if (leaderChanged) this.swapLeader(this.squadShown.leader, s.leaderSlot)
    const switchChanged = s.switching !== this.squadShown.switching
    this.squadShown = { leader: s.leaderSlot, switching: s.switching }
    s.members.forEach((m, i) => {
      const b = this.squad[i]!
      const isLeader = i === s.leaderSlot
      const state = stateOf(m)
      if (leaderChanged || switchChanged || state !== b.shownState) {
        b.shownState = state
        this.styleSquadIcon(b, m, isLeader, s.switching)
      }
      if (state === 'dead') {
        if (m.reviveSec !== b.shownSec) {
          b.shownSec = m.reviveSec
          b.dead.setText(String(m.reviveSec))
        }
        return
      }
      if (state === 'cooling') this.drawCooldown(b, m.cdRemainMs, m.cdMs)
      else if (isLeader) b.base.setStrokeStyle(3, 0xffdc5d, 0.55 + 0.4 * Math.sin(this.time.now / 240))
      const ratio = m.max > 0 ? Math.max(0, Math.min(1, m.hp / m.max)) : 0
      if (Math.abs(ratio - b.shownHp) < 0.005) return
      b.shownHp = ratio
      this.drawHpRing(b, ratio)
    })
  }

  private onLeaderChanged(e: LeaderChanged): void {
    const t = emojiText(
      this,
      viewport.logicalWidth / 2,
      viewport.logicalHeight * 0.36,
      `{${e.emoji}} ${e.name} 接任队长`,
      {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: viewport.logicalWidth - 80 },
        resolution: textRes(),
      },
      { origin: 0.5 },
    )
      .setDepth(226)
      .setScale(0.6)
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 400, onComplete: () => t.destroy() })
  }

  private createFxIndicators(): void {
    this.fxIcons = []
    this.fxKey = ''
    this.fxBars = this.add.graphics().setDepth(121)
  }

  private updateFxIndicators(list: HudSnapshot['battleFx']): void {
    const x = safeInsets.left + 26
    const y0 = safeInsets.top + 52
    const step = 40
    const key = list.map((f) => `${f.emoji}${f.polarity}`).join(',')
    if (key !== this.fxKey) {
      this.fxKey = key
      for (const o of this.fxIcons) o.destroy()
      this.fxIcons = list.map((f, i) =>
        emojiImage(this, x, y0 + i * step, f.emoji, 34, 'player').setDepth(121),
      )
    }
    const g = this.fxBars
    if (!g) return
    g.clear()
    const barW = 34
    list.forEach((f, i) => {
      const by = y0 + i * step + 20
      const ratio = f.totalMs > 0 ? Math.max(0, Math.min(1, f.remainMs / f.totalMs)) : 0
      roundRect(g, x - barW / 2, by, barW, 5, 2, { fill: 0x000000, fillAlpha: 0.5 })
      roundRect(g, x - barW / 2 + 0.5, by + 0.5, Math.max(2, (barW - 1) * ratio), 4, 2, { fill: f.polarity === 'buff' ? 0x66bb6a : 0xef5350 })
    })
  }

  private onSkillCast(name: string): void {
    const t = emojiText(
      this,
      viewport.logicalWidth / 2,
      viewport.logicalHeight * 0.36,
      `{26a1} ${name}`,
      {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffdc5d',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: viewport.logicalWidth - 80 },
        resolution: textRes(),
      },
      { origin: 0.5 },
    )
      .setDepth(226)
      .setScale(0.6)
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() })
  }

  private onFieldCollected(fx: FieldCollected): void {
    const res = textRes()
    const buff = fx.polarity === 'buff'
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight * 0.42
    const title = emojiText(
      this,
      cx,
      cy,
      `{${fx.emoji}} ${fx.name}`,
      {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: buff ? '#b9f6ca' : '#ff9e9e',
        stroke: '#000000',
        strokeThickness: 5,
        resolution: res,
      },
      { origin: 0.5 },
    )
      .setDepth(226)
      .setScale(0.6)
    const sub = this.add
      .text(cx, cy + 32, `${buff ? '增益' : '减益'} · ${fx.desc}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: viewport.logicalWidth - 80 },
        resolution: res,
      })
      .setOrigin(0.5, 0)
      .setDepth(226)
    this.tweens.add({ targets: title, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [title, sub],
      alpha: 0,
      delay: 1600,
      duration: 450,
      onComplete: () => {
        title.destroy()
        sub.destroy()
      },
    })
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }

  private onWaveComplete(s: WaveSummary): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    this.add.rectangle(cx, cy, 6000, 6000, 0x000000, 0.55).setDepth(230)

    const title = this.add
      .text(cx, cy - 76, `第 ${s.wave} 波完成！`, {
        fontFamily: UI_FONT,
        fontSize: FONT.banner,
        fontStyle: 'bold',
        color: '#ffdc5d',
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(231)
    title.setScale(0.6)
    this.tweens.add({ targets: title, scale: 1, duration: 320, ease: 'Back.easeOut' })

    const lineStyle = { fontFamily: UI_FONT, fontSize: FONT.head, color: '#ffffff', resolution: res }
    iconLabel(this, cx - 140, cy + 12, '1f480', 37, `击杀 ${s.kills}`, lineStyle).setDepth(231)
    iconLabel(this, cx + 140, cy + 12, PICKUPS.coin.emoji, 37, `金币 +${s.coins}`, lineStyle).setDepth(231)

  }

  private drawXpBar(s: HudSnapshot): void {
    const x = safeInsets.left + 12
    const y = safeInsets.top + 12
    const g = this.xpBar
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRect(x, y, 200, 14)
    g.fillStyle(0x4dd0e1, 1)
    g.fillRect(x + 1, y + 1, 198 * Math.min(1, s.xp / s.xpNext), 12)
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
                { label: '波次完成', run: () => this.onWaveComplete({ wave: 1, kills: 12, coins: 34 }) },
              ],
            },
          ],
        },
      ],
    }
  }
}

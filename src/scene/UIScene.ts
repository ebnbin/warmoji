import Phaser from 'phaser'
import { CAPTAINS } from '../data/captains'
import { PICKUPS } from '../data/pickups'
import { formatTime } from '../util/format'
import { endRun, getRun } from '../run/state'
import { emojiImage } from '../emoji/hold'
import { emojiText, iconLabel } from '../ui/emojiText'
import { FONT, UI_FONT } from '../util/fonts'
import { Joystick } from '../ui/Joystick'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import type { FieldCollected, HudInput, HudSnapshot, LeaderChanged, SquadSnapshot, WaveSummary, WaveWarning } from '../run/hudHost'
import { activeHudHost, HudEvent, setActiveHudInput } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import { roundRect } from '../ui/shapes'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'

interface SquadButton {
  cx: number
  cy: number
  base: Phaser.GameObjects.Arc
  emoji: Phaser.GameObjects.Image
  ring: Phaser.GameObjects.Arc
  hp: Phaser.GameObjects.Graphics
  dead: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
  shownHp: number
  shownSec: number
  shownAlive: boolean
}

const SQUAD_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'] as const

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
  private skillBase?: Phaser.GameObjects.Arc
  private skillEmoji?: Phaser.GameObjects.Image
  private skillMask?: Phaser.GameObjects.Graphics
  private skillCdText?: Phaser.GameObjects.Text
  private skillRing?: Phaser.GameObjects.Arc
  private skillCenter = { x: 0, y: 0 }
  private skillEmojiScale = 1
  private skillWasReady = false
  private skillShownSec = -1
  private skillShownRatio = -1
  private fxIcons: Phaser.GameObjects.Image[] = []
  private fxBars?: Phaser.GameObjects.Graphics
  private fxKey = ''
  private squad: SquadButton[] = []
  private squadShown = { leader: -1, switching: false }

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

    this.createSkillButton(res)
    this.createFxIndicators()
    this.squad = []
    this.squadShown = { leader: -1, switching: false }
    SQUAD_KEYS.forEach((k, slot) => this.input.keyboard?.on(`keydown-${k}`, () => this.trySwitchLeader(slot)))

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
    this.updateSkillButton()
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

  private createSkillButton(res: number): void {
    const r = 55
    const cx = safeInsets.left + r + 24
    const cy = viewport.logicalHeight - safeInsets.bottom - r - 24
    this.skillCenter = { x: cx, y: cy }
    this.skillWasReady = false
    this.skillShownSec = -1
    this.skillShownRatio = -1
    this.skillBase = this.add
      .circle(cx, cy, r, 0x000000, 0.38)
      .setStrokeStyle(3, 0xffffff, 0.28)
      .setDepth(300)
    this.skillEmoji = emojiImage(this, cx, cy, CAPTAINS[getRun().captainId].emoji, 76, 'player').setDepth(301)
    this.skillEmojiScale = this.skillEmoji.scaleX
    this.skillMask = this.add.graphics().setDepth(302)
    this.skillCdText = this.add
      .text(cx, cy, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(303)
    this.skillRing = this.add
      .circle(cx, cy, r + 6, 0x000000, 0)
      .setStrokeStyle(3, 0xffdc5d, 0.9)
      .setDepth(303)
      .setVisible(false)
    this.add
      .zone(cx - r, cy - r, r * 2, r * 2)
      .setOrigin(0)
      .setDepth(304)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.tryCastSkill())
    this.input.keyboard?.on('keydown-E', () => this.tryCastSkill())
  }

  private tryCastSkill(): void {
    if (this.paused) return
    this.arena.castSkill()
  }

  private updateSkillButton(): void {
    if (!this.skillMask) return
    const sk = this.arena.skillSnapshot()
    if (!sk) return
    if (sk.remainMs > 0) {
      const remainSec = Math.ceil(sk.remainMs / 1000)
      const ratio = sk.cdMs > 0 ? sk.remainMs / sk.cdMs : 0
      if (this.skillWasReady || remainSec !== this.skillShownSec || Math.abs(ratio - this.skillShownRatio) > 0.01) {
        this.skillWasReady = false
        this.skillShownSec = remainSec
        this.skillShownRatio = ratio
        this.skillCdText?.setText(String(remainSec))
        this.skillEmoji?.setAlpha(0.4)
        this.skillRing?.setVisible(false)
        const g = this.skillMask
        g.clear()
        g.fillStyle(0x000000, 0.6)
        g.slice(this.skillCenter.x, this.skillCenter.y, 52, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false)
        g.fillPath()
      }
      return
    }
    if (!this.skillWasReady) {
      this.skillWasReady = true
      this.skillShownSec = -1
      this.skillMask.clear()
      this.skillCdText?.setText('')
      this.skillEmoji?.setAlpha(1)
      this.skillRing?.setVisible(true)
      const bump = (obj: Phaser.GameObjects.GameObject | undefined, base: number): void => {
        if (!obj) return
        this.tweens.add({
          targets: obj,
          scaleX: { from: base * 1.16, to: base },
          scaleY: { from: base * 1.16, to: base },
          duration: 260,
          ease: 'Back.easeOut',
        })
      }
      bump(this.skillBase, 1)
      bump(this.skillEmoji, this.skillEmojiScale)
    }
    this.skillRing?.setAlpha(0.5 + 0.4 * Math.sin(this.time.now / 240))
  }

  private createSquad(s: SquadSnapshot, res: number): void {
    for (const b of this.squad) for (const o of [b.base, b.emoji, b.ring, b.hp, b.dead, b.zone]) o.destroy()
    this.squad = []
    this.squadShown = { leader: -1, switching: false }
    const n = s.members.length
    const r = 27
    const w = viewport.logicalWidth
    const { left: sL, right: sR, bottom: sB } = safeInsets
    // 技能按钮占着左下角：整排居中放不下就整体右移，再不够就收紧间距
    const skillRight = sL + 55 * 2 + 24 + 16
    const rightEdge = w - sR - 16
    let step = 62
    if (n * step > rightEdge - skillRight) step = Math.max(46, Math.floor((rightEdge - skillRight) / n))
    const x0 = Math.max(skillRight, w / 2 - (n * step) / 2)
    const cy = viewport.logicalHeight - sB - 46
    s.members.forEach((m, slot) => {
      const cx = x0 + step * slot + step / 2
      const base = this.add.circle(cx, cy, r, 0x000000, 0.38).setStrokeStyle(3, 0xffffff, 0.28).setDepth(300)
      const emoji = emojiImage(this, cx, cy, m.emoji, 40, 'player').setDepth(301)
      const ring = this.add.circle(cx, cy, r + 5, 0x000000, 0).setStrokeStyle(4, 0xffdc5d, 0.95).setDepth(302).setVisible(false)
      const hp = this.add.graphics().setDepth(302)
      const dead = this.add
        .text(cx, cy, '', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
          resolution: res,
        })
        .setOrigin(0.5)
        .setDepth(303)
        .setVisible(false)
      const zone = this.add
        .zone(cx - step / 2, cy - r - 10, step, r * 2 + 30)
        .setOrigin(0)
        .setDepth(304)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.trySwitchLeader(slot))
      this.squad.push({ cx, cy, base, emoji, ring, hp, dead, zone, shownHp: -1, shownSec: -1, shownAlive: true })
    })
  }

  private trySwitchLeader(slot: number): void {
    if (this.paused) return
    this.arena.switchLeader(slot)
  }

  private styleSquadButton(b: SquadButton, alive: boolean, isLeader: boolean, switching: boolean): void {
    const dim = switching ? 0.55 : 1
    const size = isLeader ? 48 : 40
    b.base.setAlpha(dim).setStrokeStyle(3, 0xffffff, isLeader ? 0.6 : 0.28)
    b.emoji.setAlpha(alive ? dim : 0.3 * dim).setDisplaySize(size, size)
    b.ring.setVisible(isLeader).setAlpha(dim)
    b.hp.setVisible(alive).setAlpha(dim)
    b.dead.setVisible(!alive)
  }

  private drawSquadHp(b: SquadButton, ratio: number): void {
    const g = b.hp
    const w = 44
    const x = b.cx - w / 2
    const y = b.cy + 30
    g.clear()
    roundRect(g, x, y, w, 6, 3, { fill: 0x000000, fillAlpha: 0.55 })
    roundRect(g, x + 1, y + 1, Math.max(2, (w - 2) * ratio), 4, 2, {
      fill: ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffdc5d : 0xef5350,
    })
  }

  private updateSquad(): void {
    const s = this.arena.squadSnapshot()
    if (!s) return
    if (s.members.length !== this.squad.length) this.createSquad(s, textRes())
    const leaderChanged = s.leaderSlot !== this.squadShown.leader
    const switchChanged = s.switching !== this.squadShown.switching
    this.squadShown = { leader: s.leaderSlot, switching: s.switching }
    s.members.forEach((m, i) => {
      const b = this.squad[i]!
      const aliveChanged = m.alive !== b.shownAlive
      if (leaderChanged || switchChanged || aliveChanged) {
        b.shownAlive = m.alive
        this.styleSquadButton(b, m.alive, i === s.leaderSlot, s.switching)
      }
      if (!m.alive && m.reviveSec !== b.shownSec) {
        b.shownSec = m.reviveSec
        b.dead.setText(String(m.reviveSec))
      }
      const ratio = m.max > 0 ? Math.max(0, Math.min(1, m.hp / m.max)) : 0
      if (Math.abs(ratio - b.shownHp) < 0.005) return
      b.shownHp = ratio
      this.drawSquadHp(b, ratio)
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

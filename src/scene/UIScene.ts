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
import type { HudInput, HudSnapshot, WaveSummary } from '../run/hudHost'
import { activeHudHost, setActiveHudInput } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import { roundRect } from '../ui/shapes'

export class UIScene extends Phaser.Scene implements HudInput {
  private joystick?: Joystick
  private xpBar!: Phaser.GameObjects.Graphics
  private timeText!: Phaser.GameObjects.Text
  private bossBar!: Phaser.GameObjects.Graphics
  private killsText!: Phaser.GameObjects.Text
  private coinsText!: Phaser.GameObjects.Text
  private last!: HudSnapshot
  private paused = false
  private pauseObjs: Phaser.GameObjects.GameObject[] = []
  // 队长技能按钮
  private skillBase?: Phaser.GameObjects.Arc
  private skillEmoji?: Phaser.GameObjects.Image
  private skillMask?: Phaser.GameObjects.Graphics
  private skillCdText?: Phaser.GameObjects.Text
  private skillRing?: Phaser.GameObjects.Arc
  private skillCenter = { x: 0, y: 0 }
  /** setDisplaySize 后的小数 scale，弹跳按它做相对缩放 */
  private skillEmojiScale = 1
  private skillWasReady = false
  private skillShownSec = -1
  private skillShownRatio = -1
  // 战场拾取效果指示
  private fxIcons: Phaser.GameObjects.Image[] = []
  private fxBars?: Phaser.GameObjects.Graphics
  private fxKey = ''

  constructor() {
    super('ui')
  }

  get moveVector(): { x: number; y: number } {
    return this.joystick?.vector ?? { x: 0, y: 0 }
  }

  /** 宿主在 create 里登记且先于 scene.launch('ui')，此处必已就位 */
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
      level: -1,
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
      .on('pointerup', () => this.togglePause())
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.paused) this.togglePause()
    })

    this.createSkillButton(res)
    this.createFxIndicators()

    const arenaEvents = this.arena.events
    arenaEvents.on('wave-complete', this.onWaveComplete, this)
    arenaEvents.on('wave-warning', this.onWaveWarning, this)
    arenaEvents.on('skill-cast', this.onSkillCast, this)
    arenaEvents.on('field-collected', this.onFieldCollected, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      arenaEvents.off('wave-complete', this.onWaveComplete, this)
      arenaEvents.off('wave-warning', this.onWaveWarning, this)
      arenaEvents.off('skill-cast', this.onSkillCast, this)
      arenaEvents.off('field-collected', this.onFieldCollected, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      setActiveHudInput(undefined)
    })

    if (this.arena.scene.isPaused()) {
      this.paused = true
      this.showPauseOverlay()
    }
  }

  // ── 暂停 ────────────────────────────────────────────────────

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
        .on('pointerup', onTap)
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
        this.arena.scene.start('menu')
      }),
    ]
  }

  update(): void {
    this.updateSkillButton()
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

  private onWaveWarning(w: { title: string; sub: string }): void {
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

  // ── 队长主动技能按钮（左下角）────────────────────────────────

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
      .on('pointerup', () => this.tryCastSkill())
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
      // emoji 的 scale 是小数，弹跳须相对基准缩放，不能 tween 到绝对 1
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

  // ── 战场拾取效果指示（左上角，经验条下方竖排）───────────────

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

  private onFieldCollected(fx: {
    emoji: string
    name: string
    desc: string
    polarity: 'buff' | 'debuff'
  }): void {
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
    if (s.levels > 0) {
      iconLabel(this, cx, cy + 72, '1fad8', 35, `能量豆 +${s.levels}（队长技能弹药）`, {
        ...lineStyle,
        fontSize: FONT.body,
        color: '#b3e5fc',
      }).setDepth(231)
    }
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
}

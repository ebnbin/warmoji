import Phaser from 'phaser'
import { CAPTAINS } from '../captains/registry'
import { SKILL } from '../captains/skill'
import { PICKUPS } from '../pickups/registry'
import { formatTime } from '../core/format'
import { RARITIES } from '../items/registry'
import type { ItemRarity } from '../items/registry'
import { endRun, getRun } from '../run/state'
import { isDevOpen, isStress, setDevOpen, setStress } from '../debug/dev'
import { heapMB, rafHz, rendererInfo, startRafMeter } from '../debug/diagnostics'
import { emojiCacheStats, emojiImage, emojiText, iconLabel } from '../emoji/textures'
import { FONT, UI_FONT } from '../core/fonts'
import { Joystick } from '../core/Joystick'
import { playSfx } from '../audio/sfx'
import {
  applyCamera,
  isStandalone,
  safeInsets,
  textRes,
  viewport,
  VIEWPORT_CHANGED,
} from '../core/apply'
import type { BaseArenaScene, HudSnapshot, WaveSummary } from './BaseArenaScene'

// 屏幕层：HUD、虚拟摇杆、升级提示、结算界面。
// 与 ArenaScene 并行运行，相机静止不随地图滚动，坐标即逻辑视口坐标。
export class UIScene extends Phaser.Scene {
  private joystick?: Joystick
  private xpBar!: Phaser.GameObjects.Graphics
  private levelText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private bossBar!: Phaser.GameObjects.Graphics
  private killsText!: Phaser.GameObjects.Text
  private coinsText!: Phaser.GameObjects.Text
  private last!: HudSnapshot
  private devText?: Phaser.GameObjects.Text
  private fpsWindowMin = Infinity
  private frameMaxMs = 0
  private fpsWindowStart = 0
  private devRefreshedAt = 0
  private paused = false
  private pauseObjs: Phaser.GameObjects.GameObject[] = []
  /** 在场的开箱横幅数：连开多箱时逐条下移错位 */
  private chestBanners = 0
  // 队长技能按钮（左下角）：底圆 + 队长头像 + 冷却扇形暗罩 + 秒数 + 就绪光圈
  private skillBase?: Phaser.GameObjects.Arc
  private skillEmoji?: Phaser.GameObjects.Image
  private skillMask?: Phaser.GameObjects.Graphics
  private skillCdText?: Phaser.GameObjects.Text
  private skillRing?: Phaser.GameObjects.Arc
  private skillCenter = { x: 0, y: 0 }
  /** 队长头像的基准缩放（emojiImage 经 setDisplaySize 得到的小数 scale） */
  private skillEmojiScale = 1
  private skillWasReady = false
  private skillShownSec = -1
  private skillShownRatio = -1
  /** 按钮下缘的能量豆点（亮 = 持有） */
  private skillBeanDots?: Phaser.GameObjects.Graphics
  private skillShownBeans = -1

  /** 当前战斗场景 key：四套竞技场（有界/无界/河流/虚空）互斥运行，本场景只跟随其一 */
  private arenaKey: 'arena' | 'arenaInfinite' | 'arenaRiver' | 'arenaVoid' = 'arena'

  constructor() {
    super('ui')
  }

  /** 启动时探测哪个竞技场在跑（含暂停中——视口变化会带着暂停态重启本场景）。
   * 用运行状态而非 launch 传参：场景 data 会跨局残留，探测永不脏 */
  init(): void {
    const running = (['arenaInfinite', 'arenaRiver', 'arenaVoid'] as const).find(
      (k) => this.scene.isActive(k) || this.scene.isPaused(k),
    )
    this.arenaKey = running ?? 'arena'
  }

  get joystickVector(): { x: number; y: number } {
    return this.joystick?.vector ?? { x: 0, y: 0 }
  }

  private get arena(): BaseArenaScene {
    return this.scene.get(this.arenaKey) as BaseArenaScene
  }

  create(): void {
    applyCamera(this)
    const res = textRes()
    const w = viewport.logicalWidth
    // 全屏贴边的 HUD 须避开刘海/状态栏/Home 条
    const { top: sT, right: sR, left: sL } = safeInsets
    this.last = {
      xp: -1,
      xpNext: -1,
      level: -1,
      beans: -1,
      kills: -1,
      coins: -1,
      wave: -1,
      seconds: -1,
      remainMs: -1,
      over: false,
      bossHp: null,
      bossMaxHp: 1,
    }

    this.joystick = new Joystick(this)

    this.xpBar = this.add.graphics()
    this.bossBar = this.add.graphics().setDepth(120)
    // 深色字 + 白描边：浅色地图与暗色背景（相机贴边时）上都可读
    const hudText = {
      fontFamily: UI_FONT,
      color: '#2b2b33',
      stroke: '#ffffff',
      strokeThickness: 3,
      resolution: res,
    }
    // 能量豆计数放在经验条下方（经验条 = 下一颗豆的攒取进度）
    emojiImage(this, sL + 24, sT + 44, '1fad8', 30, 'player')
    this.levelText = this.add.text(sL + 40, sT + 32, '0/3', { ...hudText, fontSize: FONT.body })
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

    // 暂停：按钮或 ESC；已暂停或已结算时按钮行为由 togglePause 把关
    emojiImage(this, w - sR - 26, sT + 112, '23f8', 48)
      .setDepth(300)
      .setAlpha(0.85)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.togglePause())
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.paused) this.togglePause()
    })

    const wrench = emojiImage(
      this,
      w - sR - 12,
      viewport.logicalHeight - safeInsets.bottom - 26,
      '1f527',
      40,
    )
      .setOrigin(1, 1)
      .setDepth(300)
      .setAlpha(0.45)
      .setInteractive({ useHandCursor: true })
    wrench.on('pointerdown', () => {
      if (this.paused) return
      setDevOpen(!isDevOpen())
      this.scene.restart()
    })
    if (isDevOpen()) this.createDevPanel(res)

    this.createSkillButton(res)

    const arenaEvents = this.arena.events
    arenaEvents.on('wave-complete', this.onWaveComplete, this)
    arenaEvents.on('wave-warning', this.onWaveWarning, this)
    arenaEvents.on('skill-cast', this.onSkillCast, this)
    arenaEvents.on('chest-open', this.onChestOpen, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      arenaEvents.off('wave-complete', this.onWaveComplete, this)
      arenaEvents.off('wave-warning', this.onWaveWarning, this)
      arenaEvents.off('skill-cast', this.onSkillCast, this)
      arenaEvents.off('chest-open', this.onChestOpen, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      // devText 在 SHUTDOWN 里随场景对象一起销毁；清引用，否则关闭 dev 后
      // restart 不重建面板，update 仍对已销毁的 Text 调 setText → 渲染撞空 → 卡死
      this.devText = undefined
    })

    // 视口变化会重启本场景：恢复暂停浮层
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
      const g = this.add.graphics().setDepth(251)
      if (filled) {
        g.fillStyle(0xffd54f, 1)
        g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 36)
      } else {
        g.fillStyle(0xffffff, 0.12)
        g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 36)
        g.lineStyle(1, 0xffffff, 0.35)
        g.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 36)
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
        .setDepth(252)
      const z = this.add
        .zone(rect.x, rect.y, rect.w, rect.h)
        .setOrigin(0)
        .setDepth(252)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', onTap)
      return [g, t, z]
    }
    this.pauseObjs = [
      this.add.rectangle(cx, cy, 6000, 6000, 0x000000, 0.6).setDepth(250),
      this.add
        .text(cx, cy - 116, '已暂停', {
          fontFamily: UI_FONT,
          fontSize: FONT.big,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: textRes(),
        })
        .setOrigin(0.5)
        .setDepth(251),
      ...button(cy + 8, '继 续', true, () => this.togglePause()),
      ...button(cy + 100, '结束本局', false, () => {
        endRun()
        this.arena.scene.start('menu')
      }),
    ]
  }

  update(time: number): void {
    if (this.devText) this.updateDevPanel(time)
    this.updateSkillButton()
    const s = this.arena.hudSnapshot()
    if (s.xp !== this.last.xp || s.xpNext !== this.last.xpNext) this.drawXpBar(s)
    if (s.beans !== this.last.beans) {
      this.levelText.setText(`${s.beans}/${SKILL.maxBeans}`)
      this.levelText.setColor(s.beans >= SKILL.maxBeans ? '#f9a825' : '#2b2b33')
    }
    if (s.kills !== this.last.kills) this.killsText.setText(String(s.kills))
    if (s.coins !== this.last.coins) this.coinsText.setText(String(s.coins))
    // 常规显示本波倒计时；压测模式无波次限时，显示已进行时间
    const remainSec = Math.ceil(s.remainMs / 1000)
    const lastRemainSec = Math.ceil(this.last.remainMs / 1000)
    if (s.wave !== this.last.wave || remainSec !== lastRemainSec || s.seconds !== this.last.seconds) {
      this.timeText.setText(
        isStress() ? formatTime(s.seconds) : `第${s.wave}波 ${formatTime(remainSec)}`,
      )
    }
    if (s.bossHp !== this.last.bossHp) this.drawBossBar(s)
    this.last = s
  }

  /** 终波 Boss 血条：波次计时下方居中的红条 */
  private drawBossBar(s: HudSnapshot): void {
    const g = this.bossBar
    g.clear()
    if (s.bossHp === null) return
    const w = 320
    const x = viewport.logicalWidth / 2 - w / 2
    const y = safeInsets.top + 56
    g.fillStyle(0x000000, 0.55)
    g.fillRoundedRect(x, y, w, 16, 8)
    const ratio = Math.max(0, Math.min(1, s.bossHp / s.bossMaxHp))
    g.fillStyle(0xef5350, 1)
    g.fillRoundedRect(x + 2, y + 2, Math.max(6, (w - 4) * ratio), 12, 6)
  }

  /** 节点波警示横幅：短暂弹出后淡出（精英潮 / Boss 登场） */
  private onWaveWarning(w: { title: string; sub: string }): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight * 0.3
    playSfx('over')
    const title = this.add
      .text(cx, cy, w.title, {
        fontFamily: UI_FONT,
        fontSize: FONT.banner,
        fontStyle: 'bold',
        color: '#ff8a80',
        stroke: '#2b0000',
        strokeThickness: 6,
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(226)
    const sub = this.add
      .text(cx, cy + 58, w.sub, {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        color: '#ffd54f',
        stroke: '#000000',
        strokeThickness: 4,
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
    // 压测模式无技能（阵容不来自 run），不渲染按钮
    if (!this.arena.skillSnapshot()) return
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
      .setStrokeStyle(3, 0xffd54f, 0.9)
      .setDepth(303)
      .setVisible(false)
    this.skillBeanDots = this.add.graphics().setDepth(303)
    this.skillShownBeans = -1
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

  /** 按钮下缘的豆点：亮点 = 可用弹药（豆数变化才重绘） */
  private drawBeanDots(beans: number): void {
    if (!this.skillBeanDots || beans === this.skillShownBeans) return
    this.skillShownBeans = beans
    const g = this.skillBeanDots
    g.clear()
    const total = SKILL.maxBeans
    const gap = 20
    const y = this.skillCenter.y + 66
    for (let i = 0; i < total; i++) {
      const x = this.skillCenter.x + (i - (total - 1) / 2) * gap
      if (i < beans) {
        g.fillStyle(0xffd54f, 1)
        g.fillCircle(x, y, 6)
      } else {
        g.fillStyle(0x000000, 0.4)
        g.fillCircle(x, y, 6)
        g.lineStyle(1.5, 0xffffff, 0.4)
        g.strokeCircle(x, y, 6)
      }
    }
  }

  /** 逐帧刷新按钮状态：冷却中扇形暗罩（脏检查）；CD 好但无豆置灰；
   * 双满就绪时光圈呼吸 */
  private updateSkillButton(): void {
    if (!this.skillMask) return
    const sk = this.arena.skillSnapshot()
    if (!sk) return
    this.drawBeanDots(sk.beans)
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
        // 剩余冷却的扇形暗罩：从 12 点起顺时针，随充能收缩
        const g = this.skillMask
        g.clear()
        g.fillStyle(0x000000, 0.6)
        g.slice(this.skillCenter.x, this.skillCenter.y, 52, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false)
        g.fillPath()
      }
      return
    }
    if (!sk.ready) {
      // CD 已转好但没有豆：无罩置灰，等经验升级喂弹
      if (this.skillWasReady || this.skillShownSec !== 0) {
        this.skillWasReady = false
        this.skillShownSec = 0
        this.skillShownRatio = -1
        this.skillMask.clear()
        this.skillCdText?.setText('')
        this.skillEmoji?.setAlpha(0.55)
        this.skillRing?.setVisible(false)
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
      // 就绪弹跳提示（各自按基准缩放做相对弹跳：emoji 的原生 scale 是小数，
      // 不能 tween 到绝对 1）
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

  /** 开箱横幅：道具名按稀有度着色 + 归属；位置比技能横幅低一档避免叠字。
   * 连开多箱（精英潮 AOE）按在场横幅数逐条下移，不互相糊字 */
  private onChestOpen(loot: { emoji: string; name: string; rarity: ItemRarity; owner: string }): void {
    this.chestBanners += 1
    const t = emojiText(
      this,
      viewport.logicalWidth / 2,
      viewport.logicalHeight * 0.46 + (this.chestBanners - 1) * 44,
      `{${loot.emoji}} ${loot.name} → ${loot.owner}`,
      {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: RARITIES[loot.rarity].color,
        stroke: '#000000',
        strokeThickness: 5,
        resolution: textRes(),
      },
      { origin: 0.5 },
    )
      .setDepth(226)
      .setScale(0.6)
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 1500,
      duration: 400,
      onComplete: () => {
        t.destroy()
        this.chestBanners = Math.max(0, this.chestBanners - 1)
      },
    })
  }

  /** 技能释放横幅：技能名短暂弹出（比波次警示小一号、更快收场） */
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
        color: '#ffd54f',
        stroke: '#000000',
        strokeThickness: 5,
        resolution: textRes(),
      },
      { origin: 0.5 },
    )
      .setDepth(226)
      .setScale(0.6)
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() })
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }

  private createDevPanel(res: number): void {
    startRafMeter()
    this.fpsWindowMin = Infinity
    this.frameMaxMs = 0
    this.fpsWindowStart = 0
    this.devRefreshedAt = 0
    const h = viewport.logicalHeight
    const stressBtn = this.add
      .text(safeInsets.left + 12, h - safeInsets.bottom - 12, `压测模式：${isStress() ? '开' : '关'}（点击切换）`, {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffffff',
        backgroundColor: isStress() ? '#2e7d32' : '#c62828',
        padding: { x: 10, y: 6 },
        resolution: textRes(),
      })
      .setOrigin(0, 1)
      .setDepth(300)
      .setInteractive({ useHandCursor: true })
    stressBtn.on('pointerdown', () => {
      setStress(!isStress())
      this.arena.scene.restart()
    })
    this.devText = this.add
      .text(safeInsets.left + 12, h - safeInsets.bottom - 12 - stressBtn.height - 8, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 8, y: 6 },
        lineSpacing: 4,
        resolution: res,
      })
      .setOrigin(0, 1)
      .setDepth(300)
      .setAlpha(0.88)
  }

  private updateDevPanel(time: number): void {
    const fps = this.game.loop.actualFps
    const rawDelta = this.game.loop.rawDelta
    if (time - this.fpsWindowStart > 5000) {
      this.fpsWindowStart = time
      this.fpsWindowMin = fps
      this.frameMaxMs = rawDelta
    } else {
      if (fps < this.fpsWindowMin) this.fpsWindowMin = fps
      if (rawDelta > this.frameMaxMs) this.frameMaxMs = rawDelta
    }
    if (time - this.devRefreshedAt < 250) return
    this.devRefreshedAt = time
    const p = this.arena.perfSnapshot()
    const cache = emojiCacheStats(this)
    const raf = rafHz()
    const heap = heapMB()
    const vp = viewport
    const gl = rendererInfo(this.game)
    this.devText!.setText([
      `FPS ${fps.toFixed(0)}（5s低 ${Number.isFinite(this.fpsWindowMin) ? this.fpsWindowMin.toFixed(0) : '-'}）· rAF ${raf > 0 ? raf : '-'}`,
      `帧峰值 ${this.frameMaxMs.toFixed(0)}ms${heap === undefined ? '' : ` · 内存 ${heap}MB`}`,
      `敌人 ${p.enemies} · 预告 ${p.pending} · 子弹 ${p.projectiles} · 金币 ${p.coins}`,
      `对象 ${p.objects} · 物理体 ${p.bodies} · emoji纹理 ${cache.textures}（固定 ${cache.pinned}）`,
      `难度 t ${p.combatSec}s · 刷怪 ${p.spawnIntervalMs}ms · 血量 ×${p.hpMultiplier.toFixed(2)}`,
      `视口 ${Math.round(vp.logicalWidth)}×${Math.round(vp.logicalHeight)} ×${vp.fitScale.toFixed(2)} · DPR ${vp.dpr} · 画布 ${Math.round(vp.cssWidth * vp.dpr)}×${Math.round(vp.cssHeight * vp.dpr)}`,
      `inner ${window.innerWidth}×${window.innerHeight} · screen ${screen.width}×${screen.height} · 安全区 ${Math.round(safeInsets.top)}/${Math.round(safeInsets.right)}/${Math.round(safeInsets.bottom)}/${Math.round(safeInsets.left)}${isStandalone() ? ' · PWA' : ''}`,
      gl.length > 54 ? `${gl.slice(0, 53)}…` : gl,
    ])
  }

  /** 波末结算横幅：冻结期展示本波战果，随场景切换自然销毁 */
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
        color: '#ffd54f',
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

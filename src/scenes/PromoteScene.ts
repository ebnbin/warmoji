import Phaser from 'phaser'
import type { CharacterId } from '../core/config'
import { CAPTAINS, CHARACTERS } from '../core/config'
import { formationPosts } from '../core/formation'
import type { ItemId } from '../core/items'
import { arenaSceneFor } from '../core/maps'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import {
  endRun,
  getRun,
  guardCenter,
  guardOrder,
  isTeamFull,
  promoteStep,
  recruitCandidates,
  recruitMember,
  setGuardCenter,
} from '../core/run'
import type { RunState } from '../core/run'
import { characterStatGroups } from '../core/stats'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage } from '../ui/emoji'
import { EmojiGrid } from '../ui/grid'
import { FONT, UI_FONT } from '../ui/fonts'
import { playSfx } from '../ui/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 整编页：每波战斗前的强制招募 + 阵型页。开局组队与波末整编完全复用本页：
// 队长确认后进来招首发（可返回重选队长），此后每波结束固定招 1 人直到满编
//（不可跳过、无其他招募途径）。招募完成后——首次满员额外展示一次阵型页
//（formation 模式：满员自动 N 保 1，玩家点选受保护的中心），此后阵型调整走
// 商店的常驻入口（fromShop，商店睡眠等待返回）。
interface PromoteLayout {
  content: { w: number; h: number }
  headerY: number
  stepY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: PromoteLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  stepY: 96,
  detail: { x: 40, y: 132, w: 730, h: 484 },
  list: { x: 810, y: 132, w: 430, h: 484 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: PromoteLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  stepY: 106,
  detail: { x: 24, y: 144, w: 672, h: 460 },
  list: { x: 24, y: 628, w: 672, h: 470 },
  btn: { y: 1184, w: 360, h: 72 },
}

/** 阵型预览外圈的缓慢顺时针环绕转速（rad/s，纯装饰） */
const PREVIEW_SPIN = 0.18

export class PromoteScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/选中等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private mode: 'recruit' | 'formation' = 'recruit'
  /** recruit 模式的当前选中候选角色 id */
  private selectedKey = ''
  /** 从商店进入的阵型调整（商店睡眠中，退出时唤醒） */
  private fromShop = false
  /** 中心互换动画播放中，忽略输入 */
  private swapBusy = false
  private layout!: PromoteLayout
  private origin = { x: 0, y: 0 }
  private grid?: EmojiGrid
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private formationObjs: Phaser.GameObjects.GameObject[] = []
  private memberImgs: Phaser.GameObjects.Image[] = []
  private memberZones: Phaser.GameObjects.Zone[] = []
  private memberRects: { id: string; x: number; y: number; w: number; h: number }[] = []
  /** 预览外圈的环绕相位与几何（update 逐帧推进） */
  private previewPhase = 0
  private previewGeom = { cx: 0, cy: 0, scale: 1 }
  private reportTimer = 0
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private backRect = { x: 0, y: 0, w: 0, h: 0 }
  private quitArmed = false

  constructor() {
    super('promote')
  }

  init(data?: { fromShop?: boolean }): void {
    // Phaser 的 scene.start 不传 data 时会沿用上一次的 data——只有商店确实在
    // 沉睡等待（阵型入口打开）时才认 fromShop，防脏标记把正常整编顶成阵型页
    this.fromShop = !!data?.fromShop && this.scene.isSleeping('shop')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.run = getRun()
    this.detailObjs = []
    this.formationObjs = []
    this.grid = undefined
    this.quitArmed = false
    this.swapBusy = false

    const resolved = this.resolveMode()
    if (!resolved) {
      // 点数结清且无阵型页可展示：直接去下一站
      this.scene.start(this.nextScene())
      return
    }
    this.mode = resolved
    // 首次满员的阵型页只自动展示这一次
    if (this.mode === 'formation' && !this.fromShop) this.run.formationIntroduced = true
    if (this.mode !== 'formation' && (!preserved || !this.validSelection())) {
      this.selectedKey = this.defaultSelection()
    }

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = this.origin.y

    this.add
      .text(
        w / 2,
        oy + L.headerY,
        this.mode === 'formation' ? '布置阵型' : this.isInitial() ? '组建队伍' : '队伍整编',
        {
          fontFamily: UI_FONT,
          fontSize: FONT.title,
          fontStyle: 'bold',
          color: '#f5f5f5',
          resolution: res,
        },
      )
      .setOrigin(0.5)

    if (this.fromShop) {
      // 商店入口：返回即唤醒沉睡的商店（货架/金币/免费刷新原样保留）
      const back = this.add
        .text(this.origin.x + 40, oy + L.headerY, '← 返回商店', {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#c8c8d4',
          resolution: res,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
      back.on('pointerup', () => this.exitToShop())
      this.backRect = { x: back.x, y: back.y - back.height / 2, w: back.width, h: back.height }
      this.input.keyboard?.on('keydown-ESC', () => this.exitToShop())
    } else if (this.isInitial()) {
      // 开局组队：可反悔，返回重选队长（本局作废）
      const back = this.add
        .text(this.origin.x + 40, oy + L.headerY, '← 返回', {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#c8c8d4',
          resolution: res,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
      back.on('pointerup', () => {
        if (this.grid?.wasDragged) return
        endRun()
        this.scene.start('captain')
      })
      this.backRect = { x: back.x, y: back.y - back.height / 2, w: back.width, h: back.height }
      this.input.keyboard?.on('keydown-ESC', () => {
        endRun()
        this.scene.start('captain')
      })
    } else {
      // 波末整编：队长不可重选，只能结束本局（二次点击确认，防误触弃局）
      const quit = this.add
        .text(this.origin.x + 40, oy + L.headerY, '✕ 结束', {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#c8c8d4',
          resolution: res,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
      quit.on('pointerup', () => {
        if (this.grid?.wasDragged) return
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
      this.backRect = { x: quit.x, y: quit.y - quit.height / 2, w: quit.width, h: quit.height }
    }

    // 步骤说明：剩余点数 + 当前环节要做的事
    this.add
      .text(w / 2, oy + L.stepY, this.stepBanner(), {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        fontStyle: 'bold',
        color: '#b3e5fc',
        resolution: res,
      })
      .setOrigin(0.5)

    // 详情面板底板（两种模式共用同一块区域）
    const D = L.detail
    const dx = this.origin.x + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)

    if (this.mode !== 'formation') {
      // 候选网格
      this.grid = new EmojiGrid(this, {
        x: this.origin.x + L.list.x,
        y: oy + L.list.y,
        w: L.list.w,
        h: L.list.h,
      })
      this.grid.onTap = (key): void => {
        playSfx('click')
        this.selectedKey = key
        this.refresh()
      }
      this.grid.setItems(this.buildItems())
    }

    // 确认按钮
    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btn.y - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    const b = this.btnRect
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0x81d4fa, 1)
    btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.add
      .text(w / 2, oy + L.btn.y, this.confirmLabel(), {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#17323f',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.grid?.wasDragged) this.confirm()
      })
    this.input.keyboard?.on('keydown-ENTER', () => this.confirm())
    this.input.keyboard?.on('keydown-SPACE', () => this.confirm())

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

    if (this.mode === 'formation') {
      this.rebuildFormation()
    } else {
      this.refresh()
    }

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  /** 开局组队（首波开战前）还是波末整编：首波 = 队长的开局波次（可跳波） */
  private isInitial(): boolean {
    return this.run.wave === CAPTAINS[this.run.captainId].startWave
  }

  /** 点数花完后的去向：开局看队长 firstWaveShop（默认直接开战），波末必进商店 */
  private nextScene(): 'arena' | 'arenaInfinite' | 'arenaRiver' | 'arenaVoid' | 'shop' {
    if (this.isInitial() && !CAPTAINS[this.run.captainId].firstWaveShop) {
      return arenaSceneFor(this.run.mapId)
    }
    return 'shop'
  }

  /** 当前环节：商店入口直达阵型页；否则本波有名额必须招募，
   * 首次满员再补一次阵型页，无事可办返回 null（直接去下一站） */
  private resolveMode(): 'recruit' | 'formation' | null {
    if (this.fromShop) return 'formation'
    const step = promoteStep(this.run)
    if (step) return step
    if (isTeamFull(this.run) && !this.run.formationIntroduced) return 'formation'
    return null
  }

  private stepBanner(): string {
    if (this.mode === 'recruit') return '本波招募名额 · 必须选一名新队员入队'
    if (this.fromShop) return '点选一名队员，与中心互换'
    return '满员自动列阵 N 保 1 · 点选队员设为受保护的中心'
  }

  private confirmLabel(): string {
    if (this.mode === 'recruit') return '招募入队'
    if (this.fromShop) return '返回商店'
    return this.nextScene() === 'shop' ? '前往商店' : '开战'
  }

  /** 唤醒沉睡的商店并退出本页（商店货架/金币/刷新次数原样保留） */
  private exitToShop(): void {
    playSfx('click')
    this.scene.wake('shop')
    this.scene.stop()
  }

  // ── 数据 ────────────────────────────────────────────────────

  private buildItems(): { key: string; emoji: string; outline: 'player'; badge?: string }[] {
    return recruitCandidates(this.run).map((id) => ({
      key: id,
      emoji: CHARACTERS[id].emoji,
      outline: 'player' as const,
    }))
  }

  private defaultSelection(): string {
    const items = this.buildItems()
    return items[0]?.key ?? ''
  }

  private validSelection(): boolean {
    return this.buildItems().some((i) => i.key === this.selectedKey)
  }

  // ── 确认执行 ────────────────────────────────────────────────

  private confirm(): void {
    if (this.mode === 'formation') {
      if (this.fromShop) {
        this.exitToShop()
      } else {
        playSfx('click')
        this.scene.start(this.nextScene())
      }
      return
    }
    if (!this.selectedKey) return
    if (recruitMember(this.run, this.selectedKey as CharacterId) < 0) return
    playSfx('recruit')
    // 下一环节或直接开拔（重建页面刷新模式/候选；保留背景色）
    if (this.resolveMode()) {
      this.selectedKey = ''
      this.preserveOnRestart = true
      this.scene.restart()
    } else {
      this.scene.start(this.nextScene())
    }
  }

  // ── 阵型页：N 保 1 中心选择器 ───────────────────────────────

  /** 岗位 → 角色：0 号中心，其余外圈（guardOrder 稳定次序，互换不牵连他人） */
  private postIds(): CharacterId[] {
    return guardOrder(this.run)
  }

  /** 重建阵型预览（列表区）：真实摆出 N 保 1，点选外圈队员与中心互换；
   * 外圈随 previewPhase 缓慢顺时针环绕（layoutFormationPreview 逐帧摆位） */
  private rebuildFormation(): void {
    for (const o of this.formationObjs) o.destroy()
    this.formationObjs = []
    this.memberImgs = []
    this.memberZones = []
    this.memberRects = []
    const res = textRes()
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const ids = this.postIds()
    const n = ids.length
    const posts = formationPosts('guard', n, this.previewPhase)

    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(lx, ly, L.w, L.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(lx, ly, L.w, L.h, 14)
    this.formationObjs.push(panel)

    const maxR = Math.max(...posts.map((p) => Math.hypot(p.x, p.y)), 1)
    const cx = lx + L.w / 2
    const cy = ly + L.h / 2
    const scale = Math.min(2.4, (Math.min(L.w, L.h) / 2 - 76) / maxR)
    this.previewGeom = { cx, cy, scale }

    posts.forEach((p, post) => {
      const id = ids[post]
      if (!id) return
      const px = cx + p.x * scale
      const py = cy + p.y * scale
      if (post === 0) {
        // 受保护中心：琥珀色光环标注（中心不随外圈环绕）
        const ring = this.add.graphics()
        ring.lineStyle(3, 0xffca28, 0.95)
        ring.strokeCircle(px, py, 44)
        this.formationObjs.push(ring)
      }
      const img = emojiImage(this, px, py, CHARACTERS[id].emoji, 80, 'player')
      this.formationObjs.push(img)
      this.memberImgs[post] = img
      const zone = this.add
        .zone(px - 40, py - 40, 80, 80)
        .setOrigin(0)
        .setInteractive({ useHandCursor: post !== 0 })
        .on('pointerup', () => this.onMemberTap(post))
      this.formationObjs.push(zone)
      this.memberZones[post] = zone
      this.memberRects[post] = { id, x: px - 40, y: py - 40, w: 80, h: 80 }
    })

    this.formationObjs.push(
      this.add
        .text(cx, ly + L.h - 20, '点选队员，与中心互换', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#d0d0d8',
          resolution: res,
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.8),
    )

    this.renderCenterDetail(res)
    this.reportPromote()
  }

  /** 按当前环绕相位重摆外圈成员（图像/命中区/调试矩形同步；互换动画期间暂停） */
  private layoutFormationPreview(): void {
    const ids = this.postIds()
    const posts = formationPosts('guard', ids.length, this.previewPhase)
    const { cx, cy, scale } = this.previewGeom
    posts.forEach((p, post) => {
      if (post === 0) return // 中心不动
      const img = this.memberImgs[post]
      const zone = this.memberZones[post]
      const rect = this.memberRects[post]
      if (!img || !zone || !rect) return
      const px = cx + p.x * scale
      const py = cy + p.y * scale
      img.setPosition(px, py)
      zone.setPosition(px - 40, py - 40)
      rect.x = px - 40
      rect.y = py - 40
    })
  }

  update(_time: number, delta: number): void {
    if (this.mode !== 'formation' || this.swapBusy) return
    this.previewPhase += (delta / 1000) * PREVIEW_SPIN
    this.layoutFormationPreview()
    // 外圈在转，调试矩形定期刷新，e2e 取到的坐标不至于过期
    this.reportTimer += delta
    if (this.reportTimer >= 300) {
      this.reportTimer = 0
      this.reportPromote()
    }
  }

  /** 点选外圈队员：与中心互换（带滑动动画） */
  private onMemberTap(post: number): void {
    if (this.swapBusy || post === 0) return
    const ids = this.postIds()
    const id = ids[post]
    if (!id || !setGuardCenter(this.run, id)) return
    playSfx('click')
    const ia = this.memberImgs[0]
    const ib = this.memberImgs[post]
    if (!ia || !ib) {
      this.rebuildFormation()
      return
    }
    this.swapBusy = true
    playSfx('whoosh')
    const done = (): void => {
      this.swapBusy = false
      this.rebuildFormation()
    }
    this.tweens.add({ targets: ia, x: ib.x, y: ib.y, duration: 170, ease: 'Cubic.easeInOut' })
    this.tweens.add({
      targets: ib,
      x: ia.x,
      y: ia.y,
      duration: 170,
      ease: 'Cubic.easeInOut',
      onComplete: done,
    })
  }

  /** 详情区展示当前中心角色（复用招募/升级的属性版式） */
  private renderCenterDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    const center = guardCenter(this.run)
    if (!center) return
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const slot = this.run.roster.indexOf(center)
    const spec = CHARACTERS[center]
    const items = this.run.memberItems[slot] ?? []

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, spec.emoji, 85, 'player'),
      this.add
        .text(dx + 104, dy + 44, `${spec.name} · 受保护的中心`, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 80, '站在队伍正中，受击判定减半，更少被敌人摸到', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          wordWrap: { width: D.w - 130, useAdvancedWrap: true },
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )
    this.renderStatGroups(center, items, res)
  }

  // ── 详情（招募模式） ────────────────────────────────────────

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    if (!this.selectedKey) return
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const id = this.selectedKey as CharacterId
    const spec = CHARACTERS[id]
    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, spec.emoji, 85, 'player'),
      this.add
        .text(dx + 104, dy + 44, spec.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 80, spec.desc, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          wordWrap: { width: D.w - 130 },
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )
    this.renderStatGroups(id, [], res)
  }

  /** 属性组列表（招募/阵型详情共用） */
  private renderStatGroups(id: CharacterId, items: ItemId[], res: number): void {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    let cursor = dy + 128
    for (const group of characterStatGroups(id, items)) {
      this.detailObjs.push(
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
        this.detailObjs.push(t)
        cursor += Math.max(34, t.height + 8)
      }
      cursor += 10
      if (cursor > dy + D.h - 60) break
    }
  }

  private refresh(): void {
    this.grid?.setSelected(this.selectedKey || null)
    this.renderDetail(textRes())
    this.reportPromote()
  }

  private reportPromote(): void {
    const center = guardCenter(this.run) ?? ''
    reportDebug({
      scene: 'promote',
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
      promote: {
        mode: this.mode,
        selected: this.mode === 'formation' ? center : this.selectedKey,
        items:
          this.mode === 'formation'
            ? this.memberRects.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h }))
            : (this.grid?.cellRects() ?? []).map((r) => ({
                id: r.key,
                x: r.x,
                y: r.y,
                w: r.w,
                h: r.h,
              })),
        confirm: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
          enabled: this.mode === 'formation' || this.selectedKey !== '',
        },
        back: {
          x: this.backRect.x + this.backRect.w / 2,
          y: this.backRect.y + this.backRect.h / 2,
          w: this.backRect.w,
          h: this.backRect.h,
        },
        ...(this.mode === 'formation' ? { formation: { center } } : {}),
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart({ fromShop: this.fromShop })
  }
}

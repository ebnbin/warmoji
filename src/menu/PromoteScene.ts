import Phaser from 'phaser'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import type { CharacterId } from '../characters/registry'
import { formationPosts } from '../characters/formation'
import type { ItemId } from '../items/registry'
import { arenaSceneFor } from '../maps/registry'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { unlockAt } from '../run/recruit'
import { Rng } from '../core/rng'
import {
  endRun,
  getRun,
  guardCenter,
  guardOrder,
  isTeamFull,
  promoteStep,
  recruitCandidates,
  recruitDueCount,
  recruitMember,
  recruitUnlocked,
  setGuardCenter,
} from '../run/state'
import type { RunState } from '../run/state'
import { characterStatGroups } from './stats'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage } from '../emoji/textures'
import { EmojiGrid } from './grid'
import { FONT, UI_FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'

// 整编页：每波战斗前的强制招募 + 阵型页。开局组队与波末整编完全复用本页：
// 队长确认后进来招首发（可返回重选队长），此后每波结束按名额招人直到满编
//（不可跳过、无其他招募途径；跳波开局可能一波多名额，一页选满才能出发）。
// 候选来自命定卡池（run.recruitPool，开局按队长种子抽定整局固定）：网格常驻
// 十卡三态——已解锁可选 / ❓ 盖牌（身份保密，按编制数逐档揭晓）/ 已入队 🎖️。
// 详情面板内嵌一块阵型预览：已有队员 + 本波空位按实际战斗布局慢转，点候选
// 填入空位、点预览里的人换下。招募完成后——首次满员额外展示一次阵型页
//（formation 模式：满员自动 N 保 1，玩家点选受保护的中心），此后阵型调整走
// 商店的常驻入口（fromShop，商店睡眠等待返回）。
interface PromoteLayout {
  content: { w: number; h: number }
  headerY: number
  stepY: number
  detail: { x: number; y: number; w: number; h: number }
  /** 招募模式：详情面板内切出的阵型预览区与文字详情区 */
  preview: { x: number; y: number; w: number; h: number }
  detailText: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: PromoteLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  stepY: 96,
  detail: { x: 40, y: 132, w: 730, h: 484 },
  preview: { x: 40, y: 132, w: 264, h: 484 },
  detailText: { x: 320, y: 132, w: 450, h: 484 },
  list: { x: 810, y: 132, w: 430, h: 484 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: PromoteLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  stepY: 106,
  detail: { x: 24, y: 144, w: 672, h: 460 },
  preview: { x: 24, y: 144, w: 672, h: 196 },
  detailText: { x: 24, y: 352, w: 672, h: 252 },
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
  /** recruit 模式：详情面板正在展示的卡（角色 id 或 lock-N 盖牌位） */
  private selectedKey = ''
  /** recruit 模式：本波名额数、命定卡池（整局固定）与本轮解锁数 */
  private due = 0
  private pool: CharacterId[] = []
  private unlocked = 0
  /** 已点进空位的候选（顺序即入队槽位序），点满 due 个才能确认 */
  private picked: CharacterId[] = []
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
  /** recruit 模式的预览记号（容器 + 已选位的命中区），随相位逐帧摆位 */
  private previewTokens: { c: Phaser.GameObjects.Container; zone?: Phaser.GameObjects.Zone; post: number }[] = []
  private previewObjs: Phaser.GameObjects.GameObject[] = []
  private btnBg?: Phaser.GameObjects.Graphics
  private btnLabel?: Phaser.GameObjects.Text
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
    this.previewTokens = []
    this.previewObjs = []
    this.grid = undefined
    this.btnBg = undefined
    this.btnLabel = undefined
    this.quitArmed = false
    this.swapBusy = false

    const resolved = this.resolveMode()
    if (!resolved) {
      // 名额结清且无阵型页可展示：直接去下一站
      this.scene.start(this.nextScene())
      return
    }
    this.mode = resolved
    // 首次满员的阵型页只自动展示这一次
    if (this.mode === 'formation' && !this.fromShop) this.run.formationIntroduced = true
    if (this.mode !== 'formation') {
      // 命定卡池：开局已定（run.recruitPool），这里只算本轮名额与解锁进度
      this.due = recruitDueCount(this.run)
      this.pool = [...this.run.recruitPool]
      this.unlocked = recruitUnlocked(this.run)
      const open = recruitCandidates(this.run)
      this.picked = preserved
        ? this.picked.filter((id) => open.includes(id)).slice(0, this.due)
        : []
      if (!preserved || !this.validSelected()) {
        this.selectedKey = open[0] ?? ''
      }
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
      // 预览区与文字详情区之间的细分隔线
      const pv = L.preview
      const div = this.add.graphics()
      div.lineStyle(1, 0xffffff, 0.12)
      if (h > w) {
        const yy = oy + pv.y + pv.h + 6
        div.lineBetween(this.origin.x + pv.x + 14, yy, this.origin.x + pv.x + pv.w - 14, yy)
      } else {
        const xx = this.origin.x + pv.x + pv.w + 8
        div.lineBetween(xx, oy + pv.y + 14, xx, oy + pv.y + pv.h - 14)
      }

      // 命定卡池网格（十卡三态）：可选牌点击进出空位（选满后 1 名额时点击
      // 即换人，多名额需先在预览里换下）；盖牌/已入队的点击只看详情
      this.grid = new EmojiGrid(this, {
        x: this.origin.x + L.list.x,
        y: oy + L.list.y,
        w: L.list.w,
        h: L.list.h,
      })
      this.grid.onTap = (key): void => {
        playSfx('click')
        this.selectedKey = key
        if (this.cardState(key) === 'open') {
          const id = key as CharacterId
          const at = this.picked.indexOf(id)
          if (at >= 0) this.picked.splice(at, 1)
          else if (this.picked.length < this.due) this.picked.push(id)
          else if (this.due === 1) this.picked = [id]
        }
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
    this.btnBg = this.add.graphics()
    this.btnBg.fillStyle(0x81d4fa, 1)
    this.btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.btnLabel = this.add
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
    if (this.mode === 'recruit') {
      const base = `命定卡池已揭晓 ${this.unlocked}/${this.pool.length} 张`
      return this.due > 1
        ? `${base} · 本波选 ${this.due} 名，点满全部空位才能出发`
        : `${base} · 必须选一名新队员入队`
    }
    if (this.fromShop) return '点选一名队员，与中心互换'
    return '满员自动列阵 N 保 1 · 点选队员设为受保护的中心'
  }

  private confirmLabel(): string {
    if (this.mode === 'recruit') return this.due > 1 ? `全员入队 0/${this.due}` : '招募入队'
    if (this.fromShop) return '返回商店'
    return this.nextScene() === 'shop' ? '前往商店' : '开战'
  }

  private confirmEnabled(): boolean {
    return this.mode === 'formation' || (this.due > 0 && this.picked.length === this.due)
  }

  /** 确认按钮的可用态与计数文案（招募未选满置灰不可按） */
  private updateConfirm(): void {
    const enabled = this.confirmEnabled()
    this.btnBg?.setAlpha(enabled ? 1 : 0.35)
    this.btnLabel?.setAlpha(enabled ? 1 : 0.55)
    if (this.mode === 'recruit' && this.due > 1) {
      this.btnLabel?.setText(`全员入队 ${this.picked.length}/${this.due}`)
    }
  }

  /** 唤醒沉睡的商店并退出本页（商店货架/金币/刷新次数原样保留） */
  private exitToShop(): void {
    playSfx('click')
    this.scene.wake('shop')
    this.scene.stop()
  }

  // ── 数据 ────────────────────────────────────────────────────

  /** 卡状态：盖牌（未解锁）/ 已入队 / 可选。key 为 lock-N 或角色 id */
  private cardState(key: string): 'locked' | 'taken' | 'open' {
    if (key.startsWith('lock-')) return 'locked'
    const idx = this.pool.indexOf(key as CharacterId)
    if (idx < 0 || idx >= this.unlocked) return 'locked'
    return this.run.roster.includes(key as CharacterId) ? 'taken' : 'open'
  }

  private validSelected(): boolean {
    if (!this.selectedKey) return false
    if (this.selectedKey.startsWith('lock-')) {
      const idx = Number(this.selectedKey.slice(5))
      return idx >= this.unlocked && idx < this.pool.length
    }
    return this.pool.includes(this.selectedKey as CharacterId)
  }

  /** 十卡三态：已解锁按角色亮牌（入队 ✔️ / 本轮已选 ✅），未解锁 ❓ 盖牌 */
  private buildItems(): { key: string; emoji: string; outline?: 'player'; badge?: string }[] {
    return this.pool.map((id, i) => {
      if (i >= this.unlocked) return { key: `lock-${i}`, emoji: '2753' }
      return {
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player' as const,
        ...(this.run.roster.includes(id)
          ? { badge: '1f396' }
          : this.picked.includes(id)
            ? { badge: '2705' }
            : {}),
      }
    })
  }

  // ── 确认执行 ────────────────────────────────────────────────

  private confirm(): void {
    if (!this.confirmEnabled()) return
    if (this.mode === 'formation') {
      if (this.fromShop) {
        this.exitToShop()
      } else {
        playSfx('click')
        this.scene.start(this.nextScene())
      }
      return
    }
    // 批量入队：按点选顺序占槽位（预览里的站位即入队后的站位）
    for (const id of this.picked) {
      if (recruitMember(this.run, id) < 0) return
    }
    playSfx('recruit')
    this.picked = []
    this.selectedKey = ''
    // 下一环节或直接开拔（重建页面刷新模式/候选；保留背景色）
    if (this.resolveMode()) {
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
    if (this.mode === 'formation') {
      if (this.swapBusy) return
      this.previewPhase += (delta / 1000) * PREVIEW_SPIN
      this.layoutFormationPreview()
      // 外圈在转，调试矩形定期刷新，e2e 取到的坐标不至于过期
      this.reportTimer += delta
      if (this.reportTimer >= 300) {
        this.reportTimer = 0
        this.reportPromote()
      }
      return
    }
    this.previewPhase += (delta / 1000) * PREVIEW_SPIN
    this.layoutRecruitPreview()
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
    const def = CHARACTERS[center]
    const items = this.run.memberItems[slot] ?? []

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, def.emoji, 85, 'player'),
      this.add
        .text(dx + 104, dy + 44, `${def.name} · 受保护的中心`, {
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

  // ── 详情（招募模式：文字详情区，预览占掉面板一角） ──────────

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    if (!this.selectedKey) return
    const D = this.layout.detailText
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    // 盖牌：不透露身份，只提示揭晓条件
    if (this.selectedKey.startsWith('lock-')) {
      const idx = Number(this.selectedKey.slice(5))
      this.detailObjs.push(
        emojiImage(this, dx + 46, dy + 48, '2753', 74),
        this.add
          .text(dx + 90, dy + 36, '命运牌 · 未解锁', {
            fontFamily: UI_FONT,
            fontSize: FONT.lead,
            fontStyle: 'bold',
            color: '#c8c8d4',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(dx + 90, dy + 70, `队伍规模达到 ${unlockAt(idx)} 人时揭晓这张牌的真身`, {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#b9b9c6',
            wordWrap: { width: D.w - 110 },
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      return
    }

    const id = this.selectedKey as CharacterId
    const def = CHARACTERS[id]
    const state = this.cardState(id)
    const tag = state === 'taken' ? ' · 已入队' : this.picked.includes(id) ? ' · 已选' : ''
    const tagColor = state === 'taken' ? '#a5d6a7' : '#81d4fa'
    this.detailObjs.push(
      emojiImage(this, dx + 46, dy + 48, def.emoji, 74, 'player'),
      this.add
        .text(dx + 90, dy + 36, def.name + tag, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: tag ? tagColor : '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 90, dy + 70, def.desc, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          wordWrap: { width: D.w - 110 },
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )
    this.renderStatGroups(id, [], res, D, dy + 112)
  }

  /** 属性组列表（招募/阵型详情共用；rect/startY 由两种模式各自指定） */
  private renderStatGroups(
    id: CharacterId,
    items: ItemId[],
    res: number,
    D = this.layout.detail,
    startY = this.origin.y + this.layout.detail.y + 128,
  ): void {
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    let cursor = startY
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
    this.grid?.setItems(this.buildItems())
    this.grid?.setSelected(this.selectedKey || null)
    this.renderDetail(textRes())
    this.rebuildRecruitPreview()
    this.updateConfirm()
    this.reportPromote()
  }

  // ── 招募模式：阵型预览（详情面板内嵌，与阵型页同款慢转） ────

  /** 重建预览记号：已有队员实心、已选候选带高亮环、空位虚线圈；
   * 布局与战斗同源（formationPosts 按招完后的人数取形），≥3 人随相位慢转 */
  private rebuildRecruitPreview(): void {
    for (const t of this.previewTokens) t.zone?.destroy()
    for (const o of this.previewObjs) o.destroy()
    this.previewTokens = []
    this.previewObjs = []
    const P = this.layout.preview
    const px = this.origin.x + P.x
    const py = this.origin.y + P.y
    const n = this.run.roster.length
    const total = n + this.due
    if (total === 0) return
    const posts = formationPosts('ring', total, this.previewPhase)
    const maxR = Math.max(...posts.map((p) => Math.hypot(p.x, p.y)), 1)
    const size = Math.min(P.w, P.h) >= 240 ? 58 : 50
    const fit = Math.min(P.w, P.h) / 2 - size / 2 - 24
    const scale = Math.min(2.2, fit / maxR)
    const cx = px + P.w / 2
    const cy = py + P.h / 2 - 6
    this.previewGeom = { cx, cy, scale }

    posts.forEach((p, post) => {
      const c = this.add.container(cx + p.x * scale, cy + p.y * scale)
      this.previewObjs.push(c)
      const token: { c: Phaser.GameObjects.Container; zone?: Phaser.GameObjects.Zone; post: number } = { c, post }
      if (post < n) {
        // 已有队员
        c.add(emojiImage(this, 0, 0, CHARACTERS[this.run.roster[post]!].emoji, size, 'player'))
      } else {
        const id = this.picked[post - n]
        if (id) {
          // 已点进空位的候选：高亮环 + 点击换下
          const halo = this.add.graphics()
          halo.lineStyle(3, 0x81d4fa, 0.95)
          halo.strokeCircle(0, 0, size / 2 + 5)
          c.add(halo)
          c.add(emojiImage(this, 0, 0, CHARACTERS[id].emoji, size, 'player'))
          const zone = this.add
            .zone(c.x - size / 2, c.y - size / 2, size, size)
            .setOrigin(0)
            .setInteractive({ useHandCursor: true })
            .on('pointerup', () => {
              if (this.grid?.wasDragged) return
              playSfx('click')
              const at = this.picked.indexOf(id)
              if (at >= 0) this.picked.splice(at, 1)
              this.selectedKey = id
              this.refresh()
            })
          token.zone = zone
        } else {
          // 待填的空位：虚线圈 + 淡加号
          const dash = this.add.graphics()
          dash.lineStyle(2.5, 0xffffff, 0.5)
          const R = size / 2 + 3
          const dashes = 12
          for (let i = 0; i < dashes; i++) {
            const a0 = (i / dashes) * Math.PI * 2
            dash.beginPath()
            dash.arc(0, 0, R, a0, a0 + ((Math.PI * 2) / dashes) * 0.55)
            dash.strokePath()
          }
          c.add(dash)
          const plus = emojiImage(this, 0, 0, '2795', 20)
          plus.setAlpha(0.4)
          c.add(plus)
        }
      }
      this.previewTokens.push(token)
    })

    this.previewObjs.push(
      this.add
        .text(cx, py + P.h - 12, `队伍 ${n} 人 → ${total} 人`, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b3e5fc',
          resolution: textRes(),
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.85),
    )
  }

  /** 按当前相位重摆招募预览（容器与命中区同步；1~2 人布局天然静止） */
  private layoutRecruitPreview(): void {
    if (this.previewTokens.length === 0) return
    const total = this.run.roster.length + this.due
    const posts = formationPosts('ring', total, this.previewPhase)
    const { cx, cy, scale } = this.previewGeom
    for (const t of this.previewTokens) {
      const p = posts[t.post]
      if (!p) continue
      const x = cx + p.x * scale
      const y = cy + p.y * scale
      t.c.setPosition(x, y)
      t.zone?.setPosition(x - t.zone.width / 2, y - t.zone.height / 2)
    }
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
                state: this.cardState(r.key),
              })),
        confirm: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
          enabled: this.confirmEnabled(),
        },
        back: {
          x: this.backRect.x + this.backRect.w / 2,
          y: this.backRect.y + this.backRect.h / 2,
          w: this.backRect.w,
          h: this.backRect.h,
        },
        ...(this.mode === 'formation'
          ? { formation: { center } }
          : { due: this.due, picked: [...this.picked] }),
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart({ fromShop: this.fromShop })
  }
}

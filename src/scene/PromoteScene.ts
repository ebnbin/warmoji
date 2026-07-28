import Phaser from 'phaser'
import { CAPTAINS } from '../data/captains'
import { CHARACTERS } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { formationPosts } from '../data/formation'
import type { ItemId } from '../types/items'
import { battleSceneFor } from '../battle'
import type { BattleSceneKey } from '../battle'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { unlockAt } from '../run/recruit'
import { Rng } from '../util/rng'
import {
  endRun,
  getRun,
  guardCenter,
  guardOrder,
  hasCenter,
  promoteStep,
  recruitCandidates,
  recruitDueCount,
  recruitMember,
  recruitUnlocked,
  setGuardCenter,
} from '../run/state'
import type { RunState } from '../run/state'
import { characterStatGroups } from '../scene/statLines'
import { applyBackground } from '../util/background'
import { reportDebug } from '../debug'
import { emojiImage } from '../emoji/textures'
import { EmojiGrid } from '../ui/grid'
import { ScrollView } from '../ui/scroll'
import type { ScrollRect } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'

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

/** 按各站位实际间距收缩图标尺寸：队伍变大（最多 8）时相邻不再重叠 */
function fitIconSize(posts: readonly { x: number; y: number }[], scale: number, base: number): number {
  let minD = Infinity
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      minD = Math.min(minD, Math.hypot(posts[i]!.x - posts[j]!.x, posts[i]!.y - posts[j]!.y))
    }
  }
  if (!Number.isFinite(minD)) return base
  return Math.max(24, Math.min(base, minD * scale * 0.92))
}

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
  /** 详情文字区（招募：detailText 子区；阵型：整块 detail）——变长属性装进可滚动容器 */
  private detailView!: ScrollView
  private detailRect: ScrollRect = { x: 0, y: 0, w: 0, h: 0 }
  private formationObjs: Phaser.GameObjects.GameObject[] = []
  private memberImgs: Phaser.GameObjects.Image[] = []
  private memberZones: Phaser.GameObjects.Zone[] = []
  private memberRects: { id: string; x: number; y: number; w: number; h: number }[] = []
  /** 阵型预览的当前图标尺寸（按人数收缩，layout 逐帧摆位时复用其半径） */
  private formationIconSize = 80
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
    roundRect(panel, dx, dy, D.w, D.h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })

    // 详情文字区：招募模式占详情面板一角（detailText），阵型模式占整块 detail。
    // 角色属性（携带/升级卡/被动）是变长文案，装进可滚动容器，不再静默截断
    const T = this.mode === 'formation' ? L.detail : L.detailText
    this.detailRect = { x: this.origin.x + T.x, y: oy + T.y, w: T.w, h: T.h }
    this.detailView = new ScrollView(this, this.detailRect)

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
  private nextScene(): BattleSceneKey | 'shop' {
    if (this.isInitial() && !CAPTAINS[this.run.captainId].firstWaveShop) {
      return battleSceneFor(this.run.mapId)
    }
    return 'shop'
  }

  /** 当前环节：商店入口直达阵型页；否则本波有名额必须招募，
   * 首次满员再补一次阵型页，无事可办返回 null（直接去下一站） */
  private resolveMode(): 'recruit' | 'formation' | null {
    if (this.fromShop) return 'formation'
    const step = promoteStep(this.run)
    if (step) return step
    if (hasCenter(this.run) && !this.run.formationIntroduced) return 'formation'
    return null
  }

  private stepBanner(): string {
    if (this.mode === 'recruit') {
      return this.due > 1 ? `本波招募 ${this.due} 名，点满空位后出发` : '招募一名新队员'
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
    roundRect(panel, lx, ly, L.w, L.h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })
    this.formationObjs.push(panel)

    const maxR = Math.max(...posts.map((p) => Math.hypot(p.x, p.y)), 1)
    const cx = lx + L.w / 2
    const cy = ly + L.h / 2
    const scale = Math.min(2.4, (Math.min(L.w, L.h) / 2 - 76) / maxR)
    this.previewGeom = { cx, cy, scale }
    const size = fitIconSize(posts, scale, 80)
    this.formationIconSize = size
    const half = size / 2

    posts.forEach((p, post) => {
      const id = ids[post]
      if (!id) return
      const px = cx + p.x * scale
      const py = cy + p.y * scale
      if (post === 0) {
        // 受保护中心：琥珀色光环标注（中心不随外圈环绕）
        const ring = this.add.graphics()
        ring.lineStyle(3, 0xffdc5d, 0.95)
        ring.strokeCircle(px, py, half + 4)
        this.formationObjs.push(ring)
      }
      const img = emojiImage(this, px, py, CHARACTERS[id].emoji, size, 'player')
      this.formationObjs.push(img)
      this.memberImgs[post] = img
      const zone = this.add
        .zone(px - half, py - half, size, size)
        .setOrigin(0)
        .setInteractive({ useHandCursor: post !== 0 })
        .on('pointerup', () => this.onMemberTap(post))
      this.formationObjs.push(zone)
      this.memberZones[post] = zone
      this.memberRects[post] = { id, x: px - half, y: py - half, w: size, h: size }
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
    const half = this.formationIconSize / 2
    posts.forEach((p, post) => {
      if (post === 0) return // 中心不动
      const img = this.memberImgs[post]
      const zone = this.memberZones[post]
      const rect = this.memberRects[post]
      if (!img || !zone || !rect) return
      const px = cx + p.x * scale
      const py = cy + p.y * scale
      img.setPosition(px, py)
      zone.setPosition(px - half, py - half)
      rect.x = px - half
      rect.y = py - half
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
    this.detailView.clear()
    const center = guardCenter(this.run)
    if (!center) {
      this.detailView.setContentHeight(0)
      return
    }
    const D = this.detailRect
    const slot = this.run.roster.indexOf(center)
    const def = CHARACTERS[center]
    const items = this.run.memberItems[slot] ?? []

    const subtitle = this.add
      .text(104, 80, '站在队伍正中，受击判定减半，更少被敌人摸到', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#b9b9c6',
        wordWrap: { width: D.w - 130, useAdvancedWrap: true },
        resolution: res,
      })
      .setOrigin(0, 0)
    this.detailView.add([
      emojiImage(this, 58, 56, def.emoji, 85, 'player'),
      this.add
        .text(104, 44, `${def.name} · 受保护的中心`, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffdc5d',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      subtitle,
    ])
    const start = Math.max(128, 80 + subtitle.height + 12)
    const end = this.renderStatGroups(center, items, res, start)
    this.detailView.setContentHeight(end + 12)
  }

  // ── 详情（招募模式：文字详情区，预览占掉面板一角） ──────────

  private renderDetail(res: number): void {
    this.detailView.clear()
    if (!this.selectedKey) {
      this.detailView.setContentHeight(0)
      return
    }
    const D = this.detailRect

    // 盖牌：不透露身份，只提示揭晓条件
    if (this.selectedKey.startsWith('lock-')) {
      const idx = Number(this.selectedKey.slice(5))
      this.detailView.add([
        emojiImage(this, 46, 48, '2753', 74),
        this.add
          .text(90, 36, '命运牌 · 未解锁', {
            fontFamily: UI_FONT,
            fontSize: FONT.lead,
            fontStyle: 'bold',
            color: '#c8c8d4',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(90, 70, `队伍规模达到 ${unlockAt(idx)} 人时揭晓这张牌的真身`, {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#b9b9c6',
            wordWrap: { width: D.w - 110 },
            resolution: res,
          })
          .setOrigin(0, 0),
      ])
      this.detailView.setContentHeight(150)
      return
    }

    const id = this.selectedKey as CharacterId
    const def = CHARACTERS[id]
    const state = this.cardState(id)
    const tag = state === 'taken' ? ' · 已入队' : this.picked.includes(id) ? ' · 已选' : ''
    const tagColor = state === 'taken' ? '#a5d6a7' : '#81d4fa'
    const desc = this.add
      .text(90, 70, def.desc, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#b9b9c6',
        wordWrap: { width: D.w - 110 },
        resolution: res,
      })
      .setOrigin(0, 0)
    this.detailView.add([
      emojiImage(this, 46, 48, def.emoji, 74, 'player'),
      this.add
        .text(90, 36, def.name + tag, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: tag ? tagColor : '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      desc,
    ])
    const start = Math.max(112, 70 + desc.height + 10)
    const end = this.renderStatGroups(id, [], res, start)
    this.detailView.setContentHeight(end + 12)
  }

  /** 属性组列表（招募/阵型详情共用）：渲染进 detailView，返回排完的内容底端 */
  private renderStatGroups(id: CharacterId, items: ItemId[], res: number, startY: number): number {
    const wrap = this.detailRect.w - 104
    let cursor = startY
    // 选角色只描述当前（本级）属性与能力，不列跨级升级路径
    for (const group of characterStatGroups(id, items, 1, { path: false })) {
      this.detailView.add([
        emojiImage(this, 42, cursor, group.icon, 35),
        this.add
          .text(62, cursor, group.title, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      ])
      cursor += 38
      for (const line of group.lines) {
        const t = this.add
          .text(62, cursor, line, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: '#d0d0d8',
            wordWrap: { width: wrap },
            lineSpacing: 6,
            resolution: res,
          })
          .setOrigin(0, 0)
        this.detailView.add(t)
        cursor += Math.max(34, t.height + 8)
      }
      cursor += 10
    }
    return cursor
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
    const base = Math.min(P.w, P.h) >= 240 ? 58 : 50
    const fit = Math.min(P.w, P.h) / 2 - base / 2 - 24
    const scale = Math.min(2.2, fit / maxR)
    // 环上人越多相邻越挤，按实际间距收缩图标，避免 total 变大时糊成一坨
    const size = fitIconSize(posts, scale, base)
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

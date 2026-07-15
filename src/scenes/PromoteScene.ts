import Phaser from 'phaser'
import type { CharacterId } from '../core/config'
import { CAPTAINS, CHARACTERS, LEVELS } from '../core/config'
import type { FormationId } from '../core/formation'
import { FORMATION_IDS, formationDesc, formationName, formationPosts } from '../core/formation'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import {
  endRun,
  getRun,
  isTeamFull,
  pointsAvailable,
  promoteStep,
  recruitCandidates,
  recruitMember,
  rosterCap,
  setFormation,
  swapFormationPosts,
  upgradeMember,
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

// 整编页：每波战斗前的必经一站。开局组队与波末整编完全复用本页：
// 队长确认后带着开局点数进来（wave=1，可返回重选队长），波末必进（wave>1，只能结束本局）。
// 环节顺序：有点数先强制结算（未满编必须招募、满编后必须升级，每 1 点一步），
// 点数结清后落在「队形」环节——满员可切换队形/互换站位，未满员固定环形只作检阅；
// 开局未满员时跳过队形环节直接开拔（去向看队长 firstWaveShop），波末从队形环节进商店。
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

/** 预览/示意图统一朝上（与开战时初始朝向一致） */
const PREVIEW_FACING = -Math.PI / 2

export class PromoteScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/选中等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private mode: 'recruit' | 'upgrade' | 'formation' = 'recruit'
  /** recruit 模式为候选角色 id；upgrade 模式为 `slot:N` */
  private selectedKey = ''
  /** 队形环节选中的岗位（-1 = 未选） */
  private selectedPost = -1
  /** 互换动画播放中，忽略输入 */
  private swapBusy = false
  private layout!: PromoteLayout
  private origin = { x: 0, y: 0 }
  private grid?: EmojiGrid
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private formationObjs: Phaser.GameObjects.GameObject[] = []
  private memberImgs: Phaser.GameObjects.Image[] = []
  private memberRects: { id: string; x: number; y: number; w: number; h: number }[] = []
  private cardRects: { id: FormationId; x: number; y: number; w: number; h: number }[] = []
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private backRect = { x: 0, y: 0, w: 0, h: 0 }
  private quitArmed = false

  constructor() {
    super('promote')
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
      // 开局未满员且点数已结清：跳过队形环节直接开拔
      this.scene.start(this.nextScene())
      return
    }
    this.mode = resolved
    if (this.mode === 'formation') {
      if (!preserved || this.selectedPost >= this.run.roster.length) this.selectedPost = -1
    } else if (!preserved || !this.validSelection()) {
      this.selectedKey = this.defaultSelection()
    }

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = this.origin.y

    this.add
      .text(w / 2, oy + L.headerY, this.isInitial() ? '组建队伍' : '队伍整编', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    if (this.isInitial()) {
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

    // 详情/预览面板底板（两种模式共用同一块区域）
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
      .text(w / 2, h - safeInsets.bottom - 10, 'emoji graphics © Twemoji · CC-BY 4.0', {
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

  /** 开局组队（第 1 波开战前）还是波末整编 */
  private isInitial(): boolean {
    return this.run.wave === 1
  }

  /** 点数花完后的去向：开局看队长 firstWaveShop（默认直接开战），波末必进商店 */
  private nextScene(): 'arena' | 'shop' {
    if (this.isInitial() && !CAPTAINS[this.run.captainId].firstWaveShop) return 'arena'
    return 'shop'
  }

  /** 当前环节：有点数先强制结算；波末（或开局已满员）随后落在队形环节；
   * 开局未满员点数结清即离开（null） */
  private resolveMode(): 'recruit' | 'upgrade' | 'formation' | null {
    const step = promoteStep(this.run)
    if (step) return step
    if (!this.isInitial() || isTeamFull(this.run)) return 'formation'
    return null
  }

  private stepBanner(): string {
    const points = pointsAvailable(this.run)
    if (this.mode === 'recruit') return `剩余 ${points} 点 · 必须招募新队员（未满编不可升级）`
    if (this.mode === 'upgrade') return `剩余 ${points} 点 · 已满编，选择一名队员升级`
    if (!isTeamFull(this.run)) {
      return `队伍未满员（${this.run.roster.length}/${rosterCap(this.run)}），满员后解锁队形调整`
    }
    return '选择队形 · 点选两名队员互换站位'
  }

  private confirmLabel(): string {
    if (this.mode === 'recruit') return '招募（花 1 点）'
    if (this.mode === 'upgrade') return '升级（花 1 点）'
    return this.nextScene() === 'arena' ? '开战' : '前往商店'
  }

  // ── 数据 ────────────────────────────────────────────────────

  private buildItems(): { key: string; emoji: string; outline: 'player'; badge?: string }[] {
    if (this.mode === 'recruit') {
      return recruitCandidates(this.run).map((id) => ({
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player' as const,
      }))
    }
    // 升级模式：仅列出未满级的队员（满级不可选）
    return this.run.roster
      .map((id, slot) => ({ id, slot }))
      .filter((m) => this.upgradeable(m.slot))
      .map((m) => ({
        key: `slot:${m.slot}`,
        emoji: CHARACTERS[m.id].emoji,
        outline: 'player' as const,
      }))
  }

  private upgradeable(slot: number): boolean {
    return (this.run.memberLevels[slot] ?? 1) < LEVELS.max
  }

  private defaultSelection(): string {
    const items = this.buildItems()
    return items[0]?.key ?? ''
  }

  private validSelection(): boolean {
    return this.buildItems().some((i) => i.key === this.selectedKey)
  }

  private selectedSlot(): number {
    return this.selectedKey.startsWith('slot:') ? Number(this.selectedKey.slice(5)) : -1
  }

  // ── 确认执行 ────────────────────────────────────────────────

  private confirm(): void {
    if (this.mode === 'formation') {
      playSfx('click')
      this.scene.start(this.nextScene())
      return
    }
    if (!this.selectedKey) return
    if (this.mode === 'recruit') {
      const id = this.selectedKey as CharacterId
      if (recruitMember(this.run, id) < 0) return
      playSfx('recruit')
    } else {
      const slot = this.selectedSlot()
      if (slot < 0 || !upgradeMember(this.run, slot)) return
      playSfx('upgrade')
    }
    // 下一环节或直接开拔（重建页面刷新模式/候选；保留背景色）
    if (this.resolveMode()) {
      this.selectedKey = ''
      this.preserveOnRestart = true
      this.scene.restart()
    } else {
      this.scene.start(this.nextScene())
    }
  }

  // ── 队形环节：预览即编辑 ────────────────────────────────────

  /** 重建队形环节全部动态对象（选择卡 + 阵型预览） */
  private rebuildFormation(): void {
    for (const o of this.formationObjs) o.destroy()
    this.formationObjs = []
    this.memberImgs = []
    this.memberRects = []
    this.cardRects = []
    const res = textRes()
    this.renderFormationCards(res)
    this.renderFormationPreview(res)
    this.reportPromote()
  }

  /** 右侧/下方：三张队形选择卡（小圆点示意图 + 名称 + 说明） */
  private renderFormationCards(res: number): void {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const n = this.run.roster.length
    const locked = !isTeamFull(this.run)
    const gap = 14
    const cardH = Math.min(150, (L.h - gap * (FORMATION_IDS.length - 1)) / FORMATION_IDS.length)

    FORMATION_IDS.forEach((id, i) => {
      const cy = ly + i * (cardH + gap)
      const active = this.run.formation === id
      const g = this.add.graphics()
      g.fillStyle(active ? 0xffffff : 0x000000, active ? 0.16 : 0.22)
      g.fillRoundedRect(lx, cy, L.w, cardH, 14)
      g.lineStyle(active ? 2 : 1, 0xffffff, active ? 0.9 : 0.1)
      g.strokeRoundedRect(lx, cy, L.w, cardH, 14)
      this.formationObjs.push(g)

      // 小圆点示意图：与真实岗位同一几何，前排/中心岗位用琥珀色点出
      const posts = formationPosts(id, Math.max(n, 2), PREVIEW_FACING)
      const maxR = Math.max(...posts.map((p) => Math.hypot(p.x, p.y)), 1)
      const diag = this.add.graphics()
      const dcx = lx + 62
      const dcy = cy + cardH / 2
      const ds = 36 / maxR
      posts.forEach((p, post) => {
        const special = id === 'guard' ? post === 0 : id === 'vanguard' && post < Math.ceil(Math.max(n, 2) / 2)
        diag.fillStyle(special ? 0xffca28 : 0xffffff, special ? 0.95 : 0.8)
        diag.fillCircle(dcx + p.x * ds, dcy + p.y * ds, 5.5)
      })
      this.formationObjs.push(diag)

      const name = this.add
        .text(lx + 118, cy + cardH / 2 - 17, formationName(id, n), {
          fontFamily: UI_FONT,
          fontSize: FONT.head,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      const desc = this.add
        .text(lx + 118, cy + cardH / 2 + 16, formationDesc(id), {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          // 中文无空格，必须逐字换行才能在窄卡片内折行
          wordWrap: { width: L.w - 136, useAdvancedWrap: true },
          resolution: res,
        })
        .setOrigin(0, 0.5)
      this.formationObjs.push(name, desc)
      if (locked) {
        diag.setAlpha(0.4)
        name.setAlpha(0.4)
        desc.setAlpha(0.4)
      }

      const zone = this.add
        .zone(lx, cy, L.w, cardH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: !locked })
        .on('pointerup', () => {
          if (locked || this.swapBusy || this.run.formation === id) return
          playSfx('click')
          setFormation(this.run, id)
          this.selectedPost = -1
          this.rebuildFormation()
        })
      this.formationObjs.push(zone)
      this.cardRects.push({ id, x: lx, y: cy, w: L.w, h: cardH })
    })
  }

  /** 左侧/上方：把队伍按当前队形真实摆出来，点两名队员互换站位 */
  private renderFormationPreview(res: number): void {
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const run = this.run
    const n = run.roster.length
    const locked = !isTeamFull(run)
    const posts = formationPosts(run.formation, n, PREVIEW_FACING)
    const maxR = Math.max(...posts.map((p) => Math.hypot(p.x, p.y)), 1)
    const cx = dx + D.w / 2
    const cy = dy + D.h / 2 + 12
    const scale = Math.min(2.4, (Math.min(D.w, D.h) / 2 - 84) / maxR)

    // 前后阵是方向性队形：标注移动方向（预览朝上）
    if (run.formation === 'vanguard') {
      this.formationObjs.push(
        this.add
          .text(cx, dy + 26, '↑ 移动方向', {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0.5, 0)
          .setAlpha(0.55),
      )
    }

    posts.forEach((p, post) => {
      const id = run.formationOrder[post]
      if (!id) return
      const px = cx + p.x * scale
      const py = cy + p.y * scale
      if (post === this.selectedPost) {
        const ring = this.add.graphics()
        ring.lineStyle(3, 0xffffff, 0.95)
        ring.strokeCircle(px, py, 46)
        this.formationObjs.push(ring)
      }
      const img = emojiImage(this, px, py, CHARACTERS[id].emoji, 64, 'player')
      this.formationObjs.push(img)
      this.memberImgs[post] = img
      const zone = this.add
        .zone(px - 42, py - 42, 84, 84)
        .setOrigin(0)
        .setInteractive({ useHandCursor: !locked })
        .on('pointerup', () => this.onMemberTap(post))
      this.formationObjs.push(zone)
      this.memberRects.push({ id, x: px - 42, y: py - 42, w: 84, h: 84 })
    })

    // 底部提示：选中队员名 + 互换指引
    const hint = locked
      ? '阵容检阅：确认无误就出发吧'
      : this.selectedPost >= 0
        ? `${CHARACTERS[run.formationOrder[this.selectedPost]!]?.name ?? ''}：再点另一名队员互换位置`
        : '点选队员可互换站位'
    this.formationObjs.push(
      this.add
        .text(cx, dy + D.h - 22, hint, {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color: '#d0d0d8',
          resolution: res,
        })
        .setOrigin(0.5, 1),
    )
  }

  /** 队形预览点选：第一次选中，第二次互换（带滑动动画） */
  private onMemberTap(post: number): void {
    if (this.swapBusy || !isTeamFull(this.run)) return
    playSfx('click')
    if (this.selectedPost === post) {
      this.selectedPost = -1
      this.rebuildFormation()
      return
    }
    if (this.selectedPost < 0) {
      this.selectedPost = post
      this.rebuildFormation()
      return
    }
    const a = this.selectedPost
    const b = post
    this.selectedPost = -1
    if (!swapFormationPosts(this.run, a, b)) {
      this.rebuildFormation()
      return
    }
    // 两名队员滑到对方岗位后重建（重建同步选中态/调试状态）
    const ia = this.memberImgs[a]
    const ib = this.memberImgs[b]
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

  // ── 详情（招募/升级模式） ───────────────────────────────────

  private renderDetail(res: number): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    if (!this.selectedKey) return
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const isRecruit = this.mode === 'recruit'
    const slot = this.selectedSlot()
    const id = isRecruit ? (this.selectedKey as CharacterId) : this.run.roster[slot]!
    const spec = CHARACTERS[id]
    const level = isRecruit ? 1 : (this.run.memberLevels[slot] ?? 1)
    const items = isRecruit ? [] : (this.run.memberItems[slot] ?? [])

    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, spec.emoji, 64, 'player'),
      this.add
        .text(dx + 104, dy + 44, isRecruit ? spec.name : `${spec.name} Lv.${level} → Lv.${level + 1}`, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 80, isRecruit ? spec.desc : '升级提升伤害与生命上限', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          wordWrap: { width: D.w - 130 },
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )

    let cursor = dy + 128
    for (const group of characterStatGroups(spec, items, level)) {
      this.detailObjs.push(
        emojiImage(this, dx + 42, cursor, group.icon, 26),
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
    const formationSelected =
      this.selectedPost >= 0 ? (this.run.formationOrder[this.selectedPost] ?? '') : ''
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
        points: pointsAvailable(this.run),
        selected: this.mode === 'formation' ? formationSelected : this.selectedKey,
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
        ...(this.mode === 'formation'
          ? {
              formation: {
                id: this.run.formation,
                locked: !isTeamFull(this.run),
                order: [...this.run.formationOrder],
                cards: this.cardRects.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h })),
              },
            }
          : {}),
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { formationPosts } from '../data/formation'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { unlockAt } from '../run/recruit'
import { Rng } from '../util/rng'
import {
  getRun,
  recruitCandidates,
  recruitDueCount,
  recruitMember,
  recruitUnlocked,
  teamStep,
} from '../run/state'
import type { RunState } from '../run/state'
import { applyBackground } from '../util/background'
import { reportDebug } from '../debug'
import { emojiImage } from '../emoji/hold'
import { EmojiGrid } from '../ui/grid'
import { ScrollView } from '../ui/scroll'
import type { ScrollRect } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import {
  addConfirmButton,
  addRunExit,
  addTeamFrame,
  fitIconSize,
  isInitialWave,
  nextAfterTeam,
  PREVIEW_SPIN,
  renderStatGroups,
  teamLayout,
} from './teamPage'
import type { TeamLayout } from './teamPage'

export class RecruitScene extends Phaser.Scene {
  // 视口变化触发的 restart 置真，保留页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  /** 角色 id 或 lock-N */
  private selectedKey = ''
  private due = 0
  private pool: CharacterId[] = []
  private unlocked = 0
  /** 顺序即入队槽位序 */
  private picked: CharacterId[] = []
  private layout!: TeamLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailView!: ScrollView
  private detailRect: ScrollRect = { x: 0, y: 0, w: 0, h: 0 }
  private previewPhase = 0
  private previewGeom = { cx: 0, cy: 0, scale: 1 }
  private previewTokens: { c: Phaser.GameObjects.Container; zone?: Phaser.GameObjects.Zone; post: number }[] = []
  private previewObjs: Phaser.GameObjects.GameObject[] = []
  private btnBg!: Phaser.GameObjects.Graphics
  private btnLabel!: Phaser.GameObjects.Text
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private backRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('recruit')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.run = getRun()
    this.previewTokens = []
    this.previewObjs = []

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

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = teamLayout(w, h))
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = this.origin.y
    const dragged = (): boolean => this.grid.wasDragged

    addTeamFrame(this, L, this.origin, isInitialWave(this.run) ? '组建队伍' : '队伍整编', this.stepBanner(), res)
    this.backRect = addRunExit(this, this.run, this.origin.x + 40, oy + L.headerY, res, dragged)

    const T = L.detailText
    this.detailRect = { x: this.origin.x + T.x, y: oy + T.y, w: T.w, h: T.h }
    this.detailView = new ScrollView(this, this.detailRect)

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

    const btn = addConfirmButton(this, L, this.origin, this.confirmLabel(), res, () => this.confirm(), dragged)
    this.btnBg = btn.bg
    this.btnLabel = btn.label
    this.btnRect = btn.rect

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private stepBanner(): string {
    return this.due > 1 ? `本波招募 ${this.due} 名，点满空位后出发` : '招募一名新队员'
  }

  private confirmLabel(): string {
    return this.due > 1 ? `全员入队 0/${this.due}` : '招募入队'
  }

  private confirmEnabled(): boolean {
    return this.due > 0 && this.picked.length === this.due
  }

  private updateConfirm(): void {
    const enabled = this.confirmEnabled()
    this.btnBg.setAlpha(enabled ? 1 : 0.35)
    this.btnLabel.setAlpha(enabled ? 1 : 0.55)
    if (this.due > 1) {
      this.btnLabel.setText(`全员入队 ${this.picked.length}/${this.due}`)
    }
  }

  // ── 数据 ────────────────────────────────────────────────────

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
    for (const id of this.picked) {
      if (recruitMember(this.run, id) < 0) return
    }
    playSfx('recruit')
    this.picked = []
    this.selectedKey = ''
    this.scene.start(teamStep(this.run) ?? nextAfterTeam(this.run))
  }

  update(_time: number, delta: number): void {
    this.previewPhase += (delta / 1000) * PREVIEW_SPIN
    this.layoutPreview()
  }

  // ── 详情（文字详情区，预览占掉面板一角） ────────────────────

  private renderDetail(res: number): void {
    this.detailView.clear()
    if (!this.selectedKey) {
      this.detailView.setContentHeight(0)
      return
    }
    const D = this.detailRect

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
    const end = renderStatGroups(this, this.detailView, this.detailRect.w, id, [], res, start)
    this.detailView.setContentHeight(end + 12)
  }

  private refresh(): void {
    this.grid.setItems(this.buildItems())
    this.grid.setSelected(this.selectedKey || null)
    this.renderDetail(textRes())
    this.rebuildPreview()
    this.updateConfirm()
    this.report()
  }

  // ── 队伍预览（详情面板内嵌，与阵型页同款慢转） ──────────────

  private rebuildPreview(): void {
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
    const size = fitIconSize(posts, scale, base)
    const cx = px + P.w / 2
    const cy = py + P.h / 2 - 6
    this.previewGeom = { cx, cy, scale }

    posts.forEach((p, post) => {
      const c = this.add.container(cx + p.x * scale, cy + p.y * scale)
      this.previewObjs.push(c)
      const token: { c: Phaser.GameObjects.Container; zone?: Phaser.GameObjects.Zone; post: number } = { c, post }
      if (post < n) {
        c.add(emojiImage(this, 0, 0, CHARACTERS[this.run.roster[post]!].emoji, size, 'player'))
      } else {
        const id = this.picked[post - n]
        if (id) {
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
              if (this.grid.wasDragged) return
              playSfx('click')
              const at = this.picked.indexOf(id)
              if (at >= 0) this.picked.splice(at, 1)
              this.selectedKey = id
              this.refresh()
            })
          token.zone = zone
        } else {
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

  private layoutPreview(): void {
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

  private report(): void {
    reportDebug({
      scene: 'recruit',
      elapsed: 0,
      kills: this.run.kills,
      level: this.run.xp.level,
      wave: this.run.wave,
      coins: this.run.coins,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      recruit: {
        selected: this.selectedKey,
        items: this.grid.cellRects().map((r) => ({
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
        due: this.due,
        picked: [...this.picked],
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { UNIT } from '../util/units'
import { unlockAt } from '../run/recruit'
import {
  getRun,
  recruitCandidates,
  recruitDueCount,
  recruitMember,
  recruitUnlocked,
  teamStep,
} from '../run/state'
import type { RunState } from '../run/state'
import { playSfx } from '../audio/sfx'
import { characterStatGroups } from './statLines'
import { AvatarSlot, beginPage, Button, Divider, EmojiGrid, Flow, Icon, Label, PageHeader, pageFrame, Panel, RichLabel, ScrollView } from '../ui'
import type { GridItem, Rect } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { fitIconSize, flowStatGroups, isInitialWave, nextAfterTeam, PREVIEW_SPIN, runExit } from './teamPage'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'

/** 头像预览的环形排版，单位格：两人并排，三人小环，更多人大环 */
const PREVIEW_RING = { pairGap: 1.1, small: 0.58, large: 0.8 } as const

function ringPosts(count: number, phase = 0): { x: number; y: number }[] {
  if (count <= 1) return Array.from({ length: count }, () => ({ x: 0, y: 0 }))
  if (count === 2) {
    return [
      { x: (-PREVIEW_RING.pairGap / 2) * UNIT, y: 0 },
      { x: (PREVIEW_RING.pairGap / 2) * UNIT, y: 0 },
    ]
  }
  const r = (count === 3 ? PREVIEW_RING.small : PREVIEW_RING.large) * UNIT
  return Array.from({ length: count }, (_, post) => {
    const a = -Math.PI / 2 + (post * 2 * Math.PI) / count + phase
    return { x: Math.cos(a) * r, y: Math.sin(a) * r }
  })
}

export class RecruitScene extends Phaser.Scene implements DevProviderHost {
  private preserveOnRestart = false
  private run!: RunState
  private selectedKey: CharacterId | number | null = null
  private due = 0
  private pool: CharacterId[] = []
  private unlocked = 0
  private picked: CharacterId[] = []
  private grid!: EmojiGrid<CharacterId | number>
  private detail!: ScrollView
  private previewRect: Rect = { x: 0, y: 0, w: 0, h: 0 }
  private previewPhase = 0
  private previewGeom = { cx: 0, cy: 0, scale: 1 }
  private previewSlots: { slot: AvatarSlot; post: number }[] = []
  private previewCaption?: Label
  private confirmBtn!: Button

  constructor() {
    super(SceneKey.Recruit)
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.run = getRun()
    this.previewSlots = []
    this.previewCaption = undefined

    this.due = recruitDueCount(this.run)
    this.pool = [...this.run.recruitPool]
    this.unlocked = recruitUnlocked(this.run)
    const open = recruitCandidates(this.run)
    this.picked = preserved ? this.picked.filter((id) => open.includes(id)).slice(0, this.due) : []
    if (!preserved || !this.validSelected()) this.selectedKey = open[0] ?? null

    const f = pageFrame({ sub: true, footer: true })
    new PageHeader(this, f, {
      title: isInitialWave(this.run) ? '组建队伍' : '队伍整编',
      sub: this.due > 1 ? `本波招募 ${this.due} 名，点满空位后出发` : '招募一名新队员',
      ...runExit(this, this.run),
    })

    const D = f.detail
    new Panel(this, D.x, D.y, D.w, D.h)
    if (f.portrait) {
      this.previewRect = { x: D.x, y: D.y, w: D.w, h: 196 }
      new Divider(this, D.x + 16, D.y + 202, D.w - 32)
      this.detail = new ScrollView(this, { x: D.x, y: D.y + 212, w: D.w, h: D.h - 220 })
    } else {
      this.previewRect = { x: D.x, y: D.y, w: 264, h: D.h }
      new Divider(this, D.x + 272, D.y + 16, D.h - 32, true)
      this.detail = new ScrollView(this, { x: D.x + 280, y: D.y + 8, w: D.w - 280, h: D.h - 16 })
    }

    this.grid = new EmojiGrid(this, f.list)
    this.grid.onTap = (key): void => {
      this.selectedKey = key
      if (typeof key !== 'number' && this.cardState(key) === 'open') {
        const at = this.picked.indexOf(key)
        if (at >= 0) this.picked.splice(at, 1)
        else if (this.picked.length < this.due) this.picked.push(key)
        else if (this.due === 1) this.picked = [key]
      }
      this.refresh()
    }

    this.confirmBtn = new Button(this, f.centerX, f.footerY, {
      label: this.confirmLabel(),
      keys: ['ENTER', 'SPACE'],
      sfx: null,
      onTap: () => this.confirm(),
    })

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private confirmLabel(): string {
    return this.due > 1 ? `全员入队 ${this.picked.length}/${this.due}` : '招募入队'
  }

  private confirmEnabled(): boolean {
    return this.due > 0 && this.picked.length === this.due
  }

  private cardState(id: CharacterId): 'locked' | 'taken' | 'open' {
    const idx = this.pool.indexOf(id)
    if (idx < 0 || idx >= this.unlocked) return 'locked'
    return this.run.roster.includes(id) ? 'taken' : 'open'
  }

  private validSelected(): boolean {
    const sel = this.selectedKey
    if (sel === null) return false
    if (typeof sel === 'number') return sel >= this.unlocked && sel < this.pool.length
    return this.pool.includes(sel)
  }

  private buildItems(): GridItem<CharacterId | number>[] {
    return this.pool.map((id, i) => {
      if (i >= this.unlocked) return { key: i, emoji: '2753', dim: true }
      return {
        key: id,
        emoji: CHARACTERS[id].emoji,
        outline: 'player' as const,
        badge: this.run.roster.includes(id) ? '1f396' : this.picked.includes(id) ? '2705' : undefined,
      }
    })
  }

  private confirm(): void {
    if (!this.confirmEnabled()) return
    for (const id of this.picked) {
      if (recruitMember(this.run, id) < 0) return
    }
    playSfx('recruit')
    this.picked = []
    this.selectedKey = null
    this.scene.start(teamStep(this.run) ?? nextAfterTeam(this.run))
  }

  update(_time: number, delta: number): void {
    this.previewPhase += (delta / 1000) * PREVIEW_SPIN
    this.layoutPreview()
  }

  private renderDetail(): void {
    const view = this.detail.clear()
    const sel = this.selectedKey
    if (sel === null) return
    const w = view.viewport.w
    const flow = new Flow(this, view, { x: 16, y: 8, width: w - 40 })
    if (typeof sel === 'number') {
      flow.put(new Icon(this, 16 + 37, 45, '2753', 74))
      flow.put(new Label(this, 104, 30, '命运牌 · 未解锁', { kind: 'lead', color: 'muted' }).setOrigin(0, 0.5))
      flow.put(new Label(this, 104, 58, `队伍规模达到 ${unlockAt(sel)} 人时揭晓这张牌的真身`, { kind: 'label', color: 'muted', wrap: w - 124 }))
      flow.finish(112)
      return
    }
    const def = CHARACTERS[sel]
    const state = this.cardState(sel)
    const tag = state === 'taken' ? { text: ' · 已入队', color: 'good' as const } : this.picked.includes(sel) ? { text: ' · 已选', color: 'info' as const } : null
    flow.put(new Icon(this, 16 + 37, 45, def.emoji, 74, 'player'))
    flow.put(new RichLabel(this, 104, 30, tag ? [def.name, tag] : def.name, { kind: 'lead', gap: 0, originX: 0, maxWidth: w - 124 }))
    const desc = new Label(this, 104, 58, def.desc, { kind: 'label', color: 'muted', wrap: w - 124 })
    flow.put(desc)
    flow.y = Math.max(104, desc.y + desc.height + 12)
    flowStatGroups(flow, characterStatGroups(sel, [], 1, { path: false }))
    flow.finish()
  }

  private refresh(): void {
    this.grid.setItems(this.buildItems())
    this.grid.setSelected(this.selectedKey)
    this.renderDetail()
    this.rebuildPreview()
    this.confirmBtn.setLabel(this.confirmLabel()).setEnabled(this.confirmEnabled())
  }

  private rebuildPreview(): void {
    for (const s of this.previewSlots) s.slot.destroy()
    this.previewCaption?.destroy()
    this.previewSlots = []
    const P = this.previewRect
    const n = this.run.roster.length
    const total = n + this.due
    if (total === 0) return
    const posts = ringPosts(total, this.previewPhase)
    const maxR = Math.max(...posts.map((p) => Math.hypot(p.x, p.y)), 1)
    const base = Math.min(P.w, P.h) >= 240 ? 58 : 50
    const fit = Math.min(P.w, P.h) / 2 - base / 2 - 24
    const scale = Math.min(2.2, fit / maxR)
    const size = fitIconSize(posts, scale, base)
    const cx = P.x + P.w / 2
    const cy = P.y + P.h / 2 - 6
    this.previewGeom = { cx, cy, scale }
    posts.forEach((p, post) => {
      const x = cx + p.x * scale
      const y = cy + p.y * scale
      let slot: AvatarSlot
      if (post < n) {
        slot = new AvatarSlot(this, x, y, size, { mode: 'member', emoji: CHARACTERS[this.run.roster[post]!].emoji, outline: 'player' })
      } else {
        const id = this.picked[post - n]
        slot = id
          ? new AvatarSlot(this, x, y, size, {
              mode: 'picked',
              emoji: CHARACTERS[id].emoji,
              outline: 'player',
              onTap: () => {
                const at = this.picked.indexOf(id)
                if (at >= 0) this.picked.splice(at, 1)
                this.selectedKey = id
                this.refresh()
              },
            })
          : new AvatarSlot(this, x, y, size, { mode: 'empty' })
      }
      this.previewSlots.push({ slot, post })
    })
    this.previewCaption = new Label(this, cx, P.y + P.h - 14, `队伍 ${n} 人 → ${total} 人`, { kind: 'label', color: 'info' }).setOrigin(0.5, 1)
  }

  private layoutPreview(): void {
    if (this.previewSlots.length === 0) return
    const posts = ringPosts(this.run.roster.length + this.due, this.previewPhase)
    const { cx, cy, scale } = this.previewGeom
    for (const s of this.previewSlots) {
      const p = posts[s.post]
      if (p) s.slot.setPosition(cx + p.x * scale, cy + p.y * scale)
    }
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  devProvider(): DevProvider {
    return {
      id: 'recruit',
      title: '招募页',
      sections: [
        {
          id: 'recruit',
          title: '招募页',
          items: () => [
            {
              kind: 'action',
              label: '自动补齐并入队',
              desc: '按候选顺序把空位填满后直接确认，省去逐个点选',
              run: (): void => {
                for (const id of this.pool.slice(0, this.unlocked)) {
                  if (this.picked.length >= this.due) break
                  if (this.cardState(id) === 'open' && !this.picked.includes(id)) this.picked.push(id)
                }
                this.refresh()
                this.confirm()
              },
            },
          ],
        },
      ],
    }
  }
}

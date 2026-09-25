import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { formationPosts } from '../data/formation'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { getRun, guardCenter, guardOrder, setGuardCenter } from '../run/state'
import type { RunState } from '../run/state'
import { applyBackground } from '../util/background'
import { emojiImage } from '../emoji/hold'
import { ScrollView } from '../ui/scroll'
import type { ScrollRect } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'
import {
  addConfirmButton,
  addRunExit,
  addTeamFrame,
  fitIconSize,
  nextAfterTeam,
  PREVIEW_SPIN,
  renderStatGroups,
  teamLayout,
} from './teamPage'
import type { TeamLayout } from './teamPage'

export class FormationScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private fromShop = false
  private swapBusy = false
  private layout!: TeamLayout
  private origin = { x: 0, y: 0 }
  private detailView!: ScrollView
  private detailRect: ScrollRect = { x: 0, y: 0, w: 0, h: 0 }
  private memberObjs: Phaser.GameObjects.GameObject[] = []
  private memberImgs: Phaser.GameObjects.Image[] = []
  private memberZones: Phaser.GameObjects.Zone[] = []
  private iconSize = 80
  private phase = 0
  private geom = { cx: 0, cy: 0, scale: 1 }

  constructor() {
    super('formation')
  }

  init(data?: { fromShop?: boolean }): void {
    this.fromShop = !!data?.fromShop && this.scene.isSleeping('shop')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.run = getRun()
    this.memberObjs = []
    this.swapBusy = false
    if (!this.fromShop) this.run.formationIntroduced = true

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = teamLayout(w, h))
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = this.origin.y

    addTeamFrame(
      this,
      L,
      this.origin,
      '布置阵型',
      this.fromShop ? '点选一名队员，与中心互换' : '满员自动列阵 N 保 1 · 点选队员设为受保护的中心',
      res,
    )

    if (this.fromShop) {
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
      this.input.keyboard?.on('keydown-ESC', () => this.exitToShop())
    } else {
      addRunExit(this, this.run, this.origin.x + 40, oy + L.headerY, res)
    }

    const D = L.detail
    this.detailRect = { x: this.origin.x + D.x, y: oy + D.y, w: D.w, h: D.h }
    this.detailView = new ScrollView(this, this.detailRect)

    const label = this.fromShop ? '返回商店' : nextAfterTeam(this.run) === 'shop' ? '前往商店' : '开战'
    addConfirmButton(this, L, this.origin, label, res, () => this.confirm())

    this.rebuild()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private confirm(): void {
    if (this.fromShop) {
      this.exitToShop()
      return
    }
    playSfx('click')
    this.scene.start(nextAfterTeam(this.run))
  }

  private exitToShop(): void {
    playSfx('click')
    this.scene.wake('shop')
    this.scene.stop()
  }

  private postIds(): CharacterId[] {
    return guardOrder(this.run)
  }

  private rebuild(): void {
    for (const o of this.memberObjs) o.destroy()
    this.memberObjs = []
    this.memberImgs = []
    this.memberZones = []
    const res = textRes()
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const ids = this.postIds()
    const n = ids.length
    const posts = formationPosts('guard', n, this.phase)

    const panel = this.add.graphics()
    roundRect(panel, lx, ly, L.w, L.h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })
    this.memberObjs.push(panel)

    const maxR = Math.max(...posts.map((p) => Math.hypot(p.x, p.y)), 1)
    const cx = lx + L.w / 2
    const cy = ly + L.h / 2
    const scale = Math.min(2.4, (Math.min(L.w, L.h) / 2 - 76) / maxR)
    this.geom = { cx, cy, scale }
    const size = fitIconSize(posts, scale, 80)
    this.iconSize = size
    const half = size / 2

    posts.forEach((p, post) => {
      const id = ids[post]
      if (!id) return
      const px = cx + p.x * scale
      const py = cy + p.y * scale
      if (post === 0) {
        const ring = this.add.graphics()
        ring.lineStyle(3, 0xffdc5d, 0.95)
        ring.strokeCircle(px, py, half + 4)
        this.memberObjs.push(ring)
      }
      const img = emojiImage(this, px, py, CHARACTERS[id].emoji, size, 'player')
      this.memberObjs.push(img)
      this.memberImgs[post] = img
      const zone = this.add
        .zone(px - half, py - half, size, size)
        .setOrigin(0)
        .setInteractive({ useHandCursor: post !== 0 })
        .on('pointerup', () => this.onMemberTap(post))
      this.memberObjs.push(zone)
      this.memberZones[post] = zone
    })

    this.memberObjs.push(
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
  }

  private layoutMembers(): void {
    const ids = this.postIds()
    const posts = formationPosts('guard', ids.length, this.phase)
    const { cx, cy, scale } = this.geom
    const half = this.iconSize / 2
    posts.forEach((p, post) => {
      if (post === 0) return
      const img = this.memberImgs[post]
      const zone = this.memberZones[post]
      if (!img || !zone) return
      const px = cx + p.x * scale
      const py = cy + p.y * scale
      img.setPosition(px, py)
      zone.setPosition(px - half, py - half)
    })
  }

  update(_time: number, delta: number): void {
    if (this.swapBusy) return
    this.phase += (delta / 1000) * PREVIEW_SPIN
    this.layoutMembers()
  }

  private onMemberTap(post: number): void {
    if (this.swapBusy || post === 0) return
    const ids = this.postIds()
    const id = ids[post]
    if (!id || !setGuardCenter(this.run, id)) return
    playSfx('click')
    const ia = this.memberImgs[0]
    const ib = this.memberImgs[post]
    if (!ia || !ib) {
      this.rebuild()
      return
    }
    this.swapBusy = true
    playSfx('whoosh')
    const done = (): void => {
      this.swapBusy = false
      this.rebuild()
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
    const end = renderStatGroups(this, this.detailView, D.w, center, items, res, start)
    this.detailView.setContentHeight(end + 12)
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart({ fromShop: this.fromShop })
  }
}

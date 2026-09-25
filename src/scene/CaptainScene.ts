import Phaser from 'phaser'
import { CAPTAINS, PICKABLE_CAPTAIN_IDS } from '../data/captains'
import type { CaptainId } from '../types/captains'
import { browserStorage } from '../util/storage'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { beginRun, teamStep } from '../run/state'
import { loadCaptain, loadMap, saveCaptain } from '../save/selection'
import { captainStatGroups } from '../scene/statLines'
import { applyBackground } from '../util/background'
import { emojiImage, preloadEmojis } from '../emoji/hold'
import { EmojiGrid } from '../ui/grid'
import { ScrollView } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { nextAfterTeam } from './teamPage'

interface CaptainLayout {
  content: { w: number; h: number }
  headerY: number
  list: { x: number; y: number; w: number; h: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: CaptainLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  detail: { x: 40, y: 96, w: 730, h: 520 },
  list: { x: 810, y: 96, w: 430, h: 520 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: CaptainLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  detail: { x: 24, y: 100, w: 672, h: 480 },
  list: { x: 24, y: 604, w: 672, h: 520 },
  btn: { y: 1184, w: 360, h: 72 },
}

export class CaptainScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private selectedId: CaptainId = PICKABLE_CAPTAIN_IDS[0]!
  private layout!: CaptainLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailView!: ScrollView
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('captain')
  }

  preload(): void {
    if (!this.preserveOnRestart) this.selectedId = loadCaptain(browserStorage())
    const ids = new Set<CaptainId>([this.selectedId, ...PICKABLE_CAPTAIN_IDS])
    preloadEmojis(
      this,
      [...ids].flatMap((id) => [
        { id: CAPTAINS[id].emoji, outline: 'player' as const },
        ...captainStatGroups(CAPTAINS[id]).map((g) => ({ id: g.icon })),
      ]),
    )
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const ox = this.origin.x
    const oy = this.origin.y

    this.add
      .text(ox + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('map'))
    this.add
      .text(w / 2, oy + L.headerY, '选择队长', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    this.grid = new EmojiGrid(this, { x: ox + L.list.x, y: oy + L.list.y, w: L.list.w, h: L.list.h })
    this.grid.onTap = (key): void => {
      playSfx('click')
      this.selectedId = key as CaptainId
      saveCaptain(browserStorage(), this.selectedId)
      this.refresh()
    }
    this.grid.setItems(
      PICKABLE_CAPTAIN_IDS.map((id) => ({ key: id, emoji: CAPTAINS[id].emoji, outline: 'player' as const })),
    )

    const D = L.detail
    const dx = ox + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    roundRect(panel, dx, dy, D.w, D.h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })
    this.detailView = new ScrollView(this, { x: dx, y: dy, w: D.w, h: D.h })

    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btn.y - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    const b = this.btnRect
    const btnBg = this.add.graphics()
    roundRect(btnBg, b.x, b.y, b.w, b.h, b.h / 2, { fill: 0xffdc5d })
    this.add
      .text(w / 2, oy + L.btn.y, '组建队伍', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    const confirm = (): void => {
      playSfx('click')
      const run = beginRun(this.selectedId, [], loadMap(browserStorage()))
      this.scene.start(teamStep(run) ?? nextAfterTeam(run))
    }
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', confirm)
    this.input.keyboard?.on('keydown-ENTER', confirm)
    this.input.keyboard?.on('keydown-SPACE', confirm)
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('map'))

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private renderDetail(res: number): void {
    this.detailView.clear()
    const D = this.layout.detail
    const def = CAPTAINS[this.selectedId]

    this.detailView.add([
      emojiImage(this, 58, 56, def.emoji, 85, 'player'),
      this.add
        .text(104, 42, def.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(104, 76, '队长 · 提供团队增益，不参与战斗', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#b9b9c6',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    ])

    let cursor = 122
    for (const group of captainStatGroups(def)) {
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
      cursor += 36
      for (const line of group.lines) {
        const t = this.add
          .text(62, cursor, line, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: '#d0d0d8',
            wordWrap: { width: D.w - 104 },
            lineSpacing: 6,
            resolution: res,
          })
          .setOrigin(0, 0)
        this.detailView.add(t)
        cursor += Math.max(34, t.height + 6)
      }
      cursor += 10
    }
    this.detailView.setContentHeight(cursor + 12)
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedId)
    this.renderDetail(textRes())
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

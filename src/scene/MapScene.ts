import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import type { MapId } from '../types/maps'
import { bossFor, MAP_IDS, MAPS } from '../data/maps'
import { BATTLE_SCENE_KEY } from '../ecs/keys'
import { beginRun } from '../run/state'
import { sandboxCaptain, sandboxStarters } from '../run/sandbox'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { loadMap, saveMap } from '../save/selection'
import { loadSettings } from '../save/settings'
import { applyBackground } from '../util/background'
import { reportDebug } from '../debug'
import { emojiImage, preloadEmojis } from '../emoji/hold'
import { EmojiGrid } from '../ui/grid'
import { ScrollView } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'

const MAP_PLAY_LABEL: Record<(typeof MAPS)[keyof typeof MAPS]['kind'], string> = {
  bounded: '有界竞技场：25×25 方场，边界围合',
  infinite: '无限世界：可朝任意方向走到天涯，终波毒雾收拢成圈',
  river: '奔流河道：万物随水流漂移，逆流而战',
  void: '环面战场：四壁皆传送门，出这头即现那头',
  ruins: '断壁废墟：墙挡人 / 挡弹 / 挡视线，靠掩体与探头作战',
  daynight: '昼夜原野：30×30 有界，视野随时间涨落——正午纵览全场、午夜相机收窄并四合迷雾；昼夜各出一批怪',
  space: '深空星海：无限世界，天体不时沿直线横扫（敌我通吃、有预警可躲）；终波奇点张开禁锢场，越往外阻力越大、谁也逃不出',
  ice: '浮冰：25×25 方形浮冰，全场打滑——不跟手、刹不住、会过冲，击退也滑得更远；滑出冰面即落水，每秒掉血又游得慢（敌我通吃），把敌人推下水淹死是活路。相机永远跟随',
}

const GROUP_ICONS = { theme: '1f5fa', decor: '1f33f', play: '1f579' } as const

interface MapLayout {
  content: { w: number; h: number }
  headerY: number
  list: { x: number; y: number; w: number; h: number }
  detail: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: MapLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  detail: { x: 40, y: 96, w: 730, h: 520 },
  list: { x: 810, y: 96, w: 430, h: 520 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: MapLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  detail: { x: 24, y: 100, w: 672, h: 480 },
  list: { x: 24, y: 604, w: 672, h: 520 },
  btn: { y: 1184, w: 360, h: 72 },
}

export class MapScene extends Phaser.Scene {
  // 视口变化触发的 restart 置真，保留页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private selectedId: MapId = MAP_IDS[0]!
  private layout!: MapLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailView!: ScrollView
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private confirmLabel!: Phaser.GameObjects.Text
  private devMode = false
  private sandbox = false
  private testRect = { x: 0, y: 0, w: 0, h: 0 }
  private testBg?: Phaser.GameObjects.Graphics
  private testLabel?: Phaser.GameObjects.Text

  constructor() {
    super('map')
  }

  preload(): void {
    preloadEmojis(this, [
      ...Object.values(GROUP_ICONS).map((id) => ({ id })),
      ...MAP_IDS.flatMap((id) => [
        { id: MAPS[id].emoji },
        ...MAPS[id].decor.emojis.map((e) => ({ id: e, outline: 'player' as const })),
      ]),
    ])
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    if (!preserved) this.selectedId = loadMap(browserStorage())

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
      .on('pointerup', () => this.scene.start('menu'))
    this.add
      .text(w / 2, oy + L.headerY, '选择地图', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 开发者模式关闭时须把 sandbox 归零，否则开关看不见却仍生效
    this.devMode = loadSettings(browserStorage()).devMode
    if (!this.devMode) this.sandbox = false
    if (this.devMode) {
      const tw = 210
      const th = 46
      this.testRect = { x: ox + L.content.w - 40 - tw, y: oy + L.headerY - th / 2, w: tw, h: th }
      const t = this.testRect
      this.testBg = this.add.graphics()
      this.testLabel = this.add
        .text(t.x + t.w / 2, oy + L.headerY, '', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
      this.add
        .zone(t.x, t.y, t.w, t.h)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          playSfx('click')
          this.sandbox = !this.sandbox
          this.refresh()
        })
    }

    this.grid = new EmojiGrid(this, { x: ox + L.list.x, y: oy + L.list.y, w: L.list.w, h: L.list.h })
    this.grid.onTap = (key): void => {
      playSfx('click')
      this.selectedId = key as MapId
      saveMap(browserStorage(), this.selectedId)
      this.refresh()
    }
    this.grid.setItems(MAP_IDS.map((id) => ({ key: id, emoji: MAPS[id].emoji })))

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
    this.confirmLabel = this.add
      .text(w / 2, oy + L.btn.y, '选择队长', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    const confirm = (): void => {
      playSfx('click')
      if (this.sandbox) {
        beginRun(sandboxCaptain(), sandboxStarters(), this.selectedId, true)
        this.scene.start(BATTLE_SCENE_KEY)
        return
      }
      this.scene.start('captain')
    }
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', confirm)
    this.input.keyboard?.on('keydown-ENTER', confirm)
    this.input.keyboard?.on('keydown-SPACE', confirm)
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private renderDetail(res: number): void {
    this.detailView.clear()
    const D = this.layout.detail
    const def = MAPS[this.selectedId]

    this.detailView.add([
      emojiImage(this, 58, 58, def.emoji, 85),
      this.add
        .text(104, 58, def.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    ])

    let cursor = 132
    const group = (icon: string, title: string): void => {
      this.detailView.add([
        emojiImage(this, 42, cursor, icon, 35),
        this.add
          .text(62, cursor, title, {
            fontFamily: UI_FONT,
            fontSize: FONT.strong,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      ])
      cursor += 40
    }
    const line = (text: string, color = '#d0d0d8'): void => {
      const t = this.add
        .text(62, cursor, text, {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color,
          wordWrap: { width: D.w - 104 },
          lineSpacing: 6,
          resolution: res,
        })
        .setOrigin(0, 0)
      this.detailView.add(t)
      cursor += Math.max(36, t.height + 8)
    }

    group(GROUP_ICONS.theme, '主题')
    line(def.desc)
    cursor += 14
    group(GROUP_ICONS.decor, '地面装饰')
    const startX = 62 + 16
    const pitch = 46
    const perRow = Math.max(1, Math.floor((D.w - startX - 16) / pitch))
    let px = startX
    let placed = 0
    for (const e of def.decor.emojis) {
      if (placed > 0 && placed % perRow === 0) {
        px = startX
        cursor += pitch
      }
      this.detailView.add(emojiImage(this, px, cursor + 10, e, 45, 'player'))
      px += pitch
      placed++
    }
    cursor += 44
    group(GROUP_ICONS.play, '玩法')
    line(MAP_PLAY_LABEL[def.kind])
    line(`终波头目 ${bossFor(this.selectedId).name}`, '#9a9aa8')
    this.detailView.setContentHeight(cursor + 12)
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedId)
    const on = this.sandbox
    if (this.testBg && this.testLabel) {
      const t = this.testRect
      this.testBg.clear()
      roundRect(this.testBg, t.x, t.y, t.w, t.h, t.h / 2, {
        fill: on ? 0xffdc5d : 0xffffff, fillAlpha: on ? 0.92 : 0.08,
        stroke: 0xffffff, strokeAlpha: on ? 0 : 0.18,
      })
      this.testLabel.setText(on ? '试炼场：开' : '试炼场：关')
      this.testLabel.setColor(on ? '#25262e' : '#c8c8d4')
    }
    this.confirmLabel.setText(on ? '进入试炼场' : '选择队长')
    this.renderDetail(textRes())
    this.reportMap()
  }

  private reportMap(): void {
    reportDebug({
      scene: 'map',
      elapsed: 0,
      kills: 0,
      level: 1,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      map: {
        selected: this.selectedId,
        items: this.grid.cellRects().map((r) => ({ id: r.key, x: r.x, y: r.y, w: r.w, h: r.h })),
        start: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
        },
        test: this.devMode
          ? {
              x: Math.round(this.testRect.x + this.testRect.w / 2),
              y: Math.round(this.testRect.y + this.testRect.h / 2),
              on: this.sandbox,
            }
          : undefined,
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

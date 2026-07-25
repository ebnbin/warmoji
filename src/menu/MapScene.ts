import Phaser from 'phaser'
import { browserStorage } from '../core/storage'
import type { MapId } from '../maps/registry'
import { bossFor, MAP_IDS, MAPS } from '../maps/registry'
import { battleSceneFor } from '../experiments/ecsExperiment'
import { beginRun } from '../run/state'
import { labCaptain, labStarters } from '../run/lab'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { loadMap, saveMap } from '../run/selection'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage } from '../emoji/textures'
import { EmojiGrid } from './grid'
import { ScrollView } from './scroll'
import { FONT, UI_FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'

// 地图选择页 = 开始游戏第一步（主菜单 → 选地图 → 选队长 → 组队 → 战斗）。
// 地图即关卡：各图有专属世界规则、出怪表与终波 Boss（详情页「玩法」段展示）。
// 布局沿用方向约定：竖屏「上」= 横屏「左」（详情），列表在下/右。

/** 各图世界规则一句话（地图详情「玩法」段） */
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
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private selectedId: MapId = MAP_IDS[0]!
  private layout!: MapLayout
  private origin = { x: 0, y: 0 }
  private grid!: EmojiGrid
  private detailView!: ScrollView
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }
  private confirmLabel!: Phaser.GameObjects.Text
  private testChk!: Phaser.GameObjects.Text
  private testMode = false

  constructor() {
    super('map')
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

    // 地图网格（单选；形象即含义，主题与装饰看详情面板）
    this.grid = new EmojiGrid(this, { x: ox + L.list.x, y: oy + L.list.y, w: L.list.w, h: L.list.h })
    this.grid.onTap = (key): void => {
      playSfx('click')
      this.selectedId = key as MapId
      saveMap(browserStorage(), this.selectedId)
      this.refresh()
    }
    this.grid.setItems(MAP_IDS.map((id) => ({ key: id, emoji: MAPS[id].emoji })))

    // 详情面板底板
    const D = L.detail
    const dx = ox + D.x
    const dy = oy + D.y
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)
    // 地图介绍/装饰预览是变长内容，装进可滚动容器
    this.detailView = new ScrollView(this, { x: dx, y: dy, w: D.w, h: D.h })

    // 确认按钮
    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btn.y - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    const b = this.btnRect
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0xffdc5d, 1)
    btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.confirmLabel = this.add
      .text(w / 2, oy + L.btn.y, '选择队长', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    // 测试模式勾选框（在确认按钮上方）：勾上则跳过队长/组队，直接进该图的沙盒
    this.testChk = this.add
      .text(w / 2, b.y - 20, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#ffffff',
        backgroundColor: '#00000055',
        padding: { x: 10, y: 5 },
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        playSfx('click')
        this.testMode = !this.testMode
        this.refresh()
      })
    const confirm = (): void => {
      playSfx('click')
      // 测试模式：跳过队长/组队/商店，用当前勾选阵容在该图上开沙盒
      if (this.testMode) {
        beginRun(labCaptain(), labStarters(), this.selectedId, true)
        this.scene.start(battleSceneFor(this.selectedId))
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

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private renderDetail(res: number): void {
    // 内容坐标以详情面板左上为原点（0,0），滚动交给 ScrollView
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

    group('1f5fa', '主题')
    line(def.desc)
    cursor += 14
    group('1f33f', '地面装饰')
    // 装饰 emoji 预览：按面板宽自动换行，装饰再多也不会横向溢出
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
    group('1f579', '玩法')
    line(MAP_PLAY_LABEL[def.kind])
    line(`终波头目 ${bossFor(this.selectedId).name}`, '#9a9aa8')
    this.detailView.setContentHeight(cursor + 12)
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedId)
    this.testChk.setText(`测试模式（免死沙盒·跳过组队）：${this.testMode ? '开' : '关'}`)
    this.testChk.setColor(this.testMode ? '#ffdc5d' : '#c8c8d4')
    this.testChk.setBackgroundColor(this.testMode ? '#2e7d32' : '#00000055')
    this.confirmLabel.setText(this.testMode ? '进入测试模式' : '选择队长')
    this.renderDetail(textRes())
    this.reportMap()
  }

  private reportMap(): void {
    reportDebug({
      scene: 'map',
      elapsed: 0,
      hp: 0,
      alive: 0,
      kills: 0,
      level: 1,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      map: {
        selected: this.selectedId,
        items: this.grid.cellRects().map((r) => ({ id: r.key, x: r.x, y: r.y, w: r.w, h: r.h })),
        start: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
        },
        test: {
          x: Math.round(this.testChk.x),
          y: Math.round(this.testChk.getBounds().centerY),
          on: this.testMode,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

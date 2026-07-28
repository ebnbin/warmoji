import Phaser from 'phaser'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { applyBackground } from '../util/background'
import { reportDebug } from '../debug'
import { emojiImage } from '../emoji/textures'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'

// 主菜单：⚔️ + 字标 + 一个主按钮 + 一排次级入口，居中一列，横竖屏同构。
//
// 这里此前堆了四套无限循环的 tween：背景漂浮的暗纹 emoji、字标逐字弹跳、
// 「角色 vs 敌人」互射的小剧场、主按钮呼吸缩放。**一直在动的东西读起来就是廉价**——
// 它没有在表达任何状态，只是在证明自己会动。现在只保留一次进场：
// 三组内容淡入并微微上浮，随即静止；**动效必须收场**，这是本页唯一的动效规矩。
//
// 一并去掉的还有：无信息量的副标题、最佳记录（排行榜之后单独做），
// 以及 Twemoji 署名行——署名收进设置页一处，不必每张大厅页都挂一条。

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 次级入口（场景键即 key） */
const ENTRIES: readonly { key: 'studio' | 'wiki' | 'settings'; icon: string; label: string }[] = [
  { key: 'studio', icon: '1f9ea', label: '工作台' },
  { key: 'wiki', icon: '1f4d6', label: '图鉴' },
  { key: 'settings', icon: '2699', label: '设置' },
]

/** 一列内容的度量（相对字标基线）。竖屏整体放大：同一套尺寸摆到 720×1280 上，
 * 会缩成一小簇浮在正中，四周全是空——空得像是还没做完，而不是克制 */
interface MenuMetrics {
  readonly logoSize: string
  readonly swordSize: number
  readonly swordDy: number
  readonly startDy: number
  readonly startW: number
  readonly entryDy: number
  readonly entryH: number
}

const LANDSCAPE: MenuMetrics = {
  logoSize: FONT.display, swordSize: 96, swordDy: -122, startDy: 148, startW: 380, entryDy: 262, entryH: 56,
}

const PORTRAIT: MenuMetrics = {
  logoSize: '100px', swordSize: 140, swordDy: -178, startDy: 216, startW: 440, entryDy: 372, entryH: 64,
}

export class MenuScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private startRect: Rect = { x: 0, y: 0, w: 0, h: 0 }
  private entryRects: Record<string, Rect> = {}

  constructor() {
    super('menu')
  }

  create(): void {
    applyCamera(this)
    if (!this.preserveOnRestart || !this.palette) {
      this.palette = randomPalette(new Rng(Date.now() >>> 0))
    }
    this.preserveOnRestart = false
    applyBackground(this.palette)
    this.entryRects = {}

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const m = h > w ? PORTRAIT : LANDSCAPE
    const cx = w / 2
    // 基线由「这一列实际占多高」反推：把整列的视觉重心放在 0.48 高度（略高于正中更耐看）。
    // 写死基线的话，横竖屏里上下留白会一头大一头小
    const top = m.swordDy - m.swordSize / 2
    const bottom = m.entryDy + m.entryH / 2
    const baseY = Math.round(h * 0.48 - (top + bottom) / 2)

    const logo = this.buildLogo(cx, baseY, m, res)
    const start = this.buildStart(cx, baseY + m.startDy, m, res)
    const entries = this.buildEntries(cx, baseY + m.entryDy, m, res)

    // 进场：淡入 + 上浮 16px，逐组错开 70ms；收场后页面完全静止
    for (const [i, box] of [logo, start, entries].entries()) {
      box.setAlpha(0)
      box.y += 16
      this.tweens.add({
        targets: box,
        alpha: 1,
        y: '-=16',
        duration: 420,
        delay: i * 70,
        ease: 'Cubic.easeOut',
      })
    }

    this.input.keyboard?.once('keydown-SPACE', () => this.startGame())
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame())

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    this.report()
  }

  /** ⚔️ + 双色字标，静态。字标按两段实测宽度拼接后整体居中，不逐字摆位 */
  private buildLogo(cx: number, y: number, m: MenuMetrics, res: number): Phaser.GameObjects.Container {
    const style = {
      fontFamily: UI_FONT,
      fontSize: m.logoSize,
      fontStyle: 'bold',
      resolution: res,
    }
    const war = this.add.text(0, 0, 'War', { ...style, color: '#ffdc5d' }).setOrigin(0, 0.5)
    const moji = this.add.text(0, 0, 'Moji', { ...style, color: '#f5f5f5' }).setOrigin(0, 0.5)
    const total = war.width + moji.width
    war.setX(-total / 2)
    moji.setX(-total / 2 + war.width)
    const sword = emojiImage(this, 0, m.swordDy, '2694', m.swordSize)
    return this.add.container(cx, y, [sword, war, moji])
  }

  /** 主按钮：琥珀实心胶囊，静态；按下时整块轻微下压，抬起即出发 */
  private buildStart(cx: number, cy: number, m: MenuMetrics, res: number): Phaser.GameObjects.Container {
    const bw = Math.min(m.startW, viewport.logicalWidth - 96)
    const bh = 78
    this.startRect = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh }
    const bg = this.add.graphics()
    roundRect(bg, -bw / 2, -bh / 2, bw, bh, bh / 2, { fill: 0xffdc5d })
    const label = this.add
      .text(0, 0, '开始战斗', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    const box = this.add.container(cx, cy, [bg, label])
    const r = this.startRect
    this.add
      .zone(r.x, r.y, r.w, r.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => box.setScale(0.97))
      .on('pointerupoutside', () => box.setScale(1))
      .on('pointerup', () => {
        box.setScale(1)
        this.startGame()
      })
    return box
  }

  /** 次级入口：一排轻量胶囊（图标 + 文字），宽度按文字实测自适应 */
  private buildEntries(cx: number, cy: number, m: MenuMetrics, res: number): Phaser.GameObjects.Container {
    const h = m.entryH
    const gap = 14
    const padX = 20
    const icon = 32
    const built = ENTRIES.map((e) => {
      const label = this.add
        .text(0, 0, e.label, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#c8c8d4',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      return { ...e, label, w: padX * 2 + icon + 10 + label.width }
    })
    const total = built.reduce((s, b) => s + b.w, 0) + gap * (built.length - 1)
    const box = this.add.container(cx, cy)
    let x = -total / 2
    for (const b of built) {
      const bg = this.add.graphics()
      roundRect(bg, x, -h / 2, b.w, h, h / 2, {
        fill: 0xffffff, fillAlpha: 0.07, stroke: 0xffffff, strokeAlpha: 0.14,
      })
      const img = emojiImage(this, x + padX + icon / 2, 0, b.icon, icon)
      b.label.setX(x + padX + icon + 10)
      box.add([bg, img, b.label])
      // 命中区用世界坐标：容器只承载进场动画，输入不跟着它一起动
      const rect: Rect = { x: cx + x, y: cy - h / 2, w: b.w, h }
      this.entryRects[b.key] = rect
      this.add
        .zone(rect.x, rect.y, rect.w, rect.h)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          playSfx('click')
          this.scene.start(b.key)
        })
      x += b.w + gap
    }
    return box
  }

  private startGame(): void {
    playSfx('click')
    this.scene.start('map')
  }

  private report(): void {
    const center = (r: Rect): Rect => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h })
    const empty: Rect = { x: 0, y: 0, w: 0, h: 0 }
    reportDebug({
      scene: 'menu',
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
      menu: {
        start: center(this.startRect),
        settings: center(this.entryRects.settings ?? empty),
        wiki: center(this.entryRects.wiki ?? empty),
        studio: center(this.entryRects.studio ?? empty),
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { loadSettings, saveSettings, SETTING_DEFS } from '../save/settings'
import type { Settings } from '../save/settings'
import { applyBackground } from '../util/background'
import { reportDebug } from '../debug'
import { emojiImage, emojiText } from '../emoji/textures'
import { ScrollView } from '../ui/scroll'
import type { ScrollRect } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { setBgmEnabled } from '../audio/bgm'
import { playSfx, setSfxEnabled } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'

// 设置页：按 SETTING_DEFS 定义表渲染开关列表，改动即时持久化。
// 布局按最小可用空间设计（横 1280×720 / 竖 720×1280），内容块居中于实际视口。
interface SettingsLayout {
  content: { w: number; h: number }
  headerY: number
  list: { y: number; w: number; rowH: number; gap: number }
}

const LANDSCAPE: SettingsLayout = {
  content: { w: 1280, h: 720 },
  headerY: 64,
  list: { y: 160, w: 680, rowH: 110, gap: 14 },
}

const PORTRAIT: SettingsLayout = {
  content: { w: 720, h: 1280 },
  headerY: 72,
  list: { y: 180, w: 672, rowH: 110, gap: 14 },
}

interface Row {
  key: keyof Settings
  /** 行内 y（相对滚动内容顶），世界坐标 = listRect.y + localY - scrollY */
  localY: number
  toggle: Phaser.GameObjects.Graphics
}

export class SettingsScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private settings!: Settings
  private layout!: SettingsLayout
  private rows: Row[] = []
  private list!: ScrollView
  private listRect: ScrollRect = { x: 0, y: 0, w: 0, h: 0 }
  private backRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('settings')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.settings = loadSettings(browserStorage())
    this.rows = []

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    const origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = origin.y

    const back = this.add
      .text(origin.x + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('menu'))
    this.backRect = {
      x: back.x,
      y: back.y - back.height / 2,
      w: back.width,
      h: back.height,
    }
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))

    emojiText(
      this,
      w / 2,
      oy + L.headerY,
      '{2699} 设置',
      {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      },
      { origin: 0.5 },
    )

    // 开关列表：居中单列，装进可滚动容器——选项定义表（SETTING_DEFS）只增不减，
    // 行数超出可视高度即滚动，不再从第 5 项起跑出屏外
    const S = L.list
    const lx = (w - S.w) / 2
    const listTop = oy + S.y
    const listH = L.content.h - S.y - 40
    this.listRect = { x: lx, y: listTop, w: S.w, h: listH }
    this.list = new ScrollView(this, this.listRect)
    SETTING_DEFS.forEach((def, i) => {
      const y = i * (S.rowH + S.gap)
      const bg = this.add.graphics()
      bg.fillStyle(0x000000, 0.22)
      bg.fillRoundedRect(0, y, S.w, S.rowH, 16)
      bg.lineStyle(1, 0xffffff, 0.1)
      bg.strokeRoundedRect(0, y, S.w, S.rowH, 16)

      const toggle = this.add.graphics()
      const row: Row = { key: def.key, localY: y, toggle }
      this.rows.push(row)

      const zone = this.add
        .zone(0, y, S.w, S.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.list.wasDragged) return
          this.settings[def.key] = !this.settings[def.key]
          saveSettings(browserStorage(), this.settings)
          // 音效/BGM 开关即时生效；开启瞬间用一声 click 给听感反馈
          setSfxEnabled(this.settings.sound)
          setBgmEnabled(this.settings.bgm)
          playSfx('click')
          this.drawToggle(row)
          this.reportSettings()
        })

      this.list.add([
        bg,
        emojiImage(this, 50, y + S.rowH / 2, def.icon, 58),
        this.add
          .text(92, y + S.rowH / 2 - 18, def.label, {
            fontFamily: UI_FONT,
            fontSize: FONT.head,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(92, y + S.rowH / 2 + 20, def.desc, {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#b9b9c6',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        toggle,
        zone,
      ])
      this.drawToggle(row)
    })
    this.list.setContentHeight(
      SETTING_DEFS.length * (S.rowH + S.gap) - S.gap,
    )

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    this.reportSettings()
  }

  /** 开关胶囊：开 = 琥珀色右侧圆钮，关 = 灰底左侧圆钮（坐标相对滚动内容） */
  private drawToggle(row: Row): void {
    const on = this.settings[row.key]
    const S = this.layout.list
    const tw = 76
    const th = 42
    const tx = S.w - 24 - tw
    const ty = row.localY + S.rowH / 2 - th / 2
    const g = row.toggle
    g.clear()
    g.fillStyle(on ? 0xffdc5d : 0xffffff, on ? 1 : 0.16)
    g.fillRoundedRect(tx, ty, tw, th, th / 2)
    g.fillStyle(on ? 0x25262e : 0xc0c0cc, 1)
    g.fillCircle(on ? tx + tw - th / 2 : tx + th / 2, ty + th / 2, th / 2 - 5)
  }

  private reportSettings(): void {
    const S = this.layout.list
    reportDebug({
      scene: 'settings',
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
      settings: {
        items: this.rows.map((r) => ({
          id: r.key,
          x: this.listRect.x,
          y: this.listRect.y + r.localY - this.list.scrollY,
          w: S.w,
          h: S.rowH,
          on: this.settings[r.key],
        })),
        back: {
          x: this.backRect.x + this.backRect.w / 2,
          y: this.backRect.y + this.backRect.h / 2,
          w: this.backRect.w,
          h: this.backRect.h,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

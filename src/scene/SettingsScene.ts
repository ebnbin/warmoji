import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { loadSettings, saveSettings, SETTING_DEFS } from '../save/settings'
import type { Settings } from '../save/settings'
import { applyBackground } from '../util/background'
import { emojiImage, preloadEmojis } from '../emoji/hold'
import { emojiText, templateEmojis } from '../ui/emojiText'
import { ScrollView } from '../ui/scroll'
import type { ScrollRect } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { setBgmEnabled } from '../audio/bgm'
import { playSfx, setSfxEnabled } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'

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

const TITLE = '{2699} 设置'

interface Row {
  key: keyof Settings
  /** 相对滚动内容顶 */
  localY: number
  toggle: Phaser.GameObjects.Graphics
}

export class SettingsScene extends Phaser.Scene {
  // 视口变化触发的 restart 置真，保留页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private settings!: Settings
  private layout!: SettingsLayout
  private rows: Row[] = []
  private list!: ScrollView
  private listRect: ScrollRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('settings')
  }

  preload(): void {
    preloadEmojis(this, [...templateEmojis(TITLE), ...SETTING_DEFS.map((d) => d.icon)].map((id) => ({ id })))
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

    this.add
      .text(origin.x + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('menu'))
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))

    emojiText(
      this,
      w / 2,
      oy + L.headerY,
      TITLE,
      {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      },
      { origin: 0.5 },
    )

    const S = L.list
    const lx = (w - S.w) / 2
    const listTop = oy + S.y
    const listH = L.content.h - S.y - 40
    this.listRect = { x: lx, y: listTop, w: S.w, h: listH }
    this.list = new ScrollView(this, this.listRect)
    SETTING_DEFS.forEach((def, i) => {
      const y = i * (S.rowH + S.gap)
      const bg = this.add.graphics()
      roundRect(bg, 0, y, S.w, S.rowH, 16, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })

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
          setSfxEnabled(this.settings.sound)
          setBgmEnabled(this.settings.bgm)
          playSfx('click')
          this.drawToggle(row)
        })

      this.list.add([
        bg,
        emojiImage(this, 50, y + S.rowH / 2, def.icon, 58),
        this.add
          .text(92, y + 32, def.label, {
            fontFamily: UI_FONT,
            fontSize: FONT.head,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(92, y + 54, def.desc, {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#b9b9c6',
            resolution: res,
            wordWrap: { width: S.w - 24 - 76 - 92 - 16, useAdvancedWrap: true },
            lineSpacing: 2,
          })
          .setOrigin(0, 0),
        toggle,
        zone,
      ])
      this.drawToggle(row)
    })
    // Twemoji 图形许可（CC-BY 4.0）要求署名，全作只此一处
    const rowsH = SETTING_DEFS.length * (S.rowH + S.gap) - S.gap
    const licenseY = rowsH + 30
    this.list.add(
      this.add
        .text(S.w / 2, licenseY, 'emoji graphics © Twemoji · CC-BY 4.0 · 有改动', {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.34),
    )
    this.list.setContentHeight(licenseY + 34)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

  }

  private drawToggle(row: Row): void {
    const on = this.settings[row.key]
    const S = this.layout.list
    const tw = 76
    const th = 42
    const tx = S.w - 24 - tw
    const ty = row.localY + S.rowH / 2 - th / 2
    const g = row.toggle
    g.clear()
    roundRect(g, tx, ty, tw, th, th / 2, { fill: on ? 0xffdc5d : 0xffffff, fillAlpha: on ? 1 : 0.16 })
    g.fillStyle(on ? 0x25262e : 0xc0c0cc, 1)
    g.fillCircle(on ? tx + tw - th / 2 : tx + th / 2, ty + th / 2, th / 2 - 5)
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}

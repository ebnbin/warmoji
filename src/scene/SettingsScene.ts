import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import { loadSettings, saveSettings, SETTING_DEFS } from '../save/settings'
import type { Settings } from '../save/settings'
import { preloadEmojis } from '../emoji/hold'
import { beginPage, Label, ListItem, PageHeader, pageFrame, ScrollView, Switch, templateEmojis } from '../ui'
import { setBgmEnabled } from '../audio/bgm'
import { setSfxEnabled } from '../audio/sfx'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const TITLE = '{2699} 设置'
const ROW = { h: 110, gap: 16 } as const

export class SettingsScene extends Phaser.Scene {
  private settings!: Settings

  constructor() {
    super(SceneKey.Settings)
  }

  preload(): void {
    preloadEmojis(this, [...templateEmojis(TITLE), ...SETTING_DEFS.map((d) => d.icon)].map((id) => ({ id })))
  }

  create(): void {
    beginPage(this)
    this.settings = loadSettings(browserStorage())
    const frame = pageFrame()
    new PageHeader(this, frame, { title: TITLE, back: () => this.scene.start(SceneKey.Menu) })

    const col = frame.column
    const list = new ScrollView(this, { x: col.x - 8, y: col.y, w: col.w + 16, h: col.h })
    SETTING_DEFS.forEach((def, i) => {
      const toggle = new Switch(this, 0, 0, {
        value: this.settings[def.key],
        onChange: (on) => {
          this.settings[def.key] = on
          saveSettings(browserStorage(), this.settings)
          setSfxEnabled(this.settings.sound)
          setBgmEnabled(this.settings.bgm)
        },
      })
      list.add(
        new ListItem(this, 8, i * (ROW.h + ROW.gap), col.w, ROW.h, {
          icon: def.icon,
          title: def.label,
          desc: def.desc,
          trailing: toggle,
          onTap: () => toggle.toggle(),
        }),
      )
    })
    const licenseY = SETTING_DEFS.length * (ROW.h + ROW.gap) + 14
    list.add(
      new Label(this, col.w / 2 + 8, licenseY, 'emoji graphics © Twemoji · CC-BY 4.0 · 有改动', { kind: 'caption', color: 'faint' }).setOrigin(0.5, 0),
    )
    list.setContentSize(licenseY + 40)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }
}

import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import { loadSettings, saveSettings, SETTING_DEFS } from '../save/settings'
import type { Settings } from '../save/settings'
import { preloadEmojis } from '../emoji/hold'
import { EMOJI_VENDOR } from '../emoji/vendor'
import { EMOJI_VENDORS } from '../emoji/vendors'
import { beginPage, Button, Label, ListItem, PageHeader, pageFrame, ScrollView, Switch, templateEmojis } from '../ui'
import { keysOf } from '../util/record'
import { setBgmEnabled } from '../audio/bgm'
import { setSfxEnabled } from '../audio/sfx'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const TITLE = '{2699} 设置'
const ROW = { h: 110, gap: 16 } as const
const VENDOR_ROW = { icon: '1f3a8', label: 'Emoji 画风', desc: '切换后游戏重新启动' } as const
const VENDOR_W = 160

export class SettingsScene extends Phaser.Scene {
  private settings!: Settings

  constructor() {
    super(SceneKey.Settings)
  }

  preload(): void {
    preloadEmojis(this, [...templateEmojis(TITLE), ...SETTING_DEFS.map((d) => d.icon), VENDOR_ROW.icon].map((id) => ({ id })))
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
    const vendors = keysOf(EMOJI_VENDORS)
    const nextVendor = (): void => {
      const at = vendors.indexOf(this.settings.emojiVendor)
      this.settings.emojiVendor = vendors[(at + 1) % vendors.length]!
      saveSettings(browserStorage(), this.settings)
      window.location.reload()
    }
    list.add(
      new ListItem(this, 8, SETTING_DEFS.length * (ROW.h + ROW.gap), col.w, ROW.h, {
        icon: VENDOR_ROW.icon,
        title: VENDOR_ROW.label,
        desc: VENDOR_ROW.desc,
        trailing: new Button(this, 0, 0, { label: EMOJI_VENDORS[this.settings.emojiVendor].name, size: 'sm', variant: 'secondary', width: VENDOR_W, onTap: nextVendor }),
        trailingWidth: VENDOR_W,
        onTap: nextVendor,
      }),
    )
    const licenseY = (SETTING_DEFS.length + 1) * (ROW.h + ROW.gap) + 14
    list.add(new Label(this, col.w / 2 + 8, licenseY, EMOJI_VENDOR.credit, { kind: 'caption', color: 'faint' }).setOrigin(0.5, 0))
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

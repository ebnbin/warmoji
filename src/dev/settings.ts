import type { DevProvider } from '../devtools'
import { setBgmEnabled } from '../audio/bgm'
import { setSfxEnabled } from '../audio/sfx'
import { loadSettings, saveSettings, SETTING_DEFS } from '../save/settings'
import { browserStorage } from '../util/storage'

/** 游戏级：玩家设置的镜像，不用退回设置页 */
export function settingsProvider(): DevProvider {
  return {
    id: 'settings',
    title: '设置',
    sections: [
      {
        id: 'settings',
        title: '设置',
        items: () =>
          SETTING_DEFS.map((def) => ({
            kind: 'toggle',
            label: def.label,
            desc: def.desc,
            get: () => loadSettings(browserStorage())[def.key],
            set: (on): void => {
              const settings = loadSettings(browserStorage())
              settings[def.key] = on
              saveSettings(browserStorage(), settings)
              setSfxEnabled(settings.sound)
              setBgmEnabled(settings.bgm)
            },
          })),
      },
    ],
  }
}

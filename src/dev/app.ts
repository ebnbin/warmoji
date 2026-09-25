import type Phaser from 'phaser'
import type { DevProvider } from '../devtools'
import { endRun } from '../run/state'
import { SceneKey } from '../scene/keys'
import { gotoScene } from './nav'

/** 游戏级：构建信息与全局动作 */
export function appProvider(game: Phaser.Game): DevProvider {
  return {
    id: 'app',
    title: '应用',
    sections: [
      {
        id: 'app',
        title: '应用',
        items: () => [
          { kind: 'text', mono: true, read: () => `构建 ${__BUILD_HASH__} · ${__BUILD_TIME__}` },
          {
            kind: 'buttons',
            buttons: [
              {
                label: '回到主菜单',
                run: (): void => {
                  endRun()
                  gotoScene(game, SceneKey.Menu)
                },
              },
            ],
          },
        ],
      },
    ],
  }
}

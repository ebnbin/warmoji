import Phaser from 'phaser'
import type { DevTab } from '../devtools'
import { endRun } from '../run/state'
import { SceneKey } from '../scene/keys'

/** 不带数据就能打开的页面 */
const PAGES: readonly { readonly key: SceneKey; readonly label: string }[] = [
  { key: SceneKey.Map, label: '选图' },
  { key: SceneKey.Wiki, label: '图鉴' },
  { key: SceneKey.Studio, label: 'Studio' },
  { key: SceneKey.Editor, label: '编辑器' },
  { key: SceneKey.Settings, label: '设置' },
]

/** 停掉所有业务 scene 再启动目标页：从哪里都能跳 */
function goto(game: Phaser.Game, key: SceneKey): void {
  for (const s of game.scene.getScenes(false)) {
    const status = s.sys.settings.status
    if (s.scene.key !== SceneKey.DevTools && status >= Phaser.Scenes.RUNNING && status <= Phaser.Scenes.SLEEPING) s.scene.stop()
  }
  game.scene.start(key)
}

export function pagesTab(game: Phaser.Game): DevTab {
  return {
    id: 'pages',
    title: '页面',
    items: () => [
      {
        kind: 'action',
        label: '主菜单',
        desc: '同时结束进行中的一局',
        run: (): void => {
          endRun()
          goto(game, SceneKey.Menu)
        },
      },
      { kind: 'buttons', buttons: PAGES.map((p) => ({ label: p.label, run: (): void => goto(game, p.key) })) },
    ],
  }
}

import type Phaser from 'phaser'
import { setDevConfig } from './config'
import { startLogCapture } from './log'
import { installHistory } from './history'
import { installInspect } from './inspect'
import { installInputWatch } from './inputWatch'
import { DevToolsScene } from './scene'
import { installTimeControl } from './timeControl'
import type { DevToolsConfig } from './types'

import { registerDevProvider } from './registry'
import { installSceneHosts } from './sceneHosts'
import type { DevProvider } from './types'

export { defineDevChoice, defineDevFlag, devChoice, devFlag, devFlagItem, setDevChoice, setDevFlag } from './flags'
export type { DevChoiceDef, DevFlagDef } from './flags'
export { markMetrics as markPerf, resetMetrics as resetPerf } from './metrics'
export { refreshDevPanel } from './registry'
export { setTimeScale, timeScale, TIME_SCALES } from './timeControl'
export { pickOnce } from './inspect'
export { layoutDock } from './dock'
export type { DevSize } from './dock'

/** 游戏级能力：与具体 scene 无关，随游戏常驻；scene 专有能力改由 scene 实现 devProvider() */
export function registerGameProvider(provider: DevProvider): () => void {
  return registerDevProvider(provider, 'game')
}
export type {
  DevActionItem,
  DevButtonsItem,
  DevChoiceItem,
  DevCustomItem,
  DevFlagsItem,
  DevInsets,
  DevItem,
  DevLayout,
  DevOption,
  DevProvider,
  DevProviderHost,
  DevScope,
  DevSection,
  DevTextItem,
  DevToggleItem,
  DevToolsConfig,
} from './types'

let installed = false

/** 在 new Phaser.Game 之后立即调用；覆盖层 scene 追加到场景栈末尾并常驻，面板与 React 另行按需加载 */
export function installDevTools(game: Phaser.Game, config: DevToolsConfig = {}): void {
  if (installed) throw new Error('devtools 只能安装一次')
  installed = true
  const cfg = setDevConfig(config)
  startLogCapture()
  installTimeControl(game, cfg.key)
  installInspect(game, cfg.key)
  installInputWatch(game)
  installHistory(game)
  installSceneHosts(game, cfg.key)
  game.scene.add(cfg.key, DevToolsScene, true)
  const host = document.createElement('div')
  host.className = 'dt'
  document.body.appendChild(host)
  void import('./panel/mount').then(
    (m) => m.mountPanel(game, host),
    (e: unknown) => console.error('开发面板加载失败', e),
  )
}

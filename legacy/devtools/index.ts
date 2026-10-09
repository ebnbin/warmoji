import type Phaser from 'phaser'
import { setDevConfig } from './config'
import { installHistory } from './history'
import { installInputWatch } from './inputWatch'
import { installInspect } from './inspect'
import { startLogCapture } from './log'
import { DevOverlayScene } from './overlayScene'
import { registerTabs } from './registry'
import { installSceneHosts } from './sceneHosts'
import { installTimeControl } from './timeControl'
import type { DevTab, DevToolsConfig } from './types'

export { devChoice, devFlag } from './flags'
export type { DevChoice, DevFlag } from './flags'
export { addOverlayPainter } from './overlay'
export type { OverlayCtx, OverlayPainter } from './overlay'
export { markMetrics, resetMetrics } from './metrics'
export { refreshDevPanel } from './registry'
export { pickOnce } from './inspect'
export { layoutDock } from './dock'
export type { DevSize } from './dock'
export type {
  DevActionItem,
  DevButtonsItem,
  DevChoiceItem,
  DevCustomItem,
  DevItem,
  DevLayer,
  DevMultiItem,
  DevOption,
  DevSceneTabs,
  DevTab,
  DevTabsHost,
  DevTextItem,
  DevToggleItem,
  DevToolsConfig,
} from './types'

/** 游戏层页签：与当前在哪个 scene 无关，一直都在 */
export function registerGameTab(tab: DevTab): () => void {
  return registerTabs('game', '', '', [tab])
}

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
  game.scene.add(cfg.key, DevOverlayScene, true)
  const host = document.createElement('div')
  host.className = 'dt'
  document.body.appendChild(host)
  void import('./panel/mount').then(
    (m) => m.mountPanel(game, host),
    (e: unknown) => console.error('开发面板加载失败', e),
  )
}

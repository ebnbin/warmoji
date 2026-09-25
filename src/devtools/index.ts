import type Phaser from 'phaser'
import { setDevConfig } from './config'
import { startLogCapture } from './log'
import { DevToolsScene } from './scene'
import { registerBuiltins } from './sections'
import type { DevToolsConfig } from './types'

export { markMetrics as markPerf, resetMetrics as resetPerf } from './metrics'
export { refreshDevPanel, registerDevSection, sceneDevSection } from './registry'
export type {
  DevActionItem,
  DevChoiceItem,
  DevCustomItem,
  DevFlagsItem,
  DevInsets,
  DevItem,
  DevLayout,
  DevOption,
  DevSection,
  DevTextItem,
  DevTheme,
  DevToggleItem,
  DevToolsConfig,
  DevWidget,
  DevWidgetContext,
} from './types'

let installed = false

/** 在 new Phaser.Game 之后立即调用；覆盖层 scene 会追加到场景栈末尾并常驻 */
export function installDevTools(game: Phaser.Game, config: DevToolsConfig = {}): void {
  if (installed) throw new Error('devtools 只能安装一次')
  installed = true
  const cfg = setDevConfig(config)
  startLogCapture()
  registerBuiltins(game)
  game.scene.add(cfg.key, DevToolsScene, true)
}

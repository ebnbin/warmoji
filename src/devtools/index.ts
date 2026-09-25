import type Phaser from 'phaser'
import { setDevConfig } from './config'
import { startLogCapture } from './log'
import { installHistory } from './history'
import { installInspect } from './inspect'
import { installInputWatch } from './inputWatch'
import { DevToolsScene } from './scene'
import { registerBuiltins } from './sections'
import { installTimeControl } from './timeControl'
import type { DevToolsConfig } from './types'

export { defineDevChoice, defineDevFlag, devChoice, devFlag, setDevChoice, setDevFlag } from './flags'
export type { DevChoiceDef, DevFlagDef } from './flags'
export { markMetrics as markPerf, resetMetrics as resetPerf } from './metrics'
export { refreshDevPanel, registerDevSection, sceneDevSection } from './registry'
export { setTimeScale, timeScale, TIME_SCALES } from './timeControl'
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
  installTimeControl(game, cfg.key)
  installInspect(game, cfg.key)
  installInputWatch(game)
  installHistory(game)
  registerBuiltins(game)
  game.scene.add(cfg.key, DevToolsScene, true)
}

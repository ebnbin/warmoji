import Phaser from 'phaser'
import { SceneKey } from '../scene/keys'

/** 停掉所有业务 scene 后启动目标 scene：从任意位置跳转 */
export function gotoScene(game: Phaser.Game, key: SceneKey, data?: object): void {
  for (const s of game.scene.getScenes(false)) {
    const status = s.sys.settings.status
    if (s.scene.key !== SceneKey.DevTools && status >= Phaser.Scenes.RUNNING && status <= Phaser.Scenes.SLEEPING) s.scene.stop()
  }
  game.scene.start(key, data)
}

import Phaser from 'phaser'
import { registerTabs } from './registry'
import type { DevTabsHost } from './types'

let game: Phaser.Game | undefined
let devKey = ''
const attached = new WeakSet<Phaser.Scene>()
const unregisters = new WeakMap<Phaser.Scene, () => void>()

function isHost(scene: Phaser.Scene): scene is Phaser.Scene & DevTabsHost {
  return typeof (scene as Partial<DevTabsHost>).devTabs === 'function'
}

function register(scene: Phaser.Scene & DevTabsHost): void {
  unregisters.get(scene)?.()
  const own = scene.devTabs()
  unregisters.set(scene, registerTabs('scene', scene.scene.key, own.title, own.tabs))
}

function unregister(scene: Phaser.Scene): void {
  unregisters.get(scene)?.()
  unregisters.delete(scene)
}

function attach(scene: Phaser.Scene): void {
  attached.add(scene)
  if (!isHost(scene)) return
  scene.events.on(Phaser.Scenes.Events.CREATE, () => register(scene))
  scene.events.on(Phaser.Scenes.Events.SHUTDOWN, () => unregister(scene))
  scene.events.on(Phaser.Scenes.Events.DESTROY, () => unregister(scene))
  if (scene.sys.settings.status >= Phaser.Scenes.RUNNING && scene.sys.settings.status <= Phaser.Scenes.SLEEPING) register(scene)
}

export function installSceneHosts(g: Phaser.Game, devSceneKey: string): void {
  game = g
  devKey = devSceneKey
}

/** 每帧扫一遍，接住运行期新增的 scene */
export function syncSceneHosts(): void {
  if (!game) return
  for (const scene of game.scene.getScenes(false)) {
    if (scene.scene.key === devKey || attached.has(scene)) continue
    attach(scene)
  }
}

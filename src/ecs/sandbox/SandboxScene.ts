import Phaser from 'phaser'
import { applyCamera, VIEWPORT_CHANGED } from '../../util/apply'
import { preloadEmojis } from '../../emoji/hold'
import { BATTLE_SCENE_KEY, SANDBOX_SCENE_KEY } from '../keys'
import type { EcsBattleScene } from '../EcsBattleScene'
import { SandboxPanel, PILL_ICON } from './SandboxPanel'

/** 开发者模式下随战斗 scene 启停，叠在 HUD 之上；战斗暂停期间入睡 */
export class SandboxScene extends Phaser.Scene {
  private panel?: SandboxPanel

  constructor() {
    super(SANDBOX_SCENE_KEY)
  }

  preload(): void {
    preloadEmojis(this, [{ id: PILL_ICON }])
  }

  create(): void {
    applyCamera(this)
    const battle = this.scene.get(BATTLE_SCENE_KEY) as EcsBattleScene
    this.panel = new SandboxPanel(this, battle)
    const sleep = (): void => {
      this.scene.sleep()
    }
    const wake = (): void => {
      this.scene.wake()
    }
    battle.events.on(Phaser.Scenes.Events.PAUSE, sleep)
    battle.events.on(Phaser.Scenes.Events.RESUME, wake)
    if (battle.scene.isPaused()) sleep()
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      battle.events.off(Phaser.Scenes.Events.PAUSE, sleep)
      battle.events.off(Phaser.Scenes.Events.RESUME, wake)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.panel?.destroy()
      this.panel = undefined
    })
  }

  update(time: number): void {
    this.panel?.update(time)
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }
}

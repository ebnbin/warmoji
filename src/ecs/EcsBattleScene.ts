import Phaser from 'phaser'
import { viewport } from '../core/apply'
import { UI_FONT, FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { ECS_SCENE_KEY } from './keys'
import { makeWorld } from './world'
import type { EcsWorld } from './world'

// ECS 实验战斗场景（宿主壳）：Phaser 只做画布/相机/输入/音频宿主,战斗世界全在 ECS。
// P0 阶段为占位——建空世界、显示施工提示、ESC/点击回大厅。后续阶段在此挂自绘渲染
// pipeline + 各系统,逐步复刻旧战斗场景的全部效果。
export class EcsBattleScene extends Phaser.Scene {
  private world!: EcsWorld

  constructor() {
    super(ECS_SCENE_KEY)
  }

  create(): void {
    this.world = makeWorld()
    // e2e/探针句柄：暴露当前 ECS 世界（后续阶段各系统/渲染都挂在它上）
    ;(window as unknown as { __ecsWorld?: EcsWorld }).__ecsWorld = this.world

    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.centerOn(viewport.logicalWidth / 2, viewport.logicalHeight / 2)
    cam.setBackgroundColor('#12161c')

    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    this.add
      .text(cx, cy - 40, 'ECS 实验战斗', { fontFamily: UI_FONT, fontSize: FONT.banner, color: '#e8eef6' })
      .setOrigin(0.5)
    this.add
      .text(cx, cy + 40, '施工中 · 点击或 ESC 返回大厅', {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#8fa1b5',
      })
      .setOrigin(0.5)

    const toMenu = (): void => {
      playSfx('click')
      this.scene.start('menu')
    }
    this.input.on('pointerup', toMenu)
    this.input.keyboard?.on('keydown-ESC', toMenu)
  }
}

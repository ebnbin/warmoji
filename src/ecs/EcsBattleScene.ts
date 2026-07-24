import Phaser from 'phaser'
import { viewport } from '../core/apply'
import { UNIT } from '../core/units'
import { UI_FONT, FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { OUTLINED_EMOJIS } from '../boot/preload'
import { ECS_SCENE_KEY } from './keys'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { EcsAtlas } from './render/atlas'
import { EcsSpriteBatch } from './render/spriteBatch'
import { spawnSprite } from './entities'

// ECS 实验战斗场景(宿主壳):Phaser 只做画布/相机/输入/音频宿主,战斗世界全在 ECS。
// P1:建 emoji 图集 + 自绘批量渲染管线;spawn 一组已知实体验证位姿/翻转/tint/深度/相机。
// 后续阶段在此挂各系统,逐步复刻旧战斗全部效果。
export class EcsBattleScene extends Phaser.Scene {
  private world!: EcsWorld
  private atlas?: EcsAtlas
  private ready = false

  constructor() {
    super(ECS_SCENE_KEY)
  }

  create(): void {
    this.ready = false
    this.world = makeWorld()
    ;(window as unknown as { __ecsWorld?: EcsWorld }).__ecsWorld = this.world

    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.centerOn(viewport.logicalWidth / 2, viewport.logicalHeight / 2)
    cam.setBackgroundColor('#12161c')

    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    const hint = this.add
      .text(cx, 40, 'ECS 实验 · 构建图集…', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#8fa1b5' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)

    void this.boot(hint, cx, cy)

    const toMenu = (): void => {
      playSfx('click')
      this.scene.start('menu')
    }
    this.input.keyboard?.on('keydown-ESC', toMenu)
  }

  private async boot(hint: Phaser.GameObjects.Text, cx: number, cy: number): Promise<void> {
    const atlas = await EcsAtlas.build(this, OUTLINED_EMOJIS)
    if (!this.scene.isActive()) return
    this.atlas = atlas
    new EcsSpriteBatch(this, this.world, atlas)
    this.spawnDemo(cx, cy)
    hint.setText(`ECS 图集就绪 · ${atlas.pageCount} 页 · P1 渲染验证`)
    this.ready = true
    ;(window as unknown as { __ecs?: { ready: boolean; pages: number } }).__ecs = {
      ready: true,
      pages: atlas.pageCount,
    }
  }

  /** P1 演示:一排已知实体,分别验证 位姿/旋转/翻转/tint 相乘/纯色填充/半透明/深度叠压 */
  private spawnDemo(cx: number, cy: number): void {
    const atlas = this.atlas!
    const P = OUTLINED_EMOJIS.player
    const E = OUTLINED_EMOJIS.enemy
    const L = OUTLINED_EMOJIS.elite
    const s = 2 * UNIT
    const gap = 2.4 * UNIT
    // 正常(居中,作相机对齐基准)
    spawnSprite(this.world, atlas, { id: P[0]!, outline: 'player', x: cx, y: cy, size: s })
    // 旋转 30°
    spawnSprite(this.world, atlas, { id: P[1] ?? P[0]!, outline: 'player', x: cx - gap, y: cy, size: s, rot: Math.PI / 6 })
    // 水平翻转
    spawnSprite(this.world, atlas, { id: E[0]!, outline: 'enemy', x: cx + gap, y: cy, size: s, flipX: true })
    // 金色系(elite 描边本身金) + 深度叠压演示:两枚重叠,z 大者在上
    spawnSprite(this.world, atlas, { id: L[0]!, outline: 'elite', x: cx - gap, y: cy + gap, size: s, z: 0 })
    spawnSprite(this.world, atlas, { id: P[0]!, outline: 'player', x: cx - gap + 0.8 * UNIT, y: cy + gap, size: s, z: 1 })
    // 纯色填充(闪白)
    spawnSprite(this.world, atlas, { id: E[0]!, outline: 'enemy', x: cx, y: cy + gap, size: s, color: 0xffffff, effect: 1 })
    // 半透明
    spawnSprite(this.world, atlas, { id: P[0]!, outline: 'player', x: cx + gap, y: cy + gap, size: s, alpha: 0.4 })
  }

  get isReady(): boolean {
    return this.ready
  }
}

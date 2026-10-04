import Phaser from 'phaser'

const DOT_KEY = 'fx-dot'

/** 白色圆点纹理，粒子靠着色得到颜色 */
function ensureFxDot(scene: Phaser.Scene): string {
  if (scene.textures.exists(DOT_KEY)) return DOT_KEY
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
  ctx.fill()
  scene.textures.addCanvas(DOT_KEY, canvas)
  return DOT_KEY
}

/** more 补上或改掉默认的几项：往哪边坠、怎么叠色 */
export function burstEmitter(
  scene: Phaser.Scene,
  tints: number[],
  speedMax: number,
  lifespanMax = 460,
  more: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {},
): Phaser.GameObjects.Particles.ParticleEmitter {
  return scene.add
    .particles(0, 0, ensureFxDot(scene), {
      speed: { min: speedMax * 0.35, max: speedMax },
      lifespan: { min: lifespanMax * 0.55, max: lifespanMax },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0.2 },
      tint: tints,
      emitting: false,
      ...more,
    })
    .setDepth(20)
}

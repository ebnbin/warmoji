import Phaser from 'phaser'

// 粒子点纹理走 tint 上色，混合模式保持 NORMAL：ADD 在浅色地图上看不见
const DOT_KEY = 'fx-dot'

export function ensureFxDot(scene: Phaser.Scene): string {
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

/** emitting=false，用 explode 触发 */
export function burstEmitter(
  scene: Phaser.Scene,
  tints: number[],
  speedMax: number,
  lifespanMax = 460,
): Phaser.GameObjects.Particles.ParticleEmitter {
  return scene.add
    .particles(0, 0, ensureFxDot(scene), {
      speed: { min: speedMax * 0.35, max: speedMax },
      lifespan: { min: lifespanMax * 0.55, max: lifespanMax },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0.2 },
      tint: tints,
      emitting: false,
    })
    .setDepth(20)
}

/** 全屏罩层按透明度着色；近乎透明即隐藏，免得每帧白画一遍整屏 */
export function setOverlayFill(rect: Phaser.GameObjects.Rectangle, color: number, alpha: number): void {
  rect.setFillStyle(color, alpha).setVisible(alpha > 0.001)
}

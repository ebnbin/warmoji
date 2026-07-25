import Phaser from 'phaser'
import { UI_FONT } from '../core/fonts'

// 伤害数字专用位图字体：启动时把 0-9 光栅化成一张字形图，
// 战斗中的数字用 BitmapText 摆字形四边形——零 canvas 光栅化、零纹理分配。
// （此前每次命中新建 Text = 新建+销毁一张纹理，iOS TBDR 上帧中纹理分配会整管线停顿）
export const DAMAGE_FONT = 'damage-digits'
const TEX_KEY = 'damage-digits-tex'
const CHARS = '0123456789'
// 字形按 2 倍显示尺寸渲染，高 DPR 下缩放依然清晰
const CHAR_W = 24
const CHAR_H = 36

export function ensureDamageFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(DAMAGE_FONT)) return
  if (!scene.textures.exists(TEX_KEY)) {
    const canvas = document.createElement('canvas')
    canvas.width = CHAR_W * CHARS.length
    canvas.height = CHAR_H
    const ctx = canvas.getContext('2d')!
    ctx.font = `bold 26px ${UI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 5
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < CHARS.length; i++) {
      const cx = i * CHAR_W + CHAR_W / 2
      ctx.strokeText(CHARS[i]!, cx, CHAR_H / 2)
      ctx.fillText(CHARS[i]!, cx, CHAR_H / 2)
    }
    scene.textures.addCanvas(TEX_KEY, canvas)
  }
  scene.cache.bitmapFont.add(
    DAMAGE_FONT,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: TEX_KEY,
      'offset.x': 0,
      'offset.y': 0,
      width: CHAR_W,
      height: CHAR_H,
      chars: CHARS,
      charsPerRow: CHARS.length,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 0,
    }),
  )
}

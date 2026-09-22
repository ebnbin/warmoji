import Phaser from 'phaser'
import { UI_FONT } from '../util/fonts'

// 伤害数字须走 BitmapText：帧中新建 Text 会分配纹理，iOS TBDR 上整管线停顿
export const DAMAGE_FONT = 'damage-digits'
const TEX_KEY = 'damage-digits-tex'
const CHARS = '0123456789'
// 2 倍显示尺寸，高 DPR 下不糊
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

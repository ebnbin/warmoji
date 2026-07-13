import Phaser from 'phaser'
import { ArenaScene } from './scenes/ArenaScene'
import { MenuScene } from './scenes/MenuScene'
import { PreloadScene } from './scenes/PreloadScene'
import { UIScene } from './scenes/UIScene'
import { setStress } from './ui/dev'
import { refreshViewport, viewport } from './ui/viewport'

const badge = document.getElementById('build-badge')
if (badge) {
  badge.textContent = __BUILD_HASH__
  badge.title = `构建于 ${__BUILD_TIME__}`
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 背景渐变画在 canvas 之下的页面层，canvas 必须透明
  transparent: true,
  // emoji 纹理为 2 次幂尺寸，mipmap 消除缩小采样的锯齿
  render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  width: Math.round(viewport.cssWidth * viewport.dpr),
  height: Math.round(viewport.cssHeight * viewport.dpr),
  input: { activePointers: 3 },
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / viewport.dpr },
  scene: [PreloadScene, MenuScene, ArenaScene, UIScene],
})

game.events.once(Phaser.Core.Events.READY, () => refreshViewport(game))

let resizeTimer: number | undefined
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => refreshViewport(game), 100)
})

// 供临时验证脚本注入状态
window.__game = game
window.__twemojiVersion = __TWEMOJI_VERSION__

window.__setStress = (on: boolean): void => {
  setStress(on)
  if (game.scene.isActive('arena')) game.scene.getScene('arena').scene.restart()
}

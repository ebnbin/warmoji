import Phaser from 'phaser'
import { ArenaScene } from './scenes/ArenaScene'
import { MenuScene } from './scenes/MenuScene'
import { PreloadScene } from './scenes/PreloadScene'
import { UIScene } from './scenes/UIScene'
import { refreshViewport } from './ui/viewport'

const badge = document.getElementById('build-badge')
if (badge) {
  badge.textContent = __BUILD_HASH__
  badge.title = `构建于 ${__BUILD_TIME__}`
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#12122a',
  input: { activePointers: 3 },
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [PreloadScene, MenuScene, ArenaScene, UIScene],
})

let resizeTimer: number | undefined
game.scale.on('resize', () => {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => refreshViewport(game), 100)
})

// 供临时验证脚本注入状态
window.__game = game

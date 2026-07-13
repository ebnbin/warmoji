import Phaser from 'phaser'
import { ARENA } from './core/config'
import { ArenaScene } from './scenes/ArenaScene'
import { MenuScene } from './scenes/MenuScene'

const badge = document.getElementById('build-badge')
if (badge) {
  badge.textContent = __BUILD_HASH__
  badge.title = `构建于 ${__BUILD_TIME__}`
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA.width,
  height: ARENA.height,
  backgroundColor: '#12122a',
  input: { activePointers: 3 },
  physics: { default: 'arcade' },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MenuScene, ArenaScene],
})

// 供临时验证脚本注入状态
window.__game = game

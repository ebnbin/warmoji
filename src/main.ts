import Phaser from 'phaser'
import { ArenaScene } from './scenes/ArenaScene'
import { CaptainScene } from './scenes/CaptainScene'
import { MenuScene } from './scenes/MenuScene'
import { PreloadScene } from './scenes/PreloadScene'
import { PromoteScene } from './scenes/PromoteScene'
import { SettingsScene } from './scenes/SettingsScene'
import { ShopScene } from './scenes/ShopScene'
import { UIScene } from './scenes/UIScene'
import { WikiScene } from './scenes/WikiScene'
import { browserStorage } from './core/highscore'
import { grantCoins, grantXp } from './core/run'
import { loadSettings } from './core/settings'
import { setStress } from './ui/dev'
import { initSfx, setSfxEnabled, sfxStats } from './ui/sfx'
import { isStandalone, nudgeIosViewport, refreshViewport, viewport } from './ui/viewport'

const badge = document.getElementById('build-badge')
if (badge) {
  badge.textContent = __BUILD_HASH__
  badge.title = `构建于 ${__BUILD_TIME__}`
}

// 程序化音效：首个手势解锁 + 按设置开关
initSfx()
setSfxEnabled(loadSettings(browserStorage()).sound)

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
  // 变步长物理：高刷新率屏幕上敌人/飞刀逐帧平滑移动
  physics: { default: 'arcade', arcade: { fixedStep: false } },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / viewport.dpr },
  scene: [PreloadScene, MenuScene, WikiScene, SettingsScene, CaptainScene, PromoteScene, ShopScene, ArenaScene, UIScene],
})

game.events.once(Phaser.Core.Events.READY, () => {
  refreshViewport(game, true)
  // iOS PWA 冷启动视口修正：多时点 nudge 兜底（无变化时 refresh 为空操作）
  for (const delay of [0, 100, 500, 1000]) {
    window.setTimeout(() => nudgeIosViewport(() => refreshViewport(game)), delay)
  }
})

// iOS（尤其独立 PWA）旋转/启动后视口尺寸异步稳定且不补发 resize：
// 除 resize 外再观察 #game 盒子实际变化 + 旋转后定时复查；
// refreshViewport 自带无变化跳过，重复触发无副作用
let resizeTimer: number | undefined
const scheduleRefresh = (): void => {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => refreshViewport(game), 100)
}
window.addEventListener('resize', scheduleRefresh)
window.visualViewport?.addEventListener('resize', scheduleRefresh)
const gameEl = document.getElementById('game')
if (gameEl) new ResizeObserver(scheduleRefresh).observe(gameEl)
window.addEventListener('orientationchange', () => {
  // 独立 PWA 的目标尺寸由屏幕尺寸确定，立即重算消除旋转延迟；浏览器模式等尺寸稳定
  if (isStandalone()) {
    refreshViewport(game)
    nudgeIosViewport(() => refreshViewport(game))
  }
  scheduleRefresh()
  window.setTimeout(() => refreshViewport(game), 400)
  window.setTimeout(() => refreshViewport(game), 1000)
})

// 供临时验证脚本注入状态
window.__game = game
window.__twemojiVersion = __TWEMOJI_VERSION__

window.__setStress = (on: boolean): void => {
  setStress(on)
  if (game.scene.isActive('arena')) game.scene.getScene('arena').scene.restart()
}

window.__addCoins = (n: number): void => grantCoins(n)
window.__addXp = (n: number): void => grantXp(n)
window.__sfxStats = (): { baked: number; played: number } => sfxStats()

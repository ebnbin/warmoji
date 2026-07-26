import Phaser from 'phaser'
import { CaptainScene } from './scene/CaptainScene'
import { BenchScene } from './scene/BenchScene'
import { CardScene } from './scene/CardScene'
import { MapScene } from './scene/MapScene'
import { MenuScene } from './scene/MenuScene'
import { PreloadScene } from './scene/PreloadScene'
import { PromoteScene } from './scene/PromoteScene'
import { ResultScene } from './scene/ResultScene'
import { SettingsScene } from './scene/SettingsScene'
import { ShopScene } from './scene/ShopScene'
import { StudioScene } from './scene/StudioScene'
import { UIScene } from './war/UIScene'
import { WikiScene } from './scene/WikiScene'
import { BATTLE_SCENES, isBattleSceneKey } from './battle'
import { browserStorage } from './util/storage'
import { getRun } from './run/state'
import { loadSettings } from './save/settings'
import { initBgm, playBgm, setBgmEnabled } from './audio/bgm'
import { initSfx, setSfxEnabled } from './audio/sfx'
import { isStandalone, nudgeIosViewport, refreshViewport, viewport } from './util/apply'

const badge = document.getElementById('build-badge')
if (badge) {
  badge.textContent = __BUILD_HASH__
  badge.title = `构建于 ${__BUILD_TIME__}`
}

// 程序化音效与 BGM：首个手势解锁 + 按设置开关
initSfx()
initBgm()
setSfxEnabled(loadSettings(browserStorage()).sound)
setBgmEnabled(loadSettings(browserStorage()).bgm)

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 背景渐变画在 canvas 之下的页面层，canvas 必须透明
  transparent: true,
  // emoji 纹理为 2 次幂尺寸，mipmap 消除缩小采样的锯齿。
  // pixelArt 显式给定：Phaser 3 的默认值是 zoom !== 1（本项目 zoom = 1/dpr，故高 DPR
  // 真机上一直是开着的，连带 antialias=false、roundPixels=true），Phaser 4 改成恒为 false。
  // 这里沿用 v3 的判据，避免升级后手机上的观感发生变化（桌面 dpr=1 时两版本本就一致）。
  render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR', pixelArt: viewport.dpr !== 1 },
  width: Math.round(viewport.cssWidth * viewport.dpr),
  height: Math.round(viewport.cssHeight * viewport.dpr),
  input: { activePointers: 3 },
  // 变步长物理：高刷新率屏幕上敌人/飞刀逐帧平滑移动
  physics: { default: 'arcade', arcade: { fixedStep: false } },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / viewport.dpr },
  scene: [PreloadScene, MenuScene, MapScene, WikiScene, StudioScene, SettingsScene, BenchScene, CaptainScene, PromoteScene, CardScene, ShopScene, ...BATTLE_SCENES, UIScene, ResultScene],
})

game.events.once(Phaser.Core.Events.READY, () => {
  refreshViewport(game, true)
  // iOS PWA 冷启动视口修正：多时点 nudge 兜底（无变化时 refresh 为空操作）
  for (const delay of [0, 100, 500, 1000]) {
    window.setTimeout(() => nudgeIosViewport(() => refreshViewport(game)), delay)
  }
  // 场景 → BGM：大厅页共用一首，战斗页按本局地图配曲。
  // 挂在场景 START 上（restart 重入时 playBgm 幂等不重开）
  const lobby = ['menu', 'map', 'wiki', 'studio', 'settings', 'bench', 'captain', 'promote', 'cards', 'shop', 'result']
  for (const scene of game.scene.getScenes(false)) {
    const key = scene.scene.key
    if (lobby.includes(key)) {
      scene.events.on(Phaser.Scenes.Events.START, () => playBgm('lobby'))
    } else if (isBattleSceneKey(key)) {
      scene.events.on(Phaser.Scenes.Events.START, () => playBgm(getRun().mapId))
    }
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


import Phaser from 'phaser'
import { MapScene } from './scene/MapScene'
import { MenuScene } from './scene/MenuScene'
import { PauseScene } from './scene/PauseScene'
import { PreloadScene } from './scene/PreloadScene'
import { LevelUpRecruitScene, RecruitScene } from './scene/RecruitScene'
import { LevelUpScene } from './scene/LevelUpScene'
import { ResultScene } from './scene/ResultScene'
import { SettingsScene } from './scene/SettingsScene'
import { ShopScene } from './scene/ShopScene'
import { StudioScene } from './scene/StudioScene'
import { EditorScene } from './scene/EditorScene'
import { UIScene } from './scene/UIScene'
import { WikiScene } from './scene/WikiScene'
import { EcsBattleScene } from './ecs/EcsBattleScene'
import { browserStorage, StorageKey } from './util/storage'
import { getRun } from './run/state'
import { loadSettings } from './save/settings'
import { initBgm, playBgm, setBgmEnabled } from './audio/bgm'
import { initSfx, setSfxEnabled } from './audio/sfx'
import { isStandalone, nudgeIosViewport, refreshViewport, setGameArea, viewport } from './util/apply'
import { FONT_FAMILY, TONE } from './ui/theme'
import { installDevTools, layoutDock } from './devtools'
import { registerGameDevTabs } from './dev'
import { SceneKey } from './scene/keys'

initSfx()
initBgm()
setSfxEnabled(loadSettings(browserStorage()).sound)
setBgmEnabled(loadSettings(browserStorage()).bgm)

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  transparent: true,
  render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR', pixelArt: viewport.dpr !== 1 },
  width: Math.round(viewport.cssWidth * viewport.dpr),
  height: Math.round(viewport.cssHeight * viewport.dpr),
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / viewport.dpr },
  scene: [PreloadScene, MenuScene, MapScene, WikiScene, StudioScene, EditorScene, SettingsScene, RecruitScene, ShopScene, EcsBattleScene, UIScene, ResultScene, PauseScene, LevelUpScene, LevelUpRecruitScene],
})

installDevTools(game, {
  key: SceneKey.DevTools,
  storageKey: StorageKey.DevTools,
  accent: TONE.accent.face,
  font: { family: FONT_FAMILY },
  build: { hash: __BUILD_HASH__, time: __BUILD_TIME__ },
  relayout: () => refreshViewport(game),
})
setGameArea(layoutDock)
registerGameDevTabs(game)

game.events.once(Phaser.Core.Events.READY, () => {
  refreshViewport(game, true)
  for (const delay of [0, 100, 500, 1000]) {
    window.setTimeout(() => nudgeIosViewport(() => refreshViewport(game)), delay)
  }
  const lobby = [
    SceneKey.Menu,
    SceneKey.Map,
    SceneKey.Wiki,
    SceneKey.Studio,
    SceneKey.Editor,
    SceneKey.Settings,
    SceneKey.Recruit,
    SceneKey.Shop,
    SceneKey.Result,
  ]
  for (const key of lobby) {
    game.scene.getScene(key).events.on(Phaser.Scenes.Events.START, () => playBgm('lobby'))
  }
  game.scene.getScene(SceneKey.Battle).events.on(Phaser.Scenes.Events.START, () => playBgm(getRun().mapId))
})

let resizeTimer: number | undefined
const scheduleRefresh = (): void => {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => refreshViewport(game), 100)
}
window.addEventListener('resize', scheduleRefresh)
window.visualViewport?.addEventListener('resize', scheduleRefresh)
new ResizeObserver(scheduleRefresh).observe(document.body)
window.addEventListener('orientationchange', () => {
  if (isStandalone()) {
    refreshViewport(game)
    nudgeIosViewport(() => refreshViewport(game))
  }
  scheduleRefresh()
  window.setTimeout(() => refreshViewport(game), 400)
  window.setTimeout(() => refreshViewport(game), 1000)
})

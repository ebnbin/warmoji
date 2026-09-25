import Phaser from 'phaser'
import { CaptainScene } from './scene/CaptainScene'
import { CardScene } from './scene/CardScene'
import { MapScene } from './scene/MapScene'
import { MenuScene } from './scene/MenuScene'
import { PreloadScene } from './scene/PreloadScene'
import { RecruitScene } from './scene/RecruitScene'
import { FormationScene } from './scene/FormationScene'
import { ResultScene } from './scene/ResultScene'
import { SettingsScene } from './scene/SettingsScene'
import { ShopScene } from './scene/ShopScene'
import { StudioScene } from './scene/StudioScene'
import { UIScene } from './scene/UIScene'
import { WikiScene } from './scene/WikiScene'
import { EcsBattleScene } from './ecs/EcsBattleScene'
import { browserStorage, StorageKey } from './util/storage'
import { getRun } from './run/state'
import { loadSettings } from './save/settings'
import { initBgm, playBgm, setBgmEnabled } from './audio/bgm'
import { initSfx, playSfx, setSfxEnabled } from './audio/sfx'
import { applyCamera, isStandalone, nudgeIosViewport, refreshViewport, safeInsets, textRes, viewport } from './util/apply'
import { UI_FONT } from './util/fonts'
import { installDevTools, registerGameProvider } from './devtools'
import { appProvider } from './dev/app'
import { audioProvider } from './dev/audio'
import { emojiProvider } from './dev/emoji'
import { settingsProvider } from './dev/settings'
import { SceneKey } from './scene/keys'

const badge = document.getElementById('build-badge')
if (badge) {
  badge.textContent = __BUILD_HASH__
  badge.title = `构建于 ${__BUILD_TIME__}`
}

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
  scene: [PreloadScene, MenuScene, MapScene, WikiScene, StudioScene, SettingsScene, CaptainScene, RecruitScene, FormationScene, CardScene, ShopScene, EcsBattleScene, UIScene, ResultScene],
})

installDevTools(game, {
  key: SceneKey.DevTools,
  storageKey: StorageKey.DevTools,
  accent: 0xffdc5d,
  font: { family: UI_FONT, size: 22 },
  layout: (scene) => {
    applyCamera(scene)
    return { width: viewport.logicalWidth, height: viewport.logicalHeight, insets: safeInsets, textResolution: textRes() }
  },
  onTap: () => playSfx('click'),
})

registerGameProvider(appProvider(game))
registerGameProvider(settingsProvider())
registerGameProvider(audioProvider())
registerGameProvider(emojiProvider(game))

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
    SceneKey.Settings,
    SceneKey.Captain,
    SceneKey.Recruit,
    SceneKey.Formation,
    SceneKey.Cards,
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
const gameEl = document.getElementById('game')
if (gameEl) new ResizeObserver(scheduleRefresh).observe(gameEl)
window.addEventListener('orientationchange', () => {
  if (isStandalone()) {
    refreshViewport(game)
    nudgeIosViewport(() => refreshViewport(game))
  }
  scheduleRefresh()
  window.setTimeout(() => refreshViewport(game), 400)
  window.setTimeout(() => refreshViewport(game), 1000)
})

import Phaser from 'phaser'
import { ArenaScene } from './maps/ArenaScene'
import { CaptainScene } from './menu/CaptainScene'
import { ChestScene } from './menu/ChestScene'
import { InfiniteArenaScene } from './maps/InfiniteArenaScene'
import { MapScene } from './menu/MapScene'
import { MenuScene } from './menu/MenuScene'
import { PreloadScene } from './boot/PreloadScene'
import { PromoteScene } from './menu/PromoteScene'
import { ResultScene } from './menu/ResultScene'
import { RiverArenaScene } from './maps/RiverArenaScene'
import { SettingsScene } from './menu/SettingsScene'
import { ShopScene } from './menu/ShopScene'
import { StudioScene } from './menu/StudioScene'
import { UIScene } from './battle/UIScene'
import { VoidArenaScene } from './maps/VoidArenaScene'
import { WikiScene } from './menu/WikiScene'
import { WAVE } from './run/waves'
import { browserStorage } from './core/storage'
import { getRun, grantCoins, grantXp } from './run/state'
import { ENEMY_DEFS } from './enemies/registry'
import { toPx } from './battle/px'
import { ABILITIES } from './abilities/registry'
import type { AbilityDef } from './abilities/defs'
import { spawnCoins } from './pickups/pickups'
import { rollChestLoot } from './pickups/chest'
import type { ItemId } from './items/registry'
import { UNIT } from './core/units'
import type { BaseArenaScene } from './battle/BaseArenaScene'
import { loadSettings } from './run/settings'
import { bgmState, initBgm, playBgm, renderBgmOffline, setBgmEnabled } from './audio/bgm'
import type { BgmId } from './audio/music'
import { labCaptain, labStarters, setLabEnemies } from './run/lab'
import { beginRun } from './run/state'
import { arenaSceneFor, sanitizeMapId } from './maps/registry'
import { initSfx, setSfxEnabled, sfxStats } from './audio/sfx'
import { isStandalone, nudgeIosViewport, refreshViewport, viewport } from './core/apply'

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
  // emoji 纹理为 2 次幂尺寸，mipmap 消除缩小采样的锯齿
  render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  width: Math.round(viewport.cssWidth * viewport.dpr),
  height: Math.round(viewport.cssHeight * viewport.dpr),
  input: { activePointers: 3 },
  // 变步长物理：高刷新率屏幕上敌人/飞刀逐帧平滑移动
  physics: { default: 'arcade', arcade: { fixedStep: false } },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / viewport.dpr },
  scene: [PreloadScene, MenuScene, MapScene, WikiScene, StudioScene, SettingsScene, CaptainScene, PromoteScene, ChestScene, ShopScene, ArenaScene, InfiniteArenaScene, RiverArenaScene, VoidArenaScene, UIScene, ResultScene],
})

game.events.once(Phaser.Core.Events.READY, () => {
  refreshViewport(game, true)
  // iOS PWA 冷启动视口修正：多时点 nudge 兜底（无变化时 refresh 为空操作）
  for (const delay of [0, 100, 500, 1000]) {
    window.setTimeout(() => nudgeIosViewport(() => refreshViewport(game)), delay)
  }
  // 场景 → BGM：大厅页共用一首，战斗页按本局地图配曲。
  // 挂在场景 START 上（restart 重入时 playBgm 幂等不重开）
  const lobby = ['menu', 'map', 'wiki', 'studio', 'settings', 'captain', 'promote', 'chests', 'shop', 'result']
  const arenas = ['arena', 'arenaInfinite', 'arenaRiver', 'arenaVoid']
  for (const scene of game.scene.getScenes(false)) {
    const key = scene.scene.key
    if (lobby.includes(key)) {
      scene.events.on(Phaser.Scenes.Events.START, () => playBgm('lobby'))
    } else if (arenas.includes(key)) {
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

// 供临时验证脚本注入状态
window.__game = game

// 测试模式：设定出场敌人（kind 列表），用当前勾选阵容在某张真实地图上开测试模式
window.__setLab = (kinds: string[], mapId = 'forest'): void => {
  setLabEnemies(kinds)
  const m = sanitizeMapId(mapId)
  beginRun(labCaptain(), labStarters(), m, true)
  const target = arenaSceneFor(m)
  // 已在目标竞技场则原子重开（避免同帧 stop+start 竞态）；否则停掉别的竞技场再启动它
  for (const key of ['arena', 'arenaInfinite', 'arenaRiver', 'arenaVoid']) {
    if (key !== target && game.scene.isActive(key)) game.scene.stop(key)
  }
  if (game.scene.isActive(target)) game.scene.getScene(target).scene.restart()
  else game.scene.start(target)
}

window.__addCoins = (n: number): void => grantCoins(n)
window.__addXp = (n: number): void => grantXp(n)
// e2e：往待开箱列表塞一个宝箱（指定道具或按当前阵容随机抽），战斗结束即进开箱页
window.__addChest = (itemId?: string): void => {
  const run = getRun()
  if (itemId) {
    run.chests.push(itemId as ItemId)
    return
  }
  const loot = rollChestLoot(run.roster, run.memberItems, run.captainItems, () => Math.random())
  if (loot) run.chests.push(loot.itemId)
}
// e2e 快进到指定波（在商店/整编期间调用，下次开战即该波）
window.__setWave = (n: number): void => {
  getRun().wave = Math.max(1, Math.min(WAVE.totalWaves, Math.round(n)))
}
// e2e 行为探针：向活跃战场按 kind 投放一只敌人（相对队伍中心的格偏移落点）
window.__spawnEnemy = (kind: string, dxU = 3, dyU = 0): void => {
  const def = ENEMY_DEFS.find((s) => s.kind === kind)
  if (!def) return
  for (const key of ['arena', 'arenaInfinite', 'arenaRiver', 'arenaVoid']) {
    if (!game.scene.isActive(key)) continue
    const sc = game.scene.getScene(key) as BaseArenaScene
    const px = toPx(def)
    sc.materializeEnemy(px, sc.center.x + dxU * UNIT, sc.center.y + dyU * UNIT, px.hp)
  }
}
// e2e 行为探针：投放一只持械敌人（僵尸三围 + 指定能力行；敌方 ctx 验证用）
window.__spawnArmedEnemy = (abilityId: string, dxU = 3, dyU = 0): void => {
  const w = (ABILITIES as Record<string, AbilityDef>)[abilityId]
  const base = ENEMY_DEFS.find((s) => s.kind === 'zombie')
  if (!w || !base) return
  for (const key of ['arena', 'arenaInfinite', 'arenaRiver', 'arenaVoid']) {
    if (!game.scene.isActive(key)) continue
    const sc = game.scene.getScene(key) as BaseArenaScene
    const px = toPx({ ...base, abilities: [w] })
    // 高耐久投放：观测期不被队伍火力秒掉（首发前阵亡会让断言竞态）
    sc.materializeEnemy(px, sc.center.x + dxU * UNIT, sc.center.y + dyU * UNIT, px.hp * 100)
  }
}
// e2e 行为探针：在队伍中心附近撒落地金币（偷币鼠用例）
window.__dropCoins = (n: number, dxU = 2, dyU = 0): void => {
  for (const key of ['arena', 'arenaInfinite', 'arenaRiver', 'arenaVoid']) {
    if (!game.scene.isActive(key)) continue
    const sc = game.scene.getScene(key) as BaseArenaScene
    spawnCoins(sc, sc.center.x + dxU * UNIT, sc.center.y + dyU * UNIT, n)
  }
}
window.__sfxStats = (): { baked: number; played: number } => sfxStats()
// e2e/探针：离线渲染一段 BGM 统计响度（验证真实出声、各曲差异）+ 播放状态快照
window.__bgmProbe = (id: BgmId, seconds?: number): Promise<{ rms: number; peak: number; notes: number }> =>
  renderBgmOffline(id, seconds)
window.__bgmState = (): { desired: BgmId | null; playing: BgmId | null; enabled: boolean } => bgmState()

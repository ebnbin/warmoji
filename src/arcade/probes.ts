import type Phaser from 'phaser'
import { UNIT } from '../core/units'
import { beginRun } from '../run/state'
import { labCaptain, labStarters, setLabEnemies, setLabRoster } from '../run/lab'
import { sanitizeMapId } from '../data/maps'
import { BOSSES, ENEMY_DEFS } from '../data/enemies'
import { ABILITIES } from '../data/abilities'
import { toPx } from '../war/px'
import { FIELD_PICKUPS, fieldPickupsFor } from '../data/battlefield'
import { ARENA_SCENE_KEYS, arenaSceneFor } from './keys'
import { spawnCoins } from './pickups'
import { spawnFieldPickup } from './field'
import type { AbilityDef } from '../data/abilityDefs'
import type { CharacterId } from '../data/characters'
import type { Polarity } from '../data/battlefield'
import type { ArcadeBattleScene } from './ArcadeBattleScene'

// 旧框架（Arcade）的 e2e 调试探针。与 ecs 侧的 __ecs* 探针对称：只对本框架有效，
// 随本包一起消失。全局声明在 probes.d.ts，实现在此，装配经 experiments facade。

/** 当前在跑的那个竞技场场景（多套世界形态互斥运行，至多一个活跃） */
function activeArenas(game: Phaser.Game): ArcadeBattleScene[] {
  const out: ArcadeBattleScene[] = []
  for (const key of ARENA_SCENE_KEYS) {
    if (game.scene.isActive(key)) out.push(game.scene.getScene(key) as ArcadeBattleScene)
  }
  return out
}

export function installArcadeProbes(game: Phaser.Game): void {
  // 设定试炼场阵容（角色 id 列表）后在某图开测试模式——供 e2e 单测某角色
  window.__labTeam = (ids: string[], mapId = 'forest'): void => {
    setLabRoster(ids as CharacterId[])
    window.__setLab!([], mapId)
  }
  // 测试模式：设定出场敌人（kind 列表），用当前勾选阵容在某张真实地图上开测试模式
  window.__setLab = (kinds: string[], mapId = 'forest'): void => {
    setLabEnemies(kinds)
    const m = sanitizeMapId(mapId)
    beginRun(labCaptain(), labStarters(), m, true)
    const target = arenaSceneFor(m)
    // 已在目标竞技场则原子重开（避免同帧 stop+start 竞态）；否则停掉别的竞技场再启动它
    for (const key of ARENA_SCENE_KEYS) {
      if (key !== target && game.scene.isActive(key)) game.scene.stop(key)
    }
    if (game.scene.isActive(target)) game.scene.getScene(target).scene.restart()
    else game.scene.start(target)
  }
  // 行为探针：向活跃战场按 kind 投放一只敌人（相对队伍中心的格偏移落点）。
  // 也支持 Boss kind（走 Boss 落地管线：金边 + HUD 血条），供 Boss 行为探测/取景
  window.__spawnEnemy = (kind: string, dxU = 3, dyU = 0): void => {
    const boss = BOSSES.find((s) => s.kind === kind)
    const def = ENEMY_DEFS.find((s) => s.kind === kind) ?? boss
    if (!def) return
    for (const sc of activeArenas(game)) {
      const px = toPx(def)
      sc.materializeEnemy(px, sc.center.x + dxU * UNIT, sc.center.y + dyU * UNIT, px.hp, false, !!boss)
    }
  }
  // 行为探针：投放一只持械敌人（僵尸三围 + 指定能力行；敌方 ctx 验证用）
  window.__spawnArmedEnemy = (abilityId: string, dxU = 3, dyU = 0): void => {
    const w = (ABILITIES as Record<string, AbilityDef>)[abilityId]
    const base = ENEMY_DEFS.find((s) => s.kind === 'zombie')
    if (!w || !base) return
    for (const sc of activeArenas(game)) {
      const px = toPx({ ...base, abilities: [w] })
      // 高耐久投放：观测期不被队伍火力秒掉（首发前阵亡会让断言竞态）
      sc.materializeEnemy(px, sc.center.x + dxU * UNIT, sc.center.y + dyU * UNIT, px.hp * 100)
    }
  }
  // 行为探针：在队伍中心附近撒落地金币（偷币鼠用例）
  window.__dropCoins = (n: number, dxU = 2, dyU = 0): void => {
    for (const sc of activeArenas(game)) {
      spawnCoins(sc, sc.center.x + dxU * UNIT, sc.center.y + dyU * UNIT, n)
    }
  }
  // 投放一名战场拾取携带者（本图池按极性随机取，或指定 id）——带极性光环，死亡掉拾取
  window.__spawnCarrier = (polarity: Polarity = 'buff', id?: string): void => {
    const base = ENEMY_DEFS.find((s) => s.kind === 'zombie')
    if (!base) return
    for (const sc of activeArenas(game)) {
      const pool = fieldPickupsFor(sc.run.mapId).filter((p) => p.polarity === polarity)
      const def = (id ? FIELD_PICKUPS[id] : undefined) ?? pool[Math.floor(Math.random() * pool.length)]
      if (!def) continue
      const px = toPx(base)
      sc.materializeEnemy(px, sc.center.x + 2 * UNIT, sc.center.y, px.hp, false, false, 1, def)
    }
  }
  // 掉一枚地面拾取（默认落在队伍中心，下一帧即被走位判定收取——验证拾取→限时效果链；
  // 给出格偏移则落在远处静置，可观察地面待拾贴图/光圈）
  window.__spawnFieldPickup = (polarity: Polarity = 'buff', id?: string, dxU = 0, dyU = 0): void => {
    for (const sc of activeArenas(game)) {
      const pool = fieldPickupsFor(sc.run.mapId).filter((p) => p.polarity === polarity)
      const def = (id ? FIELD_PICKUPS[id] : undefined) ?? pool[Math.floor(Math.random() * pool.length)]
      if (def) spawnFieldPickup(sc, sc.center.x + dxU * UNIT, sc.center.y + dyU * UNIT, def)
    }
  }
}

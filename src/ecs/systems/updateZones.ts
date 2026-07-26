import { hasComponent, query, removeEntity } from 'bitecs'
import {
  Alive,
  Disarmed,
  ENEMY_SET,
  FACTION,
  Frozen,
  GroundHit,
  Lifetime,
  Owner,
  Ring,
  Tint,
  Transform,
  ZONE_SET,
  Zone,
  ZoneBurn,
  ZoneFollow,
} from '../components'
import { applyDamage, hurtMember } from '../combat'
import { backEaseOut } from '../ease'
import { zoneSrcName } from '../store'
import type { Sim } from '../sim'

// 区域管线:一条。跟位 → 开关 → 到期 → 视觉 → 跳伤。
// 生成在 entities/zone.ts(那里写了「为什么毒圈和光环是同一种东西」)。
//
// 减速的消费在 enemy.ts::applySlowZones(与转向/染色同读一份 ZoneSlow),
// 不在这里——那是敌人的属性,不是区的属性。

/** 到期后的渐隐时长(ms):效果在 until 停,视觉再淡这么久才回收 */
const FADE_MS = 250

/** 逐帧:跟位/开关/到期/视觉,然后两侧各按自己的节拍跳伤 */
export function updateZones(sim: Sim): void {
  const world = sim.world
  // 取快照迭代:到期回收会就地改动 query 返回的稠密数组
  const zones = [...query(world, ZONE_SET as unknown as object[])]
  if (zones.length === 0) return
  const now = sim.elapsedMs
  for (const z of zones) {
    // 跟随型:位姿抄锚点,开关随造它的那件武器能不能出手
    //(持有者倒下 / 被变形 → 光环当场熄,复活自然回来。这不是一份要同步的副本,读源头即可)
    if (hasComponent(world, z, ZoneFollow)) {
      const a = ZoneFollow.of[z]!
      Transform.x[z] = Transform.x[a]!
      Transform.y[z] = Transform.y[a]!
      const w = Owner.eid[z]!
      Zone.on[z] = Frozen.v[w] === 0 && Disarmed.v[w] === 0 ? 1 : 0
    }
    // 到期:效果先停,视觉再淡出,淡完回收(故淡出的透明度压过开关——不然一到点就凭空消失)
    let alpha = Zone.on[z] ? 1 : 0
    const until = Lifetime.until[z]!
    if (until > 0 && now >= until) {
      const over = now - until
      if (over >= FADE_MS) {
        removeEntity(world, z)
        continue
      }
      Zone.on[z] = 0
      alpha = 1 - over / FADE_MS
    }
    // 入场缩放走视觉钟(波末过场冻结期照样播完);整体透明度叠上开关与淡出
    const enter = Zone.enterMs[z]!
    const age = sim.fxMs - Ring.born[z]!
    Ring.radius[z] = Zone.radius[z]! * (enter > 0 && age < enter ? 0.3 + 0.7 * backEaseOut(age / enter) : 1)
    Tint.alpha[z] = alpha
  }
  const burns = [...query(world, [Zone, ZoneBurn, Transform])]
  if (burns.length === 0) return
  burnEnemies(sim, burns, now)
  burnMembers(sim, burns, now)
}

/** 烧敌人:按区域脉冲(敌人多:每区自打节拍,每拍烧区内全部) */
function burnEnemies(sim: Sim, burns: readonly number[], now: number): void {
  let enemies: readonly number[] | undefined
  for (const z of burns) {
    if (Zone.on[z] === 0 || Zone.faction[z] === FACTION.enemy || now < ZoneBurn.nextAt[z]!) continue
    ZoneBurn.nextAt[z] = now + ZoneBurn.tickMs[z]!
    // 快照:跳伤可能当场击杀,回收会就地改动稠密数组
    enemies ??= [...query(sim.world, ENEMY_SET as unknown as object[])]
    const r = Zone.radius[z]!
    const damage = ZoneBurn.damage[z]!
    const slot = ZoneBurn.srcSlot[z]!
    for (const eid of enemies) {
      const d = sim.hooks.worldDelta(sim, Transform.x[z]!, Transform.y[z]!, Transform.x[eid]!, Transform.y[eid]!)
      if (d.x * d.x + d.y * d.y <= r * r) applyDamage(sim, eid, damage, 0, undefined, undefined, slot)
    }
  }
}

/** 烧队员:按受害者节流(队员少:无论同时踩几个区,每 tickMs 至多掉一次血) */
function burnMembers(sim: Sim, burns: readonly number[], now: number): void {
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    for (const z of burns) {
      if (Zone.on[z] === 0 || Zone.faction[z] !== FACTION.enemy) continue
      const r = Zone.radius[z]!
      const d = sim.hooks.worldDelta(sim, Transform.x[z]!, Transform.y[z]!, Transform.x[m]!, Transform.y[m]!)
      if (d.x * d.x + d.y * d.y > r * r) continue
      if (now - GroundHit.last[m]! >= ZoneBurn.tickMs[z]!) {
        GroundHit.last[m] = now
        hurtMember(sim, m, ZoneBurn.damage[z]!, zoneSrcName[z] || undefined, 0xa5d86a) // 中毒/灼烧走毒绿闪
      }
      break
    }
  }
}

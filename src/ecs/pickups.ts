import { addComponent, query } from 'bitecs'
import { UNIT } from '../util/units'
import { playSfx } from '../audio/sfx'
import { PICKUP, PICKUPS } from '../data/pickups'
import { FIELD, POLARITY_COLOR } from '../data/battlefield'
import { foldBattleEffects } from '../war/battleFx'
import {
  Alive,
  Bob,
  Enemy,
  Magnet,
  MFlash,
  PICKUP_SET,
  Pickup,
  Pop,
  Ring,
  Tint,
  Transform,
} from './components'
import { backEaseOut } from './ease'
import { enemyCarries, pickupDef } from './store'
import { spawnPickup } from './entities/pickup'
import type { PickupSpec } from './entities/pickup'
import type { Sim } from './sim'
import type { FieldPickupDef } from '../types/battlefield'

// 拾取物管线:一条。落地待拾 → (可选)磁吸向队伍中心 → 进拾取圈到手 → 触发它那一种效果,
// 外加入场弹出 / 待拾缓浮 / 到期淡出这些与种类无关的杂事。
//
// 「不同的拾取给不同的东西」是唯一的分歧点,故收在 PICKUP_KINDS 一处:
// **新增一种拾取 = 在这张表里加一行(落地参数 + 到手效果),管线一行不用碰。**
// 金币与战场增/减益此前是两套东西(前者 ECS 实体、后者游离的 Phaser 对象 + 模块级数组),
// 现在只是这张表里的两行。

/** 到手效果的分派键;下标即 Pickup.kind */
export const COIN = 0
export const FIELD_BUFF = 1

/** 一种拾取物:怎么落地(spec)+ 到手干什么(collect) */
interface PickupKind {
  /** 落地参数:def 是该枚的载荷(金币无载荷) */
  spec(sim: Sim, def: FieldPickupDef | undefined): PickupSpec
  /** 到手效果:此刻实体还在,Transform 可读;回收由管线负责 */
  collect(sim: Sim, eid: number): void
}

export const PICKUP_KINDS: readonly PickupKind[] = [
  // ── 金币:磁吸入账,永久经济 ──
  {
    spec: (sim) => ({
      kind: COIN,
      emoji: PICKUPS.coin.emoji,
      size: PICKUPS.coin.size * UNIT,
      z: 3,
      // 磁吸范围随队长/道具走(Magnet 挂在队长身上)
      pull: Magnet.radius[sim.captain]!,
      grab: PICKUP.collectRadius * UNIT,
      groundMs: 0,
      popMs: 160,
      bob: 0,
    }),
    collect: (sim, eid) => {
      sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 4, kind: 'coin' })
      playSfx('coin')
      sim.run.coins += 1
    },
  },
  // ── 战场增/减益:不磁吸(需主动走位,增益去趋、减益去避),短时,施加一层限时乘区 ──
  {
    spec: (_sim, def) => ({
      kind: FIELD_BUFF,
      emoji: def!.emoji,
      size: 0.85 * UNIT,
      z: 6,
      pull: 0,
      grab: FIELD.grabRadiusU * UNIT,
      groundMs: FIELD.groundMs,
      popMs: 180,
      bob: 6,
      ring: { color: POLARITY_COLOR[def!.polarity], radius: FIELD.grabRadiusU * UNIT, fillAlpha: 0.12, z: 3 },
      def,
    }),
    collect: (sim, eid) => {
      const def = pickupDef[eid]!
      const color = POLARITY_COLOR[def.polarity]
      sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'coin' })
      playSfx(def.polarity === 'buff' ? 'levelup' : 'hurt')
      applyBattleMod(sim, def)
      sim.pendingCollects.push(def)
      // 到手反馈:全队闪一下极性色。走受击闪光同一通道——否则队员视觉每帧把染色抹回常态,
      // 只闪得到一帧
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        MFlash.until[m] = sim.elapsedMs + 300
        Tint.color[m] = color
        Tint.effect[m] = 0
      }
    },
  },
]

/** 落一枚金币(可多枚散开) */
export function dropCoins(sim: Sim, x: number, y: number, count: number): void {
  const spec = PICKUP_KINDS[COIN]!.spec(sim, undefined)
  for (let i = 0; i < count; i++) {
    const jx = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    spawnPickup(sim, x + jx, y + jy, spec)
  }
}

/** 落一枚战场增/减益(携带者死亡处) */
export function dropFieldPickup(sim: Sim, x: number, y: number, def: FieldPickupDef): void {
  spawnPickup(sim, x, y, PICKUP_KINDS[FIELD_BUFF]!.spec(sim, def))
}

/** 给携带者敌人挂上极性光环(实体自带的圈:敌人没了圈自然跟着没,不必对帐销毁) */
export function attachCarrierRing(sim: Sim, eid: number, def: FieldPickupDef): void {
  addComponent(sim.world, eid, Ring)
  Ring.color[eid] = POLARITY_COLOR[def.polarity]
  Ring.radius[eid] = FIELD.auraRadiusU * UNIT
  Ring.fillAlpha[eid] = 0.18
  Ring.lineAlpha[eid] = 0.9
  Ring.lineWidth[eid] = 3
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 4
  Ring.breathe[eid] = 1
}

/** 施加一层限时效果:同 id 只刷新计时不叠加,随即重折乘区 */
function applyBattleMod(sim: Sim, def: FieldPickupDef): void {
  sim.battleMods = sim.battleMods.filter((m) => m.id !== def.id)
  sim.battleMods.push({
    id: def.id,
    emoji: def.emoji,
    polarity: def.polarity,
    until: sim.elapsedMs + def.durationMs,
    totalMs: def.durationMs,
    fx: def.fx,
  })
  sim.battleFx = foldBattleEffects(sim.battleMods.map((m) => m.fx))
}

/** 与种类无关的两桩视觉:入场弹出(0.3 → 1 的 Back.easeOut 缩放)与待拾缓浮。
 * 都走视觉钟 sim.fxMs——波末过场冻结期照样播完 */
export function animatePickup(sim: Sim, eid: number): void {
  const popLeft = Pop.until[eid]! - sim.fxMs
  const size = Pop.size[eid]!
  if (popLeft > 0) {
    const k = size * (0.3 + 0.7 * backEaseOut(1 - popLeft / Pop.ms[eid]!))
    Transform.w[eid] = k
    Transform.h[eid] = k
  } else if (Transform.w[eid] !== size) {
    Transform.w[eid] = size
    Transform.h[eid] = size
  }
  if (Bob.amp[eid]! > 0) {
    // 三角波上下缓飘;光圈按 -off 抵消,始终贴在落点(它画的是拾取圈,不该跟着飘)
    const t = (sim.fxMs % (Bob.halfMs[eid]! * 2)) / Bob.halfMs[eid]!
    const off = -Bob.amp[eid]! * (t <= 1 ? t : 2 - t)
    Transform.y[eid] = Bob.y0[eid]! + off
    Ring.dy[eid] = -off
  }
}

/** 在场待拾数 / 携带者数(HUD 与 e2e 探针) */
export function pickupCounts(sim: Sim): { pickups: number; carriers: number } {
  let pickups = 0
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) {
    if (Pickup.kind[eid] === FIELD_BUFF) pickups++
  }
  let carriers = 0
  for (const eid of query(sim.world, [Enemy])) {
    if (enemyCarries[eid] !== undefined) carriers++
  }
  return { pickups, carriers }
}

import type { CharacterId } from './config'
import { UNIT } from './config'
import type { WeaponSpec } from './weapons'

// 角色特殊能力：一阶/二阶两档，靠购买角色专属能力卡解锁（core/items.ts 的
// 能力卡条目；二阶卡需先持有一阶卡，累积生效不替代）。
// 能力 = 对武器行为的质变（新弹道/新区域/新机制）。实现为纯 spec 变换：
// applyAbilities 按已解锁档位把能力字段注入武器 spec，运行时（src/weapons/）
// 按字段执行，无角色分支散落。

export interface AbilitySpec {
  readonly icon: string
  readonly name: string
  readonly desc: string
}

/** 已解锁的能力档位：a1 = 一阶（下标 0 的卡），a2 = 二阶（下标 1 的卡） */
export interface AbilityTiers {
  a1: boolean
  a2: boolean
}

export const ABILITIES: Record<CharacterId, readonly [AbilitySpec, AbilitySpec]> = {
  juggler: [
    { icon: '🍅', name: '三重抛掷', desc: '每次投掷同时抛出 3 枚番茄，扇形散开' },
    { icon: '💥', name: '爆浆番茄', desc: '番茄命中后爆裂，对周围敌人造成 60% 溅射伤害' },
  ],
  unicorn: [
    { icon: '⚡', name: '二连突刺', desc: '每次出手连刺两段，第二段重新索敌' },
    { icon: '🌈', name: '虹光震波', desc: '突刺终点爆发冲击波：60% 范围伤害并强力击退' },
  ],
  troll: [
    { icon: '🌀', name: '全周横扫', desc: '巨斧扫过整整一圈，攻击四面八方的敌人' },
    { icon: '🥶', name: '震慑余波', desc: '被横扫命中的敌人减速 45%，持续 1.2 秒' },
  ],
  cowboy: [
    { icon: '🎯', name: '贯穿弹', desc: '水弹贯穿敌人，沿途最多命中 3 名' },
    { icon: '🔫', name: '左轮风暴', desc: '每把枪每第 4 次射击变为 5 发扇形弹幕' },
  ],
  mage: [
    { icon: '🔥', name: '余烬秘火', desc: '轰炸在爆心留下灼烧地面，3 秒内持续烧伤敌人' },
    { icon: '✨', name: '连锁轰炸', desc: '轰炸后 0.25 秒向随机敌人追加一次 75% 伤害的轰炸' },
  ],
  kangaroo: [
    { icon: '🪃', name: '双子回旋', desc: '同时向相反方向掷出第二枚回旋镖' },
    { icon: '🧲', name: '磁力巨镖', desc: '回旋镖增大 40%，并沿途吸取金币' },
  ],
  robot: [
    { icon: '🔭', name: '双联光束', desc: '开火时向正后方同步射出第二道光束' },
    { icon: '📡', name: '全域扫射', desc: '光束改为绕自身一周的 8 向扫射，每束 60% 伤害' },
  ],
  snowman: [
    { icon: '🩹', name: '冻伤', desc: '寒气光环每秒对范围内敌人造成 6 点伤害' },
    { icon: '🌨️', name: '凛冬降临', desc: '每 5 秒光环脉冲一次，冻结范围内敌人 0.7 秒' },
  ],
} as const

/** 按已解锁档位把能力注入武器 spec（纯变换；一二阶累积生效） */
export function applyAbilities(
  id: CharacterId,
  tiers: AbilityTiers,
  weapons: readonly WeaponSpec[],
): WeaponSpec[] {
  const { a1, a2 } = tiers
  if (!a1) return [...weapons]
  return weapons.map((w) => {
    switch (id) {
      case 'juggler':
        if (w.kind !== 'projectile') return w
        return {
          ...w,
          volley: { count: 3, spreadRad: 0.32 },
          ...(a2 ? { splash: { radius: 0.9 * UNIT, ratio: 0.6 } } : {}),
        }
      case 'unicorn':
        if (w.kind !== 'thrust') return w
        return {
          ...w,
          combo: { delayMs: 170 },
          ...(a2
            ? {
                tipBurst: { radius: 1.1 * UNIT, ratio: 0.6, knockback: 720, color: 0xff8ad8 },
              }
            : {}),
        }
      case 'troll':
        if (w.kind !== 'sweep') return w
        return {
          ...w,
          arcRad: Math.PI * 2,
          sweepMs: Math.round(w.sweepMs * 1.35),
          ...(a2 ? { slowOnHit: { factor: 0.55, durationMs: 1200 } } : {}),
        }
      case 'cowboy':
        if (w.kind !== 'projectile') return w
        return {
          ...w,
          pierce: 2,
          ...(a2 ? { everyN: { n: 4, count: 5, spreadRad: 0.55 } } : {}),
        }
      case 'mage':
        if (w.kind !== 'areaBlast') return w
        return {
          ...w,
          burn: { radius: 1.4 * UNIT, dps: 8, durationMs: 3000 },
          ...(a2 ? { echo: { delayMs: 250, ratio: 0.75 } } : {}),
        }
      case 'kangaroo':
        if (w.kind !== 'boomerang') return w
        return {
          ...w,
          twin: true,
          ...(a2
            ? {
                hitRadius: w.hitRadius * 1.4,
                held: { ...w.held, size: w.held.size * 1.4 },
                coinMagnetRadius: 1.6 * UNIT,
              }
            : {}),
        }
      case 'robot':
        if (w.kind !== 'laser') return w
        return {
          ...w,
          backBeam: true,
          ...(a2 ? { radial: { beams: 8, ratio: 0.6, stepMs: 60 } } : {}),
        }
      case 'snowman':
        if (w.kind !== 'slowAura') return w
        return {
          ...w,
          dps: 6,
          ...(a2 ? { freeze: { intervalMs: 5000, durationMs: 700 } } : {}),
        }
    }
  })
}

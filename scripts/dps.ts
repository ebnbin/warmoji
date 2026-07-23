// 生效 DPS 粗算（只读工具，非运行时）：各投送口径不同——summon/turret 按并发、
// boomerang 按去回两判、chainArc 按满命中折算，其余为单目标 damage/cooldown。
// 暴击/道具/aim 前。balance.ts 与 gen-defs 的数值软护栏同源于此。

type Ability = Record<string, unknown>

function num(v: Ability, k: string): number {
  const x = v[k]
  return typeof x === 'number' ? x : 0
}

export function abilityDps(v: Ability): number {
  const dmg = num(v, 'damage')
  const cd = num(v, 'cooldownMs') / 1000
  switch (v.kind) {
    case 'summon': {
      // 每只小蜂 = 撞击直伤 + 毒素总伤（damage/tick × 跳数）；按每波并发折算
      const onHit = Array.isArray(v.onHit) ? (v.onHit as Ability[]) : []
      let per = dmg
      for (const e of onHit) {
        if (e.kind === 'poison') per += num(e, 'damage') * (num(e, 'durationMs') / Math.max(1, num(e, 'tickMs')))
      }
      return (num(v, 'count') * per) / (num(v, 'intervalMs') / 1000)
    }
    case 'turret':
      return (num(v, 'maxTurrets') * dmg) / (num(v, 'fireIntervalMs') / 1000)
    case 'chainArc': {
      // 满命中：主 + bounces 跳，逐跳 ×decay
      let tot = 0
      for (let i = 0; i <= num(v, 'bounces'); i++) tot += dmg * num(v, 'decay') ** i
      return tot / cd
    }
    case 'boomerang': {
      // 去回各判一次；冷却在接住后才起，周期 ≈ cd + 飞行去 + 回收
      const cyc = cd + num(v, 'outMs') / 1000 + num(v, 'range') / num(v, 'returnSpeed')
      return (2 * dmg) / cyc
    }
    default:
      return cd > 0 ? dmg / cd : 0
  }
}

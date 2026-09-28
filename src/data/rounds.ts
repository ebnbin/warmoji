import type { RepeatDef, Rounds, RunDef, StepDef } from '../types/runs'

/** 第 round 轮选中了没有：不写轮次就每轮都有 */
function inRound(r: Rounds | undefined, round: number): boolean {
  if (!r) return true
  const from = r.from ?? 1
  return round >= from && round <= (r.to ?? Infinity) && (round - from) % (r.every ?? 1) === 0
}

/** 第 round 轮有的那些，去掉轮次条件 */
function pick<T extends { readonly rounds?: Rounds }>(items: readonly T[], round: number): T[] {
  return items.filter((x) => inRound(x.rounds, round)).map((x) => ({ ...x, rounds: undefined }))
}

/** 重复的第 round 轮要走的步骤：只留这一轮有的，每场只留这一轮有的刷怪与结束规则，名字后面加上第几轮 */
export function roundSteps(rep: RepeatDef, round: number): StepDef[] {
  return pick(rep.steps, round).map((s): StepDef => {
    if (s.kind !== 'fight') return s
    const f = s.fight
    const phases = f.phases.map((p) => ({ ...p, spawns: pick(p.spawns, round), ends: pick(p.ends, round) }))
    return { kind: 'fight', fight: { ...f, name: `${f.name} · 第 ${round} 轮`, phases } }
  })
}

/** 重复里写的每一个轮次条件 */
export function roundsOf(rep: RepeatDef): Rounds[] {
  const gated = rep.steps.flatMap((s) => [s, ...(s.kind === 'fight' ? s.fight.phases.flatMap((p) => [...p.spawns, ...p.ends]) : [])])
  return gated.flatMap((x) => (x.rounds ? [x.rounds] : []))
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** 一直重复时，到第几轮为止每一种轮次组合都出现过：过了所有条件的起止轮，再走完各条件间隔的最小公倍数那么多轮 */
export function cycleOf(rep: RepeatDef): number {
  const all = roundsOf(rep)
  const edge = Math.max(0, ...all.map((r) => Math.max(r.from ?? 1, r.to ?? 0)))
  const period = all.reduce((l, r) => (l * (r.every ?? 1)) / gcd(l, r.every ?? 1), 1)
  return edge + period
}

/** 一直重复时，走到的那一轮之后再多展开几轮：往后找下一场、下一次招募都在这几轮里找 */
const LOOKAHEAD = 2

/** 走到第 step 步时一局要走的步骤：重复按轮展开；一直重复的展开到这一步之后还有几轮，且每一种轮次组合都出现过 */
export function planOf(def: RunDef, step: number): StepDef[] {
  const out: StepDef[] = []
  for (const s of def.steps) {
    if (s.kind !== 'repeat') {
      out.push(s)
      continue
    }
    let last = s.times ?? Infinity
    for (let r = 1; r <= last; r++) {
      out.push(...roundSteps(s, r))
      if (last === Infinity && out.length > step) last = Math.max(r + LOOKAHEAD, cycleOf(s))
    }
  }
  return out
}

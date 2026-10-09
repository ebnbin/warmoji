import type { StarRule } from '../types/runs'
import type { RunState } from './state'

/** 这一局做到了这条星级条件 */
export function starMet(run: RunState, s: StarRule): boolean {
  switch (s.kind) {
    case 'downs':
      return Object.values(run.stats.deaths).reduce((sum, n) => sum + n, 0) <= s.count
    case 'time':
      return run.combatMs <= s.ms
    case 'switches':
      return run.stats.switches <= s.count
    case 'skills':
      return run.stats.casts <= s.count
    case 'kills':
      return run.kills >= s.count
    case 'hazard':
      return (run.stats.hazardDamage[s.by] ?? 0) <= s.damage
  }
}

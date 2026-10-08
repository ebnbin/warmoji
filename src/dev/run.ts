import type { DevTab } from '../devtools'
import { CHARACTERS } from '../data/characters'
import { MAPS } from '../data/maps'
import { currentRun, runDef, stepsOf } from '../run/state'

function runText(): string {
  const run = currentRun()
  if (!run) return ''
  return [
    `${MAPS[run.mapId].name} · ${runDef(run).name} · 第 ${run.step + 1}/${stepsOf(run).length} 步`,
    `金币 ${run.coins} · 击杀 ${run.kills} · 等级 ${run.xp.level}（${run.xp.xp} xp）`,
    `队伍 ${run.roster.map((id) => CHARACTERS[id].name).join('、')} · 队长 ${CHARACTERS[run.leaderId].name}`,
    `累计战斗 ${Math.round(run.combatMs / 1000)} s`,
  ].join('\n')
}

/** 只读：改对局的作弊放在能正确处理它的场景里，战斗中的改动要录进录像 */
export function runTab(): DevTab {
  return { id: 'run', title: '对局', when: () => currentRun() !== undefined, items: () => [{ kind: 'text', mono: true, read: runText }] }
}

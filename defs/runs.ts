import type { RunDef } from '../src/types/runs'
import { mapValues } from '../src/util/record.ts'
import { EXPERIMENTS } from './experiments.ts'
import { CHAPTER as meadowChapter } from './maps/meadow/chapter.ts'

/** 冒险：一张地图一章，每章单独开局；各场用这张图的实验，章末打这张图的头目 */
const ADVENTURE = { meadowChapter } as const satisfies Record<string, RunDef>

/** B 的 id 和 A 的都不重名才是 B 本身，否则是 never */
type Disjoint<A, B> = [keyof A & keyof B] extends [never] ? B : never

/** 单独试玩一个实验：按它的预设队伍打它那一场；用实验的 id，和冒险的章重名就编译不过 */
const TRIALS: Disjoint<typeof ADVENTURE, Record<keyof typeof EXPERIMENTS, RunDef>> = mapValues(EXPERIMENTS, (e): RunDef => ({
  emoji: e.emoji,
  name: e.name,
  desc: e.desc,
  note: e.note,
  team: e.team,
  stars: e.stars,
  steps: [{ kind: 'fight', fight: e.fight }],
}))

export const RUNS = { ...ADVENTURE, ...TRIALS } as const satisfies Record<string, RunDef>

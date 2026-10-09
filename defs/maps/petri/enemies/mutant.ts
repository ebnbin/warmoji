import type { EnemyDef } from '../../../../legacy/types/enemies'
import type { ElementId } from '../../../../legacy/types/elements'
import type { StatusId } from '../../../../legacy/types/statuses'

/** 身上一沾上这种状态，就突变成留下它的元素 */
const adapt = (mark: StatusId, element: ElementId) => ({ on: 'hurt', to: 'self', if: { kind: 'marked', who: 'self', mark }, effects: [{ kind: 'attune', element, ms: 6000 }] }) as const

const MUTANT = {
  kind: 'mutant',
  emoji: '1f9ec',
  name: '突变体',
  desc: '本身没有元素，追着人抓挠，一爪是实打实的物理；挨什么元素就朝什么突变 6 秒：一中毒、着火或发冷，当场变成毒、火或冰，再也叠不上毒、点不着、冻不住；一湿就变成水，反倒一冰就冻、一电一片；变了以后抓人也带上它；雷和物理它适应不了',
  size: 1.4,
  radius: 0.52,
  hp: 160,
  speed: 1.4,
  damage: 13,
  xp: 7,
  coins: 5,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 2,
      damage: 17,
      fireSfx: 'whoosh',
      windup: { ms: 300, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 2, arcDeg: 100, ms: 180 },
    },
  ],
  reactions: [adapt('poison', 'poison'), adapt('burn', 'fire'), adapt('chill', 'ice'), adapt('wet', 'water')],
} satisfies EnemyDef

export default MUTANT

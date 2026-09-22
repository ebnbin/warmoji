import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// 守卫：flat config 同名规则后者整个替换前者，新加一个覆盖面更大的块会静默清空前面的护栏，lint 照样全绿

const eslint = new ESLint()

/** 返回命中的规则名 */
async function rulesFiredOn(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false })
  return (result?.messages ?? []).map((m) => m.ruleId ?? '')
}

const GUARDS: readonly { name: string; file: string; code: string }[] = [
  {
    name: '实现隔离：主干不得直接 import 战斗实现',
    file: 'src/run/state.ts',
    code: "import { EcsBattleScene } from '../ecs/EcsBattleScene'\nvoid EcsBattleScene\n",
  },
  {
    name: '实现隔离：主干不得直接 import bitecs',
    file: 'src/run/state.ts',
    code: "import { addEntity } from 'bitecs'\nvoid addEntity\n",
  },
  {
    name: '页面层不得依赖战斗实现',
    file: 'src/scene/UIScene.ts',
    code: "import { worldFor } from '../ecs/worlds/hooks'\nvoid worldFor\n",
  },
  {
    name: '战斗侧不得依赖场景层',
    file: 'src/ecs/ability/kinds/summon.ts',
    code: "import { UIScene } from '../../../scene/UIScene'\nvoid UIScene\n",
  },
  {
    name: '战斗侧不得依赖开发者工具',
    file: 'src/ecs/systems/spawnStep.ts',
    code: "import { DevPanel } from '../../dev/DevPanel'\nvoid DevPanel\n",
  },
  {
    name: 'assets/*.json 只许 data/ 与 types/ 读',
    file: 'src/run/xp.ts',
    code: "import waves from '../assets/progression.json'\nvoid waves\n",
  },
  {
    name: '建实体只在 src/ecs/entities/ 下',
    file: 'src/ecs/pickups.ts',
    code: "import { addEntity } from 'bitecs'\nvoid addEntity\n",
  },
  {
    name: 'data 是内容叶子层',
    file: 'src/data/pickups.ts',
    code: "import { xpToNext } from '../run/xp'\nvoid xpToNext\n",
  },
  {
    name: '纯逻辑文件禁 import phaser',
    file: 'src/run/xp.ts',
    code: "import Phaser from 'phaser'\nvoid Phaser\n",
  },
  {
    name: 'types 只放类型声明',
    file: 'src/types/weapons.ts',
    code: 'export function f(): number {\n  return 1\n}\n',
  },
]

/** 该放行的位置必须真的放行 */
const ALLOWED: readonly { name: string; file: string; code: string }[] = [
  {
    name: 'entities/ 下建实体照常',
    file: 'src/ecs/entities/pickup.ts',
    code: "import { addEntity } from 'bitecs'\nvoid addEntity\n",
  },
  {
    name: 'types/ 读 assets json 照常',
    file: 'src/types/weapons.ts',
    code: "import weapons from '../assets/weapons.json'\nvoid weapons\n",
  },
  {
    name: 'data/ 读 assets json 照常',
    file: 'src/data/pickups.ts',
    code: "import pickups from '../assets/pickups.json'\nvoid pickups\n",
  },
  {
    name: 'battle.ts 是唯一允许 import 两侧实现的接线面',
    file: 'src/battle.ts',
    code: "import { EcsBattleScene } from './ecs/EcsBattleScene'\nvoid EcsBattleScene\n",
  },
]

describe('eslint 架构护栏还活着', () => {
  for (const g of GUARDS) {
    it(`拦得住：${g.name}`, async () => {
      const fired = await rulesFiredOn(g.file, g.code)
      const hit = fired.some((r) => r.endsWith('no-restricted-imports') || r.endsWith('no-restricted-syntax'))
      expect(hit, `${g.file} 里这段代码本该被拦下，实际只报了：${fired.join(', ') || '（什么都没报）'}`).toBe(true)
    })
  }
  for (const a of ALLOWED) {
    it(`不误伤：${a.name}`, async () => {
      const fired = await rulesFiredOn(a.file, a.code)
      const hit = fired.filter((r) => r.endsWith('no-restricted-imports') || r.endsWith('no-restricted-syntax'))
      expect(hit, `${a.file} 里这段代码本该放行，却被拦下`).toEqual([])
    })
  }
})

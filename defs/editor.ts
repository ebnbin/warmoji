import type { RunDef } from '../src/types/runs'

/** 关卡编辑器打开时的草稿：最简单的可玩一局，三人预设队伍在草甸撑过一分钟 */
export const EDITOR_DRAFT = {
  emoji: '1f6e0',
  name: '自定义关卡',
  desc: '在关卡编辑器里调出来的一局',
  team: { slots: ['royalGuard', 'rocker', 'nurse'] },
  steps: [
    {
      kind: 'fight',
      fight: {
        name: '第 1 场',
        map: 'meadow',
        phases: [
          {
            mix: [
              { kind: 'wolf', weight: 3 },
              { kind: 'goat', weight: 1 },
            ],
            spawns: [{ kind: 'stream' }],
            ends: [{ kind: 'time', ms: 60_000 }],
          },
        ],
      },
    },
  ],
} as const satisfies RunDef

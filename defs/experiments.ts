import type { ExperimentDef } from '../src/types/runs'

/** 实验：每个只试一种新玩法，都打在沙盒的新地图上，靠这张图自己的机制成立 */
export const EXPERIMENTS = {
  bankRaid: {
    emoji: '26f0',
    name: '坡顶来敌',
    desc: '草甸一边的陡坡上面是更高的一层草甸，敌人全都从坡顶被抛下来，落在坡脚一带；撑过 75 秒',
    note: '出怪口当变量：敌人只从一处进场，落点就是战线，守在坡脚截住刚落地的，还是退到开阔处等它们追过来',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 90 }],
    fight: {
      name: '坡顶来敌',
      map: 'meadow',
      clockSec: 120,
      phases: [
        {
          intro: { title: '坡顶来敌', sub: '敌人只从坡顶被抛下来' },
          mix: [
            { kind: 'zombie', weight: 4 },
            { kind: 'boar', weight: 2 },
            { kind: 'locust', weight: 2 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 700, ramp: { toMs: 380, overMs: 60_000 }, at: { kind: 'gate', gate: 'bank' } },
            { kind: 'batch', atMs: 40_000, squad: { count: 6, enemy: 'boar', elites: 1, at: { kind: 'gate', gate: 'bank' } }, banner: { title: '野猪群', sub: '一群野猪从坡顶冲下来' } },
          ],
          ends: [{ kind: 'time', ms: 75_000 }],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>

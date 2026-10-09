import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
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
            { kind: 'wolf', weight: 4 },
            { kind: 'tusker', weight: 2 },
            { kind: 'goat', weight: 2 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 700, ramp: { toMs: 380, overMs: 60_000 }, at: { kind: 'gate', gate: 'bank' } },
            { kind: 'batch', atMs: 40_000, squad: { count: 6, enemy: 'tusker', elites: 1, at: { kind: 'gate', gate: 'bank' } }, banner: { title: '野猪群', sub: '一群野猪从坡顶冲下来' } },
          ],
          ends: [{ kind: 'time', ms: 75_000 }],
        },
      ],
    },
  },
  gateGuard: {
    emoji: '1f411',
    name: '守栅门',
    desc: '闩着的栅栏门外就是羊圈：怪物从林子里钻出来，不理队伍，直奔栅栏门去拱羊；放过去 6 只就输，撑过 30 秒',
    note: '敌人朝一处行进、不追队伍：从「别被打倒」变成「拦住它们」，站位要卡在林子和栅栏门之间',
    team: { slots: [{ tags: ['control'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 23 }],
    fight: {
      name: '守栅门',
      map: 'meadow',
      clockSec: 60,
      phases: [
        {
          intro: { title: '守栅门', sub: '别让怪物摸到栅栏门' },
          spawns: [
            { kind: 'stream', intervalMs: 1300, ramp: { toMs: 750, overMs: 80_000 }, enemy: 'wolf', drive: { kind: 'march', mark: 'gate' }, at: { kind: 'gate', gate: 'woods' } },
            { kind: 'stream', fromMs: 20_000, intervalMs: 5000, enemy: 'tusker', drive: { kind: 'march', mark: 'gate' }, at: { kind: 'gate', gate: 'woods' } },
            {
              kind: 'stream',
              intervalMs: 3200,
              mix: [
                { kind: 'grassSnake', weight: 2 },
                { kind: 'cheshire', weight: 1 },
              ],
              at: { kind: 'gate', gate: 'brush' },
            },
          ],
          ends: [
            { kind: 'time', ms: 30_000 },
            { kind: 'leak', mark: 'gate', radius: 1.5, count: 6 },
          ],
        },
      ],
    },
  },
  relay: {
    emoji: '1f3c3',
    name: '接力',
    desc: '队长每 10 秒自动交给名单上的下一名队员，手动换不了；一分半内击杀 80 只',
    note: '强制轮换：每名队员都要轮到当队长，近战、远程、辅助各自怎么走位都得会，草地开阔没有别的规矩干扰',
    team: { slots: [{ tags: ['melee'] }, { tags: ['ranged'] }, { tags: ['area'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 70_000 }],
    fight: {
      name: '接力',
      map: 'meadow',
      clockSec: 90,
      rules: { relay: 10_000, leader: { lock: true } },
      phases: [
        {
          intro: { title: '接力', sub: '每 10 秒换下一名队员当队长' },
          mix: [
            { kind: 'wolf', weight: 4 },
            { kind: 'goat', weight: 2 },
            { kind: 'tusker', weight: 1 },
            { kind: 'grassSnake', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 600 }],
          ends: [
            { kind: 'kills', count: 80 },
            { kind: 'time', ms: 90_000, lose: true },
          ],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>

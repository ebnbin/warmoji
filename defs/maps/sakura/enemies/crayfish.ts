import type { EnemyDef } from '../../../../legacy/types/enemies'

const CRAYFISH = {
  kind: 'crayfish',
  emoji: '1f99e',
  name: '溪虾',
  element: 'water',
  desc: '从溪岸爬上来的溪虾，溪水冲不走它，追人时照样下水：钳子一夹，被夹住的 1 秒走不动，还被溪水浇湿，湿了的人点不着火，却一冰就冻、一电一片；硬壳护甲厚，刀砍棒敲都不太疼，毒照样渗得进去；本身一直是湿的，点不着火，一冰就冻住，冻住了再敲就碎',
  size: 1.25,
  radius: 0.46,
  span: [0, 1],
  hp: 56,
  stats: { armor: 8 },
  speed: 1.3,
  damage: 6,
  xp: 5,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 1.7,
      damage: 8,
      fireSfx: 'chip',
      windup: { ms: 320, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 1.4, radius: 0.4, ms: 140 },
      onHit: [{ kind: 'root', durationMs: 1000 }],
    },
  ],
} satisfies EnemyDef

export default CRAYFISH

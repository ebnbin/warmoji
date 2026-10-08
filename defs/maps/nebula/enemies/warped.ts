import type { EnemyDef } from '../../../../src/types/enemies'

const WARPED = {
  kind: 'warped',
  emoji: '1faea',
  name: '扭曲脸',
  element: 'dark',
  desc: '脸被引力扯歪了的怪人：一路追着人走，每 6 秒在身周撑开一圈 1.5 格、跟着它走的扭曲场，3 秒内打进圈里的子弹全被弹回去',
  size: 1.3,
  radius: 0.48,
  hp: 160,
  speed: 1.3,
  damage: 14,
  xp: 7,
  coins: 5,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      class: 'skill',
      cooldownMs: 6000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 9,
      fireSfx: 'warp',
      shape: { kind: 'world' },
      onHit: [{ kind: 'barrier', shape: 'ring', length: 1.5, durationMs: 3000, bodies: 'none', shots: true, reflect: true, follow: true, color: 0x7e57c2 }],
    },
  ],
} satisfies EnemyDef

export default WARPED

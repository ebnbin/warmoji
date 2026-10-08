import type { EnemyDef } from '../../../src/types/enemies'

const ELF = {
  kind: 'elf',
  drive: { kind: 'chase' },
  emoji: '1f9cc',
  name: '巨魔萨满',
  desc: '巨魔部落的萨满，每隔几秒群体治疗周围受伤的同伴——不先清它，怪潮就一直被奶回来',
  size: 1.3,
  radius: 0.5,
  hp: 65,
  speed: 1.3,
  damage: 5,
  xp: 5,
  coins: 4,
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      aim: 'self',
      fireSfx: 'upgrade',
      shape: { kind: 'disc', radius: 3.5, at: 'self', of: 'hurt' },
      onHit: [{ kind: 'heal', amount: 13, scope: 'all' }],
    },
  ],
} satisfies EnemyDef

export default ELF

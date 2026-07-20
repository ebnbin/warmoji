import { describe, expect, it } from 'vitest'
import { OUTLINED_EMOJIS } from './preload'
import { BOSS, ENEMY_DEFS } from '../enemies/registry'

describe('预载清单覆盖', () => {
  it('所有敌方亡语冷枪（onDeath spawnProjectile）的弹体 emoji 都在预载里', () => {
    const preloaded = new Set(OUTLINED_EMOJIS.enemyProjectile)
    for (const e of [...ENEMY_DEFS, BOSS]) {
      for (const fx of e.onDeath ?? []) {
        if (fx.kind === 'spawnProjectile') {
          expect(preloaded.has(fx.projectile.emoji), `${e.name} 亡语弹 ${fx.projectile.emoji} 漏预载`).toBe(
            true,
          )
        }
      }
    }
  })
})

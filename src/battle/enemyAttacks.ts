import { norm } from '../lib/vec'
import { playSfx } from '../audio/sfx'
import type { Member } from './members'
import { spawnEnemyShot } from './hazards'
import type { Enemy } from './enemies'
import type { ArcadeBody, BaseArenaScene } from './BaseArenaScene'

// 敌人攻击模块运行时：按 spec.attacks 逐条推进（计时在 a.attackNextAt，
// 与模块列表同下标）。periodicShot 朝移动方向或最近队员放弹；
// ringBarrage 向四周均匀齐射（带随机整体旋转）。伤害倍率吃精英标记。

export function runEnemyAttacks(
  scene: BaseArenaScene,
  a: Enemy,
  body: ArcadeBody,
  now: number,
  target: Member,
): void {
  const attacks = a.spec.attacks
  if (!attacks) return
  const e = a.image
  for (let i = 0; i < attacks.length; i++) {
    if (now < (a.attackNextAt[i] ?? 0)) continue
    const atk = attacks[i]!
    a.attackNextAt[i] = now + atk.intervalMs
    switch (atk.kind) {
      case 'periodicShot': {
        let angle: number
        if (atk.aim === 'move') {
          const v = norm(body.velocity.x, body.velocity.y)
          angle = Math.atan2(v.y, v.x)
        } else {
          const d = scene.worldDelta(e, target.image)
          angle = Math.atan2(d.y, d.x)
        }
        spawnEnemyShot(scene, e.x, e.y, angle, atk.bullet, a.spec.name, a.dmgMul)
        break
      }
      case 'ringBarrage': {
        const rot = scene.rng.next() * Math.PI * 2
        for (let k = 0; k < atk.count; k++) {
          spawnEnemyShot(scene, e.x, e.y, rot + (k * 2 * Math.PI) / atk.count, atk.bullet, a.spec.name, a.dmgMul)
        }
        playSfx('boom')
        break
      }
    }
  }
}

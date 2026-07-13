import type Phaser from 'phaser'
import type { ProjectileSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import { nearestAngle } from './types'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 发射型：held 时持有物定身指向目标（可带左右手挂载位）；无 held 时角色本体出弹 */
export class ProjectileWeapon implements WeaponRuntime {
  private image?: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0

  constructor(
    private spec: ProjectileSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    if (spec.held) {
      this.image = emojiImage(ctx.scene, 0, 0, spec.held.emoji, spec.held.size, true).setDepth(13)
    }
    this.cooldown = initialCooldownMs
  }

  private muzzle(owner: WeaponOwner): { x: number; y: number } {
    const held = this.spec.held
    if (!held) return { x: owner.x, y: owner.y }
    const side = held.mountSide ?? 0
    const gap = held.mountGap ?? 0
    const px = Math.cos(this.aim + Math.PI / 2) * side * gap
    const py = Math.sin(this.aim + Math.PI / 2) * side * gap
    return {
      x: owner.x + Math.cos(this.aim) * held.restOffset + px,
      y: owner.y + Math.sin(this.aim) * held.restOffset + py,
    }
  }

  update(delta: number, owner: WeaponOwner): void {
    this.cooldown -= delta
    if (this.image) {
      const pos = this.muzzle(owner)
      this.image.setPosition(pos.x, pos.y)
      this.image.setRotation(this.aim + this.spec.held!.rotationOffsetRad)
    }

    if (this.cooldown > 0) return
    const targets = this.ctx.enemyTargets()
    const aim = nearestAngle(owner, targets)
    if (aim === null) return
    this.aim = aim
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.spec.damage * this.ctx.damageMul())
    const from = this.muzzle(owner)
    this.ctx.spawnProjectile(from.x, from.y, this.aim, this.spec, damage)
  }

  setVisible(on: boolean): void {
    this.image?.setVisible(on)
  }

  destroy(): void {
    this.image?.destroy()
  }
}

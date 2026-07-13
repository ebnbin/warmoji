import type Phaser from 'phaser'
import type { BoomerangSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import { nearestAngle } from './types'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

type Phase = 'idle' | 'out' | 'back'

/**
 * 回旋镖：出手瞬间锁定最远点，去程飞向该点；回程追踪角色实时位置。
 * 飞行途中碰到的敌人受伤，去程/回程各判一次（同一程内每敌最多一次）。
 * 接住后才开始计冷却。
 */
export class BoomerangWeapon implements WeaponRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private phase: Phase = 'idle'
  private launchX = 0
  private launchY = 0
  private destX = 0
  private destY = 0
  private flightT = 0
  private hitSet = new Set<Phaser.GameObjects.Image>()
  private damage = 0

  constructor(
    private spec: BoomerangSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, spec.held.emoji, spec.held.size, true).setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: WeaponOwner): void {
    if (this.phase === 'idle') {
      this.cooldown -= delta
      this.image.setPosition(
        owner.x + Math.cos(this.aim) * this.spec.held.restOffset,
        owner.y + Math.sin(this.aim) * this.spec.held.restOffset,
      )
      this.image.setRotation(this.aim + this.spec.held.rotationOffsetRad)

      if (this.cooldown > 0) return
      const aim = nearestAngle(owner, this.ctx.enemyTargets())
      if (aim === null) return
      this.aim = aim
      this.launch(owner)
      return
    }

    // 飞行中：自旋 + 途中判伤
    this.image.rotation += (this.spec.spinRadPerSec * delta) / 1000
    if (this.phase === 'out') {
      this.flightT = Math.min(1, this.flightT + delta / this.spec.outMs)
      // 去程终点在出手瞬间已锁定
      const ease = Math.sin((this.flightT * Math.PI) / 2)
      this.image.setPosition(
        this.launchX + (this.destX - this.launchX) * ease,
        this.launchY + (this.destY - this.launchY) * ease,
      )
      if (this.flightT >= 1) {
        this.phase = 'back'
        this.hitSet.clear()
      }
    } else {
      // 回程：追踪角色实时位置
      const dx = owner.x - this.image.x
      const dy = owner.y - this.image.y
      const dist = Math.hypot(dx, dy)
      const step = (this.spec.returnSpeed * delta) / 1000
      if (dist <= Math.max(step, 20)) {
        this.phase = 'idle'
        this.hitSet.clear()
        this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()
        return
      }
      this.image.setPosition(
        this.image.x + (dx / dist) * step,
        this.image.y + (dy / dist) * step,
      )
    }
    this.hitAlongPath()
  }

  private launch(owner: WeaponOwner): void {
    this.phase = 'out'
    this.flightT = 0
    this.hitSet.clear()
    this.launchX = owner.x
    this.launchY = owner.y
    this.destX = owner.x + Math.cos(this.aim) * this.spec.range
    this.destY = owner.y + Math.sin(this.aim) * this.spec.range
    this.damage = Math.round(this.spec.damage * this.ctx.damageMul())
  }

  private hitAlongPath(): void {
    for (const t of this.ctx.enemyTargets()) {
      if (this.hitSet.has(t.ref)) continue
      const dx = t.x - this.image.x
      const dy = t.y - this.image.y
      const rr = this.spec.hitRadius + t.radius
      if (dx * dx + dy * dy <= rr * rr) {
        this.hitSet.add(t.ref)
        this.ctx.damageEnemy(t.ref, this.damage)
      }
    }
  }

  setVisible(on: boolean): void {
    this.image.setVisible(on)
    if (!on) {
      this.phase = 'idle'
      this.hitSet.clear()
      this.cooldown = this.spec.cooldownMs
    }
  }

  destroy(): void {
    this.image.destroy()
  }
}

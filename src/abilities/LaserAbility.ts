import type Phaser from 'phaser'
import { thrustHitIndices } from './spec'
import type { LaserSpec } from './spec'
import { emojiImage } from '../emoji/textures'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 贯穿激光：向最近的敌人方向发射光束，线段胶囊判定命中直线上的所有敌人。
 * 能力：backBeam 向正后方补一道；radial 出手变为绕一周的多向序列扫射（取代单束） */
export class LaserAbility implements AbilityRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private hidden = false
  /** 全域扫射的待发队列（内部时钟驱动，随角色死亡自然暂停） */
  private radialQueue: { angle: number; at: number }[] = []
  private clock = 0

  constructor(
    private spec: LaserSpec,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, spec.held.emoji, spec.held.size, ctx.ownerOutline).setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    this.clock += delta
    const held = this.spec.held
    this.image.setPosition(
      owner.x + Math.cos(this.aim) * held.restOffset,
      owner.y + Math.sin(this.aim) * held.restOffset,
    )
    this.image.setRotation(this.aim + held.rotationOffsetRad)

    // 全域扫射：按时序逐束兑现（跟随角色实时位置）
    if (this.radialQueue.length > 0 && !this.hidden) {
      const ratio = this.spec.radial?.ratio ?? 1
      while (this.radialQueue.length > 0 && this.radialQueue[0]!.at <= this.clock) {
        const shot = this.radialQueue.shift()!
        this.aim = shot.angle
        this.fireBeam(owner, shot.angle, ratio)
      }
      return
    }

    if (this.cooldown > 0 || this.hidden) return
    const targets = this.ctx.targets()
    // 最近敌人在射程内才开火
    let best = Infinity
    let aim: number | null = null
    for (const t of targets) {
      const dx = t.x - owner.x
      const dy = t.y - owner.y
      const d = dx * dx + dy * dy
      if (d < best) {
        best = d
        aim = Math.atan2(dy, dx)
      }
    }
    if (aim === null || best > this.spec.range * this.spec.range) return
    this.aim = aim
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    if (this.spec.radial) {
      // 出手变为绕一周的序列扫射：从瞄准角起步，逐束旋转铺满 360°
      const { beams, stepMs } = this.spec.radial
      for (let k = 0; k < beams; k++) {
        this.radialQueue.push({ angle: aim + (k * 2 * Math.PI) / beams, at: this.clock + k * stepMs })
      }
      return
    }

    this.fireBeam(owner, aim, 1)
    // 双联光束：正后方补一道
    if (this.spec.backBeam) this.fireBeam(owner, aim + Math.PI, 1)
  }

  /** 发射一束：胶囊判定 + 特效（ratio 折损用于扫射分束） */
  private fireBeam(owner: AbilityOwner, angle: number, ratio: number): void {
    this.ctx.sfx('zap')
    const damage = Math.max(1, Math.round(this.spec.damage * this.ctx.damageMul() * ratio))
    const origin = { x: owner.x, y: owner.y }
    const targets = this.ctx.targets()
    for (const i of thrustHitIndices(origin, angle, this.spec.range, this.spec.beamRadius, targets)) {
      this.ctx.damageTarget(targets[i]!.ref, damage, this.spec.knockback, origin.x, origin.y)
    }
    this.beamEffect(origin.x, origin.y, angle)
  }

  private beamEffect(x: number, y: number, angle: number): void {
    const beam = this.ctx.scene.add
      .rectangle(x, y, this.spec.range, this.spec.beamRadius * 2, this.spec.color, 0.55)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(7)
    const core = this.ctx.scene.add
      .rectangle(x, y, this.spec.range, this.spec.beamRadius * 0.7, 0xffffff, 0.95)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(8)
    this.ctx.scene.tweens.add({
      targets: [beam, core],
      alpha: 0,
      scaleY: 0.15,
      duration: 200,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        beam.destroy()
        core.destroy()
      },
    })
  }

  setVisible(on: boolean): void {
    this.hidden = !on
    this.image.setVisible(on)
    if (!on) this.radialQueue.length = 0
  }

  destroy(): void {
    this.image.destroy()
  }
}

import { DEG2RAD } from '../lib/units'
import type Phaser from 'phaser'
import type { ProjectileSpec, TurretSpec } from './spec'
import { ANIM_SPEC } from '../emoji/studio'
import { Animator } from '../emoji/animator'
import { clipFramesLive } from '../emoji/animTextures'
import { emojiImage } from '../emoji/textures'
import { nearestAngle } from './types'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

interface Turret {
  img: Phaser.GameObjects.Image
  fireCd: number
  anim: Animator
}

/** 装置型：本体无攻击，周期在脚下架设弩塔；弩塔自主索敌开火（伤害归属
 * 建造者）。同时在场有上限，超出拆最旧的。能力：burst 三连弩扇形连射。
 * 动画绑定示范：开火即播 attack cycle clip，durMs = 本次开火间隔——
 * 攻速（cooldownMul）越快拉弓越快，一次攻击恰好一遍动画 */
export class TurretAbility implements AbilityRuntime {
  private turrets: Turret[] = []
  private placeCd: number
  /** 弩塔子弹走通用投射物管线的合成 spec */
  private boltSpec: ProjectileSpec
  /** 动画帧活数组（惰性烘焙，未就绪前弩塔保持静态形象） */
  private idleFrames: string[]
  private attackFrames: string[]
  /** 动画时钟：delta 累积（暂停即停帧，与场景时基无耦合） */
  private clock = 0

  constructor(
    private spec: TurretSpec,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.placeCd = initialCooldownMs
    this.boltSpec = {
      kind: 'projectile',
      name: spec.name,
      icon: spec.icon,
      damage: spec.damage,
      cooldownMs: spec.fireIntervalMs,
      knockback: spec.knockback,
      projectile: spec.projectile,
    }
    this.idleFrames = clipFramesLive(ctx.scene, spec.turret.emoji, 'idle', ctx.ownerOutline)
    this.attackFrames = clipFramesLive(ctx.scene, spec.turret.emoji, 'attack', ctx.ownerOutline)
  }

  update(delta: number, owner: AbilityOwner): void {
    this.clock += delta
    this.placeCd -= delta
    if (this.placeCd <= 0) {
      this.placeCd = this.spec.placeIntervalMs * this.ctx.cooldownMul()
      this.place(owner)
    }
    const interval = this.spec.fireIntervalMs * this.ctx.cooldownMul()
    for (const t of this.turrets) {
      t.fireCd -= delta
      if (t.fireCd > 0) continue
      const targets = this.ctx.targets()
      const aim = nearestAngle({ x: t.img.x, y: t.img.y, setVisualOffset: () => {} }, targets, this.spec.range)
      if (aim === null) continue
      t.fireCd = interval
      t.img.setRotation(aim - Math.PI / 4)
      // 一次开火 = 一遍拉弓动画，时长恰为下次开火间隔（攻速绑定的核心一行）
      t.anim.play('attack', { durMs: interval })
      const damage = Math.round(this.spec.damage * this.ctx.damageMul())
      const burst = this.spec.burst
      if (burst && burst.count > 1) {
        for (let i = 0; i < burst.count; i++) {
          const a = aim + burst.spreadDeg * DEG2RAD * (i / (burst.count - 1) - 0.5)
          this.ctx.spawnProjectile(t.img.x, t.img.y, a, this.boltSpec, damage)
        }
      } else {
        this.ctx.spawnProjectile(t.img.x, t.img.y, aim, this.boltSpec, damage)
      }
      this.ctx.sfx('shoot')
    }
    for (const t of this.turrets) t.anim.update(this.clock)
  }

  /** 在建造者脚下架一座；超编拆最旧 */
  private place(owner: AbilityOwner): void {
    const img = emojiImage(this.ctx.scene, owner.x, owner.y + 6, this.spec.turret.emoji, this.spec.turret.size, this.ctx.ownerOutline).setDepth(5)
    const base = img.scaleX
    img.setScale(base * 0.2)
    this.ctx.scene.tweens.add({ targets: img, scale: base, duration: 220, ease: 'Back.easeOut' })
    const anim = new Animator(img)
    anim.register('idle', this.idleFrames)
    anim.register('attack', this.attackFrames)
    anim.setIdle('idle', ANIM_SPEC.durMs, this.turrets.length * 311)
    this.turrets.push({ img, fireCd: 200, anim })
    this.ctx.sfx('recruit')
    while (this.turrets.length > this.spec.maxTurrets) {
      const old = this.turrets.shift()!
      this.ctx.scene.tweens.add({
        targets: old.img,
        alpha: 0,
        scale: old.img.scaleX * 0.3,
        duration: 240,
        onComplete: () => old.img.destroy(),
      })
    }
  }

  setVisible(on: boolean): void {
    for (const t of this.turrets) t.img.setVisible(on)
  }

  destroy(): void {
    for (const t of this.turrets) t.img.destroy()
    this.turrets = []
  }
}

import { DEG2RAD } from '../lib/units'
import type Phaser from 'phaser'
import type { ProjectileDef } from './defs'
import { emojiImage } from '../emoji/textures'
import { nearestAngle } from './types'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 发射型：held 时持有物定身指向目标（可带左右手挂载位）；无 held 时角色本体出弹。
 * 瞄准：nearest 最近目标 / move 持有者移动方向（无需目标）；整圈 volley 也无需目标。
 * 能力：volley 恒定齐射（≥2π 为整圈，可随机旋转）；everyN 每第 n 次特殊齐射 */
export class ProjectileAbility implements AbilityRuntime {
  private image?: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private shots = 0

  constructor(
    private def: ProjectileDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    if (def.held) {
      this.image = emojiImage(ctx.scene, 0, 0, def.held.emoji, def.held.size, ctx.ownerOutline).setDepth(13)
    }
    this.cooldown = initialCooldownMs
  }

  private muzzle(owner: AbilityOwner): { x: number; y: number } {
    const held = this.def.held
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

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    if (this.image) {
      const pos = this.muzzle(owner)
      this.image.setPosition(pos.x, pos.y)
      this.image.setRotation(this.aim + this.def.held!.rotationOffsetDeg * DEG2RAD)
    }

    if (this.cooldown > 0) return
    const fullRing = this.def.volley !== undefined && this.def.volley.spreadDeg >= 360 - 1e-9
    if (this.def.aim === 'move') {
      const h = this.ctx.ownerHeading?.()
      if (!h) return
      this.aim = Math.atan2(h.y, h.x)
    } else if (!fullRing) {
      const aim = nearestAngle(owner, this.ctx.targets(), this.def.range)
      if (aim === null) return
      this.aim = aim
    }
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.def.damage * this.ctx.damageMul())
    const from = this.muzzle(owner)
    this.shots++
    const defial = this.def.everyN && this.shots % this.def.everyN.n === 0
    const volley = defial
      ? { count: this.def.everyN!.count, spreadDeg: this.def.everyN!.spreadDeg }
      : this.def.volley
    if (volley && volley.count > 1) {
      const full = volley.spreadDeg >= 360 - 1e-9
      const base = full && volley.randomRotate ? (this.ctx.random?.() ?? 0) * Math.PI * 2 : this.aim
      for (let i = 0; i < volley.count; i++) {
        // 整圈按 count 均分步进（端点不重叠）；扇形沿瞄准方向对称散开
        const angle = full
          ? base + (i * volley.spreadDeg * DEG2RAD) / volley.count
          : this.aim + volley.spreadDeg * DEG2RAD * (i / (volley.count - 1) - 0.5)
        this.ctx.spawnProjectile(from.x, from.y, angle, this.def, damage)
      }
      if (this.def.fireSfx) this.ctx.sfx(this.def.fireSfx)
      return
    }
    this.ctx.spawnProjectile(from.x, from.y, this.aim, this.def, damage)
    if (this.def.fireSfx) this.ctx.sfx(this.def.fireSfx)
  }

  tickCooldown(delta: number): void {
    this.cooldown -= delta
  }

  postponeFire(ms: number): void {
    this.cooldown = Math.max(this.cooldown, ms)
  }

  setVisible(on: boolean): void {
    this.image?.setVisible(on)
  }

  destroy(): void {
    this.image?.destroy()
  }
}

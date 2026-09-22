import { DEG2RAD } from '../../util/units'
import type Phaser from 'phaser'
import type { BoomerangDef } from '../../types/abilityDefs'
import { emojiImage } from '../../emoji/textures'
import { nearestAngle } from './targeting'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

interface Flyer {
  image: Phaser.GameObjects.Image
  phase: 'idle' | 'out' | 'back'
  launchX: number
  launchY: number
  destX: number
  destY: number
  flightT: number
  hitSet: Set<Phaser.GameObjects.Image>
}

/** 全部接住后才开始计冷却 */
export class BoomerangAbility implements AbilityRuntime {
  private flyers: Flyer[]
  private cooldown: number
  private aim = 0
  private damage = 0

  constructor(
    private def: BoomerangDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    const makeFlyer = (visible: boolean): Flyer => ({
      image: emojiImage(ctx.scene, 0, 0, def.held.emoji, def.held.size, ctx.ownerOutline)
        .setDepth(13)
        .setVisible(visible),
      phase: 'idle',
      launchX: 0,
      launchY: 0,
      destX: 0,
      destY: 0,
      flightT: 0,
      hitSet: new Set(),
    })
    // 主镖兼作持有物视觉；双子镖只在飞行中可见
    this.flyers = def.twin ? [makeFlyer(true), makeFlyer(false)] : [makeFlyer(true)]
    this.cooldown = initialCooldownMs
  }

  private get idle(): boolean {
    return this.flyers.every((f) => f.phase === 'idle')
  }

  update(delta: number, owner: AbilityOwner): void {
    if (this.idle) {
      this.cooldown -= delta
      const main = this.flyers[0]!
      main.image.setPosition(
        owner.x + Math.cos(this.aim) * this.def.held.restOffset,
        owner.y + Math.sin(this.aim) * this.def.held.restOffset,
      )
      main.image.setRotation(this.aim + this.def.held.rotationOffsetDeg * DEG2RAD)

      if (this.cooldown > 0) return
      const aim = nearestAngle(owner, this.ctx.targets())
      if (aim === null) return
      this.aim = aim
      this.launch(owner)
      return
    }

    for (const f of this.flyers) {
      if (f.phase === 'idle') continue
      this.updateFlyer(f, delta, owner)
    }
    if (this.idle) this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()
  }

  private updateFlyer(f: Flyer, delta: number, owner: AbilityOwner): void {
    f.image.rotation += (this.def.spinDegPerSec * DEG2RAD * delta) / 1000
    if (f.phase === 'out') {
      f.flightT = Math.min(1, f.flightT + delta / this.def.outMs)
      const ease = Math.sin((f.flightT * Math.PI) / 2)
      f.image.setPosition(
        f.launchX + (f.destX - f.launchX) * ease,
        f.launchY + (f.destY - f.launchY) * ease,
      )
      if (f.flightT >= 1) {
        f.phase = 'back'
        f.hitSet.clear()
      }
    } else {
      const dx = owner.x - f.image.x
      const dy = owner.y - f.image.y
      const dist = Math.hypot(dx, dy)
      const step = (this.def.returnSpeed * delta) / 1000
      if (dist <= Math.max(step, 20)) {
        f.phase = 'idle'
        f.hitSet.clear()
        if (f !== this.flyers[0]) f.image.setVisible(false)
        return
      }
      f.image.setPosition(f.image.x + (dx / dist) * step, f.image.y + (dy / dist) * step)
    }

    if (this.def.coinMagnetRadius) {
      this.ctx.attractCoins?.(f.image.x, f.image.y, this.def.coinMagnetRadius)
    }
    for (const t of this.ctx.targets()) {
      if (f.hitSet.has(t.ref)) continue
      const dx = t.x - f.image.x
      const dy = t.y - f.image.y
      const rr = this.def.hitRadius + t.radius
      if (dx * dx + dy * dy <= rr * rr) {
        f.hitSet.add(t.ref)
        this.ctx.damageTarget(t.ref, this.damage, this.def.knockback, f.image.x, f.image.y)
      }
    }
  }

  private launch(owner: AbilityOwner): void {
    this.ctx.sfx('whoosh')
    this.damage = Math.round(this.def.damage * this.ctx.damageMul())
    this.flyers.forEach((f, i) => {
      const angle = this.aim + i * Math.PI
      f.phase = 'out'
      f.flightT = 0
      f.hitSet.clear()
      f.launchX = owner.x
      f.launchY = owner.y
      f.destX = owner.x + Math.cos(angle) * this.def.range
      f.destY = owner.y + Math.sin(angle) * this.def.range
      f.image.setVisible(true).setPosition(owner.x, owner.y)
    })
  }

  setVisible(on: boolean): void {
    this.flyers.forEach((f, i) => {
      f.image.setVisible(on && (i === 0 || f.phase !== 'idle'))
      if (!on) {
        f.phase = 'idle'
        f.hitSet.clear()
      }
    })
    if (!on) this.cooldown = this.def.cooldownMs
  }

  destroy(): void {
    for (const f of this.flyers) f.image.destroy()
  }
}

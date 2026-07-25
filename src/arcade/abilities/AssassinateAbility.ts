import { DEG2RAD } from '../../util/units'
import type Phaser from 'phaser'
import type { AssassinateDef } from '../../data/abilityDefs'
import { applyEffects } from './effects'
import { circleCue, slashCue } from '../../war/cues'
import { strongestTarget } from './targeting'
import { emojiImage } from '../../emoji/textures'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 瞬袭型：冷却好时瞬移到索敌范围内血量最高的敌人背后重斩，短暂停留
 * （期间本体无敌）后闪回原位。位移走 visualOffset（与队伍布局叠加，物理体
 * 随视觉走）。能力：onHit 斩击目标命中效果（连环刃等）；execute 低血目标伤害翻倍 */
export class AssassinateAbility implements AbilityRuntime {
  private image?: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  /** 突袭剩余时长；>0 表示正处于背刺停留帧 */
  private strikeLeft = 0
  private offset = { x: 0, y: 0 }

  constructor(
    private def: AssassinateDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    if (def.held) {
      this.image = emojiImage(ctx.scene, 0, 0, def.held.emoji, def.held.size, ctx.ownerOutline).setDepth(13)
    }
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    if (this.image && this.def.held) {
      const dist = this.def.held.restOffset
      this.image.setPosition(owner.x + Math.cos(this.aim) * dist, owner.y + Math.sin(this.aim) * dist)
      this.image.setRotation(this.aim + this.def.held.rotationOffsetDeg * DEG2RAD)
    }

    if (this.strikeLeft > 0) {
      this.strikeLeft -= delta
      if (this.strikeLeft <= 0) {
        // 闪回原位
        this.offset = { x: 0, y: 0 }
        owner.setVisualOffset(0, 0)
        this.flash(owner.x, owner.y)
      } else {
        owner.setVisualOffset(this.offset.x, this.offset.y)
      }
      return
    }

    if (this.cooldown > 0) return
    // 索敌：范围内血量最高者（精英/厚血怪优先挨刀）
    const target = strongestTarget(owner.x, owner.y, this.ctx.targets(), this.def.range, (ref) =>
      this.ctx.targetHp(ref),
    )
    if (!target) return
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()

    // 落点：目标背面（沿本体→目标方向再往前越过目标）
    const dx = target.x - owner.x
    const dy = target.y - owner.y
    const d = Math.hypot(dx, dy) || 1
    const landX = target.x + (dx / d) * (target.radius + this.def.behindDist)
    const landY = target.y + (dy / d) * (target.radius + this.def.behindDist)
    this.aim = Math.atan2(target.y - landY, target.x - landX)
    this.flash(owner.x, owner.y)
    this.offset = { x: landX - owner.x + this.offset.x, y: landY - owner.y + this.offset.y }
    owner.setVisualOffset(this.offset.x, this.offset.y)
    this.strikeLeft = this.def.strikeMs
    this.ctx.grantOwnerInvuln?.(this.def.strikeMs + 200)
    this.ctx.sfx('whoosh')
    this.flash(landX, landY)

    // 斩击：主目标全额，处决判定按血量比例；连环刃波及周围小圈
    let damage = Math.round(this.def.damage * this.ctx.damageMul())
    const exec = this.def.execute
    if (exec) {
      const hp = this.ctx.targetHp(target.ref)
      const maxHp = this.ctx.targetMaxHp(target.ref)
      if (maxHp > 0 && hp / maxHp <= exec.hpRatio) damage = Math.round(damage * exec.mul)
    }
    this.ctx.damageTarget(target.ref, damage, this.def.knockback, landX, landY)
    if (this.def.onHit) {
      applyEffects(this.ctx, this.def.onHit, {
        center: { x: target.x, y: target.y },
        baseDamage: damage,
        targets: [target.ref],
        exclude: new Set([target.ref]),
      })
    }
    slashCue(this.ctx.scene, target.x, target.y, this.aim, 34)
  }

  /** 瞬移端点的残影闪光 */
  private flash(x: number, y: number): void {
    circleCue(this.ctx.scene, x, y, 26, {
      fill: 0xb388ff,
      fillAlpha: 0.4,
      fromScale: 1,
      toScale: 1.8,
      durationMs: 240,
      depth: 14,
    })
  }

  setVisible(on: boolean): void {
    this.image?.setVisible(on)
    if (!on && this.strikeLeft > 0) this.strikeLeft = 1
  }

  destroy(): void {
    this.image?.destroy()
  }
}

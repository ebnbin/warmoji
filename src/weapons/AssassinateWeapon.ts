import type Phaser from 'phaser'
import { circleHitIndices } from '../core/weapons'
import type { AssassinateSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import type { EnemyTarget, WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 瞬袭型：冷却好时瞬移到索敌范围内血量最高的敌人背后重斩，短暂停留
 * （期间本体无敌）后闪回原位。位移走 visualOffset（与队伍布局叠加，物理体
 * 随视觉走）。能力：cleave 斩击波及目标周围小圈；execute 低血目标伤害翻倍 */
export class AssassinateWeapon implements WeaponRuntime {
  private image?: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  /** 突袭剩余时长；>0 表示正处于背刺停留帧 */
  private strikeLeft = 0
  private offset = { x: 0, y: 0 }

  constructor(
    private spec: AssassinateSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    if (spec.held) {
      this.image = emojiImage(ctx.scene, 0, 0, spec.held.emoji, spec.held.size, 'player').setDepth(13)
    }
    this.cooldown = initialCooldownMs
  }

  /** 索敌：范围内血量最高者（精英/厚血怪优先挨刀） */
  private pickTarget(owner: WeaponOwner): EnemyTarget | null {
    const r2 = this.spec.range * this.spec.range
    let best: EnemyTarget | null = null
    let bestHp = -1
    for (const t of this.ctx.enemyTargets()) {
      const dx = t.x - owner.x
      const dy = t.y - owner.y
      if (dx * dx + dy * dy > r2) continue
      const hp = (t.ref.getData('hp') as number) || 0
      if (hp > bestHp) {
        bestHp = hp
        best = t
      }
    }
    return best
  }

  update(delta: number, owner: WeaponOwner): void {
    this.cooldown -= delta
    if (this.image && this.spec.held) {
      const dist = this.spec.held.restOffset
      this.image.setPosition(owner.x + Math.cos(this.aim) * dist, owner.y + Math.sin(this.aim) * dist)
      this.image.setRotation(this.aim + this.spec.held.rotationOffsetRad)
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
    const target = this.pickTarget(owner)
    if (!target) return
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    // 落点：目标背面（沿本体→目标方向再往前越过目标）
    const dx = target.x - owner.x
    const dy = target.y - owner.y
    const d = Math.hypot(dx, dy) || 1
    const landX = target.x + (dx / d) * (target.radius + this.spec.behindDist)
    const landY = target.y + (dy / d) * (target.radius + this.spec.behindDist)
    this.aim = Math.atan2(target.y - landY, target.x - landX)
    this.flash(owner.x, owner.y)
    this.offset = { x: landX - owner.x + this.offset.x, y: landY - owner.y + this.offset.y }
    owner.setVisualOffset(this.offset.x, this.offset.y)
    this.strikeLeft = this.spec.strikeMs
    this.ctx.grantMemberInvuln(this.spec.strikeMs + 200)
    this.ctx.sfx('whoosh')
    this.flash(landX, landY)

    // 斩击：主目标全额，处决判定按血量比例；连环刃波及周围小圈
    let damage = Math.round(this.spec.damage * this.ctx.damageMul())
    const exec = this.spec.execute
    if (exec) {
      const hp = (target.ref.getData('hp') as number) || 0
      const maxHp = (target.ref.getData('maxHp') as number) || hp
      if (maxHp > 0 && hp / maxHp <= exec.hpRatio) damage = Math.round(damage * exec.mul)
    }
    this.ctx.damageEnemy(target.ref, damage, this.spec.knockback, landX, landY)
    const cleave = this.spec.cleave
    if (cleave) {
      const targets = this.ctx.enemyTargets()
      const splash = Math.max(1, Math.round(damage * cleave.ratio))
      for (const i of circleHitIndices({ x: target.x, y: target.y }, cleave.radius, targets)) {
        const t = targets[i]!
        if (t.ref === target.ref) continue
        this.ctx.damageEnemy(t.ref, splash, this.spec.knockback * 0.6, target.x, target.y)
      }
    }
    this.slash(target.x, target.y)
  }

  /** 瞬移端点的残影闪光 */
  private flash(x: number, y: number): void {
    const c = this.ctx.scene.add.circle(x, y, 26, 0xb388ff, 0.4).setDepth(14)
    this.ctx.scene.tweens.add({
      targets: c,
      scale: 1.8,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => c.destroy(),
    })
  }

  /** 斩击弧光 */
  private slash(x: number, y: number): void {
    const g = this.ctx.scene.add.graphics().setDepth(14)
    g.lineStyle(5, 0xffffff, 0.9)
    g.beginPath()
    g.arc(x, y, 34, this.aim - 1.1, this.aim + 1.1)
    g.strokePath()
    this.ctx.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 220,
      onComplete: () => g.destroy(),
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

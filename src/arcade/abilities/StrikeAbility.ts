import { emojiImage } from '../../emoji/textures'
import type { StrikeDef } from '../../types/abilityDefs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 镜像坐标按最近镜像计距并去重 */
export class StrikeAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: StrikeDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    if (this.cooldown > 0) return
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()
    this.castNow(owner)
  }

  castNow(owner: AbilityOwner): void {
    const seen = new Set<unknown>()
    const nearest = this.ctx
      .targets()
      .map((t) => {
        const dx = t.x - owner.x
        const dy = t.y - owner.y
        return { t, d2: dx * dx + dy * dy }
      })
      .sort((a, b) => a.d2 - b.d2)
      .filter(({ t }) => !seen.has(t.ref) && seen.add(t.ref))
      .slice(0, this.def.targets)
    nearest.forEach(({ t }, i) => {
      const drop = this.def.drop
      const img = emojiImage(this.ctx.scene, t.x, t.y - drop.fromAbove, drop.emoji, drop.size, this.ctx.ownerOutline)
        .setDepth(30)
        .setAlpha(0)
      this.ctx.scene.tweens.add({
        targets: img,
        y: t.y,
        alpha: 1,
        duration: drop.dropMs,
        delay: i * drop.staggerMs,
        ease: 'Quad.easeIn',
        onComplete: () => {
          img.destroy()
          if (!t.ref.active) return
          if (this.def.coinsPerHit) this.ctx.spawnCoins?.(t.x, t.y, this.def.coinsPerHit)
          const damage = Math.max(1, Math.round(this.def.damage * this.ctx.damageMul()))
          this.ctx.damageTarget(t.ref, damage, this.def.knockback, owner.x, owner.y)
        },
      })
    })
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}

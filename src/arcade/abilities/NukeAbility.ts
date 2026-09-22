import type { NukeDef } from '../../types/abilityDefs'
import { screenFlashCue } from '../cues'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 镜像坐标按真身去重；休眠者不在快照内，天然豁免 */
export class NukeAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: NukeDef,
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

  castNow(_owner: AbilityOwner): void {
    void _owner
    screenFlashCue(this.ctx.scene, 0xffffff, 0.55, 380)
    this.ctx.sfx('boom')
    const scale = this.ctx.waveScale?.() ?? 1
    const mul = this.ctx.damageMul()
    const seen = new Set<unknown>()
    // 边遍历边击杀，须先复制快照
    for (const t of [...this.ctx.targets()]) {
      if (seen.has(t.ref) || !t.ref.active) continue
      seen.add(t.ref)
      const boss = this.ctx.isBossTarget?.(t.ref) ?? false
      const damage = Math.max(1, Math.round(this.def.damage * scale * mul * (boss ? this.def.bossRatio : 1)))
      this.ctx.damageTarget(t.ref, damage)
    }
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}

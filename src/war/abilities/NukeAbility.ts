import type { NukeDef } from '../../data/abilityDefs'
import { screenFlashCue } from './cues'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 全域打击型：全场活跃目标各吃一次大额伤害 + 全屏白闪。伤害随当前波次
 * 威胁倍率缩放（ctx.waveScale，与敌人血量成长同步），Boss 按比例折减；
 * 镜像坐标按真身去重，休眠者不在目标快照内天然豁免 */
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
    // 伤害会边遍历边击杀，先复制快照
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

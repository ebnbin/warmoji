

import type { AbilityDef } from '../types/abilityDefs'

// 能力 = 独立于角色的攻击行为单元；held 缺省时行为主体是角色本体。
// 新增能力类型：在此加 kind 与 Def，src/abilities/ 加对应运行时类并注册 create.ts。

// ── 命中效果层（可组合，阵营中立；求值见 abilities/effects.ts）─────────
// 「投送方式」（突刺/弹道/连锁…）与「命中后做什么」正交：后者收拢为一组
// onHit 效果，任意投送都能挂同一套。新增效果类型：在此加 kind 与接口、
// 扩 Effect 联合，并在 effects.ts 的 applyEffects 里加分支、gen-defs 加校验。

// ── 单发型能力（castNow）：队长主动技能的效果载荷，也可作角色自动能力 ──

/** 该武器是否穿墙攻击（残垣图：索敌不被断壁遮挡）。缺省即不穿墙 */
export function abilityPiercesWalls(def: AbilityDef): boolean {
  return 'piercesWalls' in def && def.piercesWalls === true
}

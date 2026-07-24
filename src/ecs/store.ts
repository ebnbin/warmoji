import { MAX_ENTITIES } from './world'
import type { EnemyDef } from '../enemies/registry'

// 富数据伴随存储(按 eid 索引):bitECS 组件只存数值,def 引用等复杂对象放这里。
// spawn 时写、removeEntity 前不必清(下次 spawn 覆盖;eid 复用后新 def 覆盖旧)。

/** 敌人的 px 化 def(emoji/尺寸/速度/locomotion/abilities/死亡效果…) */
export const enemyDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(MAX_ENTITIES)

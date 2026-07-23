import type { MapId } from '../maps/registry'

// 战场拾取（第三支柱：绑定地图，短时·战术·走位）：金币→队员(永久)，
// 经验→团队(永久)，战场拾取→战场(短时/位置/可趋可避)。每张地图有固定池，
// 主题呼应本图世界规则。携带者敌人带极性光环（绿=增益/红=减益），死亡掉在地面，
// 队伍走位拾取（不磁吸）；增益去趋、减益去避。拾取即施加一层与 teamFx 并行相乘的
// 限时战斗层（battleFx），几秒后自动失效。数量按波次预算固定（非概率）。

export type Polarity = 'buff' | 'debuff'

/** 限时战斗层：与 teamFx 并行相乘的短时增/减益（拾取施加，逐个到期）。 */
export interface BattleEffects {
  /** 队伍移速倍率（乘） */
  moveSpeedMul: number
  /** 全队伤害倍率（乘） */
  teamDamageMul: number
  /** 全队冷却倍率（乘，<1 攻速更快） */
  teamCooldownMul: number
  /** 全队暴击率加成（加，与角色/团队暴击相加后封顶 0.5） */
  critAdd: number
  /** 全体敌人移速倍率（乘，<1 更慢；>1 敌人狂化更快） */
  enemySlowMul: number
}

export const BATTLE_FX_IDENTITY: BattleEffects = {
  moveSpeedMul: 1,
  teamDamageMul: 1,
  teamCooldownMul: 1,
  critAdd: 0,
  enemySlowMul: 1,
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** 叠加多个限时片段：乘区相乘、crit 相加，最终封顶/保底防叠飞。 */
export function foldBattleEffects(parts: readonly Partial<BattleEffects>[]): BattleEffects {
  const fx = { ...BATTLE_FX_IDENTITY }
  for (const p of parts) {
    if (p.moveSpeedMul !== undefined) fx.moveSpeedMul *= p.moveSpeedMul
    if (p.teamDamageMul !== undefined) fx.teamDamageMul *= p.teamDamageMul
    if (p.teamCooldownMul !== undefined) fx.teamCooldownMul *= p.teamCooldownMul
    if (p.critAdd !== undefined) fx.critAdd += p.critAdd
    if (p.enemySlowMul !== undefined) fx.enemySlowMul *= p.enemySlowMul
  }
  fx.moveSpeedMul = clamp(fx.moveSpeedMul, 0.35, 2.2)
  fx.teamDamageMul = clamp(fx.teamDamageMul, 0.35, 2.5)
  fx.teamCooldownMul = clamp(fx.teamCooldownMul, 0.4, 2.2)
  fx.critAdd = clamp(fx.critAdd, 0, 0.5)
  fx.enemySlowMul = clamp(fx.enemySlowMul, 0.4, 2.2)
  return fx
}

export interface FieldPickupDef {
  readonly id: string
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly polarity: Polarity
  /** 拾取后效果的持续时长（毫秒）——短时，制造趋避的节奏 */
  readonly durationMs: number
  readonly fx: Partial<BattleEffects>
}

// 四图各自的拾取池（主题呼应本图世界规则），每图至少 1 增益 + 1 减益。
const POOLS: Record<MapId, readonly FieldPickupDef[]> = {
  // 黑森林：林兽/植被
  forest: [
    { id: 'forest_hunt', emoji: '1f43a', name: '狩猎本能', desc: '全队伤害 +35%（8 秒）', polarity: 'buff', durationMs: 8000, fx: { teamDamageMul: 1.35 } },
    { id: 'forest_swift', emoji: '1f342', name: '林间疾风', desc: '队伍移速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { moveSpeedMul: 1.3 } },
    { id: 'forest_vines', emoji: '1f33f', name: '藤蔓缠足', desc: '队伍移速 -30%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.7 } },
    { id: 'forest_spore', emoji: '1f344', name: '孢子狂化', desc: '敌人移速 +30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { enemySlowMul: 1.3 } },
  ],
  // 荒漠：烈日/疾风/流沙
  desert: [
    { id: 'desert_gale', emoji: '1f32c', name: '疾风助战', desc: '全队攻速 +33%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { teamCooldownMul: 0.75 } },
    { id: 'desert_mirage', emoji: '2728', name: '海市蜃楼', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { critAdd: 0.18 } },
    { id: 'desert_sand', emoji: '1f3dc', name: '流沙陷步', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.72 } },
    { id: 'desert_storm', emoji: '1f32a', name: '沙暴蔽日', desc: '全队伤害 -22%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { teamDamageMul: 0.78 } },
  ],
  // 奔流：顺流/活水/逆流/漩涡
  river: [
    { id: 'river_flow', emoji: '1f30a', name: '顺流而行', desc: '队伍移速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { moveSpeedMul: 1.3 } },
    { id: 'river_spring', emoji: '1f4a7', name: '活水灌注', desc: '全队攻速 +28%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { teamCooldownMul: 0.78 } },
    { id: 'river_under', emoji: '1f531', name: '逆流阻滞', desc: '队伍移速 -30%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.7 } },
    { id: 'river_whirl', emoji: '1fae7', name: '漩涡搅扰', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { teamCooldownMul: 1.3 } },
  ],
  // 工厂：齿轮咬滞/涡轮增压/精密校准（增益），传动卡壳/油污黏脚（减益）——呼应「自动化车间」主题
  void: [
    { id: 'factory_grind', emoji: '2699', name: '齿轮咬滞', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemySlowMul: 0.65 } },
    { id: 'factory_turbo', emoji: '26a1', name: '涡轮增压', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { teamDamageMul: 1.35 } },
    { id: 'factory_calibrate', emoji: '1f527', name: '精密校准', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { critAdd: 0.18 } },
    { id: 'factory_jam', emoji: '1f529', name: '传动卡壳', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { teamCooldownMul: 1.3 } },
    { id: 'factory_oil', emoji: '1f6e2', name: '油污黏脚', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.72 } },
  ],
  // 残垣：伏击/夯墙/尘幕（增益），碎砾/塌方（减益）——呼应「废墟掩体」主题
  ruins: [
    { id: 'ruins_ambush', emoji: '1f3f9', name: '断壁伏击', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { critAdd: 0.18 } },
    { id: 'ruins_rampart', emoji: '1f9f1', name: '残垣回响', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { teamDamageMul: 1.35 } },
    { id: 'ruins_dust', emoji: '1f32b', name: '尘幕蔽敌', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemySlowMul: 0.65 } },
    { id: 'ruins_rubble', emoji: '1faa8', name: '碎砾绊足', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.72 } },
    { id: 'ruins_collapse', emoji: '1f4a8', name: '塌方扬尘', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { teamCooldownMul: 1.3 } },
  ],
  // 晨昏原野：破晓/烈阳/流星（增益，白昼），夜幕/晦月（减益，暗夜）——呼应昼夜轮替主题
  daynight: [
    { id: 'daynight_dawn', emoji: '1f305', name: '破晓锋芒', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { teamDamageMul: 1.35 } },
    { id: 'daynight_sun', emoji: '2600', name: '烈阳灼敌', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemySlowMul: 0.65 } },
    { id: 'daynight_meteor', emoji: '1f320', name: '流星贯注', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { critAdd: 0.18 } },
    { id: 'daynight_nightfall', emoji: '1f30c', name: '夜幕低垂', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.72 } },
    { id: 'daynight_darkmoon', emoji: '1f311', name: '晦月蚀袭', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { teamCooldownMul: 1.3 } },
  ],
  // 深空：星能/曲速/引力弹弓（增益），黑洞拖曳/失重打滑（减益）——呼应太空/天体主题
  space: [
    { id: 'space_starfuel', emoji: '1f31f', name: '星能灌注', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { teamDamageMul: 1.35 } },
    { id: 'space_warp', emoji: '1f4ab', name: '曲速跃迁', desc: '全队攻速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { teamCooldownMul: 0.77 } },
    { id: 'space_slingshot', emoji: '2604', name: '引力弹弓', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { critAdd: 0.18 } },
    { id: 'space_drag', emoji: '1f300', name: '黑洞拖曳', desc: '队伍移速 -30%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.7 } },
    { id: 'space_weightless', emoji: '1fa90', name: '失重打滑', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { teamCooldownMul: 1.3 } },
  ],
}

/** 全部拾取按 id 索引（携带者掉落/注入器按 id 反查） */
export const FIELD_PICKUPS: Record<string, FieldPickupDef> = Object.fromEntries(
  Object.values(POOLS)
    .flat()
    .map((d) => [d.id, d]),
)

export const FIELD_PICKUP_IDS = Object.keys(FIELD_PICKUPS)

/** 本图拾取池 */
export function fieldPickupsFor(mapId: MapId): readonly FieldPickupDef[] {
  return POOLS[mapId]
}

/** 本波携带者预算（固定数量，非概率）：随波次上探，Boss 波偏减益施压 */
export function waveCarrierBudget(wave: number, isBoss: boolean): { buff: number; debuff: number } {
  if (isBoss) return { buff: 1, debuff: 2 }
  if (wave <= 3) return { buff: 2, debuff: 1 }
  if (wave <= 8) return { buff: 2, debuff: 2 }
  return { buff: 3, debuff: 3 }
}

function pickPolarity(
  pool: readonly FieldPickupDef[],
  polarity: Polarity,
  rand: () => number,
): FieldPickupDef | undefined {
  const sub = pool.filter((d) => d.polarity === polarity)
  if (sub.length === 0) return undefined
  return sub[Math.floor(rand() * sub.length) % sub.length]
}

/** 本波所有携带者背的拾取（buff/debuff 数由预算表定，从本图池随机抽，可重复） */
export function rollWaveCarriers(
  mapId: MapId,
  wave: number,
  isBoss: boolean,
  rand: () => number,
): FieldPickupDef[] {
  const budget = waveCarrierBudget(wave, isBoss)
  const pool = POOLS[mapId]
  const out: FieldPickupDef[] = []
  for (let i = 0; i < budget.buff; i++) {
    const d = pickPolarity(pool, 'buff', rand)
    if (d) out.push(d)
  }
  for (let i = 0; i < budget.debuff; i++) {
    const d = pickPolarity(pool, 'debuff', rand)
    if (d) out.push(d)
  }
  return out
}

// 拾取管线旋钮（格值，进战斗乘 UNIT）
export const FIELD = {
  /** 拾取半径：队伍中心进入即收（不磁吸，需主动走位） */
  grabRadiusU: 0.9,
  /** 地面停留时长：无人拾取则淡出 */
  groundMs: 9000,
  /** 携带者光环半径 */
  auraRadiusU: 0.85,
} as const

export const POLARITY_COLOR: Record<Polarity, number> = {
  buff: 0x66bb6a,
  debuff: 0xef5350,
}

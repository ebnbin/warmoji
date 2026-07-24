import type { BattlefieldTuning } from '../src/battlefield/registry'

// 战场拾取（创作层·游戏内容 + 手感旋钮）：绑定地图的短时·战术·走位拾取。
// 携带者敌人带极性光环（绿=增益/红=减益），死亡掉在地面，队伍走位拾取（不磁吸），
// 拾取即施加一层与 teamFx 并行相乘的限时战斗层（battleFx），几秒后自动失效。
// 抽取/预算/叠加逻辑在 src/battlefield/registry.ts，这里只放各图池数据 + 旋钮——经 gen 校验产出 battlefield.json。
export const BATTLEFIELD = {
  // 每图各自的拾取池（主题呼应本图世界规则），每图至少 1 增益 + 1 减益。
  pools: {
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
    // 浮冰：疾滑/冰棱/寒霜（增益），薄冰失足/霜冻僵手（减益）——呼应打滑与寒水主题
    ice: [
      { id: 'ice_glide', emoji: '26f8', name: '疾滑突进', desc: '队伍移速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { moveSpeedMul: 1.3 } },
      { id: 'ice_shard', emoji: '2744', name: '冰棱贯穿', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { teamDamageMul: 1.35 } },
      { id: 'ice_frost', emoji: '1f9ca', name: '寒霜锁敌', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemySlowMul: 0.65 } },
      { id: 'ice_thin', emoji: '1f4a6', name: '薄冰失足', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { moveSpeedMul: 0.72 } },
      { id: 'ice_numb', emoji: '1f976', name: '霜冻僵手', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { teamCooldownMul: 1.3 } },
    ],
  },
  // 拾取管线旋钮（格值，进战斗乘 UNIT）：拾取半径 / 地面停留 / 携带者光环半径。
  field: { grabRadiusU: 0.9, groundMs: 9000, auraRadiusU: 0.85 },
  // 本波携带者预算（固定数量，非概率）：Boss 波偏减益施压；常规波按波次分档，超档兜底。
  carrierBudget: {
    boss: { buff: 1, debuff: 2 },
    waveTiers: [
      { upToWave: 3, buff: 2, debuff: 1 },
      { upToWave: 8, buff: 2, debuff: 2 },
    ],
    fallback: { buff: 3, debuff: 3 },
  },
} as const satisfies BattlefieldTuning

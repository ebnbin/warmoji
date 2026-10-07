import type { BattlefieldTuning } from '../src/types/battlefield'

const DESERT_EVENTS = [
  { id: 'desert_gale', emoji: '1f32c', name: '疾风助战', desc: '全队攻速 +33%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { team: { mul: { cooldown: 0.75 } } } },
  { id: 'desert_mirage', emoji: '2728', name: '海市蜃楼', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
  { id: 'desert_sand', emoji: '1f3dc', name: '流沙陷步', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
  { id: 'desert_storm', emoji: '1f32a', name: '沙暴蔽日', desc: '全队伤害 -22%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { damage: 0.78 } } } },
] as const

const RIVER_EVENTS = [
  { id: 'river_flow', emoji: '1f6f6', name: '顺流而行', desc: '队伍移速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { team: { mul: { moveSpeed: 1.3 } } } },
  { id: 'river_spring', emoji: '1f4a7', name: '活水灌注', desc: '全队攻速 +28%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { team: { mul: { cooldown: 0.78 } } } },
  { id: 'river_under', emoji: '1f531', name: '逆流阻滞', desc: '队伍移速 -30%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.7 } } } },
  { id: 'river_whirl', emoji: '1f300', name: '漩涡搅扰', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
] as const

const RUINS_EVENTS = [
  { id: 'ruins_ambush', emoji: '1f3f9', name: '断壁伏击', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
  { id: 'ruins_rampart', emoji: '1f9f1', name: '残垣回响', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
  { id: 'ruins_dust', emoji: '1f32b', name: '尘幕蔽敌', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
  { id: 'ruins_rubble', emoji: '1faa8', name: '碎砾绊足', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
  { id: 'ruins_collapse', emoji: '1f4a8', name: '塌方扬尘', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
] as const

export const BATTLEFIELD = {
  pools: {
    exit: [
      { id: 'exit_sync', emoji: '1f6f0', name: '跃迁同步', desc: '全队攻速 +33%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { team: { mul: { cooldown: 0.75 } } } },
      { id: 'exit_lock', emoji: '1f3af', name: '坐标锁定', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
      { id: 'exit_stasis', emoji: '1f9ca', name: '相位凝滞', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'exit_drift', emoji: '1f4ab', name: '跃迁眩晕', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
      { id: 'exit_lag', emoji: '1f50c', name: '能量回流', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
    ],
    petri: [
      { id: 'petri_nutrient', emoji: '1f9eb', name: '营养充足', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'petri_penicillin', emoji: '1f48a', name: '青霉素', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
      { id: 'petri_chill', emoji: '1f9ca', name: '冷藏抑菌', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'petri_biofilm', emoji: '1f9a0', name: '菌膜缠身', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
      { id: 'petri_incubator', emoji: '1f321', name: '培养箱闷热', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
    ],
    meadow: [
      { id: 'meadow_breeze', emoji: '1f32c', name: '山风送爽', desc: '队伍移速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { team: { mul: { moveSpeed: 1.3 } } } },
      { id: 'meadow_bloom', emoji: '1f33c', name: '花香提神', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'meadow_sun', emoji: '2600', name: '晴空万里', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
      { id: 'meadow_pollen', emoji: '1f927', name: '花粉过敏', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
      { id: 'meadow_dew', emoji: '1f4a7', name: '露水沾鞋', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
    ],
    desert: DESERT_EVENTS,
    sakura: RIVER_EVENTS,
    ruins: RUINS_EVENTS,
    volcano: [
      { id: 'volcano_forge', emoji: '1f525', name: '熔炉淬火', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'volcano_obsidian', emoji: '1faa8', name: '黑曜护体', desc: '全队护甲 +4（8 秒）', polarity: 'buff', durationMs: 8000, fx: { team: { add: { armor: 4 } } } },
      { id: 'volcano_ash', emoji: '1f32b', name: '火山灰', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'volcano_heat', emoji: '1f975', name: '热浪灼身', desc: '队伍移速 -30%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.7 } } } },
      { id: 'volcano_sulfur', emoji: '2668', name: '硫磺毒雾', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
    ],
    floe: [
      { id: 'floe_glide', emoji: '26f8', name: '疾滑突进', desc: '队伍移速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { team: { mul: { moveSpeed: 1.3 } } } },
      { id: 'floe_shard', emoji: '2744', name: '冰棱贯穿', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'floe_frost', emoji: '1f9ca', name: '寒霜锁敌', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'floe_thin', emoji: '1f4a6', name: '薄冰失足', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
      { id: 'floe_numb', emoji: '1f976', name: '霜冻僵手', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
    ],
    nebula: [
      { id: 'nebula_flare', emoji: '1f31f', name: '吸积闪耀', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'nebula_lensing', emoji: '1f52d', name: '引力透镜', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
      { id: 'nebula_tide', emoji: '1f300', name: '潮汐撕扯', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'nebula_dust', emoji: '1f32b', name: '星尘拖曳', desc: '队伍移速 -30%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.7 } } } },
      { id: 'nebula_redshift', emoji: '1f534', name: '红移', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
    ],
    deep: [
      { id: 'deep_song', emoji: '1f40b', name: '鲸歌回荡', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'deep_glow', emoji: '1fabc', name: '冷光指路', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
      { id: 'deep_school', emoji: '1f41f', name: '鱼群搅局', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'deep_current', emoji: '1f30a', name: '暗流拖拽', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
      { id: 'deep_pressure', emoji: '1fae7', name: '水压压身', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
    ],
    amethyst: [
      { id: 'amethyst_prism', emoji: '1f48e', name: '晶光折射', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'amethyst_glint', emoji: '2728', name: '流光指路', desc: '暴击率 +18%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { add: { crit: 0.18 } } } },
      { id: 'amethyst_glare', emoji: '1f4ab', name: '晶芒刺目', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'amethyst_shards', emoji: '1faa8', name: '碎晶扎脚', desc: '队伍移速 -30%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.7 } } } },
      { id: 'amethyst_chill', emoji: '1f976', name: '晶洞寒气', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
    ],
    theater: [
      { id: 'theater_wand', emoji: '1fa84', name: '仙女棒', desc: '全队伤害 +35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { team: { mul: { damage: 1.35 } } } },
      { id: 'theater_slipper', emoji: '1f460', name: '水晶鞋', desc: '队伍移速 +30%（6 秒）', polarity: 'buff', durationMs: 6000, fx: { team: { mul: { moveSpeed: 1.3 } } } },
      { id: 'theater_spindle', emoji: '1f4a4', name: '沉睡咒', desc: '敌人移速 -35%（7 秒）', polarity: 'buff', durationMs: 7000, fx: { enemy: { mul: { moveSpeed: 0.65 } } } },
      { id: 'theater_apple', emoji: '1f34e', name: '毒苹果', desc: '全队攻速 -30%（6 秒）', polarity: 'debuff', durationMs: 6000, fx: { team: { mul: { cooldown: 1.3 } } } },
      { id: 'theater_midnight', emoji: '1f55b', name: '午夜钟声', desc: '队伍移速 -28%（5 秒）', polarity: 'debuff', durationMs: 5000, fx: { team: { mul: { moveSpeed: 0.72 } } } },
    ],
  },
  field: { grabRadiusU: 0.9, groundMs: 9000, auraRadiusU: 0.85 },
} as const satisfies BattlefieldTuning

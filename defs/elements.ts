import type { ElementRules } from '../legacy/types/elements'

/**
 * 元素：每种只做一件别的元素做不了的事，不带元素的一下就是物理；没有克制倍率。
 * 身体本身是哪种元素就免疫哪种：火点不着、冰冻不住、雷不受传导、水一直是湿的、毒不会中毒
 */
export const ELEMENTS = {
  list: {
    fire: { name: '火', icon: '1f525', color: 0xff7043, desc: '点燃：烧着的每隔一阵掉血，还会烧到贴着的同伴；水与冰浇得灭', body: '本身点不着，不怕岩浆', aura: 'flame', fall: { burst: 'sparks', tint: 0x5d4037 } },
    ice: { name: '冰', icon: '2744', color: 0x80deea, desc: '寒冷：越打越慢，叠满就冻住；冻住的挨一下物理就碎', body: '本身冻不住，不怕冰水', aura: 'frost', fall: { burst: 'snow', tint: 0xb3e5fc } },
    thunder: { name: '雷', icon: '1f329', color: 0xffd54f, desc: '打断挨打的出手，电流再跳到身边的另一个；湿的连成一片一起挨', body: '本身不受传导', aura: 'zap', fall: { burst: 'glow', tint: 0xfff59d } },
    water: { name: '水', icon: '1f4a7', color: 0x42a5f5, desc: '浇湿：灭火、点不着；湿的一冰就冻、一电一片', body: '本身一直是湿的，会游泳', aura: 'drip', fall: { burst: 'splash', tint: 0x90caf9 } },
    poison: { name: '毒', icon: '1f9ea', color: 0x9ccc65, desc: '中毒：一层层叠上去掉血，中了毒什么回复都不管用', body: '本身不会中毒', aura: 'toxic', fall: { burst: 'bubbles', tint: 0x7cb342 } },
  },
  burn: { ratio: 0.15, tickMs: 500, durationMs: 3000, spread: 0.4 },
  chill: { stacks: 3, ms: 3000, slow: 0.75, frozenMs: 1500 },
  shock: { radius: 2.5, ratio: 0.5 },
  wet: { ms: 5000 },
  poison: { ratio: 0.1, tickMs: 1000, durationMs: 5000, stacks: 5 },
  reactions: {
    shatter: { name: '碎冰', desc: '冻住的挨一下物理：这一下伤害翻倍，冰也碎了', color: 0xb3e5fc, burst: 'shards', ratio: 1 },
    thaw: { name: '解冻', desc: '火打在冻住或身上发冷的：冰化了、寒冷散了，这一下不点燃', color: 0xffccbc, burst: 'steam' },
    quench: { name: '熄灭', desc: '水或冰打在烧着的、火打在湿的：火灭了，湿气也蒸干了', color: 0xe0f7fa, burst: 'steam' },
    flashFreeze: { name: '急冻', desc: '冰打在湿的：当场冻住，不用叠满', color: 0x81d4fa, burst: 'snow' },
    conduct: { name: '导电', desc: '雷打在湿的：周围 3 格内湿的敌人连成一片，各吃这一下六成的伤害', color: 0xfff176, burst: 'glow', radius: 3, ratio: 0.6 },
    ignite: { name: '爆燃', desc: '火打在毒云里的：毒云炸开，云里的敌人各吃这一下一倍半的伤害', color: 0xff8a65, burst: 'sparks', ratio: 1.5 },
  },
} as const satisfies ElementRules

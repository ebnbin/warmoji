import type mapsJson from '../assets/maps.json'
import type { Palette } from '../util/palette'
import type { EnemyKind, EnemyMixRow } from './enemies'

export interface MapDecor {
  readonly emojis: readonly string[]
  readonly sizeU: readonly [number, number]
  readonly alpha: readonly [number, number]
  readonly density: readonly [number, number]
}
interface WallsConfig {
  readonly blocks: number
  readonly maxLen: number
  readonly centerClearU: number
  readonly spawnMinCellDist: number
  readonly reflowMs: number
  /** 身体撞墙时的半径上限，过道一格宽 */
  readonly bodyRadiusCapU: number
}
export interface DayNightConfig {
  readonly cycleSec: number
  readonly startHour: number
  readonly visionMax: number
  readonly visionMid: number
  readonly visionMin: number
  readonly fogRadiusDusk: number
  readonly fogRadiusMidnight: number
  readonly fogAlphaMax: number
  readonly daySpawnScale: number
  readonly nightSpawnScale: number
}
/** 地面对体力的影响：赶路每走一格扣几点体力，歇着时体力回复乘多少 */
export interface GroundStamina {
  readonly exertion: number
  readonly regen: number
}
export interface IceConfig {
  readonly floeU: number
  readonly traction: number
  readonly waterTraction: number
  readonly waterViscosity: number
  /** 水里的体力：冰面按地图的体力算 */
  readonly waterExertion: number
  readonly waterRegen: number
  readonly waterTeamDps: number
  readonly waterEnemyDps: number
  readonly waterTickMs: number
}
export interface SpaceConfig {
  readonly blackholeRadiusU: number
  readonly meteor: {
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    readonly radiusU: number
    readonly speedU: number
    readonly travelU: number
    readonly offsetU: number
    readonly damage: number
  }
}
/** 旧星云：圆心在原点的空心厚球壳，空腔里有一个黑洞，引力按普卢默软化的万有引力 g = GM·r/(r²+ε²)^{3/2} 作用于一切 */
export interface NebulaOldConfig {
  /** 壳层的引力按牛顿壳层定理：空腔里为零，壳层里只算内侧那部分质量，外缘以外如同全部质量在中心 */
  readonly shell: {
    readonly innerU: number
    readonly outerU: number
    /** 引力常数乘壳层总质量，格³/秒² */
    readonly gm: number
  }
  /** 构建期校验的余量：任何身体以 speedMul 倍的最快速度走到停下处，再往外瞬移 leapU 格，引力仍把它拉回 */
  readonly contain: {
    readonly speedMul: number
    readonly leapU: number
  }
  readonly hole: {
    /** 引力常数乘黑洞质量，格³/秒² */
    readonly gm: number
    readonly softeningU: number
    /** 视界半径：中心进了这个圈就被吞噬 */
    readonly horizonU: number
    /** 黑洞离星域中心的距离范围，方向随机 */
    readonly fromCenterU: readonly [number, number]
    /** 刷怪点与据点离黑洞至少多远 */
    readonly clearU: number
  }
  readonly meteor: {
    readonly firstMs: number
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    /** 流星本体半径：中心距小于它就被砸中 */
    readonly radiusU: number
    /** 从壳层内壁冲进空腔时的速度 */
    readonly speedU: number
    /** 瞄准点在队长两侧最多偏多远 */
    readonly offsetU: number
    /** 以 speedU 飞行时的伤害，按动能随速度的平方变化 */
    readonly damage: number
    /** 轨迹按这个步长积分，最长飞这么久 */
    readonly stepMs: number
    readonly maxFlightMs: number
  }
}
/**
 * 星云：深空里一团空心的星云，活动的平面是它的赤道面，空腔里有一个黑洞。人、怪、掉落物、子弹与流星都受黑洞与星云壳层的万有引力：
 * 身体在星云气体里按终速被拖着漂，子弹、冲刺与流星按弹道飞；中心进了视界就被吞掉，吞下的质量让黑洞长大。这里没有太阳，光来自吸积盘与流星
 */
export interface NebulaConfig {
  /**
   * 空心厚球壳：空腔半径、外缘半径与引力常数乘壳层质量（格³/秒²）。被推开的气体堆在外面，密度从内壁的 0 按进壳层深度占壳厚比例的 rise 次方往外缘涨。
   * 引力按牛顿壳层定理只算内侧的质量：空腔里为零，刚进壳层很弱、越往里越陡，外缘以外如同全部质量在球心。
   * tau 是整层壳沿半径的光深：黑洞的光照进去，光深到 1 的那一层是被照亮的电离前沿，也就是看得见的内壁
   */
  readonly shell: {
    readonly innerU: number
    readonly outerU: number
    readonly gm: number
    readonly rise: number
    readonly tau: number
  }
  /** 构建期校验的余量：任何身体以 speedMul 倍的最快速度往外走，最深只走进壳层 depthU 格；停下后再往外瞬移 leapU 格，引力仍把它拉回 */
  readonly contain: {
    readonly speedMul: number
    readonly depthU: number
    readonly leapU: number
  }
  readonly hole: {
    /** 引力常数乘黑洞的质量，格³/秒²：开局是下限，吞得再多也不超过 maxGm */
    readonly gm: number
    readonly maxGm: number
    /** 这片星域里的光速，格/秒：定出视界 r_s = 2GM/c²、透镜的偏折与光传过来要多久 */
    readonly lightU: number
    /** 黑洞离星云中心多远，方向随机；队伍从中心另一侧离中心 startU 格处出发 */
    readonly fromCenterU: readonly [number, number]
    readonly startU: number
  }
  /**
   * 吞下的东西折成多少 GM：身体按 bodyGm·质量·(半径/bodyRadiusU)³，掉落物、弹体各算一份。
   * 它们是被拖着几乎径直掉进去的，角动量远不够绕成盘，只有 lightEta 的静能化成光，其余全并进黑洞
   */
  readonly swallow: {
    readonly bodyGm: number
    readonly bodyRadiusU: number
    readonly pickupGm: number
    readonly shotGm: number
    readonly lightEta: number
  }
  /**
   * 吸积发光：平时吸周围带着湍流角动量的稀薄气体，在盘里转到最内稳定圆轨道才掉进去，放出质量的 1/16 乘 c²；邦迪吸积率随质量的平方涨，开局每秒吸 bondiGm。
   * 吞下东西放出的光按 riseMs 亮起、按黏滞时标 viscousMs 暗下去
   */
  readonly accretion: {
    readonly bondiGm: number
    readonly riseMs: number
    readonly viscousMs: number
  }
  /** 吸积盘从最内稳定圆轨道铺到 outerRs 个 r_s；innerK 是开局平时盘上最热那一圈（约 4 r_s）未计引力红移的色温，开尔文，随光度的四分之一次方涨 */
  readonly disk: {
    readonly outerRs: number
    readonly innerK: number
  }
  /**
   * 流星：壳层的湍流甩出一个团块，以 speedU 上下 speedJitter 倍冲进空腔，之后只受引力；它被吸积盘照着，像彗星一样拖着背向黑洞的尾巴。
   * 预警时团块先在内壁上亮起来；冲进对面的壳层就被冲压撕碎，掉进视界就被吞掉。伤害按动能随速度的平方变
   */
  readonly meteor: {
    readonly firstMs: number
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    readonly speedU: number
    readonly speedJitter: number
    /** 撞上身体的半径，格 */
    readonly radiusU: number
    /** 冲进壳层多深才被撕碎，格：扫过的壳层气体和团块自己一样重的地方；还没到这么深就被引力拉回来的，落回空腔接着飞 */
    readonly shatterU: number
    /** 瞄准点在队长两侧最多偏多远 */
    readonly offsetU: number
    /** 以 speedU 撞上时的伤害 */
    readonly damage: number
    readonly gm: number
    readonly maxFlightMs: number
  }
  /** 刷怪点离黑洞的余量：比这张图最慢的敌人走不出来的半径再远这么多格 */
  readonly spawnClearU: number
  /** 画面是透视相机拍的：镜头在活动的平面上方多高，格；平面以下越深的东西在画面上越小、跟着镜头移得越慢 */
  readonly cameraU: number
}
/**
 * 火山：能走的是方形地图里一块边缘不规则的盆地，四周是崖壁与高地；一座火山背靠盆地边，山体谁也上不去。
 * 火山定期从火山口喷发，熔岩往四面八方顺着地势流，盖住的地方敌我都受伤，冷却凝固成岩石后又能站人
 */
export interface VolcanoConfig {
  /** 地形格子的边长，高度与厚度也以格计；地形铺满方框 */
  readonly cellU: number
  readonly rim: {
    /** 盆地的边离方形地图的边多远：按噪声在两者之间起伏，起伏的波长 waveU；方形的角按 cornerU 的半径磨圆 */
    readonly insetU: readonly [number, number]
    readonly waveU: number
    readonly cornerU: number
    /** 窄过两倍 neckU 的缝和尖角填成岩壁 */
    readonly neckU: number
    /** 崖壁从崖脚到崖顶 cliffU 格宽、高 cliffHeight；崖顶往外的高地每格降 backSlope */
    readonly cliffU: number
    readonly cliffHeight: number
    readonly backSlope: number
  }
  readonly cone: {
    /** 火山口圆心离最近的地图边多远 */
    readonly insetU: readonly [number, number]
    readonly craterU: number
    /** 陡峭的山体：离火山口约这么远以内身体进不去，飞行物照飞；山脚的半径按方位角在 ±blockJitter 倍内起伏 */
    readonly blockU: number
    readonly blockJitter: number
    /** 口沿的高度与山脚（挡路圈边上）的高度，其间按指数往下降，山脚的缓坡铺到 radiusU 处与平地齐平 */
    readonly height: number
    readonly footHeight: number
    readonly radiusU: number
    readonly craterDepth: number
    /** 火山口里熔岩湖的液面比火山口底高多少 */
    readonly lakeDepth: number
    /** 山坡上放射状冲沟的深度 */
    readonly gullyDepth: number
  }
  /** 地势：朝地图里整体下倾的坡度，起伏的幅度与波长 */
  readonly terrain: {
    readonly tilt: number
    readonly relief: number
    readonly waveU: number
  }
  readonly eruption: {
    readonly firstMs: number
    readonly intervalMs: number
    readonly intervalJitterMs: number
    /** 喷发前的预兆：冒烟、发红、地震 */
    readonly warnMs: number
    /** 熔岩漫过口沿的流量（格³/秒）：peakMs 内涨到 rate，之后按时间常数 waneMs 衰减，effuseMs 后停 */
    readonly rate: number
    readonly peakMs: number
    readonly waneMs: number
    readonly effuseMs: number
    /** 每次喷发熔岩集中从口沿的几股漫出，股心落在朝盆地的方向两侧 lobeSpreadDeg 内，每股宽约几度；其余方向只漫出股心的 lobeFloor 倍 */
    readonly lobes: readonly [number, number]
    readonly lobeSpreadDeg: number
    readonly lobeDeg: number
    readonly lobeFloor: number
    /** 开局前已经喷过几次，地图上留下旧熔岩 */
    readonly history: number
  }
  readonly lava: {
    readonly stepMs: number
    /** 流动：每秒流走可流部分的比例，按温度的幂变慢 */
    readonly mobility: number
    readonly mobilityPow: number
    /** 屈服强度（厚度乘坡度）：最热时与将凝固时；朝某个方向流要厚过它除以那个方向的坡度 */
    readonly yieldHot: number
    readonly yieldCold: number
    /** 冷却：温度每秒降 cooling·(1+(r/coolRadiusU)²)，r 是离火山口的距离，离得越远冷得越快 */
    readonly cooling: number
    readonly coolRadiusU: number
    /** 温度低于它就凝固成岩石 */
    readonly solidus: number
    readonly teamDps: number
    readonly enemyDps: number
    readonly tickMs: number
  }
}
/** 一列涌浪：波高（米）、周期（秒）、相对船头往哪个方向传（度，0 为顺着船头、90 为从左舷推向右舷） */
export interface Swell {
  readonly heightM: number
  readonly periodS: number
  readonly towardDeg: number
}
/** 身体脚下或金币与甲板之间的库仑摩擦系数 */
export interface Friction {
  readonly static: number
  readonly kinetic: number
}
/**
 * 船：海上航行的一艘帆船，能走的是舷墙围着的甲板，舷墙与桅杆是硬边界。甲板上的人、怪、召唤物、掉落物、炮弹都有重量，
 * 船按静水力学与刚体动力学横摇、纵摇，海浪也推着它摇；甲板倾斜后重力沿甲板的分量让东西按库仑摩擦滑、炮弹按滚动摩擦滚，赶路按恒定功率上坡慢、下坡快。
 * 物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface ShipConfig {
  readonly meterPerU: number
  /** 甲板的平面形状，格：船长沿地图的长边，船头朝右（竖屏朝上） */
  readonly hull: {
    /** 甲板从船尾横板到船首柱的长、最宽处的宽 */
    readonly lengthU: number
    readonly beamU: number
    /** 船头从最宽处收到船首柱的那段占船长的比例，半宽按余弦的 bowPow 次方收拢 */
    readonly bow: number
    readonly bowPow: number
    /** 船尾从最宽处收到横板的那段占船长的比例，按指数 sternPow 的超椭圆收拢；横板的半宽占最宽处的比例，横板中间往后鼓出船宽的 transomBulge 倍 */
    readonly stern: number
    readonly sternPow: number
    readonly transom: number
    readonly transomBulge: number
    /** 舷墙的厚度；船壳外至少留多宽的海面 */
    readonly bulwarkU: number
    readonly seaU: number
    /** 窄过两倍 neckU 的尖角填掉 */
    readonly neckU: number
    /** 桅杆立在船长方向的哪里（占船长的比例，从船尾算起），半径多少格；桅杆挡路 */
    readonly masts: readonly number[]
    readonly mastU: number
  }
  /** 空船的静水力学，米：吃水、舯剖面系数（横剖面面积占宽乘吃水的比例）、重心高、型深；海水密度，千克/米³ */
  readonly hydro: {
    readonly draftM: number
    readonly midship: number
    readonly kgM: number
    readonly depthM: number
    readonly rho: number
    /** 横摇、纵摇的惯性半径占船宽、船长的比例；附加质量占惯量的比例；阻尼比 */
    readonly rollGyration: number
    readonly pitchGyration: number
    readonly rollAdded: number
    readonly pitchAdded: number
    readonly rollDamping: number
    readonly pitchDamping: number
  }
  /** 甲板上的重量，千克：身体按半径的三次方与身体的质量折算，重心离甲板 bodyHeightM 米 */
  readonly weight: {
    readonly bodyKg: number
    readonly bodyRadiusU: number
    readonly bodyHeightM: number
    readonly pickupKg: number
    readonly ballKg: number
  }
  /** 海：船速（米/秒）与几列涌浪 */
  readonly sea: {
    readonly speedMs: number
    readonly swells: readonly Swell[]
  }
  /** 摩擦：身体脚下、金币的静与动摩擦系数；炮弹的滚动摩擦系数 */
  readonly friction: {
    readonly body: Friction
    readonly coin: Friction
    readonly ballRolling: number
  }
  /** 赶路按恒定功率 P = m·v·(c − g∥)：c 是平地上的阻力（米/秒²），下坡最多快到 downhillMax 倍；每格的费力按 1 − g∥/c，最少 effortMin */
  readonly gait: {
    readonly flatResistance: number
    readonly downhillMax: number
    readonly effortMin: number
  }
  /** 甲板上散着的炮弹：几颗、半径（格）、与舷墙桅杆和彼此相撞的恢复系数 */
  readonly balls: {
    readonly count: number
    readonly radiusU: number
    readonly restitution: number
  }
}
/**
 * 浮冰：南极海上一块近似方形的浮冰，形状按断裂、碰撞的成因每局随机生成；冰面没有边，滑出冰缘就掉进冰点附近的海水里。
 * 冰面上的一切按库仑摩擦走、滑、停，积雪、老冰、新冰的摩擦各不相同；海风一阵阵吹，风压超过脚下的摩擦就被吹着滑。
 * 物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface FloeConfig {
  readonly meterPerU: number
  /** 地图是边长 frameU 的方形，浮冰居中；冰面的距离场、积雪与新冰的格子边长 cellU */
  readonly frameU: number
  readonly cellU: number
  /** 平面形状，格 */
  readonly shape: {
    /** 冰面的面积，格² */
    readonly areaU: number
    /** 四条主断裂边：整块最多转 turnDeg 度，每条边再各自最多偏 sideDeg 度、离中心的距离最多差 sideU 格 */
    readonly turnDeg: number
    readonly sideDeg: number
    readonly sideU: number
    /** 每个角被一条斜裂缝切掉的概率与切进去的深度 */
    readonly cutChance: number
    readonly cutU: readonly [number, number]
    /** 长边中途拐折的幅度：裂缝不是笔直的 */
    readonly bendU: number
    /** 边上掰掉一块留下的豁口：几个、多深、口多宽 */
    readonly bites: readonly [number, number]
    readonly biteDepthU: readonly [number, number]
    readonly biteWidthU: readonly [number, number]
    /** 一条横贯冰面的裂缝已重新冻住，成了一道新冰；它从冰缘裂开、还没冻上的那一段是伸进冰里的水道：概率、水道的长与口宽、新冰的宽 */
    readonly leadChance: number
    readonly leadU: readonly [number, number]
    readonly leadWidthU: readonly [number, number]
    readonly seamWidthU: readonly [number, number]
    /** 断口的锯齿幅度；凸角被别的浮冰撞圆的半径 */
    readonly jagU: number
    readonly roundU: readonly [number, number]
  }
  /** 冰：老冰与新冰的厚度、冰与海水的密度，按阿基米德定出冰面高出海面多少 */
  readonly ice: {
    readonly thicknessM: number
    readonly youngM: number
    readonly density: number
    readonly seaDensity: number
  }
  /** 积雪：最深多少米、盖住多大比例、雪的密度；雪堆沿风向拉长，尺度 waveU；冰缘这么宽一圈被浪花打湿、留不住雪 */
  readonly snow: {
    readonly maxM: number
    readonly cover: number
    readonly density: number
    readonly waveU: number
    readonly bareU: number
  }
  /** 脚下与冰面之间的静、动摩擦系数：积雪、老冰、新冰；金币与碎片在冰上的摩擦 */
  readonly friction: {
    readonly snow: { readonly static: number; readonly kinetic: number }
    readonly ice: { readonly static: number; readonly kinetic: number }
    readonly young: { readonly static: number; readonly kinetic: number }
    readonly loose: number
  }
  /** 身体：脚下支撑圈占半径的比例；游泳的速度占走路的比例；半径 refRadiusU、质量 1 的身体在水里的阻力长度 m/c（格）与冻僵的时长（秒） */
  readonly body: {
    readonly footFrac: number
    readonly swimRatio: number
    readonly refRadiusU: number
    readonly dragU: number
    readonly freezeSec: number
    /** 爬上冰面：重心要越过冰缘这么多个身体半径 */
    readonly climbFrac: number
  }
  /** 风：平时的风速与阵风的峰值（米/秒）；阵风先起、再稳、后落，隔一阵来一次；风向每次偏一点 */
  readonly wind: {
    readonly meanMs: number
    readonly gustMs: number
    readonly firstMs: number
    readonly intervalMs: number
    readonly jitterMs: number
    readonly riseMs: number
    readonly holdMs: number
    readonly fallMs: number
    readonly veerDeg: number
    /** 空气密度；半径 refRadiusU、质量 1 的身体的 Cd·A/m（米²/千克）：越小的身体越容易被吹动 */
    readonly airDensity: number
    readonly dragArea: number
    /** 浮冰顺风漂得比海水快，漂速占平时风速的比例，南半球漂向偏在风向左边 driftDeg 度：浮冰上看，海水往反方向流 */
    readonly driftRatio: number
    readonly driftDeg: number
    /** 上风开阔水面的长度（风区），米：海面的风浪按它长成 */
    readonly fetchM: number
  }
  /** 水里的体力：冰面按地图的体力算 */
  readonly waterExertion: number
  readonly waterRegen: number
  readonly coldTickMs: number
}
/**
 * 溶洞：方形地图里一座部分露天的石灰岩溶洞。阳光、天光、月光从洞顶的天窗照进洞里，随真实的太阳与月亮移动；入夜后队员点起火把。
 * 光照按勒克斯算，一格 1 米；镜头短边看到多少格由洞里的亮度决定；怪物只从暗处出来；洞壁、石柱与大石笋挡人也挡子弹
 */
export interface CaveConfig {
  /** 洞厅：边离方形地图的边 insetU 格之间按噪声起伏、波长 waveU，角按 cornerU 的半径磨圆；窄过两倍 neckU 的缝与尖角填成岩壁 */
  readonly hall: {
    readonly insetU: readonly [number, number]
    readonly waveU: number
    readonly cornerU: number
    readonly neckU: number
    /** 洞顶离洞底多高，米：天窗开在洞顶上 */
    readonly ceilingM: number
    /** 洞壁从洞底弯上洞顶要横着走多宽，格 */
    readonly wallU: number
  }
  /**
   * 天窗：大天窗几个、半径多大，第一个离地图中心 mainOffsetU 格，其余散在洞厅别处；小天窗的个数与半径，格；
   * 轮廓按方位角在 ±jitter 倍内起伏；天窗之间的空隙至少 gapU 格
   */
  readonly skylights: {
    readonly mainCount: readonly [number, number]
    readonly mainU: readonly [number, number]
    readonly mainOffsetU: readonly [number, number]
    readonly minorCount: readonly [number, number]
    readonly minorU: readonly [number, number]
    readonly jitter: number
    readonly gapU: number
    /** 天窗正下方塌落的碎石坡：中间高多少米，铺到天窗半径的几倍 */
    readonly rubbleM: number
    readonly rubbleSpread: number
  }
  /** 支洞：从洞厅边往岩体里走 outU 格再顺着洞壁拐 alongU 格，宽 widthU，尽头是半径 pocketU 的暗室；天光与反光都照不进拐角后面 */
  readonly alcoves: {
    readonly count: readonly [number, number]
    readonly widthU: number
    readonly outU: number
    readonly alongU: readonly [number, number]
    readonly pocketU: number
  }
  /** 石柱（顶到洞顶）与石笋：个数、底半径（格）；石笋多半长成 clusters 丛，高多少米；底半径不到 blockU 的石笋矮小，人跨得过、子弹飞得过；出生点 clearU 格内不长 */
  readonly formations: {
    readonly columns: readonly [number, number]
    readonly columnU: readonly [number, number]
    readonly stalagmites: readonly [number, number]
    readonly clusters: readonly [number, number]
    readonly stalagmiteU: readonly [number, number]
    readonly stalagmiteM: readonly [number, number]
    readonly blockU: number
    readonly clearU: number
  }
  /** 边石坝水潭：几片、每片多大（格）；蹚水时的黏滞与每走一格耗的体力 */
  readonly pools: {
    readonly count: readonly [number, number]
    readonly sizeU: readonly [number, number]
    readonly viscosity: number
    readonly exertion: number
  }
  /**
   * 天：纬度与太阳赤纬（度），一天多少秒，开局在几点；大气消光系数（直射光按 exp(−消光·大气质量) 衰减）。
   * 太阳高度在 dwellCenterDeg 附近时时间放慢到 1/(1+dwell)，按高度的高斯窗、宽 dwellWidthDeg：天黑天亮仍连续，只是看得清
   */
  readonly sky: {
    readonly latitudeDeg: number
    readonly declinationDeg: number
    readonly dayS: number
    readonly startHour: number
    readonly extinction: number
    readonly dwell: number
    readonly dwellCenterDeg: number
    readonly dwellWidthDeg: number
  }
  /** 光照：洞底与洞顶的反照率，经洞顶反射的光铺开多远（格）；荧光苔与发光蘑菇的丛数，贴近时的照度（勒克斯） */
  readonly light: {
    readonly albedo: number
    readonly bounceU: number
    readonly glowCount: readonly [number, number]
    readonly glowLux: number
  }
  /** 火把：发光强度（坎德拉）、举多高（米）；身边的光暗过 igniteLux 就点起、亮过 douseLux 才熄灭；一个个点起时最多相差几毫秒 */
  readonly torch: {
    readonly candela: number
    readonly heightM: number
    readonly igniteLux: number
    readonly douseLux: number
    readonly staggerMs: number
  }
  /** 看多远：洞里的平均照度从 darkLux 到 brightLux（按对数）时，镜头短边从 nightU 格拉到 dayU 格；眼睛最暗只适应到 brightLux，照度不到 clearLux 就看不清 */
  readonly view: {
    readonly dayU: number
    readonly nightU: number
    readonly darkLux: number
    readonly brightLux: number
    readonly clearLux: number
  }
  /** 怪物只刷在照度不到 spawnLux 的地方 */
  readonly spawnLux: number
}
export interface OldRiverConfig {
  readonly viewScale: number
  readonly width: number
  readonly flow: number
  /** 正逆流、正顺流赶路时费力的倍率，斜着走按夹角插值 */
  readonly upstream: number
  readonly downstream: number
  /** 拾取物漂过下游边多远消失 */
  readonly coinCullPad: number
  /** 敌人漂过下游边多远就被冲走 */
  readonly enemyCullPad: number
  readonly driftCount: number
  readonly driftSpeedMul: readonly [number, number]
  readonly waveSlow: number
  readonly waveFast: number
}
/** 按流量 Q（米³/秒）定的河道：水面宽 W = widthCoef·√Q、平均水深 D = depthCoef·Q^0.4（米），坡降由曼宁糙率反算 */
export interface ChannelConfig {
  readonly widthCoef: number
  readonly depthCoef: number
  readonly manning: number
  /** 横断面的形状指数：水深按 1 − |ξ|^bedShape 从深泓往两岸收 */
  readonly bedShape: number
  /** 弯顶的深潭、过渡段的浅滩相对平均的水深倍率；深泓往凹岸偏到半宽的 thalwegShift 倍 */
  readonly pool: number
  readonly riffle: number
  readonly thalwegShift: number
  /** 河岸高出水面多少米、岸坡多宽（格）；岸顶以外的滩地每格升多少米 */
  readonly bankM: number
  readonly bankU: number
  readonly floodSlope: number
}
/**
 * 水里的身体：半径 radiusU 格、质量倍率为 1 的身体重 kg 千克、高 heightM 米，别的身体质量按半径的三次方与质量倍率、身高按半径缩放（半径不算队长倍率）；
 * 身体的密度（千克/米³）与水里的阻力系数。水的推力绕脚掌的力矩大过（体重 − 浮力）乘扶正力臂（推倒），推力大过（体重 − 浮力）乘脚底的摩擦系数（滑走），
 * 或者干脆浮起来，就站不住、随水漂
 */
export interface WadeConfig {
  readonly kg: number
  readonly radiusU: number
  readonly heightM: number
  readonly density: number
  readonly drag: number
  /** 站着时胯以下迎水的是两条腿：腿宽占身宽、胯高占身高的比例 */
  readonly legs: number
  readonly hip: number
  /** 站着时重心到脚掌下游边的水平距离占身高的比例 */
  readonly lever: number
  /** 脚底踩在湿河床上的静摩擦系数 */
  readonly mu: number
  /** 随水漂着时自己划水的速度（相对水）占想走的速度的比例 */
  readonly swim: number
  /** 水深不到这个（米）算干地 */
  readonly wetM: number
}
/**
 * 樱庭：寺院外溪边的一片樱林空地。一面是寺院的瓦顶土墙，另外三面是樱林，林缘上的樱花一棵挨一棵；一条斜着的溪从一面林缘流进来、从另一面林缘流出去，
 * 上游横着一排石组，下游漫过一道低石槛，槛上立着竹栅：水过得去，身体与掉落物过不去，漂到下游的就堵在竹栅前。溪的水流是浅水方程在溪床上的稳态解，溪上架着一座木桥；
 * 寺墙、林缘的走向，溪的走向与位置都由种子定。物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface SakuraConfig {
  readonly meterPerU: number
  /** 地形格子的边长，格；地形铺满镜头能看到的地图外一圈 */
  readonly cellU: number
  /** 地图是 sizeU 见方的方形 */
  readonly sizeU: number
  /** 能走的地面连同溪面有多大，格²：生成出来不在这个范围里就换一组随机数 */
  readonly areaU2: readonly [number, number]
  /** 窄过两倍 neckU 的缝与尖角不能走 */
  readonly neckU: number
  /**
   * 寺墙：墙身中线离地图边 insetU 格之间，整条最多斜 skewDeg 度，中途再拐最多 kinkDeg 度；墙身厚（格）、墙高（米）、瓦顶往墙两边伸出多宽（格）；
   * 院门宽（格）
   */
  readonly wall: {
    readonly insetU: readonly [number, number]
    readonly skewDeg: number
    readonly kinkDeg: number
    readonly thickU: number
    readonly heightM: number
    readonly eaveU: number
    readonly gateU: number
  }
  /**
   * 樱林：林缘离地图边 insetU 格之间，按噪声弯出最多 bendU（波长 waveU），一棵棵树冠再排出 scallopU 的参差；每条林缘另有 lobes 处伸进空地的林舌或凹进林子的草湾，
   * 伸出或凹进 lobeU 格、宽约 lobeWidthU 格
   */
  readonly forest: {
    readonly insetU: readonly [number, number]
    readonly bendU: number
    readonly waveU: number
    readonly scallopU: number
    readonly lobes: readonly [number, number]
    readonly lobeU: readonly [number, number]
    readonly lobeWidthU: readonly [number, number]
  }
  /**
   * 溪：从进林缘到出林缘的走向离横竖方向至少 slantDeg 度，两头进出林子时再各偏最多 turnDeg 度；蜿蜒的幅度（格），弯道半径至少是水面宽的 minBend 倍；
   * 溪岸离寺墙至少 wallGapU 格
   */
  readonly stream: {
    readonly slantDeg: number
    readonly turnDeg: number
    readonly meanderU: number
    readonly minBend: number
    readonly wallGapU: number
  }
  /** 溪的流量（米³/秒），河道按流量定；空地上地面的起伏多少米 */
  readonly flow: ChannelConfig & { readonly discharge: number; readonly reliefM: number }
  /** 上游的石组：石头的半径（格）、石缝多宽（格）、石顶比水面高多少米 */
  readonly rocks: {
    readonly radiusU: readonly [number, number]
    readonly gapU: readonly [number, number]
    readonly heightM: number
  }
  /** 下游的石槛：槛前从河床升上槛顶的坡多长（格）、槛下的溪比槛顶低多少米；槛上的竹栅：竹桩隔多远（格）、多高（米） */
  readonly sill: {
    readonly rampU: number
    readonly dropM: number
    readonly postU: number
    readonly heightM: number
  }
  /** 木桥：桥面宽（格）、两头落地的坡道多长（格）、桥面正中拱起多高（米）；架在溪的哪一段（弧长的比例） */
  readonly bridge: {
    readonly widthU: number
    readonly rampU: number
    readonly riseM: number
    readonly at: readonly [number, number]
  }
  /** 樱花：空地上几棵；树冠半径（格）与树高（米）；树冠下能走进去多深（格）；寺墙外（寺里）的樱花隔多远一棵（格） */
  readonly trees: {
    readonly inside: readonly [number, number]
    readonly crownU: readonly [number, number]
    readonly heightM: readonly [number, number]
    readonly overhangU: number
    readonly templeGapU: number
  }
  readonly body: WadeConfig
}
/**
 * 草甸：一片开阔的草地，场里没有障碍，也没有任何特殊规则。四周按种子生成：一边是一道陡坡，坡上是高一层的草甸；
 * 其余几边是针叶林，其中一边换成牧场的木栅栏。林子、栅栏和坡脚都是硬边界。一格 meterPerU 米：树高、坡高与影子长短按米算
 */
export interface MeadowConfig {
  readonly meterPerU: number
  /** 地图是 sizeU 见方的方形，摆在方框正中；地面画满方框 */
  readonly sizeU: number
  /** 能走的草地有多大，格²：生成出来不在这个范围里就换一组随机数 */
  readonly areaU2: readonly [number, number]
  /** 窄过两倍 neckU 的缝与尖角不能走 */
  readonly neckU: number
  /** 草地的起伏（米）与波长（格）；整片从坡脚往外每格降低多少米 */
  readonly turf: { readonly reliefM: number; readonly waveU: number; readonly riseM: number }
  /**
   * 陡坡：坡脚离地图边 insetU 格之间，按噪声弯出最多 bendU（波长 waveU）；另有 spurs 处往草地鼓出来或往里凹进去，
   * 鼓出或凹进 spurU 格、宽约 spurWidthU 格。坡顶比坡脚高 heightM 米，坡面平均每格升 riseM 米，坡面多宽由这两样定；
   * 坡顶是圆圆的肩，坡脚缓缓弯回平地，坡顶往外是高一层的草甸
   */
  readonly bank: {
    readonly insetU: readonly [number, number]
    readonly bendU: number
    readonly waveU: number
    readonly spurs: readonly [number, number]
    readonly spurU: readonly [number, number]
    readonly spurWidthU: readonly [number, number]
    readonly heightM: readonly [number, number]
    readonly riseM: readonly [number, number]
  }
  /**
   * 针叶林：林缘离地图边 insetU 格之间，按噪声弯出最多 bendU（波长 waveU），一棵棵树冠再排出 scallopU 的参差；每条林缘另有 lobes 处伸进草地的林舌或凹进林子的草湾，
   * 伸出或凹进 lobeU 格、宽约 lobeWidthU 格；大树的树冠半径（格）与树高（米），林缘一圈灌木与小树的树冠半径（格），其中白桦占多少；树冠最多探进草地 overhangU 格
   */
  readonly forest: {
    readonly insetU: readonly [number, number]
    readonly bendU: number
    readonly waveU: number
    readonly scallopU: number
    readonly lobes: readonly [number, number]
    readonly lobeU: readonly [number, number]
    readonly lobeWidthU: readonly [number, number]
    readonly crownU: readonly [number, number]
    readonly heightM: readonly [number, number]
    readonly edgeU: readonly [number, number]
    readonly birch: number
    readonly overhangU: number
  }
  /** 林间小路：路口凹进林缘多深、多宽（格）；横在路上的倒木多长（格） */
  readonly trail: { readonly notchU: number; readonly widthU: number; readonly logU: readonly [number, number] }
  /**
   * 牧场的木栅栏：离地图边 insetU 格之间，整条最多斜 skewDeg 度，中途再拐最多 kinkDeg 度；桩距（格）、桩高（米）与门宽（格）；
   * 栅栏在陡坡对面那条边的概率，其余时候在一条侧边
   */
  readonly fence: {
    readonly insetU: readonly [number, number]
    readonly skewDeg: number
    readonly kinkDeg: number
    readonly postU: number
    readonly heightM: number
    readonly gateU: number
    readonly farChance: number
  }
  /** 野花：成片开花的地方占草地的多少，花片的尺度（格） */
  readonly flowers: { readonly cover: number; readonly patchU: number }
  /** 栅栏外吃草的羊有几只 */
  readonly sheep: readonly [number, number]
}
/**
 * 电路板：队伍和敌人缩小在一块电路板上，四周围着一圈金属屏蔽罩，芯片像楼、走线像路。一格 mmPerU 毫米：元件多高、影子多长按毫米算。
 * 镀金的裸铜线带电，碰到就触电（敌我通吃）：电源线一直通电；时钟线按节拍一通一断，通电前先预警；开关线平时不通，有人踩上触摸开关，
 * 电才从开关沿线一路通过去，连着的铜板通一阵。芯片和罩壁之间的过道里有一对电极，隔一阵蓄满电，在两极之间打出一道电弧。阻焊层底下的暗线不带电
 */
export interface CircuitConfig {
  readonly mmPerU: number
  /** 地图是 sizeU 见方的方形；地面画到地图外 padU 格，镜头看得到的地方都画上 */
  readonly sizeU: number
  readonly padU: number
  /** 能走的板面有多大，格²：生成出来不在这个范围里就换一组随机数 */
  readonly areaU2: readonly [number, number]
  /** 窄过两倍 neckU 的缝不能走 */
  readonly neckU: number
  /** 屏蔽罩：罩壁离地图边 insetU 格，四个角斜切掉 chamferU 格，罩壁高 heightMM 毫米 */
  readonly frame: { readonly insetU: readonly [number, number]; readonly chamferU: readonly [number, number]; readonly heightMM: number }
  /** 开局站的那片空地的半径（格）：里面没有元件，带电的铜离它至少再远一格 */
  readonly plazaU: number
  /** 靠墙的芯片和罩壁之间留出的过道有多宽（格），芯片离那面墙的中点多远（格） */
  readonly aisleU: readonly [number, number]
  readonly chipU: readonly [number, number]
  /** 触电：身体半径的 footFrac 倍以内碰到带电的铜就算，每 tickMs 结算一次，按每秒伤害折算 */
  readonly shock: { readonly teamDps: number; readonly enemyDps: number; readonly tickMs: number; readonly footFrac: number }
  /** 电源线：一直通电，线宽（格） */
  readonly rail: { readonly widthU: readonly [number, number] }
  /** 时钟线：几条并排，线宽与线距（格），线距就是时钟芯片的脚距；按节拍断 offMs、预警 warnMs、通 onMs，一通整条同时通 */
  readonly clock: {
    readonly traces: readonly [number, number]
    readonly widthU: number
    readonly pitchU: number
    readonly offMs: number
    readonly warnMs: number
    readonly onMs: number
  }
  /**
   * 电弧：几处，两极的尖相隔 gapU 格；歇 restMs、蓄电 chargeMs、放电 arcMs，循环往复，各处错开；
   * 放电时离电弧 reachU 格以内的身体挨一下
   */
  readonly arc: {
    readonly count: readonly [number, number]
    readonly gapU: readonly [number, number]
    readonly restMs: number
    readonly chargeMs: number
    readonly arcMs: number
    readonly reachU: number
    readonly teamDamage: number
    readonly enemyDamage: number
  }
  /**
   * 开关：触摸盘的半径（格），盘中间那块圆金的半径（格），连着的铜板边长（格），盘到铜板的连线多长（格）；
   * 身体中心踩进圆金，连线与铜板一齐通电 holdMs，断开后 rearmMs 内再踩也不通
   */
  readonly button: {
    readonly padU: number
    readonly touchU: number
    readonly plateU: readonly [number, number]
    readonly reachU: readonly [number, number]
    readonly holdMs: number
    readonly rearmMs: number
  }
}
/** 沙漠里一种身体在沙上留下的印子：靴印、光脚印、爪印、蹄印、蛇的拖痕、跳着落地的一对印子、一圈细腿戳出的点 */
export type DesertGait = 'boot' | 'foot' | 'paw' | 'hoof' | 'slither' | 'hop' | 'legs'

/**
 * 沙漠：一片四边首尾相接的沙海，地图的四边是回绕的接缝，镜头跟着队长走、看不到边。沙丘与标志物都是一对一对的：
 * 同一个摆在横竖各隔半圈的两处，再加上整圈的回绕，怎么走都分不清是回到了原地还是到了另一处。
 * 赶路按坡度与沙的松实算代谢，背阴处歇着回得快；标志物挡人不挡子弹；身体走过的地方留下脚印，越累越深，见底时拖着脚走，过一会儿被风吹平。
 * 物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface DesertConfig {
  readonly meterPerU: number
  /** 镜头的长边最多看多少格：看到的范围小于环面的一圈，每样东西只画离队长最近的那一份 */
  readonly viewMaxU: number
  /** 太阳的仰角（度），方位与角色的光一致 */
  readonly sunDeg: number
  /**
   * 沙丘：几对、每座最高处多高（米）；每座由几团圆润的沙包横着风排开、融成一道缓丘，沙包迎风坡最陡处的坡度是 stossSlope、背风坡最陡处是 leeSlope（正切）；
   * 沙包横着风的半宽是它顺风长的 width 倍；各座沙丘在盛行风两侧最多偏 turnDeg 度
   */
  readonly dunes: {
    readonly pairs: readonly [number, number]
    readonly heightM: readonly [number, number]
    readonly lobes: readonly [number, number]
    readonly stossSlope: number
    readonly leeSlope: number
    readonly width: number
    readonly turnDeg: number
  }
  /** 盛行风吹去的方向在背着太阳的方向两侧最多偏多少度：背风坡多半背着太阳 */
  readonly windSpreadDeg: number
  /** 丘间的缓缓起伏：幅度（米）与一圈里起伏几次 */
  readonly swell: { readonly heightM: number; readonly waves: number }
  /** 丘间的沙：松的程度在 loose 的范围里按一圈 patches 片斑块起伏，实一点的地方颜色偏深偏红、走起来省力 */
  readonly flats: { readonly loose: readonly [number, number]; readonly patches: number }
  /** 标志物：几对（每对一模一样，横竖各隔半圈），彼此至少隔多远（格） */
  readonly landmarks: { readonly pairs: number; readonly gapU: number }
  /**
   * 走路的代谢按 Minetti 的坡度曲线：松沙上每米是硬地的 softSand 倍，被踩实的沙最多省掉多出来的 packRelief；
   * 吃力时最多出到平地正常走路的 maxPower 倍功率，再吃力就走慢；下坡最多快到 downhillMax 倍
   */
  readonly gait: {
    readonly softSand: number
    readonly packRelief: number
    readonly maxPower: number
    readonly downhillMax: number
  }
  /** 背阴处歇着的体力回复倍率；向阳处按地图的体力回复 */
  readonly shadeRegen: number
  /**
   * 脚印：印子贴图每格多少个格子。标准身体在松沙上一步踩多深（米），实沙上只踩下去 firm 倍，累到见底时深到 tired 倍，体力低于 dragFrom 开始拖着脚；
   * 步幅与脚长占身体半径的比例；印子与踩实的沙过多少秒被风吹平；一步把那里的沙踩实多少；各种敌人的步态，没写的按光脚，队员穿着靴子
   */
  readonly tracks: {
    readonly perU: number
    readonly depthM: number
    readonly firm: number
    readonly tired: number
    readonly dragFrom: number
    readonly stride: number
    readonly foot: number
    readonly lifeS: number
    readonly pack: number
    readonly gaits: Partial<Record<EnemyKind, DesertGait>>
  }
}
/**
 * 残垣：山顶台地上一座塌了大半的石砌院落——中间是回廊院，四周一圈房间，一角是塔楼。墙按一层层石块砌成，各处剩多高按砌体的物理来：
 * 高过膝盖挡人、高过胸口挡子弹、高过眼睛挡视线（按 obstacles 的身高比例）；打掉的石块以上失去支撑一起塌下，陡过砌法的地方塌成台阶，
 * 塌下来的落石砸人、在墙脚按休止角堆成碎石、扬起挡视线的尘雾。物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface RuinsConfig {
  readonly meterPerU: number
  /** 砌体格子的边长，格：每格记剩几层石块、封着的木板与地上的碎石 */
  readonly cellU: number
  /** 台地：院落外框往外 marginU 格之间按噪声起伏（波长 waveU）就是台地的边，台地边到地图边留 padU 格的山坡；窄过两倍 neckU 的缝填掉 */
  readonly site: {
    readonly marginU: readonly [number, number]
    readonly waveU: number
    readonly padU: number
    readonly neckU: number
  }
  /**
   * 院落的平面：整体转过 tiltDeg 度；回廊院中间的庭院多大、回廊多宽，四周房间的进深与开间（格）；门洞多宽，通到院外的门几道，
   * 连通以外每道墙再开门的概率；外墙、内墙、塔楼的墙与柱廊矮墙的厚（格）
   */
  readonly plan: {
    readonly tiltDeg: readonly [number, number]
    readonly garthU: readonly [number, number]
    readonly walkU: number
    readonly depthU: readonly [number, number]
    readonly roomU: readonly [number, number]
    readonly doorU: readonly [number, number]
    readonly gates: readonly [number, number]
    readonly loops: number
    readonly wallU: {
      readonly outer: number
      readonly inner: number
      readonly tower: number
      readonly parapet: number
    }
  }
  /** 砌体：一层石块高 courseM 米、密度（千克/米³）；同一处砌体里横竖相隔 bond 格以内的两格最多差一层才立得住；原本多高（米）：外墙、内墙、塔楼、柱廊的矮墙与石柱 */
  readonly masonry: {
    readonly courseM: number
    readonly density: number
    readonly bond: number
    readonly heightM: {
      readonly outer: readonly [number, number]
      readonly inner: readonly [number, number]
      readonly tower: readonly [number, number]
      readonly parapet: number
      readonly column: number
    }
  }
  /** 柱廊：石柱的底半径与柱距（格），每边拆掉几个柱间的矮墙当入口 */
  readonly arcade: {
    readonly radiusU: number
    readonly spacingU: number
    readonly entries: readonly [number, number]
  }
  /**
   * 年久失修：墙顶按低频噪声（波长 waveU 格）往下塌，剩原高的 keep 那么多；几处半径 razeU 格的地方拆到只剩墙基；开局前再预演几次多大的破坏（立方米）。
   * 石柱折断、倒下的比例；塌下来的石块留在墙脚的比例（其余早被搬走）
   */
  readonly decay: {
    readonly waveU: number
    readonly keep: readonly [number, number]
    readonly razed: readonly [number, number]
    readonly razeU: readonly [number, number]
    readonly breaches: readonly [number, number]
    readonly breachM3: readonly [number, number]
    readonly broken: number
    readonly fallen: number
    readonly rubble: number
  }
  /** 封门的木板：几道门洞、多高（米）、多厚（格） */
  readonly timber: {
    readonly doors: readonly [number, number]
    readonly heightM: number
    readonly thickU: number
  }
  /** 碎石：休止角（度）；碎石深 fullM 米时走起来最慢：黏滞与每走一格多耗的体力 */
  readonly rubble: {
    readonly reposeDeg: number
    readonly fullM: number
    readonly viscosity: number
    readonly exertion: number
  }
  /** 落石：每千焦的冲击打掉多少血；落在身体半径外多远（格）也砸得到 */
  readonly fall: {
    readonly damagePerKJ: number
    readonly radiusU: number
  }
  /** 尘雾：每塌下一立方米扬起多少（消光系数乘面积，米），摊开的半径（格），多久落下一半（秒）；视线攒下的光学厚度到 opaqueTau 就看不穿 */
  readonly dust: {
    readonly perM3: number
    readonly spreadU: number
    readonly halfLifeS: number
    readonly opaqueTau: number
  }
  /** 台地边外的树：树冠半径（格）、树高（米）、撒树的格子间距（格） */
  readonly trees: {
    readonly crownU: readonly [number, number]
    readonly heightM: readonly [number, number]
    readonly gapU: number
  }
  /** 撞墙时身体的半径最多按这么大算（格）：大个子也挤得过门洞 */
  readonly bodyCapU: number
  /** 门洞、柱间与开局时墙上塌出的缺口最窄多宽（格）：塌出来更窄的缺口补回刚好挡人的高度 */
  readonly gapU: number
  /** 寻路最快多久重算一次，毫秒 */
  readonly reflowMs: number
}
export interface TorusConfig {
  readonly arenaLong: number
  readonly arenaShort: number
  readonly projectileLifeMs: number
  readonly frame: number
}
/** 敌人怎么从出怪口进场：rise 原地从下面钻出来，walk 从洞口里走出来，climb 从场地边外翻进来，drop 从上面落下来，lob 从远处被抛进来 */
export type Entrance = 'rise' | 'walk' | 'climb' | 'drop' | 'lob'
/** 进场时冒出的样子：puff 一团烟尘，splash 水花，steam 白汽，sparks 火星，snow 雪沫，leaves 碎叶，glow 星光，petals 落花，sand 沙尘 */
export type EntranceLook = 'puff' | 'splash' | 'steam' | 'sparks' | 'snow' | 'leaves' | 'glow' | 'petals' | 'sand'

/** 离某一组地标至少多远 */
export interface GateAway {
  readonly mark: string
  readonly minU: number
}

/**
 * 出怪口摆在哪：rim 是能走的地面的外边界，切成 segU 格长的一段段；nooks 是外边界上每隔约 spacingU 格的一处口子；
 * mark 是地图自己给的同名地标；ground 是整片能走的地面。away 让它离某一组地标至少那么远
 */
export type GatePlace =
  | { readonly kind: 'rim'; readonly segU: number; readonly away?: GateAway }
  | { readonly kind: 'nooks'; readonly spacingU: number; readonly away?: GateAway }
  | { readonly kind: 'mark' }
  | { readonly kind: 'ground' }

/**
 * 一种出怪口：weight 是几种都够得着时抽中的权重，perSec 是每一处每秒最多出几只（多的分给别处），only 只出这几种敌人，reachU 是抛入的口子抛得到多远；
 * snapU 是这一种自己的吸附半径（不写按地图的）；look 是进场时冒出的样子（默认一团烟尘），落下的冒在落点，抛入的起点落点都冒，其余的冒在起点
 */
export interface GateKind {
  readonly name: string
  readonly at: GatePlace
  readonly enter: Entrance
  readonly look?: EntranceLook
  readonly snapU?: number
  readonly weight: number
  readonly perSec?: number
  readonly only?: readonly EnemyKind[]
  readonly reachU?: number
}

/**
 * 出怪口：敌人照常先定一个出生点，再吸附到 snapU 格以内的出怪口，从那里按它的进场方式出来；哪一处都够不着就在原地按 fallback 出来。
 * look 是在原地出来时冒出的样子；boss 是头目从哪种出怪口登场；lean 让地图偏向的那一侧（船低的一舷、浮冰的上风）边上的出怪口权重变大，偏到 full 时乘满 mul 倍，full 按这张图偏向的单位
 */
export interface GatesConfig {
  readonly snapU: number
  readonly fallback: Extract<Entrance, 'rise' | 'drop'>
  readonly look?: EntranceLook
  readonly boss?: string
  readonly lean?: { readonly mul: number; readonly full: number }
  readonly kinds: Readonly<Record<string, GateKind>>
}
export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly kind: 'bounded' | 'oldRiver' | 'void' | 'oldRuins' | 'ruins' | 'daynight' | 'space' | 'ice' | 'nebulaOld' | 'nebula' | 'volcano' | 'ship' | 'floe' | 'cave' | 'desert' | 'meadow' | 'sakura' | 'circuit'
  readonly size?: { readonly w: number; readonly h: number }
  readonly stamina: GroundStamina
  readonly palette: Palette
  readonly decor: MapDecor
  readonly drift?: readonly string[]
  readonly mix: readonly EnemyMixRow[]
  /** 敌人从地图上哪些地方、怎么进场；不写就在能站的地方原地冒出来 */
  readonly gates?: GatesConfig
  readonly dayMix?: readonly EnemyMixRow[]
  readonly nightMix?: readonly EnemyMixRow[]
  readonly walls?: WallsConfig
  readonly dayNight?: DayNightConfig
  readonly ice?: IceConfig
  readonly space?: SpaceConfig
  readonly nebulaOld?: NebulaOldConfig
  readonly nebula?: NebulaConfig
  readonly volcano?: VolcanoConfig
  readonly ship?: ShipConfig
  readonly oldRiver?: OldRiverConfig
  readonly floe?: FloeConfig
  readonly cave?: CaveConfig
  readonly desert?: DesertConfig
  readonly ruins?: RuinsConfig
  readonly meadow?: MeadowConfig
  readonly sakura?: SakuraConfig
  readonly circuit?: CircuitConfig
  readonly torus?: TorusConfig
  readonly finalWaveSub?: string
  readonly boss: EnemyKind
}
export type MapId = keyof typeof mapsJson

export type Hazard = 'coldWater' | 'meteor' | 'blackhole' | 'lava' | 'collapse' | 'shock' | 'arc'

export interface DecorInstance {
  emoji: string
  xU: number
  yU: number
  sizeU: number
  alpha: number
  rotation: number
}
export interface MapDefaults {
  readonly width: number
  readonly height: number
  readonly cameraMargin: number
}

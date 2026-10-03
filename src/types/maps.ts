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
  /** 地形格子的边长，高度与厚度也以格计；地形铺满镜头能看到的地图外一圈 */
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
/**
 * 河流：林子与岩石围着的一片空地，一条山溪从崖上落进深潭，往下分成一大一小两股，各自从断崖边落进深谷。
 * 河道按流量定宽深、按曼宁公式定坡降，水流是浅水方程在这副河床上的稳态解；空地的形状、河的走向与出入口都由种子定。
 * 物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface RiverConfig {
  readonly meterPerU: number
  /** 地形格子的边长，格；地形铺满镜头能看到的地图外一圈 */
  readonly cellU: number
  /** 空地：能走的地面连同河面的面积，格²；轮廓按方位角的低阶起伏（相对半径，从二阶起）加二维噪声的起伏（格，波长 waveU） */
  readonly clearing: {
    readonly areaU2: readonly [number, number]
    readonly lobes: readonly number[]
    readonly wobbleU: number
    readonly waveU: number
    /** 地图的边离空地最远处多远 */
    readonly padU: number
    /** 窄过两倍 neckU 的缝和尖角不能走 */
    readonly neckU: number
  }
  /** 河网：进水口在空地边上随机的方位；两个出水口在它对面 oppositeDeg 以内的一个、与旁边隔开 spreadDeg 的另一个，离进水口都至少 apartDeg */
  readonly network: {
    readonly oppositeDeg: number
    readonly spreadDeg: readonly [number, number]
    readonly apartDeg: number
    /** 分叉点在进水口到两出水口中点的哪一段 */
    readonly splitAt: readonly [number, number]
    /** 大股、小股在分叉处偏离主河道的角度 */
    readonly majorTurnDeg: readonly [number, number]
    readonly minorTurnDeg: readonly [number, number]
    /** 河道蜿蜒的幅度，格；弯道半径至少是河宽的 minBend 倍；河岸离空地边至少 edgeGapU */
    readonly meanderU: number
    readonly minBend: number
    readonly edgeGapU: number
  }
  /** 水力几何：流量（米³/秒）按 share 分给大股；水面宽 W = widthCoef·√Q、平均水深 D = depthCoef·Q^0.4（米）；坡降由曼宁糙率反算 */
  readonly flow: {
    readonly discharge: number
    readonly share: number
    readonly widthCoef: number
    readonly depthCoef: number
    readonly manning: number
    /** 横断面的形状指数：水深按 1 − |ξ|^bedShape 从深泓往两岸收 */
    readonly bedShape: number
    /** 弯顶的深潭、过渡段的浅滩相对平均的水深倍率；深泓往凹岸偏到半宽的 thalwegShift 倍 */
    readonly pool: number
    readonly riffle: number
    readonly thalwegShift: number
    /** 河岸高出水面多少米、岸坡多宽（格）；岸顶以外的滩地每格升多少米，起伏多少米 */
    readonly bankM: number
    readonly bankU: number
    readonly floodSlope: number
    readonly reliefM: number
  }
  /** 瀑布：进水口的崖高与崖面的进深、崖下深潭的深（米）与半径（相对主河道水面宽）；出水口外深谷的深，断崖外还能被冲过去的那一段多长（格），断崖边前那道岩坎多长（格） */
  readonly falls: {
    readonly cliffM: number
    readonly cliffU: number
    readonly poolM: number
    readonly poolR: number
    readonly gorgeM: number
    readonly lipU: number
    readonly sillU: number
  }
  /** 树：树冠半径（格）、伸进空地的树冠下有多宽能走；林子按二维噪声和岩石分地盘，林子占多少；伸进空地的林舌、空地里的树丛与孤树各几处 */
  readonly trees: {
    readonly crownU: readonly [number, number]
    readonly overhangU: number
    readonly forest: number
    readonly tongues: readonly [number, number]
    readonly groves: readonly [number, number]
    readonly lone: readonly [number, number]
  }
  /** 石头：河里与空地上各几块，半径（格），露出水面或地面多高（米） */
  readonly rocks: {
    readonly inRiver: readonly [number, number]
    readonly onLand: readonly [number, number]
    readonly radiusU: readonly [number, number]
    readonly heightM: readonly [number, number]
  }
  /**
   * 水里的身体：半径 radiusU 格、质量倍率为 1 的身体重 kg 千克、高 heightM 米，别的身体质量按半径的三次方与质量倍率、身高按半径缩放（半径不算队长倍率）；
   * 身体的密度（千克/米³）与水里的阻力系数。水的推力绕脚掌的力矩大过（体重 − 浮力）乘扶正力臂（推倒），推力大过（体重 − 浮力）乘脚底的摩擦系数（滑走），
   * 或者干脆浮起来，就站不住、随水漂
   */
  readonly body: {
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
  /** 砌体：一层石块高 courseM 米、密度（千克/米³）；同一处相邻两格最多差 bond 层才立得住；原本多高（米）：外墙、内墙、塔楼、柱廊的矮墙与石柱 */
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
  /** 寻路最快多久重算一次，毫秒 */
  readonly reflowMs: number
}
export interface TorusConfig {
  readonly arenaLong: number
  readonly arenaShort: number
  readonly projectileLifeMs: number
  readonly frame: number
}
export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly kind: 'bounded' | 'oldRiver' | 'void' | 'oldRuins' | 'ruins' | 'daynight' | 'space' | 'ice' | 'nebulaOld' | 'nebula' | 'volcano' | 'ship' | 'river' | 'floe' | 'cave'
  readonly size?: { readonly w: number; readonly h: number }
  readonly stamina: GroundStamina
  readonly palette: Palette
  readonly decor: MapDecor
  readonly drift?: readonly string[]
  readonly mix: readonly EnemyMixRow[]
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
  readonly river?: RiverConfig
  readonly ruins?: RuinsConfig
  readonly torus?: TorusConfig
  readonly finalWaveSub?: string
  readonly boss: EnemyKind
}
export type MapId = keyof typeof mapsJson

export type Hazard = 'coldWater' | 'meteor' | 'blackhole' | 'lava' | 'falls' | 'collapse'

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

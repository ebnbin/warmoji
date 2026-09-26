import type { AnimResource } from '../src/types/anim'

export const ANIMATIONS: AnimResource = {
  def: { frames: 10, durMs: 1000 },
  animations: {
    '1f916': {
      emoji: '1f916',
      name: '机器人',
      desc: '红瞳左右扫视巡逻，天线上下浮动，双耳信号灯呼吸闪烁。',
      anatomy: '红瞳 = 仅有的两个 #DD2E44 圆；天线组在 viewBox 顶部；耳朵是两侧橙色椭圆。',
      clips: {
        idle: {
          parts: [
            { indices: [0, 1], keyframes: [{ t: 0, opacity: 1 }, { t: 0.5, opacity: 0.5 }, { t: 1, opacity: 1 }] },
            { indices: [3, 4], keyframes: [{ t: 0, ty: 0 }, { t: 0.5, ty: -1.1 }, { t: 1, ty: 0 }] },
            {
              indices: [9, 13],
              keyframes: [
                { t: 0, tx: 0 },
                { t: 0.25, tx: 1.7 },
                { t: 0.5, tx: 0 },
                { t: 0.75, tx: -1.7 },
                { t: 1, tx: 0 },
              ],
            },
          ],
        },
      },
    },
    '1f40d': {
      emoji: '1f40d',
      name: '毒蛇',
      desc: '分叉舌头快速吞吐两下再收回，眨一下眼，身体盘绕不动。',
      anatomy: '舌头 = 唯一的红色 path，位于头部朝向的延长线上；眼睛是黑色小圆。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              keyframes: [
                { t: 0, tx: 0, ty: 0 },
                { t: 0.12, tx: -2.4, ty: -0.4 },
                { t: 0.24, tx: -0.6, ty: -0.1 },
                { t: 0.36, tx: -2.4, ty: -0.4 },
                { t: 0.5, tx: 0, ty: 0 },
                { t: 1, tx: 0, ty: 0 },
              ],
            },
            {
              indices: [2],
              keyframes: [
                { t: 0, opacity: 1 },
                { t: 0.7, opacity: 1 },
                { t: 0.78, opacity: 0 },
                { t: 0.86, opacity: 1 },
                { t: 1, opacity: 1 },
              ],
            },
          ],
        },
      },
    },
    '1f9df': {
      emoji: '1f9df',
      name: '僵尸',
      desc: '躯干蹒跚摇摆，伸出的手前后抓挠，头部反相晃动——三组反相运动合成「挪步逼近」。',
      anatomy: '橙衫躯干在底部；灰白手掌是独立 path；头组（发/脸/五官）占上半。旋转轴分设肩/颈。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 1],
              cx: 18,
              cy: 32,
              keyframes: [{ t: 0, rotate: -2 }, { t: 0.5, rotate: 2 }, { t: 1, rotate: -2 }],
            },
            {
              indices: [2],
              keyframes: [
                { t: 0, tx: 0, ty: 0 },
                { t: 0.25, tx: -1.1, ty: 0.5 },
                { t: 0.5, tx: 0, ty: 0 },
                { t: 0.75, tx: -0.5, ty: 0.25 },
                { t: 1, tx: 0, ty: 0 },
              ],
            },
            {
              indices: [5, 6, 7, 8, 9, 10, 11],
              cx: 18,
              cy: 27,
              keyframes: [{ t: 0, rotate: 2.2 }, { t: 0.5, rotate: -2.2 }, { t: 1, rotate: 2.2 }],
            },
          ],
        },
      },
    },
    '1f47b': {
      emoji: '1f47b',
      name: '幽灵',
      desc: '双眼在眼窝内游移画圈（盯人感），嘴巴以自身中心一缩一张地「呜~」。',
      anatomy: '身体一整片 path；双眼 + 高光是三个圆；嘴是黑色斜椭圆 path，缩放锚点取其几何中心。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1, 2, 3],
              keyframes: [
                { t: 0, tx: 0, ty: 0 },
                { t: 0.25, tx: 0.9, ty: 0.5 },
                { t: 0.5, tx: 0, ty: 1 },
                { t: 0.75, tx: -0.9, ty: 0.5 },
                { t: 1, tx: 0, ty: 0 },
              ],
            },
            {
              indices: [4],
              cx: 19.5,
              cy: 23.5,
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.3, scale: 0.8 },
                { t: 0.6, scale: 1 },
                { t: 0.8, scale: 1.18 },
                { t: 1, scale: 1 },
              ],
            },
          ],
        },
      },
    },
    '1f525': {
      emoji: '1f525',
      name: '火焰',
      desc: '双层火苗反相摇曳，四颗火星从焰心升起——渐小、随风摆、熄灭，循环不息。',
      anatomy: '本体仅外焰/内焰两个 path（绕焰底反相摆动）；火星是程序化新建的四芒星 path，逐帧计算位置与明暗。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              cx: 18,
              cy: 34,
              keyframes: [
                { t: 0, rotate: -2.4, scaleY: 1 },
                { t: 0.25, rotate: 0, scaleY: 1.025 },
                { t: 0.5, rotate: 2.4, scaleY: 1 },
                { t: 0.75, rotate: 0, scaleY: 0.985 },
                { t: 1, rotate: -2.4, scaleY: 1 },
              ],
            },
            {
              indices: [1],
              cx: 18,
              cy: 35,
              keyframes: [
                { t: 0, rotate: 2, scale: 1 },
                { t: 0.5, rotate: -2, scale: 1.05 },
                { t: 1, rotate: 2, scale: 1 },
              ],
            },
          ],
          fx: [
            {
              gen: 'rise',
              params: {
                particles: [
                  { x: 13, phase: 0, size: 1.7, color: '#FFD983' },
                  { x: 21.5, phase: 0.31, size: 1.3, color: '#E85319', drift: 1.3 },
                  { x: 16.5, phase: 0.55, size: 1.8, color: '#FFD983' },
                  { x: 24.5, phase: 0.78, size: 1.1, color: '#E85319', drift: 0.7 },
                ],
                y0: 7,
                y1: -4,
              },
            },
          ],
          viewBox: '0 -5 36 41',
        },
      },
    },
    '1fa99': {
      emoji: '1fa99',
      name: '金币',
      desc: '一道高光斜扫过币面（裁剪在圆内不越界），边缘三颗星光错相闪烁——金光闪闪。',
      anatomy: '本体 15 个元素全部静止；高光条与四芒星都是新建 path，高光用程序化 clipPath 裁在币面圆内。',
      clips: {
        idle: {
          parts: [],
          fx: [
            { gen: 'shine', params: { clip: { cx: 18, cy: 18, r: 16.2 }, id: 'coin-shine' } },
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 5.5, y: 7.5, r: 2.4, phase: 0 },
                  { x: 30.5, y: 25, r: 1.9, phase: 0.33 },
                  { x: 27, y: 5.5, r: 1.6, phase: 0.66 },
                ],
              },
            },
          ],
        },
      },
    },
    '26a1': {
      emoji: '26a1',
      name: '闪电',
      desc: '本体充能鼓胀、亮度脉动，三道小电弧在周围错时炸开，一颗电光闪过。',
      anatomy: '本体是单个 path（缩放+明暗脉冲）；电弧是新建的折线 path，各自只在周期的一小段窗口内闪现。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              cx: 18,
              cy: 18,
              keyframes: [
                { t: 0, scale: 1, opacity: 0.82 },
                { t: 0.18, scale: 1.05, opacity: 1 },
                { t: 0.36, scale: 1, opacity: 0.86 },
                { t: 0.6, scale: 1.04, opacity: 1 },
                { t: 1, scale: 1, opacity: 0.82 },
              ],
            },
          ],
          fx: [
            {
              gen: 'bolts',
              params: {
                bolts: [
                  { points: [[6, 8], [9, 10.5], [7, 13], [10, 15.5]], window: [0.12, 0.24] },
                  { points: [[30.5, 14], [27.5, 16], [29.5, 19], [26.5, 21.5]], window: [0.55, 0.68] },
                  { points: [[10, 27], [13, 28], [11.5, 31]], window: [0.82, 0.92] },
                ],
              },
            },
            { gen: 'sparkles', params: { stars: [{ x: 28, y: 6, r: 2.1, phase: 0.4, color: '#FFE8B6' }] } },
          ],
        },
      },
    },
    '1f4a7': {
      emoji: '1f4a7',
      name: '水滴',
      desc: '一颗水珠淡入、坠落、触底压扁又回弹（挤压拉伸），底部漾开两圈涟漪后消散。',
      anatomy: '本体单 path 走「位移+不等比缩放」的经典 squash & stretch；涟漪椭圆环是新建 path，只在触底后的相位窗内扩散。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              cx: 18,
              cy: 35,
              keyframes: [
                { t: 0, ty: -9, opacity: 0 },
                { t: 0.1, ty: -9, opacity: 1 },
                { t: 0.3, ty: 0, scaleX: 1, scaleY: 1 },
                { t: 0.38, scaleX: 1.24, scaleY: 0.74 },
                { t: 0.48, scaleX: 0.94, scaleY: 1.05 },
                { t: 0.56, scaleX: 1, scaleY: 1 },
                { t: 0.85, scaleX: 1, scaleY: 1, opacity: 1 },
                { t: 0.93, ty: 0, opacity: 0 },
                { t: 1, ty: -9, opacity: 0 },
              ],
            },
          ],
          fx: [
            {
              gen: 'ripples',
              params: {
                cx: 18,
                cy: 33.5,
                color: '#5DADEC',
                rings: [{ phase: 0 }, { phase: 0.16 }],
                window: [0.3, 0.85],
              },
            },
          ],
          viewBox: '0 -8 36 44',
        },
      },
    },
    '1f479': {
      emoji: '1f479',
      name: '恶鬼',
      desc: '红脸怒气起伏，双瞳收缩瞪视，头顶两缕怒气蒸腾而上——丢了座狼、怒火中烧的恶鬼骑手。',
      anatomy: '红脸 path 呼吸缩放；两只瞳孔是独立圆，各绕自身中心收放；蒸汽是新建的 S 形描边 path，升起淡出。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1],
              cx: 18,
              cy: 22,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.018 }, { t: 1, scale: 1 }],
            },
            {
              indices: [6],
              cx: 12.74,
              cy: 17.71,
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.35, scale: 0.72 },
                { t: 0.55, scale: 1.18 },
                { t: 0.75, scale: 1 },
                { t: 1, scale: 1 },
              ],
            },
            {
              indices: [8],
              cx: 23.26,
              cy: 17.71,
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.35, scale: 0.72 },
                { t: 0.55, scale: 1.18 },
                { t: 0.75, scale: 1 },
                { t: 1, scale: 1 },
              ],
            },
            {
              indices: [12],
              keyframes: [{ t: 0, ty: 0 }, { t: 0.35, ty: 0.6 }, { t: 0.55, ty: -0.3 }, { t: 1, ty: 0 }],
            },
          ],
          fx: [
            { gen: 'steam', params: { wisps: [{ x: 10.5, y0: -0.5, phase: 0 }, { x: 25.5, y0: -0.5, phase: 0.5 }] } },
          ],
          viewBox: '0 -7 36 43',
        },
      },
    },
    '1f997': {
      emoji: '1f997',
      name: '跳蝗',
      desc: '薄翅一张一合簌簌颤动，身子一鼓一鼓蓄势欲蹦——跳蝗的待机。',
      anatomy: '翅 path 竖向缩放（振翅）；身躯 path 呼吸缩放。',
      clips: {
        idle: {
          parts: [
            {
              indices: [6],
              cx: 29,
              cy: 20,
              keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 0.88 }, { t: 1, scaleY: 1 }],
            },
            {
              indices: [0],
              cx: 18,
              cy: 22,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.02 }, { t: 1, scale: 1 }],
            },
          ],
        },
      },
    },
    '1f5ff': {
      emoji: '1f5ff',
      name: '石像鬼',
      desc: '沉沉石面若有若无地起伏，眉眼一凝一张透出压迫——石像鬼的待机威压。',
      anatomy: '石面 path 极缓呼吸缩放；眉眼 path 绕自身收放（凝视）。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1],
              cx: 18,
              cy: 30,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.015 }, { t: 1, scale: 1 }],
            },
            {
              indices: [3],
              cx: 18,
              cy: 20,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.05 }, { t: 1, scale: 1 }],
            },
          ],
        },
      },
    },
    '1f421': {
      emoji: '1f421',
      name: '毒河豚',
      desc: '圆滚身子一鼓一鼓地充气，尾鳍左右轻摆——鼓胀毒河豚的待机。',
      anatomy: '身躯 path 鼓胀缩放（充气）；尾鳍 path 绕鳍根左右摆动。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              cx: 15,
              cy: 16,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.04 }, { t: 1, scale: 1 }],
            },
            {
              indices: [3],
              cx: 30,
              cy: 17,
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.25, rotate: 6 },
                { t: 0.5, rotate: 0 },
                { t: 0.75, rotate: -6 },
                { t: 1, rotate: 0 },
              ],
            },
          ],
        },
      },
    },
    '1f333': {
      emoji: '1f333',
      name: '大树',
      desc: '庞大树冠随风沉沉招摇，枝叶簌簌起伏。',
      anatomy: '树冠 path 绕树干基部小幅左右摇摆（招风）；叶簇 g 呼吸缩放（枝叶簌动）；树干静立。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1],
              cx: 18,
              cy: 29,
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.25, rotate: 2 },
                { t: 0.5, rotate: 0 },
                { t: 0.75, rotate: -2 },
                { t: 1, rotate: 0 },
              ],
            },
            {
              indices: [2],
              cx: 18,
              cy: 21,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.06 }, { t: 1, scale: 1 }],
            },
          ],
        },
      },
    },
    '1f982': {
      emoji: '1f982',
      name: '蝎王',
      desc: '尾钩高昂一颤一探，右螯缓缓开合示威，甲背沉沉起伏——荒漠之主蓄势的杀机。',
      anatomy: '尾刺 path 绕尾根小幅昂探（毒钩示威）；右巨螯 path 绕螯根开合；躯干 path 呼吸缩放。',
      clips: {
        idle: {
          parts: [
            {
              indices: [9],
              cx: 15,
              cy: 6,
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.4, rotate: -6 }, { t: 0.7, rotate: 3 }, { t: 1, rotate: 0 }],
            },
            {
              indices: [3],
              cx: 25,
              cy: 13,
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: -4 }, { t: 1, rotate: 0 }],
            },
            {
              indices: [4],
              cx: 18,
              cy: 24,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.02 }, { t: 1, scale: 1 }],
            },
          ],
        },
      },
    },
    '1f40a': {
      emoji: '1f40a',
      name: '巨鳄',
      desc: '庞躯浮沉微微起伏，独眼骤缩冷冷一瞪，背脊鳞甲一阵耸动——潜伏河底的杀机。',
      anatomy: '躯干 path 呼吸缩放（浮水起伏）；眼睛 path 绕自身收放（冷瞪）；背脊鳞甲 g 缩放耸动。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1],
              cx: 18,
              cy: 20,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.02 }, { t: 1, scale: 1 }],
            },
            {
              indices: [2],
              cx: 11.5,
              cy: 18,
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.35, scale: 0.6 },
                { t: 0.55, scale: 1.15 },
                { t: 0.75, scale: 1 },
                { t: 1, scale: 1 },
              ],
            },
            {
              indices: [3],
              cx: 25,
              cy: 24,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.05 }, { t: 1, scale: 1 }],
            },
          ],
        },
      },
    },
    '1f939': {
      emoji: '1f939',
      name: '杂耍演员',
      desc: '三球循环抛接走圆轨，双臂交替上下托举，脑袋随节奏轻点。',
      anatomy: '三球 = 顶部三个纯色 circle（绿/红/蓝）；双臂 = 两侧 F9CA55+FFDC5D 对；头组 = 中部发/脸/嘴/眼。',
      clips: {
        idle: {
          parts: [
            {
              indices: [8],
              keyframes: [
                { t: 0, tx: 0, ty: -2.6 },
                { t: 0.25, tx: 2.6, ty: 0 },
                { t: 0.5, tx: 0, ty: 2.6 },
                { t: 0.75, tx: -2.6, ty: 0 },
                { t: 1, tx: 0, ty: -2.6 },
              ],
            },
            {
              indices: [9],
              keyframes: [
                { t: 0, tx: 2.6, ty: 0 },
                { t: 0.25, tx: 0, ty: 2.6 },
                { t: 0.5, tx: -2.6, ty: 0 },
                { t: 0.75, tx: 0, ty: -2.6 },
                { t: 1, tx: 2.6, ty: 0 },
              ],
            },
            {
              indices: [10],
              keyframes: [
                { t: 0, tx: 0, ty: 2.6 },
                { t: 0.25, tx: -2.6, ty: 0 },
                { t: 0.5, tx: 0, ty: -2.6 },
                { t: 0.75, tx: 2.6, ty: 0 },
                { t: 1, tx: 0, ty: 2.6 },
              ],
            },
            {
              indices: [11, 12],
              keyframes: [
                { t: 0, ty: 0 },
                { t: 0.25, ty: -1.4 },
                { t: 0.5, ty: 0 },
                { t: 0.75, ty: 0.7 },
                { t: 1, ty: 0 },
              ],
              cx: 30,
              cy: 25,
            },
            {
              indices: [13, 14],
              keyframes: [
                { t: 0, ty: 0 },
                { t: 0.25, ty: 0.7 },
                { t: 0.5, ty: 0 },
                { t: 0.75, ty: -1.4 },
                { t: 1, ty: 0 },
              ],
              cx: 6,
              cy: 25,
            },
            {
              indices: [3, 4, 5, 6],
              keyframes: [
                { t: 0, ty: 0, rotate: 0 },
                { t: 0.25, ty: -0.5, rotate: 1.2 },
                { t: 0.5, ty: 0, rotate: 0 },
                { t: 0.75, ty: -0.5, rotate: -1.2 },
                { t: 1, ty: 0, rotate: 0 },
              ],
              cx: 17,
              cy: 18,
            },
          ],
        },
      },
    },
    '1f984': {
      emoji: '1f984',
      name: '独角兽',
      desc: '独角微微昂动，紫鬃如风拂过，角尖星光轮转闪烁。',
      anatomy: '角 = 左上橙红双件（EE7C0E/C43512）；鬃毛 = 大片 60379A；眼 = 292F33 小圆。',
      clips: {
        idle: {
          parts: [
            {
              indices: [6, 7],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.3, rotate: -3 }, { t: 0.6, rotate: 1.5 }, { t: 1, rotate: 0 }],
              cx: 11,
              cy: 10,
            },
            {
              indices: [1],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: 1.6 }, { t: 1, rotate: 0 }],
              cx: 24,
              cy: 8,
            },
            {
              indices: [4],
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.78, scaleY: 1 },
                { t: 0.84, scaleY: 0.12 },
                { t: 0.9, scaleY: 1 },
                { t: 1, scaleY: 1 },
              ],
              cx: 15.3,
              cy: 14.6,
            },
          ],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 3.5, y: 3, r: 1.9, phase: 0 },
                  { x: 9, y: 8.5, r: 1.4, phase: 0.45 },
                  { x: 1.8, y: 9.5, r: 1.2, phase: 0.75 },
                ],
              },
            },
          ],
        },
      },
    },
    '1f9cc': {
      emoji: '1f9cc',
      name: '巨魔萨满',
      desc: '整副身板沉重地喘，眉骨压下又抬起，龅牙一磨一磨，像在默念咒语。',
      anatomy: '眉 = 3E721D 横条；牙口 = 744629 嘴 + FFEBA5 牙；躯干 = 大片 A6D388 绿。',
      clips: {
        idle: {
          parts: [
            {
              indices: [5],
              keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.03 }, { t: 1, scaleY: 1 }],
              cx: 18,
              cy: 32,
            },
            {
              indices: [8],
              keyframes: [{ t: 0, ty: 0 }, { t: 0.35, ty: 0.9 }, { t: 0.6, ty: 0 }, { t: 1, ty: 0 }],
              cx: 18,
              cy: 18,
            },
            {
              indices: [7, 12],
              keyframes: [
                { t: 0, ty: 0 },
                { t: 0.25, ty: -0.5 },
                { t: 0.5, ty: 0.3 },
                { t: 0.75, ty: -0.4 },
                { t: 1, ty: 0 },
              ],
              cx: 18,
              cy: 26.5,
            },
            { indices: [9, 11], keyframes: [{ t: 0, ty: 0 }, { t: 0.5, ty: 0.5 }, { t: 1, ty: 0 }], cx: 18, cy: 14 },
          ],
        },
      },
    },
    '1f920': {
      emoji: '1f920',
      name: '牛仔',
      desc: '压帽檐致意——牛仔帽一沉一抬带着侧倾，脸跟着轻轻点头。',
      anatomy: '帽 = 顶部 825D0E 帽冠 + 664500 帽饰；[1] 是帽檐与五官的连体大件，随头一起动。',
      clips: {
        idle: {
          parts: [
            {
              indices: [2, 3],
              keyframes: [
                { t: 0, ty: 0, rotate: 0 },
                { t: 0.3, ty: 1.1, rotate: -2.5 },
                { t: 0.55, ty: -0.4, rotate: 0.8 },
                { t: 0.75, ty: 0, rotate: 0 },
                { t: 1, ty: 0, rotate: 0 },
              ],
              cx: 18,
              cy: 9,
            },
            {
              indices: [0, 1],
              keyframes: [
                { t: 0, ty: 0 },
                { t: 0.3, ty: 0.5 },
                { t: 0.55, ty: -0.2 },
                { t: 0.75, ty: 0 },
                { t: 1, ty: 0 },
              ],
              cx: 18,
              cy: 24,
            },
          ],
        },
      },
    },
    '1f9d9': {
      emoji: '1f9d9',
      name: '法师',
      desc: '法杖缓缓画圆聚能，杖头蓝珠呼吸发亮，星光绕珠而生。',
      anatomy: '法杖 = 左侧 D99E82 长杆；杖珠 = 55ACEE 大圆 + B0F0FF 高光；帽 = 顶部 FA743E。',
      clips: {
        idle: {
          parts: [
            {
              indices: [10, 11, 12],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: -5 }, { t: 1, rotate: 0 }],
              cx: 4.5,
              cy: 34,
            },
            {
              indices: [9],
              keyframes: [{ t: 0, ty: 0, rotate: 0 }, { t: 0.5, ty: 0.6, rotate: -1 }, { t: 1, ty: 0, rotate: 0 }],
              cx: 18,
              cy: 14,
            },
          ],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 8.5, y: 3, r: 1.8, phase: 0, color: '#B0F0FF' },
                  { x: 1.2, y: 10.5, r: 1.3, phase: 0.4, color: '#B0F0FF' },
                  { x: 7.5, y: 9.5, r: 1.1, phase: 0.7 },
                ],
              },
            },
          ],
        },
      },
    },
    '1f998': {
      emoji: '1f998',
      name: '袋鼠',
      desc: '耳朵前后弹动侦听，小爪快速刨两下，身体绷着蓄跳的劲。',
      anatomy: '耳 = 顶部 BF6952 内耳 + D99E82 耳廓；小爪 = 中部 BF6952 前肢；躯干 = 大件 D99E82。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 4, 5],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.2, rotate: -9 },
                { t: 0.4, rotate: 3 },
                { t: 0.6, rotate: 0 },
                { t: 1, rotate: 0 },
              ],
              cx: 8,
              cy: 6,
            },
            {
              indices: [7],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.55, rotate: 0 },
                { t: 0.65, rotate: 14 },
                { t: 0.75, rotate: -4 },
                { t: 0.85, rotate: 10 },
                { t: 0.95, rotate: 0 },
                { t: 1, rotate: 0 },
              ],
              cx: 8.5,
              cy: 18,
            },
            {
              indices: [1],
              keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.02 }, { t: 1, scaleY: 1 }],
              cx: 18,
              cy: 36,
            },
          ],
        },
      },
    },
    '26c4': {
      emoji: '26c4',
      name: '雪人',
      desc: '树枝手臂上下招摇，红围巾迎风摆动，礼帽轻轻跳动，周身雪光点点。',
      anatomy: '手臂 = 两侧 FFAC33 树枝；围巾 = DD2E44；礼帽 = 顶部 414042 双件。',
      clips: {
        idle: {
          parts: [
            {
              indices: [8],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.25, rotate: -5 },
                { t: 0.5, rotate: 0 },
                { t: 0.75, rotate: 5 },
                { t: 1, rotate: 0 },
              ],
              cx: 18,
              cy: 17,
            },
            {
              indices: [4],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: 2.5 }, { t: 1, rotate: 0 }],
              cx: 18,
              cy: 16,
            },
            {
              indices: [2, 3],
              keyframes: [
                { t: 0, ty: 0, rotate: 0 },
                { t: 0.4, ty: -0.9, rotate: -1.5 },
                { t: 0.6, ty: 0, rotate: 0 },
                { t: 1, ty: 0, rotate: 0 },
              ],
              cx: 18,
              cy: 7,
            },
          ],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 5, y: 12, r: 1.6, phase: 0.1 },
                  { x: 31, y: 20, r: 1.4, phase: 0.5 },
                  { x: 27, y: 5, r: 1.2, phase: 0.8 },
                ],
              },
            },
          ],
        },
      },
    },
    '1f9da': {
      emoji: '1f9da',
      name: '仙子',
      desc: '双翼交替振翅，身体随之轻盈起伏，魔尘星光洒落周身。',
      anatomy: '右翼 = [0]、左翼 = [1]（ABDFFF 大片），分别绕根部反相扇动；其余为身体组。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.25, rotate: 13 },
                { t: 0.5, rotate: 0 },
                { t: 0.75, rotate: -4 },
                { t: 1, rotate: 0 },
              ],
              cx: 17,
              cy: 22,
            },
            {
              indices: [1],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.25, rotate: -13 },
                { t: 0.5, rotate: 0 },
                { t: 0.75, rotate: 4 },
                { t: 1, rotate: 0 },
              ],
              cx: 19,
              cy: 22,
            },
            {
              indices: [2, 3, 4, 5, 6, 7, 8, 9, 10],
              keyframes: [{ t: 0, ty: 0 }, { t: 0.25, ty: -1.1 }, { t: 0.6, ty: 0.4 }, { t: 1, ty: 0 }],
              cx: 18,
              cy: 24,
            },
          ],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 4, y: 7, r: 1.7, phase: 0, color: '#FFE8B6' },
                  { x: 32, y: 9, r: 1.4, phase: 0.33, color: '#FFE8B6' },
                  { x: 30, y: 30, r: 1.5, phase: 0.66 },
                ],
              },
            },
          ],
        },
      },
    },
    '1f977': {
      emoji: '1f977',
      name: '忍者',
      desc: '低伏静息，只有双眼在面罩里左右逡巡；周身偶有一闪的刃光。',
      anatomy: '眼 = 662113 横条（面罩露出的双目）；眼窗皮肤 = FFDC5D；其余黑衣整体压低呼吸。',
      clips: {
        idle: {
          parts: [
            {
              indices: [16],
              keyframes: [
                { t: 0, tx: 0 },
                { t: 0.2, tx: 1.5 },
                { t: 0.45, tx: 1.5 },
                { t: 0.6, tx: -1.5 },
                { t: 0.85, tx: -1.5 },
                { t: 1, tx: 0 },
              ],
            },
            {
              indices: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
              keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.015 }, { t: 1, scaleY: 1 }],
              cx: 18,
              cy: 36,
            },
          ],
          fx: [{ gen: 'sparkles', params: { stars: [{ x: 6.5, y: 30, r: 2, phase: 0.55, color: '#E1E8ED' }] } }],
        },
      },
    },
    '1f9ab': {
      emoji: '1f9ab',
      name: '河狸工程师',
      desc: '扁尾巴有节奏地拍打，龅牙咔哒咔哒啃个不停。',
      anatomy: '尾 = 右下 662113+C1694F 扁桨；龅牙 = 左侧 FFE9B7 小方块；躯干 = 大件 C1694F/93493B。',
      clips: {
        idle: {
          parts: [
            {
              indices: [11, 12],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.2, rotate: 7 },
                { t: 0.4, rotate: -2 },
                { t: 0.55, rotate: 5 },
                { t: 0.75, rotate: 0 },
                { t: 1, rotate: 0 },
              ],
              cx: 14,
              cy: 26,
            },
            {
              indices: [0, 1],
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.12, scaleY: 0.72 },
                { t: 0.24, scaleY: 1 },
                { t: 0.36, scaleY: 0.72 },
                { t: 0.48, scaleY: 1 },
                { t: 1, scaleY: 1 },
              ],
              cx: 3.2,
              cy: 12.5,
            },
            {
              indices: [2, 3],
              keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.02 }, { t: 1, scaleY: 1 }],
              cx: 18,
              cy: 27,
            },
          ],
        },
      },
    },
    '1f41d': {
      emoji: '1f41d',
      name: '蜜蜂',
      desc: '双翼高频振动到发虚，身体悬停般上下轻浮。',
      anatomy: '翅 = 上层 CCD6DD/99AAB5 两片横翼；身 = 31373D 条纹壳 + FFCC4D 腹。',
      clips: {
        idle: {
          parts: [
            {
              indices: [2, 3],
              keyframes: [
                { t: 0, scaleY: 1, opacity: 0.95 },
                { t: 0.1, scaleY: 0.55, opacity: 0.7 },
                { t: 0.2, scaleY: 1, opacity: 0.95 },
                { t: 0.3, scaleY: 0.55, opacity: 0.7 },
                { t: 0.4, scaleY: 1, opacity: 0.95 },
                { t: 0.5, scaleY: 0.55, opacity: 0.7 },
                { t: 0.6, scaleY: 1, opacity: 0.95 },
                { t: 0.7, scaleY: 0.55, opacity: 0.7 },
                { t: 0.8, scaleY: 1, opacity: 0.95 },
                { t: 0.9, scaleY: 0.55, opacity: 0.7 },
                { t: 1, scaleY: 1, opacity: 0.95 },
              ],
              cx: 18,
              cy: 15,
            },
            { indices: [0, 1], keyframes: [{ t: 0, ty: 0 }, { t: 0.5, ty: -1.2 }, { t: 1, ty: 0 }], cx: 18, cy: 22 },
          ],
        },
      },
    },
    '1f9d1_200d_2695_fe0f': {
      emoji: '1f9d1_200d_2695_fe0f',
      name: '军医',
      desc: '俯身听诊——听诊器圆盘随心跳咚咚放大，头部专注地轻点。',
      anatomy: '听诊头 = 左下 CCD6DD/F5F8FA 同心圆；管线 = 292F33 曲线 + 右侧耳件；头组 = 中上发/脸/眼/嘴。',
      clips: {
        idle: {
          parts: [
            {
              indices: [9, 10],
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.08, scale: 1.25 },
                { t: 0.16, scale: 1 },
                { t: 0.26, scale: 1.18 },
                { t: 0.36, scale: 1 },
                { t: 1, scale: 1 },
              ],
              cx: 9,
              cy: 32.5,
            },
            {
              indices: [3, 4, 5, 6, 7],
              keyframes: [
                { t: 0, ty: 0, rotate: 0 },
                { t: 0.3, ty: 0.7, rotate: 2 },
                { t: 0.6, ty: 0, rotate: 0 },
                { t: 1, ty: 0, rotate: 0 },
              ],
              cx: 18,
              cy: 20,
            },
          ],
          fx: [{ gen: 'sparkles', params: { stars: [{ x: 4, y: 26, r: 1.5, phase: 0.05, color: '#DD2E44' }] } }],
        },
      },
    },
    '1fabc': {
      emoji: '1fabc',
      name: '水母',
      desc: '钟形伞盖一缩一张地泳动，触须反相摆尾，高光随之明灭。',
      anatomy: '伞盖 = [1][2][4] 上半球；触须 = [0] 下方大片；高光 = 白色小件。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1, 2, 4],
              keyframes: [
                { t: 0, scaleX: 1, scaleY: 1 },
                { t: 0.3, scaleX: 0.93, scaleY: 1.07 },
                { t: 0.55, scaleX: 1.04, scaleY: 0.96 },
                { t: 0.8, scaleX: 1, scaleY: 1 },
                { t: 1, scaleX: 1, scaleY: 1 },
              ],
              cx: 18,
              cy: 10,
            },
            {
              indices: [0],
              keyframes: [
                { t: 0, rotate: 0, ty: 0 },
                { t: 0.3, rotate: 2, ty: 0.8 },
                { t: 0.55, rotate: -2, ty: -0.4 },
                { t: 0.8, rotate: 0, ty: 0 },
                { t: 1, rotate: 0, ty: 0 },
              ],
              cx: 18,
              cy: 16,
            },
            {
              indices: [3, 5, 6],
              keyframes: [
                { t: 0, opacity: 1 },
                { t: 0.4, opacity: 0.55 },
                { t: 0.8, opacity: 1 },
                { t: 1, opacity: 1 },
              ],
            },
          ],
          fx: [
            {
              gen: 'bolts',
              params: {
                bolts: [
                  { points: [[2.5, 25], [5, 27], [3.5, 30]], window: [0.15, 0.26], color: '#B0F0FF', width: 1.4 },
                  {
                    points: [[33, 22], [30.6, 24.5], [32.5, 27.5]],
                    window: [0.62, 0.74],
                    color: '#B0F0FF',
                    width: 1.4,
                  },
                ],
              },
            },
          ],
        },
      },
    },
    '1f607': {
      emoji: '1f607',
      name: '天使',
      desc: '光环悬浮飘荡微微倾侧，双翼轻扇，整张笑脸安详浮动。',
      anatomy: '光环 = FFAC33 椭环；翼 = 顶部 5DADEC/3B94D9 蓝色双翼层；脸 = FFCC4D 大圆。',
      clips: {
        idle: {
          parts: [
            {
              indices: [2],
              keyframes: [
                { t: 0, ty: 0, rotate: 0 },
                { t: 0.3, ty: -1.2, rotate: 2 },
                { t: 0.6, ty: 0.3, rotate: -1 },
                { t: 1, ty: 0, rotate: 0 },
              ],
              cx: 18,
              cy: 10,
            },
            {
              indices: [3, 4],
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.25, scaleY: 0.85 },
                { t: 0.5, scaleY: 1 },
                { t: 0.75, scaleY: 0.9 },
                { t: 1, scaleY: 1 },
              ],
              cx: 18,
              cy: 11,
            },
            { indices: [0, 1, 5], keyframes: [{ t: 0, ty: 0 }, { t: 0.5, ty: -0.8 }, { t: 1, ty: 0 }], cx: 18, cy: 18 },
          ],
        },
      },
    },
    '1f911': {
      emoji: '1f911',
      name: '财迷',
      desc: '美元长舌馋得直晃，钞票眼一跳一跳放光，金币星芒围着打转。',
      anatomy: '舌 = 5D9040 绿钞舌 + FFF 美元符；眼 = 664500 上部双 $；脸 = FFCC4D 大圆。',
      clips: {
        idle: {
          parts: [
            {
              indices: [2, 4],
              keyframes: [
                { t: 0, rotate: 0, ty: 0 },
                { t: 0.25, rotate: -4, ty: 0.5 },
                { t: 0.5, rotate: 0, ty: 0 },
                { t: 0.75, rotate: 4, ty: 0.5 },
                { t: 1, rotate: 0, ty: 0 },
              ],
              cx: 18,
              cy: 24,
            },
            {
              indices: [3],
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.12, scale: 1.12 },
                { t: 0.24, scale: 1 },
                { t: 0.36, scale: 1.08 },
                { t: 0.5, scale: 1 },
                { t: 1, scale: 1 },
              ],
              cx: 17.7,
              cy: 13,
            },
          ],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 4, y: 6, r: 1.8, phase: 0.2, color: '#FFD983' },
                  { x: 32, y: 8, r: 1.5, phase: 0.6, color: '#FFD983' },
                ],
              },
            },
          ],
        },
      },
    },
    '1f973': {
      emoji: '1f973',
      name: '派对之星',
      desc: '派对帽得意地摇，吹卷横笛一伸一缩，彩纸拉花满场飞舞。',
      anatomy: '帽 = 左上 DD2E44/EA596E 锥体；吹卷 = 右侧 3B88C3/88C9F9 组；彩纸 = 蓝色小圆点；拉花 = EA596E 长带。',
      clips: {
        idle: {
          parts: [
            {
              indices: [4, 5],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.3, rotate: -4 }, { t: 0.6, rotate: 2 }, { t: 1, rotate: 0 }],
              cx: 8,
              cy: 14,
            },
            {
              indices: [6, 7, 8, 9, 10],
              keyframes: [
                { t: 0, scaleX: 1 },
                { t: 0.2, scaleX: 1.12 },
                { t: 0.4, scaleX: 0.96 },
                { t: 0.6, scaleX: 1.06 },
                { t: 0.8, scaleX: 1 },
                { t: 1, scaleX: 1 },
              ],
              cx: 17,
              cy: 26.5,
            },
            {
              indices: [11],
              keyframes: [
                { t: 0, tx: 0, ty: -1.6 },
                { t: 0.25, tx: 1.6, ty: 0 },
                { t: 0.5, tx: 0, ty: 1.6 },
                { t: 0.75, tx: -1.6, ty: 0 },
                { t: 1, tx: 0, ty: -1.6 },
              ],
            },
            {
              indices: [12],
              keyframes: [
                { t: 0, tx: 0, ty: 1.8 },
                { t: 0.25, tx: 1.8, ty: 0 },
                { t: 0.5, tx: 0, ty: -1.8 },
                { t: 0.75, tx: -1.8, ty: 0 },
                { t: 1, tx: 0, ty: 1.8 },
              ],
            },
            {
              indices: [14],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: 8 }, { t: 1, rotate: 0 }],
              cx: 34,
              cy: 13,
            },
            {
              indices: [13],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: -2.5 }, { t: 1, rotate: 0 }],
              cx: 13,
              cy: 16,
            },
          ],
        },
      },
    },
    '1f913': {
      emoji: '1f913',
      name: '神童',
      desc: '推眼镜！镜框一沉一提回到鼻梁，镜片闪过高光，得意地歪头。',
      anatomy: '镜组 = 65471B 大框 + FFF 门牙独立；脸 = FFCC4D 大圆随头微转。',
      clips: {
        idle: {
          parts: [
            {
              indices: [4],
              keyframes: [
                { t: 0, ty: 0 },
                { t: 0.3, ty: 1.2 },
                { t: 0.45, ty: -0.4 },
                { t: 0.6, ty: 0 },
                { t: 1, ty: 0 },
              ],
              cx: 18,
              cy: 17,
            },
            {
              indices: [0, 1, 2, 3],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.45, rotate: 1.6 }, { t: 0.8, rotate: -0.6 }, { t: 1, rotate: 0 }],
              cx: 18,
              cy: 20,
            },
          ],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 11, y: 13, r: 1.7, phase: 0.35, color: '#FFFFFF' },
                  { x: 25.5, y: 13, r: 1.4, phase: 0.5, color: '#FFFFFF' },
                ],
              },
            },
          ],
        },
      },
    },
    '1f9d0': {
      emoji: '1f9d0',
      name: '学者',
      desc: '单边挑眉审视，单片镜微微推近又退开，镜面泛起考据的光。',
      anatomy: '眉 = 左上 65471B 斜条；单片镜 = F4F7F9 大圆 + BDDDF4 镜面 + 67757F 镜架 + 292F33 吊链。',
      clips: {
        idle: {
          parts: [
            {
              indices: [3],
              keyframes: [
                { t: 0, ty: 0, rotate: 0 },
                { t: 0.3, ty: -1.1, rotate: -3 },
                { t: 0.55, ty: 0, rotate: 0 },
                { t: 1, ty: 0, rotate: 0 },
              ],
              cx: 11,
              cy: 8,
            },
            {
              indices: [2, 5, 7],
              keyframes: [{ t: 0, scale: 1 }, { t: 0.35, scale: 1.06 }, { t: 0.65, scale: 0.98 }, { t: 1, scale: 1 }],
              cx: 24.9,
              cy: 14.3,
            },
            {
              indices: [1],
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.72, scaleY: 1 },
                { t: 0.78, scaleY: 0.15 },
                { t: 0.84, scaleY: 1 },
                { t: 1, scaleY: 1 },
              ],
              cx: 12.2,
              cy: 14.7,
            },
          ],
          fx: [{ gen: 'sparkles', params: { stars: [{ x: 28.5, y: 10.5, r: 1.6, phase: 0.3 }] } }],
        },
      },
    },
    '1f47e': {
      emoji: '1f47e',
      name: '入侵者',
      desc: '像素步进行军——左右顿挫横移带着一压一弹，周身紫电偶闪。',
      anatomy: '全身单件像素造型，只能整体驱动：步进平移 + 挤压拉伸模拟街机帧切换。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              keyframes: [
                { t: 0, tx: 0, scaleY: 1 },
                { t: 0.2, tx: 1.4, scaleY: 0.94 },
                { t: 0.3, tx: 1.4, scaleY: 1 },
                { t: 0.5, tx: 0, scaleY: 0.94 },
                { t: 0.7, tx: -1.4, scaleY: 1 },
                { t: 0.8, tx: -1.4, scaleY: 0.94 },
                { t: 1, tx: 0, scaleY: 1 },
              ],
              cx: 18,
              cy: 35,
            },
          ],
          fx: [
            {
              gen: 'bolts',
              params: {
                bolts: [
                  { points: [[3, 6], [6, 8], [4, 11]], window: [0.32, 0.42], color: '#C29FFF' },
                  { points: [[33, 12], [30, 14], [32, 17]], window: [0.82, 0.92], color: '#C29FFF' },
                ],
              },
            },
          ],
        },
      },
    },
    '1f417': {
      emoji: '1f417',
      name: '野猪',
      desc: '鼻头使劲哼哧抽动，鬃毛竖起又伏下，怒气从头顶蒸腾。',
      anatomy: '鼻 = 中下 C1694F 椭圆件；鬃 = 顶部 662113 横条；獠牙眉眼在 292F33 件。',
      clips: {
        idle: {
          parts: [
            {
              indices: [5],
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.12, scale: 1.14 },
                { t: 0.24, scale: 1 },
                { t: 0.36, scale: 1.1 },
                { t: 0.5, scale: 1 },
                { t: 1, scale: 1 },
              ],
              cx: 18,
              cy: 24.6,
            },
            {
              indices: [1],
              keyframes: [{ t: 0, ty: 0 }, { t: 0.4, ty: -0.9 }, { t: 0.7, ty: 0 }, { t: 1, ty: 0 }],
              cx: 18,
              cy: 8,
            },
          ],
          fx: [{ gen: 'steam', params: { wisps: [{ x: 10, y0: 1.5, phase: 0 }, { x: 26, y0: 1.5, phase: 0.5 }] } }],
          viewBox: '0 -7 36 43',
        },
      },
    },
    '1f344': {
      emoji: '1f344',
      name: '蘑菇',
      desc: '菌盖一压一弹像果冻，菌柄反相支撑，孢子微光飘散。',
      anatomy: '盖 = DD2E44 红盖 + 斑点组；柄 = 99AAB5 下件。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1, 2],
              keyframes: [
                { t: 0, scaleX: 1, scaleY: 1, ty: 0 },
                { t: 0.25, scaleX: 1.06, scaleY: 0.9, ty: 1.2 },
                { t: 0.5, scaleX: 0.97, scaleY: 1.05, ty: -0.6 },
                { t: 0.75, scaleX: 1.02, scaleY: 0.98, ty: 0.2 },
                { t: 1, scaleX: 1, scaleY: 1, ty: 0 },
              ],
              cx: 18,
              cy: 20,
            },
            {
              indices: [0],
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.25, scaleY: 0.95 },
                { t: 0.5, scaleY: 1.02 },
                { t: 0.75, scaleY: 1 },
                { t: 1, scaleY: 1 },
              ],
              cx: 18,
              cy: 36,
            },
          ],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 5, y: 6, r: 1.3, phase: 0.15, color: '#F4ABBA' },
                  { x: 31.5, y: 9, r: 1.1, phase: 0.65, color: '#F4ABBA' },
                ],
              },
            },
          ],
        },
      },
    },
    '1f400': {
      emoji: '1f400',
      name: '老鼠',
      desc: '粉尾巴贼溜溜地甩来甩去，耳朵警觉抖动，鼻尖不停嗅探。',
      anatomy: '尾 = 右下 EA596E 长条；耳 = 上部 66757F 小件 + E6AAAA 内耳；鼻尖朝左。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.25, rotate: 6 },
                { t: 0.5, rotate: -3 },
                { t: 0.75, rotate: 4 },
                { t: 1, rotate: 0 },
              ],
              cx: 10,
              cy: 30,
            },
            {
              indices: [3, 4],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.15, rotate: -8 },
                { t: 0.3, rotate: 2 },
                { t: 0.45, rotate: 0 },
                { t: 1, rotate: 0 },
              ],
              cx: 12,
              cy: 19,
            },
            {
              indices: [1],
              keyframes: [
                { t: 0, ty: 0 },
                { t: 0.1, ty: -0.4 },
                { t: 0.2, ty: 0.2 },
                { t: 0.3, ty: -0.3 },
                { t: 0.4, ty: 0 },
                { t: 1, ty: 0 },
              ],
              cx: 6,
              cy: 24,
            },
          ],
        },
      },
    },
    '1fae7': {
      emoji: '1fae7',
      name: '泡泡',
      desc: '两颗泡泡各自果冻般摇摆变形，缓缓浮沉，高光流转。',
      anatomy: '大泡 = [1] 左上圆组；小泡 = [0] 左下圆组；[2..4] 为泡面高光白件。',
      clips: {
        idle: {
          parts: [
            {
              indices: [1],
              keyframes: [
                { t: 0, scaleX: 1, scaleY: 1, ty: 0 },
                { t: 0.25, scaleX: 1.05, scaleY: 0.95, ty: -0.7 },
                { t: 0.5, scaleX: 0.95, scaleY: 1.05, ty: 0 },
                { t: 0.75, scaleX: 1.03, scaleY: 0.97, ty: 0.5 },
                { t: 1, scaleX: 1, scaleY: 1, ty: 0 },
              ],
              cx: 10.5,
              cy: 11.5,
            },
            {
              indices: [0],
              keyframes: [
                { t: 0, scaleX: 1, scaleY: 1, ty: 0 },
                { t: 0.25, scaleX: 0.94, scaleY: 1.06, ty: 0.6 },
                { t: 0.5, scaleX: 1.06, scaleY: 0.94, ty: 0 },
                { t: 0.75, scaleX: 0.98, scaleY: 1.02, ty: -0.5 },
                { t: 1, scaleX: 1, scaleY: 1, ty: 0 },
              ],
              cx: 18,
              cy: 29,
            },
            { indices: [2, 3, 4], keyframes: [{ t: 0, opacity: 1 }, { t: 0.5, opacity: 0.6 }, { t: 1, opacity: 1 }] },
          ],
        },
      },
    },
    '1f411': {
      emoji: '1f411',
      name: '绵羊',
      desc: '呆呆地啃草——脑袋一点一点，羊毛云朵般起伏，偶尔眨眼。',
      anatomy: '头 = 左侧 FFAC33/FFCC4D 脸与角；毛身 = E1E8ED 大云朵；眼 = 292F33 小圆。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 3],
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.3, rotate: 6 },
                { t: 0.5, rotate: 2 },
                { t: 0.7, rotate: 6 },
                { t: 0.9, rotate: 0 },
                { t: 1, rotate: 0 },
              ],
              cx: 16,
              cy: 15,
            },
            {
              indices: [1],
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.025 }, { t: 1, scale: 1 }],
              cx: 20,
              cy: 24,
            },
            {
              indices: [2],
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.75, scaleY: 1 },
                { t: 0.8, scaleY: 0.15 },
                { t: 0.85, scaleY: 1 },
                { t: 1, scaleY: 1 },
              ],
              cx: 4.5,
              cy: 15.8,
            },
          ],
        },
      },
    },
    '1f3f9': {
      emoji: '1f3f9',
      name: '弩塔',
      desc: '待机时箭在弦上轻浮；开火周期内缓缓拉满弓，末了撒放震颤。',
      anatomy: '箭 = 99AAB5 镞（左上）+ 红橙羽组（右下）沿对角为一体；弦 = CCD6DD 斜线；弓臂 = C1694F/D99E82。',
      clips: {
        idle: {
          parts: [
            {
              indices: [2, 3, 4, 5, 6, 7, 8, 9],
              keyframes: [{ t: 0, tx: 0, ty: 0 }, { t: 0.5, tx: 0.5, ty: 0.5 }, { t: 1, tx: 0, ty: 0 }],
            },
          ],
          fx: [{ gen: 'sparkles', params: { stars: [{ x: 6, y: 6, r: 1.3, phase: 0.3, color: '#E1E8ED' }] } }],
        },
        attack: {
          kind: 'cycle',
          frames: 12,
          parts: [
            {
              indices: [2, 3, 4, 5, 6, 7, 8, 9],
              keyframes: [
                { t: 0, tx: 0, ty: 0 },
                { t: 0.35, tx: 1.4, ty: 1.4 },
                { t: 0.7, tx: 2.6, ty: 2.6 },
                { t: 0.9, tx: 3.1, ty: 3.1 },
                { t: 0.94, tx: -1.2, ty: -1.2 },
                { t: 1, tx: 0, ty: 0 },
              ],
            },
            {
              indices: [10],
              keyframes: [
                { t: 0, tx: 0, ty: 0 },
                { t: 0.7, tx: 1.5, ty: 1.5 },
                { t: 0.9, tx: 1.8, ty: 1.8 },
                { t: 0.93, tx: -0.9, ty: -0.9 },
                { t: 0.96, tx: 0.5, ty: 0.5 },
                { t: 1, tx: 0, ty: 0 },
              ],
            },
            {
              indices: [0, 1],
              keyframes: [{ t: 0, scale: 1 }, { t: 0.9, scale: 0.975 }, { t: 0.94, scale: 1.015 }, { t: 1, scale: 1 }],
              cx: 18,
              cy: 18,
            },
          ],
        },
      },
    },
    '1faba': {
      emoji: '1faba',
      name: '蛛卵',
      desc: '窝里的两枚卵轻轻晃动，像随时要孵出什么；边上的叶子随风微摆。',
      anatomy: '巢碗 = 中部 DEAD74 编织；两枚蛋 = 蓝色组（右 11-13、左 14-16）；叶 = 77B255 绿。',
      clips: {
        idle: {
          parts: [
            {
              indices: [11, 12, 13],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.3, rotate: 4 }, { t: 0.6, rotate: -3 }, { t: 1, rotate: 0 }],
              cx: 20,
              cy: 12,
            },
            {
              indices: [14, 15, 16],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.3, rotate: -4 }, { t: 0.6, rotate: 3 }, { t: 1, rotate: 0 }],
              cx: 15,
              cy: 13,
            },
            {
              indices: [2],
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: 5 }, { t: 1, rotate: 0 }],
              cx: 30,
              cy: 30,
            },
          ],
        },
      },
    },
    '1f4a3': {
      emoji: '1f4a3',
      name: '自爆怪',
      desc: '引信火花在炸弹上方明灭，像随时会引爆。',
      anatomy: '本体静止；火花为新建四芒星，绝对坐标叠在炸弹顶部引信处，不依赖本体部件（占位动画，日后可在 Studio 精修）。',
      clips: {
        idle: {
          parts: [],
          fx: [
            {
              gen: 'sparkles',
              params: {
                stars: [
                  { x: 25, y: 6, r: 2.2, phase: 0, color: '#FFD983' },
                  { x: 29, y: 9, r: 1.7, phase: 0.4, color: '#FFA000' },
                  { x: 21, y: 8, r: 1.5, phase: 0.7, color: '#FF7043' },
                ],
              },
            },
          ],
        },
      },
    },
    '1f976': {
      emoji: '1f976',
      name: '定格',
      desc: '冻得微微发抖，整张脸缓缓浮沉——时间在它周围凝住。',
      anatomy: '脸 = FFCC4D 大圆；冰霜 = 顶部/下颌 5DADEC 蓝色冻痕；眉眼口 = 深色部件。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 1, 2, 3, 4, 5, 6, 7],
              cx: 18,
              cy: 18,
              keyframes: [
                { t: 0, ty: 0, rotate: -1.2, scale: 1 },
                { t: 0.25, ty: -0.5, rotate: 1.2, scale: 1.012 },
                { t: 0.5, ty: 0, rotate: -1.2, scale: 1 },
                { t: 0.75, ty: 0.4, rotate: 1.2, scale: 0.99 },
                { t: 1, ty: 0, rotate: -1.2, scale: 1 },
              ],
            },
          ],
        },
      },
    },
    '1f6f8': {
      emoji: '1f6f8',
      name: '飞碟',
      desc: '碟穹一鼓一瘪地微微起伏，腹下一圈灯珠明灭轮转——悬停待命的碟形来客。',
      anatomy: '碟穹 ellipse[4,5,6] 呼吸缩放；腹下灯珠 circle[8,9,10] 明灭闪烁。',
      clips: {
        idle: {
          parts: [
            {
              indices: [4, 5, 6],
              cx: 18,
              cy: 11,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.06 }, { t: 1, scale: 1 }],
            },
            {
              indices: [8, 9, 10],
              cx: 24,
              cy: 19,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.4, scale: 1.3 }, { t: 0.7, scale: 0.7 }, { t: 1, scale: 1 }],
            },
          ],
        },
      },
    },
    '1f47d': {
      emoji: '1f47d',
      name: '小灰人',
      desc: '灰皮小脑袋一鼓一瘪地轻晃，黑亮巨眼一张一缩——贴脸窥探的异星客。',
      anatomy: '头 path[0] 呼吸缩放 + 上下轻浮；巨眼五官 path[1] 收放。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              cx: 18,
              cy: 18,
              keyframes: [{ t: 0, scale: 1, ty: 0 }, { t: 0.5, scale: 1.03, ty: 0.5 }, { t: 1, scale: 1, ty: 0 }],
            },
            {
              indices: [1],
              cx: 14,
              cy: 16,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.1 }, { t: 1, scale: 1 }],
            },
          ],
        },
      },
    },
    '2604': {
      emoji: '2604',
      name: '流星',
      desc: '炽白核心一搏一搏地脉动，尾焰一阵微颤——拖焰待发的疾冲之星。',
      anatomy: '核心 path[3] 脉动缩放；尾焰 path[0,1] 微颤缩放 + 轻转。',
      clips: {
        idle: {
          parts: [
            {
              indices: [3],
              cx: 8,
              cy: 26,
              keyframes: [{ t: 0, scale: 1 }, { t: 0.35, scale: 1.16 }, { t: 0.65, scale: 0.9 }, { t: 1, scale: 1 }],
            },
            {
              indices: [0, 1],
              cx: 24,
              cy: 8,
              keyframes: [
                { t: 0, scale: 1, rotate: 0 },
                { t: 0.5, scale: 1.05, rotate: 3 },
                { t: 1, scale: 1, rotate: 0 },
              ],
            },
          ],
        },
      },
    },
    '1f300': {
      emoji: '1f300',
      name: '漩涡',
      desc: '螺旋漩涡缓缓自转、一涨一缩地吞吐。',
      anatomy: '整涡 path[0] 缓转摆动 + 吞吐缩放（单元素旋涡，绕心自旋）。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              cx: 18,
              cy: 18,
              keyframes: [
                { t: 0, rotate: 0, scale: 1 },
                { t: 0.25, rotate: 12, scale: 1.05 },
                { t: 0.5, rotate: 0, scale: 1 },
                { t: 0.75, rotate: -12, scale: 0.97 },
                { t: 1, rotate: 0, scale: 1 },
              ],
            },
          ],
        },
      },
    },
    '1f9d1_200d_1f692': {
      emoji: '1f9d1_200d_1f692',
      name: '消防员',
      desc: '肩膀随呼吸稳稳起伏，偶尔眨一下眼，头盔高光一闪一闪——随时准备冲进火场。',
      anatomy: '外套与反光条 [0,1,2]、领口 [4]、脖子 [5,6]、背带 [12]、外套前襟 [15] 用同一套呼吸缩放（绕底边，各自留在原图层）；眼睛 [10] 眨眼；头盔高光 [14] 明灭。',
      clips: {
        idle: {
          parts: [
            { indices: [0, 1, 2], cx: 18, cy: 36, keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.02 }, { t: 1, scaleY: 1 }] },
            { indices: [4], cx: 18, cy: 36, keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.02 }, { t: 1, scaleY: 1 }] },
            { indices: [5, 6], cx: 18, cy: 36, keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.02 }, { t: 1, scaleY: 1 }] },
            {
              indices: [10],
              cx: 18,
              cy: 15.9,
              keyframes: [{ t: 0, scaleY: 1 }, { t: 0.6, scaleY: 1 }, { t: 0.7, scaleY: 0.1 }, { t: 0.8, scaleY: 1 }, { t: 1, scaleY: 1 }],
            },
            { indices: [12], cx: 18, cy: 36, keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.02 }, { t: 1, scaleY: 1 }] },
            { indices: [14], keyframes: [{ t: 0, opacity: 1 }, { t: 0.5, opacity: 0.5 }, { t: 1, opacity: 1 }] },
            { indices: [15], cx: 18, cy: 36, keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1.02 }, { t: 1, scaleY: 1 }] },
          ],
        },
      },
    },
    '1f577': {
      emoji: '1f577',
      name: '蛛后',
      desc: '长腿左右轮流屈伸，螯牙一开一合，圆鼓鼓的腹部一胀一缩——伏在网心的猎手。',
      anatomy: '左侧三条腿 [0,1,2] 绕左胸根摆动；右侧三条腿 [4,5,6] 绕右胸根反相摆动；[3] 是左下与右上两条腿合成的一个 path，绕中心小幅扭动；腹部 ellipse[7] 缩放；螯牙 [9] 横向开合。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 1, 2],
              cx: 16,
              cy: 17,
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.25, rotate: 4 }, { t: 0.5, rotate: 0 }, { t: 0.75, rotate: -3 }, { t: 1, rotate: 0 }],
            },
            {
              indices: [3],
              cx: 18,
              cy: 18,
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.25, rotate: -2 }, { t: 0.5, rotate: 0 }, { t: 0.75, rotate: 2 }, { t: 1, rotate: 0 }],
            },
            {
              indices: [4, 5, 6],
              cx: 20,
              cy: 17,
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.25, rotate: -4 }, { t: 0.5, rotate: 0 }, { t: 0.75, rotate: 3 }, { t: 1, rotate: 0 }],
            },
            { indices: [7], cx: 18, cy: 25.2, keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.05 }, { t: 1, scale: 1 }] },
            {
              indices: [9],
              cx: 18,
              cy: 13,
              keyframes: [{ t: 0, scaleX: 1 }, { t: 0.3, scaleX: 1 }, { t: 0.4, scaleX: 0.7 }, { t: 0.5, scaleX: 1 }, { t: 1, scaleX: 1 }],
            },
          ],
        },
      },
    },
    '1f996': {
      emoji: '1f996',
      name: '暴龙',
      desc: '巨躯沉沉起伏，身子一俯一仰，像随时要扑出去——蓄势冲撞的残垣之主。',
      anatomy: '整只 [0..10] 作为一个部件绕脚底呼吸缩放并微微前俯（单部件，图层顺序不变）。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
              cx: 20,
              cy: 35,
              keyframes: [{ t: 0, rotate: 0, scaleY: 1 }, { t: 0.5, rotate: -1.5, scaleY: 1.02 }, { t: 1, rotate: 0, scaleY: 1 }],
            },
          ],
        },
      },
    },
    '2622': {
      emoji: '2622',
      name: '失控核心',
      desc: '橙色外壳咚咚两下胀缩，三叶标志来回狂颤，中心灯忽明忽暗，外圈电弧噼啪乱窜——随时会炸的反应堆。',
      anatomy: '外壳 circle[0] 两连跳缩放；三叶 path[1] 绕中心 (18,18) 来回扭转；中心圆 circle[2] 明灭；电弧是新建折线，贴着外壳边缘错时闪现。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0],
              cx: 18,
              cy: 18,
              keyframes: [
                { t: 0, scale: 1 },
                { t: 0.1, scale: 1.035 },
                { t: 0.2, scale: 1 },
                { t: 0.3, scale: 1.035 },
                { t: 0.4, scale: 1 },
                { t: 1, scale: 1 },
              ],
            },
            {
              indices: [1],
              cx: 18,
              cy: 18,
              keyframes: [{ t: 0, rotate: 0 }, { t: 0.25, rotate: 25 }, { t: 0.5, rotate: 0 }, { t: 0.75, rotate: -25 }, { t: 1, rotate: 0 }],
            },
            { indices: [2], keyframes: [{ t: 0, opacity: 1 }, { t: 0.3, opacity: 0.3 }, { t: 0.6, opacity: 1 }, { t: 1, opacity: 1 }] },
          ],
          fx: [
            {
              gen: 'bolts',
              params: {
                bolts: [
                  { points: [[3.5, 12], [6.5, 13.5], [4.5, 16], [7.5, 18]], window: [0.05, 0.15], color: '#FFF59D', width: 1.3 },
                  { points: [[32.5, 20], [29.5, 21.5], [31.5, 24], [28.5, 26]], window: [0.45, 0.55], color: '#FFF59D', width: 1.3 },
                  { points: [[13, 32.5], [15.5, 29.5], [18, 32], [21, 29.5]], window: [0.75, 0.85], color: '#FFF59D', width: 1.3 },
                ],
              },
            },
          ],
        },
      },
    },
    '1f9db': {
      emoji: '1f9db',
      name: '夜伯爵',
      desc: '血红双瞳一明一暗，披风高领缓缓鼓起，嘴角一咧露出獠牙——暗夜里的猎食者。',
      anatomy: '披风 path[1] 绕颈部横向鼓动；红瞳 path[8] 明灭；嘴 path[10] 绕上沿张合，四片獠牙 [11..14] 随嘴下移。',
      clips: {
        idle: {
          parts: [
            { indices: [1], cx: 18, cy: 20, keyframes: [{ t: 0, scaleX: 1 }, { t: 0.5, scaleX: 1.035 }, { t: 1, scaleX: 1 }] },
            { indices: [8], keyframes: [{ t: 0, opacity: 1 }, { t: 0.5, opacity: 0.45 }, { t: 1, opacity: 1 }] },
            {
              indices: [10],
              cx: 18,
              cy: 21.3,
              keyframes: [{ t: 0, scaleY: 1 }, { t: 0.5, scaleY: 1 }, { t: 0.7, scaleY: 1.15 }, { t: 0.9, scaleY: 1 }, { t: 1, scaleY: 1 }],
            },
            {
              indices: [11, 12, 13, 14],
              keyframes: [{ t: 0, ty: 0 }, { t: 0.5, ty: 0 }, { t: 0.7, ty: 0.45 }, { t: 0.9, ty: 0 }, { t: 1, ty: 0 }],
            },
          ],
        },
      },
    },
    '1f573': {
      emoji: '1f573',
      name: '奇点',
      desc: '黑洞一胀一缩地吞吐，洞口一圈圈引力波向外荡开——沉在星海深处的坍缩之眼。',
      anatomy: '洞口三层 [0,1,2] 绕中心整体吞吐缩放；引力波是新建的紫色椭圆环，叠在洞口前层向外扩散。',
      clips: {
        idle: {
          parts: [{ indices: [0, 1, 2], cx: 18, cy: 18.5, keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 0.94 }, { t: 1, scale: 1 }] }],
          fx: [
            {
              gen: 'ripples',
              layer: 'front',
              params: { cx: 18, cy: 18.5, color: '#B388FF', rings: [{ phase: 0 }, { phase: -0.5 }], window: [0, 0.5] },
            },
          ],
        },
      },
    },
    '1f9a0': {
      emoji: '1f9a0',
      name: '细菌',
      desc: '整只菌体像果冻一样挤压拉伸，纤毛摆得比身子更欢——随时准备一分为二。',
      anatomy: '纤毛 [0..6] 与菌体 [7..13]（描边、菌体、核、胞内小泡）各为一个部件，绕同一中心挤压拉伸；纤毛多转几度，看起来在划水。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 1, 2, 3, 4, 5, 6],
              cx: 17.4,
              cy: 18,
              keyframes: [
                { t: 0, scaleX: 1, scaleY: 1, rotate: 0 },
                { t: 0.25, scaleX: 1.04, scaleY: 0.96, rotate: 5 },
                { t: 0.5, scaleX: 1, scaleY: 1, rotate: 0 },
                { t: 0.75, scaleX: 0.96, scaleY: 1.04, rotate: -5 },
                { t: 1, scaleX: 1, scaleY: 1, rotate: 0 },
              ],
            },
            {
              indices: [7, 8, 9, 10, 11, 12, 13],
              cx: 17.4,
              cy: 18,
              keyframes: [
                { t: 0, scaleX: 1, scaleY: 1, rotate: 0 },
                { t: 0.25, scaleX: 1.04, scaleY: 0.96, rotate: 2 },
                { t: 0.5, scaleX: 1, scaleY: 1, rotate: 0 },
                { t: 0.75, scaleX: 0.96, scaleY: 1.04, rotate: -2 },
                { t: 1, scaleX: 1, scaleY: 1, rotate: 0 },
              ],
            },
          ],
        },
      },
    },
    '1fab1': {
      emoji: '1fab1',
      name: '黏液虫',
      desc: '软趴趴的身子一缩一伸地蠕动，黏糊糊地往前挪。',
      anatomy: '整条虫 [0..4] 作为一个部件绕底部中点做蠕动式挤压拉伸（单部件，图层顺序不变）。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 1, 2, 3, 4],
              cx: 17.7,
              cy: 35,
              keyframes: [
                { t: 0, scaleX: 1, scaleY: 1 },
                { t: 0.3, scaleX: 1.05, scaleY: 0.94 },
                { t: 0.6, scaleX: 0.97, scaleY: 1.02 },
                { t: 1, scaleX: 1, scaleY: 1 },
              ],
            },
          ],
        },
      },
    },
    '1f5d1': {
      emoji: '1f5d1',
      name: '垃圾桶',
      desc: '桶身时不时一阵乱晃，像里面有东西在翻腾，晃完又静下来。',
      anatomy: '桶身 [0] 与桶沿、桶底 [1] 作为一个部件绕底部中点晃动（单部件，图层顺序不变）。',
      clips: {
        idle: {
          parts: [
            {
              indices: [0, 1],
              cx: 18,
              cy: 34,
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.1, rotate: 3 },
                { t: 0.2, rotate: -3 },
                { t: 0.3, rotate: 2 },
                { t: 0.4, rotate: 0 },
                { t: 1, rotate: 0 },
              ],
            },
          ],
        },
      },
    },
    '1fab0': {
      emoji: '1fab0',
      name: '苍蝇',
      desc: '一对翅膀嗡嗡高速振动，细腿在身下不安分地搓动。',
      anatomy: '左翅 ellipse[2] 绕左翅根 (16.3,12.5) 摆动，右翅 ellipse[3] 绕右翅根 (19.8,12.5) 反向摆动；腿 g[0] 绕胸口小幅扭动。',
      clips: {
        idle: {
          parts: [
            { indices: [0], cx: 18, cy: 16, keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: 2 }, { t: 1, rotate: 0 }] },
            {
              indices: [2],
              cx: 16.3,
              cy: 12.5,
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.1, rotate: 20 },
                { t: 0.2, rotate: 0 },
                { t: 0.3, rotate: 20 },
                { t: 0.4, rotate: 0 },
                { t: 0.5, rotate: 20 },
                { t: 0.6, rotate: 0 },
                { t: 0.7, rotate: 20 },
                { t: 0.8, rotate: 0 },
                { t: 0.9, rotate: 20 },
                { t: 1, rotate: 0 },
              ],
            },
            {
              indices: [3],
              cx: 19.8,
              cy: 12.5,
              keyframes: [
                { t: 0, rotate: 0 },
                { t: 0.1, rotate: -20 },
                { t: 0.2, rotate: 0 },
                { t: 0.3, rotate: -20 },
                { t: 0.4, rotate: 0 },
                { t: 0.5, rotate: -20 },
                { t: 0.6, rotate: 0 },
                { t: 0.7, rotate: -20 },
                { t: 0.8, rotate: 0 },
                { t: 0.9, rotate: -20 },
                { t: 1, rotate: 0 },
              ],
            },
          ],
        },
      },
    },
    '1f30b': {
      emoji: '1f30b',
      name: '火山怪',
      desc: '山口的岩浆柱一窜一窜往上喷，熔岩流忽明忽暗，头顶的烟云翻滚鼓胀，火星从山口蹦出来。',
      anatomy: '熔岩流 [3] 与 [5,6] 错相明灭；山口岩浆柱 [10] 绕底部纵向伸缩；烟云 [11] 鼓胀，烟团 [12..21] 上下翻滚；火星是新建四芒星，自山口升起。',
      clips: {
        idle: {
          parts: [
            { indices: [3], keyframes: [{ t: 0, opacity: 1 }, { t: 0.5, opacity: 0.7 }, { t: 1, opacity: 1 }] },
            { indices: [5, 6], keyframes: [{ t: 0, opacity: 0.8 }, { t: 0.5, opacity: 1 }, { t: 1, opacity: 0.8 }] },
            {
              indices: [10],
              cx: 19.3,
              cy: 13.7,
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.2, scaleY: 1.4 },
                { t: 0.4, scaleY: 0.9 },
                { t: 0.6, scaleY: 1.25 },
                { t: 0.8, scaleY: 1 },
                { t: 1, scaleY: 1 },
              ],
            },
            {
              indices: [11],
              cx: 18.1,
              cy: 4.8,
              keyframes: [{ t: 0, scaleX: 1, scaleY: 1 }, { t: 0.5, scaleX: 1.05, scaleY: 1.03 }, { t: 1, scaleX: 1, scaleY: 1 }],
            },
            {
              indices: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
              keyframes: [{ t: 0, ty: 0 }, { t: 0.5, ty: -0.8 }, { t: 1, ty: 0 }],
            },
          ],
          fx: [
            {
              gen: 'rise',
              params: {
                particles: [
                  { x: 16.5, phase: 0, size: 1.1, color: '#FFAC33' },
                  { x: 20, phase: 0.33, size: 0.9, color: '#E95F28' },
                  { x: 18.3, phase: 0.66, size: 1, color: '#FFD983' },
                ],
                y0: 12,
                y1: 1,
              },
            },
          ],
        },
      },
    },
  },
}

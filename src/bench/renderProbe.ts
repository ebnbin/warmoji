// 渲染健康探针：专治「整屏闪一帧」这种复现不了、看不见、也没人报错的故障。
//
// 它只回答一个二选一的问题：**那一帧到底是我们没画，还是我们画了但没显示出来**。
// · 「空帧」计数涨 → 故障在 JS 侧（提前 return / 抛异常 / 查询为空），可以继续往下查
// · 「空帧」恒为 0 而屏幕确实闪了 → 我们提交了绘制，问题在下面（GPU/合成器/上下文），
//   代码这边可以洗清嫌疑，别再改渲染逻辑了
//
// 这两条结论都无法从复现不了的现场里靠猜得到，所以这个探针常驻——它是那个
// 分叉点上唯一的证据。

/** 本帧提交的四边形数（各深度带 × 各相机累加） */
let submitted = 0
/** 本帧本应可见的实体数（同上口径）；为 0 表示场上本来就没东西，不算空帧 */
let candidates = 0

let blankFrames = 0
/** 最近一次空帧距今多少帧——「每隔一段时间闪一次」的间隔由此可读 */
let framesSinceBlank = -1
let frameNo = 0
let lastBlankFrame = -1

let errors = 0
let lastError = ''
let contextLost = 0

/** 批绘每次提交后上报（含提前 return 的情形：drawn 传 0） */
export function noteBatch(drawn: number, wanted: number): void {
  submitted += drawn
  candidates += wanted
}

/** 帧边界（挂在 POST_RENDER）：本帧有东西该画却一个都没画 = 空帧 */
export function noteFrameEnd(): void {
  frameNo++
  if (candidates > 0 && submitted === 0) {
    blankFrames++
    framesSinceBlank = lastBlankFrame < 0 ? -1 : frameNo - lastBlankFrame
    lastBlankFrame = frameNo
  }
  submitted = 0
  candidates = 0
}

export function noteError(msg: string): void {
  errors++
  lastError = msg.slice(0, 120)
}

export function noteContextLost(): void {
  contextLost++
}

export interface RenderProbe {
  blankFrames: number
  /** 上两次空帧相隔多少帧；只出现过一次则为 -1 */
  blankGap: number
  errors: number
  lastError: string
  contextLost: number
}

export function renderProbe(): RenderProbe {
  return { blankFrames, blankGap: framesSinceBlank, errors, lastError, contextLost }
}

export function resetRenderProbe(): void {
  blankFrames = 0
  framesSinceBlank = -1
  lastBlankFrame = -1
  frameNo = 0
  errors = 0
  lastError = ''
  contextLost = 0
}

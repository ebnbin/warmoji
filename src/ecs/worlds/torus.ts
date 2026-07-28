import type { Point } from '../../util/vec'

// 本图的纯世界模型（禁 phaser/DOM）；接进 WorldHooks 的是同目录的 hooks.ts。
// ECS 侧的一份——旧框架侧在 arcade/maps/ 下另有等价实现，两份有意重复。

// 虚空地图（环面世界）的纯几何（禁 phaser/DOM）。
// 竞技场是固定尺寸的环面：四边两两粘合，坐标按模运算回绕，没有墙。
// 「距离/方向」一律用环面最短差——这是传送门成为真实拓扑而非装饰的关键。

/** 坐标回绕到 [0, size)（负数安全） */
function wrapCoord(v: number, size: number): number {
  return ((v % size) + size) % size
}

export function wrapPoint(p: Point, w: number, h: number): Point {
  return { x: wrapCoord(p.x, w), y: wrapCoord(p.y, h) }
}

/** 环面最短差向量 from→to：各轴回绕到 ±半场内（可能穿缝） */
export function torusDelta(from: Point, to: Point, w: number, h: number): Point {
  let dx = to.x - from.x
  let dy = to.y - from.y
  dx -= Math.round(dx / w) * w
  dy -= Math.round(dy / h) * h
  return { x: dx, y: dy }
}

export function torusDist2(a: Point, b: Point, w: number, h: number): number {
  const d = torusDelta(a, b, w, h)
  return d.x * d.x + d.y * d.y
}

/** 目标的三个镜像坐标（半平面覆盖）：镜像取「更近的那半边」的平移，
 * 任意观察者眼中的最近镜像必在 {真身, 这三个} 之中。
 * 把它们和真身一起喂给能力索敌，能力零改动即可隔着传送门瞄准 */
export function ghostImages(p: Point, w: number, h: number): Point[] {
  const dx = p.x < w / 2 ? w : -w
  const dy = p.y < h / 2 ? h : -h
  return [
    { x: p.x + dx, y: p.y },
    { x: p.x, y: p.y + dy },
    { x: p.x + dx, y: p.y + dy },
  ]
}

/** 容器内最大居中定比矩形：非 16:9 屏幕上竞技场的取景框（多余留空白） */
export function fitAspectRect(
  containerW: number,
  containerH: number,
  aspectW: number,
  aspectH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(containerW / aspectW, containerH / aspectH)
  const w = aspectW * scale
  const h = aspectH * scale
  return { x: (containerW - w) / 2, y: (containerH - h) / 2, w, h }
}

// 虚空地图（kind='void'）：固定尺寸的环面竞技场，四边是传送门。
// 相机静止且视口裁剪出屏幕内最大居中的 16:9（竖屏 9:16）区域，非该比例
// 的屏幕多余处留空白；场内一切实体（含玩家/Boss/子弹）坐标按模回绕，
// 没有任何墙。索敌/AI/磁吸全部用环面最短差（本文件）
// 设计参数（竞技场长短边/条带宽/子弹寿命/门框厚度）已上移到 MapDef.torus（数据）。

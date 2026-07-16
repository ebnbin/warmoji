import Phaser from 'phaser'
import { codepointsToEmoji } from '../core/emoji'
import { setSvgSize } from '../core/svg'
import { emojiSvgText, svgToImage } from './emoji'

// 图鉴「全部 emoji」专用缩略图集：进入该页时一次性把全部基础形态
// 光栅化成 64px 小图并合入少量 2048×2048 画布纹理（全量约 32MB，手机可承受）。
// 建成后网格纹理常驻、同步查表——没有懒加载/回收/复用，回滚浏览不再空白；
// 且整个网格只用 2~3 张纹理，渲染批处理开销极低。每个会话只构建一次。
const THUMB = 64
const ATLAS_SIZE = 2048
const PER_ATLAS = (ATLAS_SIZE / THUMB) ** 2
const CONCURRENCY = 24

export interface WikiAtlasProgress {
  state: 'idle' | 'loading' | 'ready'
  done: number
  total: number
}

const progress: WikiAtlasProgress = { state: 'idle', done: 0, total: 0 }
/** cp → 图集纹理 key（frame 名即 cp） */
const frameOf = new Map<string, string>()
let building: Promise<void> | undefined

export function wikiAtlasProgress(): WikiAtlasProgress {
  return { ...progress }
}

/** 网格格子的纹理定位；构建完成前/光栅化失败的项返回 undefined */
export function wikiFrame(cp: string): { key: string; frame: string } | undefined {
  const key = frameOf.get(cp)
  return key ? { key, frame: cp } : undefined
}

/** 构建全量缩略图集（幂等：并发调用共享同一次构建；场景重启不打断） */
export function buildWikiAtlas(scene: Phaser.Scene, cps: readonly string[]): Promise<void> {
  if (building) return building
  progress.state = 'loading'
  progress.total = cps.length
  progress.done = 0

  building = (async () => {
    const canvases: HTMLCanvasElement[] = []
    const contexts: CanvasRenderingContext2D[] = []
    const atlasCount = Math.ceil(cps.length / PER_ATLAS)
    for (let i = 0; i < atlasCount; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = ATLAS_SIZE
      canvas.height = ATLAS_SIZE
      canvases.push(canvas)
      contexts.push(canvas.getContext('2d')!)
    }

    let cursor = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor++
        if (index >= cps.length) return
        const cp = cps[index]!
        try {
          const img = await svgToImage(setSvgSize(await emojiSvgText(codepointsToEmoji(cp)), THUMB))
          const atlas = Math.floor(index / PER_ATLAS)
          const slot = index % PER_ATLAS
          const cols = ATLAS_SIZE / THUMB
          contexts[atlas]!.drawImage(img, (slot % cols) * THUMB, Math.floor(slot / cols) * THUMB, THUMB, THUMB)
        } catch (err) {
          // 单项失败不终止构建（该格显示为空）；warn 不触发 e2e 的无 error 断言
          console.warn(`图鉴缩略图加载失败 ${cp}: ${String(err)}`)
        } finally {
          progress.done++
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    // 整张画布一次性入纹理，并按格子注册 frame
    const cols = ATLAS_SIZE / THUMB
    canvases.forEach((canvas, i) => {
      const key = `wiki-atlas-${i}`
      if (scene.textures.exists(key)) scene.textures.remove(key)
      const tex = scene.textures.addCanvas(key, canvas)!
      const from = i * PER_ATLAS
      const to = Math.min(cps.length, from + PER_ATLAS)
      for (let index = from; index < to; index++) {
        const slot = index % PER_ATLAS
        tex.add(cps[index]!, 0, (slot % cols) * THUMB, Math.floor(slot / cols) * THUMB, THUMB, THUMB)
        frameOf.set(cps[index]!, key)
      }
    })
    progress.state = 'ready'
  })().catch((err) => {
    console.error(`图鉴图集构建失败: ${String(err)}`)
    progress.state = 'idle'
    building = undefined
  })
  return building
}

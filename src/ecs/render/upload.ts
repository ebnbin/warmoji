import Phaser from 'phaser'

type GlTexture = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper

/** 按行拷出一块像素时的中转，按需加长 */
let scratch = new Uint8Array(0)

/** 贴图在显卡上的那一份绑到 0 号单元，上传参数照它建时的翻转与预乘设好；没有 WebGL 或上下文丢了时为 null */
function bindForUpload(scene: Phaser.Scene, tex: Phaser.Textures.Texture): { gl: WebGLRenderingContext; gt: GlTexture } | null {
  const r = scene.renderer
  const gt = tex.source[0]?.glTexture
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !gt || r.gl.isContextLost()) return null
  r.glTextureUnits.bind(gt, 0)
  r.glWrapper.updateTexturing({ texturing: { flipY: gt.flipY, premultiplyAlpha: gt.pma } })
  return { gl: r.gl, gt }
}

/** 画好的图交给 Phaser，只在这时传一次；CanvasTexture 建时先传一张空图，还要把整张画布读回一遍 */
export function canvasToTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.Texture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  return scene.textures.create(key, canvas, canvas.width, canvas.height)!
}

/** 每帧要换的数据图：像素就是 data，显卡丢了上下文时 Phaser 拿它重建；不经画布，免得写进去再读出来 */
export function pixelTexture(scene: Phaser.Scene, key: string, w: number, h: number): { tex: Phaser.Textures.Texture; data: Uint8Array } {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const data = new Uint8Array(w * h * 4)
  return { tex: scene.textures.addUint8Array(key, data, w, h)!, data }
}

/** 贴图上 (x, y) 处换成 src，显卡上只传这一块；带缩小版的跟着重建，一次要传好几块的把 mips 设为 false，传完再 rebuildMips */
export function uploadRegion(scene: Phaser.Scene, tex: Phaser.Textures.Texture, src: ImageData | HTMLCanvasElement, x: number, y: number, mips = true): void {
  const b = bindForUpload(scene, tex)
  if (!b) return
  const { gl, gt } = b
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, gt.flipY ? gt.height - y - src.height : y, gl.RGBA, gl.UNSIGNED_BYTE, src)
  if (mips) gt.generateMipmap()
}

/** data 是整张贴图的像素，把其中 (x, y) 起 w×h 的一块传上去；整行的直接传，不整行的先按行拷到一处 */
export function uploadPixels(scene: Phaser.Scene, tex: Phaser.Textures.Texture, data: Uint8Array, x: number, y: number, w: number, h: number, mips = true): void {
  const b = bindForUpload(scene, tex)
  if (!b) return
  const { gl, gt } = b
  const stride = gt.width * 4
  let block: Uint8Array
  if (x === 0 && w === gt.width) {
    block = data.subarray(y * stride, (y + h) * stride)
  } else {
    const n = w * h * 4
    if (scratch.length < n) scratch = new Uint8Array(n)
    block = scratch.subarray(0, n)
    for (let row = 0; row < h; row++) block.set(data.subarray((y + row) * stride + x * 4, (y + row) * stride + (x + w) * 4), row * w * 4)
  }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, gt.flipY ? gt.height - y - h : y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, block)
  if (mips) gt.generateMipmap()
}

/** 带缩小版的贴图按现在的像素重建缩小版；没有缩小版的什么都不做 */
export function rebuildMips(scene: Phaser.Scene, tex: Phaser.Textures.Texture): void {
  bindForUpload(scene, tex)?.gt.generateMipmap()
}

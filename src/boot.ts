// 拿不到 WebGL 就不加载游戏，只给提示；检测须与 Phaser 的一致（phaser/src/device/Features.js）

function webglAvailable(): boolean {
  if (!('WebGLRenderingContext' in window)) return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

function showUnsupported(): void {
  const el = document.getElementById('game')
  if (!el) return
  el.textContent =
    '当前浏览器不支持 WebGL，无法运行 WarMoji。请在浏览器设置里开启硬件加速，或换用最新版的 Chrome、Edge、Safari。'
  Object.assign(el.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    padding: '24px',
    textAlign: 'center',
    color: '#e6e6e6',
    font: '16px/1.6 system-ui, sans-serif',
  })
}

if (webglAvailable()) void import('./main')
else showUnsupported()

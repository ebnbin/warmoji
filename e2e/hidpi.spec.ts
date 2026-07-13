import { expect, test } from '@playwright/test'

test.describe('高分屏（DPR 2）', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })

  test('canvas 物理像素 = CSS × DPR，逻辑视口不变', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')
    await page.waitForFunction(() => window.__warmoji?.scene === 'menu')

    const m = await page.evaluate(() => {
      const c = document.querySelector('#game canvas') as HTMLCanvasElement
      return {
        backingW: c.width,
        backingH: c.height,
        cssW: c.getBoundingClientRect().width,
        cssH: c.getBoundingClientRect().height,
      }
    })
    expect(m.backingW).toBe(2560)
    expect(m.backingH).toBe(1440)
    expect(m.cssW).toBeCloseTo(1280, 0)
    expect(m.cssH).toBeCloseTo(720, 0)

    const v = await page.evaluate(() => window.__warmoji!)
    expect(v.viewW).toBeCloseTo(1280, 0)
    expect(v.viewH).toBeCloseTo(720, 0)

    // 高 DPR 下游戏可正常开局（CI 的软件渲染器在大 canvas 下帧率低，超时放宽）
    await page.locator('#game canvas').click()
    await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
    await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
      timeout: 30_000,
    })
    expect(errors).toEqual([])
  })
})

test.describe('手机竖屏（iPhone 尺寸，DPR 3）', () => {
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 })

  test('canvas 物理像素 = CSS × 3，竖屏保底 720 生效', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
    const m = await page.evaluate(() => {
      const c = document.querySelector('#game canvas') as HTMLCanvasElement
      return { backingW: c.width, backingH: c.height, viewW: window.__warmoji!.viewW }
    })
    expect(m.backingW).toBe(1179)
    expect(m.backingH).toBe(2556)
    expect(m.viewW).toBeCloseTo(720, 0)
  })
})

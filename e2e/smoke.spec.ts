import { expect, test } from '@playwright/test'

test('页面可加载：canvas 渲染、版本徽章存在、无控制台错误', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await expect(page).toHaveTitle(/Warmoji/i)

  await expect(page.locator('#game canvas')).toBeVisible()
  await expect(page.locator('#build-badge')).toHaveText(/^([0-9a-f]{7}|dev)$/)

  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')

  // 屏幕锚定的渐变背景画在页面层；theme-color 跟随渐变顶色（iOS 状态栏着色）
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  expect(bg).toContain('linear-gradient')
  const themeColor = await page.evaluate(
    () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '',
  )
  expect(themeColor).toMatch(/^hsl\(/)

  // PWA manifest 与图标可达（Android 状态栏/导航栏着色依赖 WebAPK 安装）
  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  expect((await manifest.json()).display).toBe('fullscreen')
  expect((await page.request.get('/icons/icon-512.png')).ok()).toBeTruthy()

  // twemoji 全集已部署：抽查一个未预载的 emoji（😀）
  const ver = await page.evaluate(() => window.__twemojiVersion)
  const dynamicSvg = await page.request.get(`/emoji/${ver}/1f600.svg`)
  expect(dynamicSvg.ok()).toBeTruthy()
  expect(await dynamicSvg.text()).toContain('<svg')

  // 跑几帧，暴露启动后才出现的运行时错误
  await page.waitForTimeout(800)
  expect(errors).toEqual([])

  await page.screenshot({ path: 'test-results/menu.png' })
})

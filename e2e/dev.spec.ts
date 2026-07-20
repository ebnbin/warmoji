import { expect, test } from '@playwright/test'
import { startRun } from './helpers'

test('dev 面板反复开关不卡死（devText 陈旧引用回归）', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 1)

  // 反复点右下角扳手（🔧 = emoji-1f527）开关 dev 面板。关闭那次曾对随
  // SHUTDOWN 已销毁的 devText 继续 setText → 渲染撞空 canvas → 整局卡死
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const ui = (window as unknown as { __game: { scene: { keys: Record<string, { children: { list: { texture?: { key?: string }; emit(ev: string): void }[] } }> } } }).__game.scene.keys['ui']!
      ui.children.list.find((o) => o.texture?.key === 'emoji-1f527')?.emit('pointerdown')
    })
    await page.waitForTimeout(300)
  }

  // 时钟仍在推进（游戏循环未被异常打断）
  const t1 = await page.evaluate(() => window.__warmoji!.elapsed)
  await page.waitForTimeout(500)
  const t2 = await page.evaluate(() => window.__warmoji!.elapsed)
  expect(t2).toBeGreaterThan(t1)
  expect(errors).toEqual([])
})

import { expect, test } from '@playwright/test'
import { enterLab, enterMap } from './helpers'

// 慢渲染环境下采样窗口偶有抖动，允许重试
test.describe.configure({ retries: 2 })

test('秒针：静则世界时间近乎冻结，动则满速推进', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  // 走测试模式直接进秒针竞技场（testMode 仍跑完整 update 循环，时标照常生效）
  await page.goto('/')
  await enterMap(page)
  await enterLab(page, 'metronome')
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena' && window.__warmoji.mapId === 'metronome')

  const elapsed = (): Promise<number> => page.evaluate(() => window.__warmoji!.elapsed)

  // 断言用比值而非绝对值：慢渲染 e2e 环境下 Phaser 会把 delta 平滑到目标步长，
  // 游戏时钟整体慢于墙钟，但「动/静」的相对推进倍率与真机一致——正是本机制的本质。

  // 静止一段真实时间：世界时钟只以 floor 缓行（近乎时停）
  const still0 = await elapsed()
  await page.waitForTimeout(2500)
  const still1 = await elapsed()
  const stillAdvance = still1 - still0

  // 先按住 0.5 秒让时标爬升到位，再测同样窗口：世界时钟推进快得多
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(500)
  const move0 = await elapsed()
  await page.waitForTimeout(2500)
  await page.keyboard.up('ArrowRight')
  const move1 = await elapsed()
  const moveAdvance = move1 - move0

  // 世界永不真正冻结（floor>0）；移动推进远大于静止（时标随移动放缩的铁证）
  expect(stillAdvance).toBeGreaterThan(0)
  expect(moveAdvance).toBeGreaterThan(stillAdvance * 3)
  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

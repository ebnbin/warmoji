import { expect, test } from '@playwright/test'
import { clickShopSlot, completePromote, drainCards, startRun } from './helpers'

// 存活到波末受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('角色专属经验来源无关：任意途径装备道具都累积经验、跨阈值自动免费升级', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await startRun(page)

  // 走位撑到波末 → 抽卡 → 整编招募 → 商店
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') break
    await page.keyboard.down(KEYS[i % 4]!)
    await page.waitForTimeout(1400)
    await page.keyboard.up(KEYS[i % 4]!)
  }
  await drainCards(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)

  const focusedId = await page.evaluate(() => window.__warmoji!.shop!.focusedId)
  const coinsBefore = await page.evaluate(() => window.__warmoji!.shop!.coins)

  // 非购买来源（模拟开宝箱 / 任意途径获得）给槽位 0 装备 3 张稀有 = 78 经验（< 80 阈值）→ 仍 1 级
  await page.evaluate(() => window.__addMemberItem!('regenRing', 0, 3))
  await clickShopSlot(page, focusedId) // 重报调试快照
  await page.waitForFunction(() => window.__warmoji?.shop?.focusedLevel === 1)

  // 再装备 1 张（同样非购买）跨过阈值 → 该角色自动升到 2 级：证明「加经验绑定在装备，与来源无关」
  await page.evaluate(() => window.__addMemberItem!('gemHeart', 0, 1))
  await clickShopSlot(page, focusedId)
  await page.waitForFunction(() => window.__warmoji?.shop?.focusedLevel === 2, undefined, {
    timeout: 10_000,
  })

  const after = await page.evaluate(() => window.__warmoji!.shop!)
  expect(after.focusedLevel).toBe(2)
  // 全程没买东西：升级免费，金币不变
  expect(after.coins).toBe(coinsBefore)
  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

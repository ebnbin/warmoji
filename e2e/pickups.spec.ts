import { expect, test } from '@playwright/test'
import { startRun } from './helpers'

// 存活期间受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('战场拾取：走位拾取地面增益 → 施加限时效果，倒计时递减', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')

  // 在队伍中心掉一枚增益拾取 → 下一帧走位判定即收 → 激活一条限时效果
  await page.evaluate(() => window.__spawnFieldPickup!('buff'))
  await page.waitForFunction(() => (window.__warmoji?.field?.active?.length ?? 0) > 0, undefined, {
    timeout: 10_000,
  })
  const a0 = await page.evaluate(() => window.__warmoji!.field!.active)
  expect(a0.length).toBeGreaterThanOrEqual(1)
  const buff = a0.find((x) => x.polarity === 'buff')!
  expect(buff).toBeTruthy()
  expect(buff.remainMs).toBeGreaterThan(0)

  // 限时效果是「活」的：剩余时长随战斗时钟递减
  await page.waitForTimeout(700)
  const remain1 = await page.evaluate(
    (id) => window.__warmoji?.field?.active.find((x) => x.id === id)?.remainMs ?? 0,
    buff.id,
  )
  expect(remain1).toBeLessThan(buff.remainMs)

  // 再掉一枚减益拾取 → 同样进入激活列表（极性为减益）
  await page.evaluate(() => window.__spawnFieldPickup!('debuff'))
  await page.waitForFunction(
    () => (window.__warmoji?.field?.active?.some((x) => x.polarity === 'debuff') ?? false),
    undefined,
    { timeout: 10_000 },
  )

  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

test('战场拾取携带者：投放带极性光环的携带者，携带者计数 ≥1', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')

  // 投放一名携带者（带光环）：在场携带者数应立即 ≥1
  await page.evaluate(() => window.__spawnCarrier!('debuff'))
  await page.waitForFunction(() => (window.__warmoji?.field?.carriers ?? 0) >= 1, undefined, {
    timeout: 10_000,
  })
  const carriers = await page.evaluate(() => window.__warmoji!.field!.carriers)
  expect(carriers).toBeGreaterThanOrEqual(1)

  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

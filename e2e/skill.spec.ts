import { expect, test } from '@playwright/test'
import {
  clickCaptain,
  clickShopNext,
  completePromote,
  confirmCaptain,
  enterCaptain,
} from './helpers'

// 软渲染 + 并行争抢下墙钟不稳；技能冷却走游戏时钟，等待全用轮询
test.describe.configure({ retries: 2 })

test('队长主动技能：开局无豆不可放、攒豆后释放进入冷却并扣豆、剩余冷却跨波保留', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await enterCaptain(page)
  // 财迷 CD 最短（20s）：豆到手后一放，跨一波还能看见剩余冷却
  await clickCaptain(page, 'moneybags')
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena' && !!window.__warmoji.skill)

  // 开局：CD 就绪但 0 颗豆 → 不可释放；按 E 也无效
  const st0 = await page.evaluate(() => window.__warmoji!.skill!)
  expect(st0.remainMs).toBe(0)
  expect(st0.beans).toBe(0)
  expect(st0.ready).toBe(false)
  await page.keyboard.press('e')
  await page.waitForTimeout(500)
  expect((await page.evaluate(() => window.__warmoji!.skill!)).remainMs).toBe(0)

  // 攒第一颗豆（击杀经验 + 第 1 波末保底必到账），期间穿插推进结算页
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => ({
      scene: window.__warmoji?.scene,
      beans: window.__warmoji?.skill?.beans ?? 0,
    }))
    if (st.scene === 'arena' && st.beans >= 1) break
    if (st.scene === 'promote') await completePromote(page)
    else if (st.scene === 'shop') await clickShopNext(page)
    else await page.waitForTimeout(800)
  }
  const armed = await page.evaluate(() => window.__warmoji!.skill!)
  expect(armed.beans).toBeGreaterThanOrEqual(1)
  expect(armed.ready).toBe(true)

  // E 键释放：扣 1 颗豆并进入满额 20s 冷却
  const beansBefore = armed.beans
  await page.keyboard.press('e')
  await page.waitForFunction(
    () => (window.__warmoji?.skill?.remainMs ?? 0) > 15_000,
    undefined,
    { timeout: 8000 },
  )
  expect((await page.evaluate(() => window.__warmoji!.skill!)).beans).toBe(beansBefore - 1)

  // 跨波保留：打完本波走整编/商店回战斗，剩余冷却带着上一波已消耗的进度
  //（若被错误重置会是 0 或满额 20s，都落在断言区间外）
  const waveCast = await page.evaluate(() => window.__warmoji!.wave!)
  await page.waitForFunction(() => window.__warmoji?.scene !== 'arena', undefined, {
    timeout: 60_000,
  })
  for (let i = 0; i < 10; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene === 'arena') break
    if (scene === 'promote') await completePromote(page)
    else if (scene === 'shop') await clickShopNext(page)
    else await page.waitForTimeout(400)
  }
  await page.waitForFunction(
    (w) => window.__warmoji?.scene === 'arena' && (window.__warmoji.wave ?? 0) === w + 1,
    waveCast,
  )
  const st1 = await page.evaluate(() => window.__warmoji!.skill!)
  expect(st1.remainMs).toBeGreaterThan(500)
  expect(st1.remainMs).toBeLessThan(19_500)
})

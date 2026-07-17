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

test('队长主动技能：预充开局、就绪后释放进入满额冷却、剩余冷却跨波保留', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await enterCaptain(page)
  // 财迷 CD 最短（20s，预充一半）：第一波内就能走完「就绪 → 释放」
  await clickCaptain(page, 'moneybags')
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena' && !!window.__warmoji.skill)

  // 开局预充一半：剩余冷却 ≈ 10s（未就绪、亦非满额）
  const st0 = await page.evaluate(() => window.__warmoji!.skill!)
  expect(st0.ready).toBe(false)
  expect(st0.remainMs).toBeGreaterThan(4000)
  expect(st0.remainMs).toBeLessThanOrEqual(10_000)

  // 战斗时钟推进到就绪（第一波 15s，预充后 10s 内必就绪）
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'arena' && window.__warmoji.skill?.ready === true,
    undefined,
    { timeout: 60_000 },
  )

  // E 键释放：立即进入满额 20s 冷却
  await page.keyboard.press('e')
  await page.waitForFunction(
    () => (window.__warmoji?.skill?.remainMs ?? 0) > 15_000,
    undefined,
    { timeout: 8000 },
  )

  // 跨波保留：打完本波走整编/商店回战斗，剩余冷却带着上一波已消耗的进度
  //（若被错误地重置，满额 20s 或重预充 10s 都会落在断言区间之外）
  await page.waitForFunction(() => window.__warmoji?.scene !== 'arena', undefined, {
    timeout: 40_000,
  })
  for (let i = 0; i < 10; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene === 'arena') break
    if (scene === 'promote') await completePromote(page)
    else if (scene === 'shop') await clickShopNext(page)
    else await page.waitForTimeout(400)
  }
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'arena' && (window.__warmoji.wave ?? 0) === 2,
  )
  const st1 = await page.evaluate(() => window.__warmoji!.skill!)
  expect(st1.remainMs).toBeGreaterThan(10_500)
  expect(st1.remainMs).toBeLessThan(19_500)
})

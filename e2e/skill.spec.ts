import type { Page } from '@playwright/test'
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

/** 站桩会被围死：等待期间穿插绕圈走位保命 */
const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
async function kiteStep(page: Page, i: number): Promise<void> {
  const key = KEYS[i % 4]!
  await page.keyboard.down(key)
  await page.waitForTimeout(900)
  await page.keyboard.up(key)
}

/** 本波剩余毫秒（读战斗场景的 HUD 快照；不在战斗中返回 0） */
async function waveRemainMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { hudSnapshot?: () => { remainMs: number } }> }
    }
    return game?.scene?.keys?.['arena']?.hudSnapshot?.().remainMs ?? 0
  })
}

test('队长主动技能：开局无豆不可放、攒豆后释放进入冷却并扣豆、剩余冷却跨波保留', async ({ page }) => {
  test.setTimeout(300_000)
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

  // 攒第一颗豆（击杀经验 + 第 1 波末保底必到账），期间穿插推进结算页。
  // 释放时机掐在本波剩余 5~15 秒：波长 ≥ 财迷 CD 时早放会在波末冷却归零、
  // 晚放又吃不出冷却消耗，锁窗口保证跨波剩余冷却必落在 5~15 秒区间
  for (let i = 0; i < 90; i++) {
    const st = await page.evaluate(() => ({
      scene: window.__warmoji?.scene,
      beans: window.__warmoji?.skill?.beans ?? 0,
    }))
    if (st.scene === 'arena' && st.beans >= 1) {
      const remain = await waveRemainMs(page)
      if (remain >= 5_000 && remain <= 15_000) break
    }
    if (st.scene === 'promote') await completePromote(page)
    else if (st.scene === 'shop') await clickShopNext(page)
    else if (st.scene === 'arena') await kiteStep(page, i)
    else await page.waitForTimeout(400)
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
  for (let i = 0; i < 40; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') break
    await kiteStep(page, i)
  }
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
    { timeout: 30_000 },
  )
  const st1 = await page.evaluate(() => window.__warmoji!.skill!)
  expect(st1.remainMs).toBeGreaterThan(500)
  expect(st1.remainMs).toBeLessThan(19_500)
})

import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// 子实体与帧表的两条回归：
// 1) 弩塔同时在场应当攒到上限（架第二座不该顶掉第一座）——曾把新架的那座也算进在役数，
//    于是 maxTurrets=2 时第二座一出现就把第一座标了退场。
// 2) 光环每帧重新登记减速区，登记表须逐帧清零——曾漏掉清零，登记项逐帧堆积，
//    光环圈叠成一片白、敌速被反复叠乘冻死。

type EcsDbg = { ready: boolean; minions: number; slowZones: number }

async function boot(page: import('@playwright/test').Page, roster: string[]): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: true, hitShake: true, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
    } catch {
      /* ignore */
    }
  })
  await page.goto('/')
  await page.evaluate((ids) => window.__ecsLabRoster!(ids), roster)
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })
  return errors
}

const minions = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.minions)

test('ECS 弩塔：架设攒到同时在场上限，新的一座不顶掉旧的', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await boot(page, ['beaver'])

  // 架设间隔 4.2s、上限 2：等到第二座架起来
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.minions >= 2, undefined, {
    timeout: 30_000,
  })
  // 两座应当并存一段时间（旧实现里第二座一出现第一座就退场，这里会掉回 1）
  const samples: number[] = []
  for (let i = 0; i < 8; i++) {
    samples.push(await minions(page))
    await page.waitForTimeout(250)
  }
  expect(Math.min(...samples), `弩塔在场数不该掉回 1：${samples.join(',')}`).toBeGreaterThanOrEqual(2)
  // 上限之外不该无限堆（退场期短暂 +1 允许）
  expect(Math.max(...samples)).toBeLessThanOrEqual(3)
  expect(errors).toEqual([])
})

test('ECS 光环：减速区登记表逐帧清零，不随时间堆积', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await boot(page, ['snowman'])

  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.slowZones > 0, undefined, {
    timeout: 15_000,
  })
  await page.waitForTimeout(5000)
  // 一个光环 = 每帧一条；漏清零的话 5 秒后是几百条
  const zones = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.slowZones)
  expect(zones, '减速区登记表在堆积').toBeLessThanOrEqual(2)
  expect(errors).toEqual([])
})

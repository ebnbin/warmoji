import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（拾取·金币）：击杀掉落金币 → 磁吸向队伍中心 → 入账（run.coins 增长）。

type EcsDbg = { ready: boolean; enemies: number; coins: number; liveCoins: number }

test('ECS 金币：击杀掉落，磁吸入账', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  const coins0 = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.coins)

  // 贴近投放炮龟(coins 5, 无亡语)，一击致死：金币落在中心附近
  await page.evaluate(() => window.__ecsSpawnEnemy!('turtle', 2, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  await page.evaluate(() => window.__ecsHurtEnemy!(200))

  // 掉落 → 磁吸 → 入账：run.coins 增长
  await page.waitForFunction((c0) => (window as unknown as { __ecs: EcsDbg }).__ecs.coins > c0, coins0, {
    timeout: 10_000,
  })

  expect(errors).toEqual([])
})

import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（伤害归属 + 结算统计）：伤害/击杀按出手槽位入账、承伤按人入账——结算页战报读的就是这些。

type EcsDbg = {
  ready: boolean
  enemies: number
  stats: { damage: number[]; kills: number[]; damageTaken: number[] }
}

test('ECS 结算统计：伤害与击杀按槽位归属、承伤按人累计', async ({ page }) => {
  test.setTimeout(120_000)
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
  // 单人远程：出手必然归属槽位 0
  await page.evaluate(() => window.__ecsLabRoster!(['mage']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  const zero = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.stats)
  expect(zero.damage[0]).toBe(0)
  expect(zero.kills[0]).toBe(0)

  // 投放血厚的靶子，等法师打它 → 伤害入账槽位 0
  await page.evaluate(() => window.__ecsSpawnEnemy!('turtle', 3, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  await page.waitForFunction(
    () => ((window as unknown as { __ecs: EcsDbg }).__ecs.stats.damage[0] ?? 0) > 0,
    undefined,
    { timeout: 20_000 },
  )

  // 打死它 → 击杀入账同一槽位
  await page.waitForFunction(
    () => ((window as unknown as { __ecs: EcsDbg }).__ecs.stats.kills[0] ?? 0) >= 1,
    undefined,
    { timeout: 30_000 },
  )

  // 承伤：贴脸放自爆怪炸队员 → damageTaken 入账
  await page.evaluate(() => window.__ecsSpawnEnemy!('creeper', 1, 0))
  await page.waitForFunction(
    () => ((window as unknown as { __ecs: EcsDbg }).__ecs.stats.damageTaken[0] ?? 0) > 0,
    undefined,
    { timeout: 25_000 },
  )

  expect(errors).toEqual([])
})

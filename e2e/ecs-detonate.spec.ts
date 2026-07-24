import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（locomotion·detonate）：苦力怕贴近→蓄力(state=2)→引爆（群伤队员 + 自毁）。

type EcsDbg = { ready: boolean; enemies: number; memberHp: number[] }

test('ECS detonate：苦力怕蓄力后引爆，群伤队员并自毁', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll'])) // 近战单人，苦力怕能活到引爆
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 贴近投放(2 格，在 triggerRange 内)：立即蓄力
  await page.evaluate(() => window.__ecsSpawnEnemy!('creeper', 2, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  await page.waitForFunction(() => window.__ecsNearestEnemyState!() === 2, undefined, { timeout: 6000 })

  // 引爆后自毁（敌人清零）+ 队员被群伤（血量下降）
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 0, undefined, {
    timeout: 8000,
  })
  const hp = (await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.memberHp))[0]!
  expect(hp).toBeLessThan(100)

  expect(errors).toEqual([])
})

import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3c：队员能力自动开火 → 抛射物命中 → 敌人死亡（kills 递增）。

type EcsDbg = { ready: boolean; enemies: number; kills: number; projectiles: number }
const dbg = () => (window as unknown as { __ecs: EcsDbg }).__ecs

test('ECS 能力：队员自动开火，抛射物击杀来袭敌人', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['juggler', 'unicorn', 'troll', 'cowboy']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 投放几只僵尸在射程内
  await page.evaluate(() => {
    window.__ecsSpawnEnemy!('zombie', 3, 0)
    window.__ecsSpawnEnemy!('zombie', -3, 1)
    window.__ecsSpawnEnemy!('zombie', 0, -3)
  })
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 3)

  // 抛射物应出膛
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.projectiles > 0, undefined, {
    timeout: 8000,
  })
  await page.screenshot({ path: 'test-results/ecs-p3-abilities.png' })

  // 队员开火击杀敌人（kills 递增）
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.kills > 0, undefined, {
    timeout: 20_000,
  })

  expect(errors).toEqual([])
})

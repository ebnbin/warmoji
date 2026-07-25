import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（队长主动技能）：纯 CD 门槛，就绪即放、放完进冷却；效果本体是队长持有的标准能力行。
// 测试模式队长是「测试员」，技能载荷 = discoFever（全场蹦迪）——顺带验证蹦迪窗口生效。

type EcsDbg = { ready: boolean; enemies: number }
type Host = {
  castSkill(): boolean
  skillSnapshot(): { name: string; remainMs: number; cdMs: number; ready: boolean }
}
type G = { scene: { getScene(k: string): Host } }

test('ECS 队长技能：就绪即放 → 进入冷却 → 全场蹦迪生效', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 放一只敌人当观察对象
  await page.evaluate(() => window.__ecsSpawnEnemy!('hive', 5, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)

  // 开局即就绪
  expect(await page.evaluate(() => ((window.__game as unknown as G).scene.getScene('ecsArena')).skillSnapshot().ready)).toBe(true)
  expect(await page.evaluate(() => window.__ecsDancing!())).toBe(false)

  // 释放：返回 true、进入冷却、蹦迪窗口开启
  expect(await page.evaluate(() => ((window.__game as unknown as G).scene.getScene('ecsArena')).castSkill())).toBe(true)
  const after = await page.evaluate(() => ((window.__game as unknown as G).scene.getScene('ecsArena')).skillSnapshot())
  expect(after.ready).toBe(false)
  expect(after.remainMs).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.__ecsDancing!())).toBe(true)

  // 冷却中再放不出（纯 CD 门槛）
  expect(await page.evaluate(() => ((window.__game as unknown as G).scene.getScene('ecsArena')).castSkill())).toBe(false)

  // 冷却按真实时钟推进，到点回到就绪（测试员 CD 仅 1s）
  await page.waitForFunction(() => ((window.__game as unknown as G).scene.getScene('ecsArena')).skillSnapshot().ready === true, undefined, { timeout: 15_000 })

  expect(errors).toEqual([])
})

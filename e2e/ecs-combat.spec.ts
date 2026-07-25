import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3b：接触伤害 / 敌人受伤致死 / 击退。

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  enemies: number
  enemyPos: { x: number; y: number }[]
  kills: number
  over: boolean
  alive: number
  memberHp: number[]
}
const dbg = () => (window as unknown as { __ecs: EcsDbg }).__ecs

async function boot(page: import('@playwright/test').Page): Promise<void> {
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
  // 关掉试炼场「无敌」旋钮：本例要看真实扣血（缺省天量血看不出接触伤害）
  await page.evaluate(() => window.__ecsLabRoster!(['juggler', 'unicorn', 'troll', 'cowboy'], [], false))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })
}

test('ECS 战斗：接触扣血 + 敌人受伤致死', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))

  await boot(page)
  // 贴脸投放僵尸：接触判定触发，队员掉血
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 1, 0))
  await page.waitForFunction(() => Math.min(...(window as unknown as { __ecs: EcsDbg }).__ecs.memberHp) < 100, undefined, {
    timeout: 12_000,
  })

  // 秒杀敌人：kills+1，敌人清零
  const before = await page.evaluate(dbg)
  await page.evaluate(() => window.__ecsHurtEnemy!(9999, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 0)
  const after = await page.evaluate(dbg)
  expect(after.kills).toBe(before.kills + 1)

  expect(errors).toEqual([])
})

test('ECS 战斗：击退把敌人推离队伍', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 3, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  const x0 = (await page.evaluate(dbg)).enemyPos[0]!.x
  // 大力击退（源在队伍中心 → 沿 +x 推开）
  await page.evaluate(() => window.__ecsHurtEnemy!(1, 900))
  // 敌人被推离中心（x 增大）
  await page.waitForFunction(
    (px) => (window as unknown as { __ecs: EcsDbg }).__ecs.enemyPos[0]!.x > px + 40,
    x0,
    { timeout: 5000 },
  )
})

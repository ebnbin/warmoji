import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3a：ECS 敌人装配 + chase（直奔最近队员）+ 团队 orbit 因敌情起反应。

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  enemies: number
  enemyPos: { x: number; y: number }[]
}
const dbg = () => (window as unknown as { __ecs: EcsDbg }).__ecs

test('ECS 敌人：投放僵尸，直奔队伍中心（chase）', async ({ page }) => {
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
  // 单人近战队（troll）：远处僵尸能自由追近一段再进入近战射程被击（避免被远程秒掉）
  await page.evaluate(() => window.__ecsLabRoster!(['troll']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 在中心右侧 5 格投放僵尸
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 5, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)

  const start = await page.evaluate(dbg)
  const startX = start.enemyPos[0]!.x
  expect(startX).toBeGreaterThan(start.centerX + 200) // 5*UNIT=320 右侧

  // 追击：等敌人 x 向中心逼近至少 90px（近战队，进射程前已自由追近一段）
  await page.waitForFunction(
    (sx) => {
      const e = (window as unknown as { __ecs: EcsDbg }).__ecs.enemyPos[0]
      return !!e && e.x < sx - 90
    },
    startX,
    { timeout: 12_000 },
  )

  await page.screenshot({ path: 'test-results/ecs-p3-enemy.png' })
  expect(errors).toEqual([])
})

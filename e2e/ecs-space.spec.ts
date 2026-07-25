import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P5（深空）：ECS 版太空图——整张地图 = 全程常驻的圆形黑洞禁锢场（向外分量按距圆心衰减 +
// 硬边界兜底，谁也逃不出去）+ 天体横扫（预警直线 → 球体匀速划过，压到的实体敌我通吃）。
// 用世界钩子/世界事件探针确定性地校验，不依赖游戏时钟推进，与旧图 e2e 同口径。

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  meteor: { travelling: boolean; t: number } | null
}

// 禁锢半径（格）：与 defs/maps.ts 的 space.blackholeRadiusU 同源
const FIELD_R_U = 12.5
const UNIT = 64

test('ECS 深空图：黑洞禁锢场从头困住队伍、天体横扫可触发并划完', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

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
  await page.evaluate(() => window.__ecsLabRoster!(['juggler'], ['zombie']))
  await enterMap(page)
  await startTestBattle(page, 'space')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // ① 禁锢场从第一波起常驻：一路朝外猛冲也困在半径内（向外分量被衰减 + 硬边界钳制），
  //    但确实一路挤到了边缘（不是原地没动）
  const dist = await page.evaluate(() => {
    const step = window.__ecsStepTeam!
    let last = { x: 0, y: 0 }
    for (let i = 0; i < 300; i++) last = step(120, 0, 16)
    return Math.hypot(last.x, last.y)
  })
  const R = FIELD_R_U * UNIT
  expect(dist).toBeLessThanOrEqual(R * 1.02)
  expect(dist).toBeGreaterThan(R * 0.85)

  // ② 天体横扫：强开一次 → 先进预警、再起划、最终划完回收
  await page.evaluate(() => window.__ecsForceWorldTick!())
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.meteor !== null, undefined, {
    timeout: 15_000,
  })
  await page.waitForFunction(
    () => (window as unknown as { __ecs: EcsDbg }).__ecs.meteor?.travelling === true,
    undefined,
    { timeout: 15_000 },
  )
  await page.screenshot({ path: 'test-results/ecs-space.png' })
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.meteor === null, undefined, {
    timeout: 30_000,
  })

  expect(errors).toEqual([])
})

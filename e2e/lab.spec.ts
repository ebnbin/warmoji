import { expect, test } from '@playwright/test'
import { enterLab, enterMap, startRun } from './helpers'

type LabEnemy = { active: boolean; getData(k: string): { def: { kind: string } } }
type LabGame = { scene: { keys: Record<string, { enemies: { getChildren(): LabEnemy[] } }> } }

test('试炼场入口：选地图即直接进入沙盒（跳过队长/组队）', async ({ page }) => {
  await page.goto('/')
  await enterMap(page)
  await enterLab(page)
  // 直接落在竞技场，且是试炼场地图（未经队长/组队/商店）
  await page.waitForFunction(() => window.__warmoji?.mapId === 'lab')
  // 队伍来自试炼场勾选阵容（默认 3 角色），而非压测的固定 5 人——验证角色选择生效
  const alive = await page.evaluate(() => window.__warmoji!.alive)
  expect(alive).toBe(3)
})

test('试炼场：只出勾选的敌人、玩家免死无时限', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await startRun(page)

  // 进入试炼场，只勾选毒蛇
  await page.evaluate(() => window.__setLab!(['snake']))

  // 试炼场维持一个小在场池：毒蛇会成群补到场
  await page.waitForFunction(
    () => {
      try {
        const g = window.__game as LabGame
        return g.scene.keys['arena']!.enemies.getChildren().filter((e) => e.active).length >= 4
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 60_000 },
  )

  // 在场敌人全是勾选的那一种
  const kinds = await page.evaluate(() => {
    const g = window.__game as LabGame
    return g.scene.keys['arena']!.enemies
      .getChildren()
      .filter((e) => e.active)
      .map((e) => e.getData('enemy').def.kind)
  })
  expect(kinds.length).toBeGreaterThan(0)
  expect([...new Set(kinds)]).toEqual(['snake'])

  // 玩家免死（与压测同一套 sandbox 免死骨架，血量拉满）
  const s = await page.evaluate(() => window.__warmoji!)
  expect(s.hp).toBeGreaterThan(100_000)

  // 切换勾选实时生效：改成自爆怪后，新出场的应含自爆怪
  await page.evaluate(() => window.__setLab!(['creeper']))
  await page.waitForFunction(
    () => {
      try {
        const g = window.__game as LabGame
        return g.scene.keys['arena']!.enemies
          .getChildren()
          .some((e) => e.active && e.getData('enemy').def.kind === 'creeper')
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 60_000 },
  )

  expect(errors).toEqual([])
})

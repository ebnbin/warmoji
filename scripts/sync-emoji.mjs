// 构建前把 @twemoji/svg 全集同步到 public/emoji/<版本>/（生成物不进 git），
// 并生成图鉴用清单 manifest.json：基础形态 codepoint 列表（剔除肤色变体）
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const srcDir = join(root, 'node_modules/@twemoji/svg')
const version = JSON.parse(readFileSync(join(srcDir, 'package.json'), 'utf8')).version
const destRoot = join(root, 'public/emoji')
const destDir = join(destRoot, version)
const manifestPath = join(destDir, 'manifest.json')

// 肤色修饰符 1F3FB..1F3FF：含任一段即视为变体，不进完整列表
const TONES = new Set(['1f3fb', '1f3fc', '1f3fd', '1f3fe', '1f3ff'])
const isBase = (name) => !name.split('-').some((seg) => TONES.has(seg))

const files = readdirSync(srcDir).filter((f) => f.endsWith('.svg'))
const synced =
  existsSync(destDir) &&
  readdirSync(destDir).filter((f) => f.endsWith('.svg')).length === files.length &&
  existsSync(manifestPath)
if (synced) process.exit(0)

rmSync(destRoot, { recursive: true, force: true })
mkdirSync(destDir, { recursive: true })
for (const f of files) copyFileSync(join(srcDir, f), join(destDir, f))

const base = files
  .map((f) => f.slice(0, -4))
  .filter(isBase)
  .sort()
writeFileSync(manifestPath, JSON.stringify({ base }))
console.log(
  `twemoji ${version}: ${files.length} 个 SVG → public/emoji/${version}/（基础形态 ${base.length}）`,
)

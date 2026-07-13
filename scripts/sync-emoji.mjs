// 构建前把 @twemoji/svg 全集同步到 public/emoji/<版本>/（生成物不进 git）
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const srcDir = join(root, 'node_modules/@twemoji/svg')
const version = JSON.parse(readFileSync(join(srcDir, 'package.json'), 'utf8')).version
const destRoot = join(root, 'public/emoji')
const destDir = join(destRoot, version)

const files = readdirSync(srcDir).filter((f) => f.endsWith('.svg'))
if (existsSync(destDir) && readdirSync(destDir).length === files.length) {
  process.exit(0)
}
rmSync(destRoot, { recursive: true, force: true })
mkdirSync(destDir, { recursive: true })
for (const f of files) copyFileSync(join(srcDir, f), join(destDir, f))
console.log(`twemoji ${version}: ${files.length} 个 SVG → public/emoji/${version}/`)

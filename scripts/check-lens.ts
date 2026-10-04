import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// 战斗镜头只由镜头层摆：战斗代码别处不许加减镜头、调主镜头的方法、改镜头的缩放边界视口、跟随与震屏闪屏。读镜头拍到哪里不受限。
const root = resolve('src/ecs')
const lens = join(root, 'lens.ts')

const RULES: readonly { readonly re: RegExp; readonly what: string }[] = [
  { re: /\bcameras\.(add|remove)\s*\(/, what: '加减镜头' },
  { re: /\bcameras\.main\.\w+\s*\(/, what: '调主镜头的方法' },
  { re: /\.(setZoom|setBounds|removeBounds|setViewport|centerOn|centerOnX|centerOnY|zoomTo|setLerp|setFollowOffset|setDeadzone)\s*\(/, what: '改镜头的缩放、边界或视口' },
  { re: /\bcam(era)?\.(startFollow|stopFollow|setScroll|shake|flash|fade|fadeIn|fadeOut|pan)\s*\(/, what: '改镜头的跟随或效果' },
]

const files: string[] = []
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.ts') && p !== lens) files.push(p)
  }
}
walk(root)

const errors: string[] = []
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line)) errors.push(`${relative('.', file)}:${i + 1} ${rule.what}，改经镜头层 src/ecs/lens.ts：${line.trim()}`)
      }
    })
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

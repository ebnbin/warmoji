import * as components from './components'
import { resizeColumn } from './components'
import * as store from './store'
import { INITIAL_CAPACITY } from './world'

let capacity = INITIAL_CAPACITY

function resize(length: number): void {
  for (const comp of Object.values(components)) {
    if (typeof comp !== 'object' || Array.isArray(comp)) continue
    const fields = comp as Record<string, unknown>
    for (const key of Object.keys(fields)) {
      const col = fields[key]
      if (col instanceof Float32Array || col instanceof Int32Array || col instanceof Uint32Array || col instanceof Uint8Array) {
        fields[key] = resizeColumn(col, length)
      }
    }
  }
  for (const arr of Object.values(store) as unknown[][]) {
    if (length < arr.length) arr.length = length
    // 逐个 push 保持 packed
    while (arr.length < length) arr.push(undefined)
  }
  capacity = length
}

/** eid 越过容量时翻倍，须在该 eid 的任何写入之前调 */
export function ensureCapacity(eid: number): void {
  if (eid < capacity) return
  let length = capacity * 2
  while (length <= eid) length *= 2
  resize(length)
}

/** 新 world 建好、尚未建任何实体时调：容量复原，富数据清空 */
export function resetEntityStorage(): void {
  if (capacity !== INITIAL_CAPACITY) resize(INITIAL_CAPACITY)
  for (const arr of Object.values(store) as unknown[][]) arr.fill(undefined)
}

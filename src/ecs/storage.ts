import * as components from './components'
import { columnFill, columnStride, resizeColumn } from './components'
import type { Column } from './components'
import * as store from './store'
import { INITIAL_CAPACITY } from './world'

let capacity = INITIAL_CAPACITY

const STORE = Object.values(store) as unknown[][]

function eachColumn(fn: (fields: Record<string, unknown>, key: string, col: Column) => void): void {
  for (const comp of Object.values(components)) {
    if (typeof comp !== 'object' || Array.isArray(comp)) continue
    const fields = comp as Record<string, unknown>
    for (const key of Object.keys(fields)) {
      const col = fields[key]
      if (col instanceof Float32Array || col instanceof Int32Array || col instanceof Uint32Array || col instanceof Uint8Array) {
        fn(fields, key, col)
      }
    }
  }
}

interface Columns {
  plain: Column[]
  plainFill: number[]
  strided: Column[]
  stride: number[]
}

function collectColumns(): Columns {
  const out: Columns = { plain: [], plainFill: [], strided: [], stride: [] }
  eachColumn((_fields, _key, col) => {
    const stride = columnStride(col)
    if (stride === 1) {
      out.plain.push(col)
      out.plainFill.push(columnFill(col))
    } else {
      out.strided.push(col)
      out.stride.push(stride)
    }
  })
  return out
}

let columns = collectColumns()

function resize(length: number): void {
  eachColumn((fields, key, col) => {
    fields[key] = resizeColumn(col, length)
  })
  columns = collectColumns()
  for (const arr of STORE) {
    if (length < arr.length) arr.length = length
    while (arr.length < length) arr.push(undefined)
  }
  capacity = length
}

export function ensureCapacity(eid: number): void {
  if (eid < capacity) return
  let length = capacity * 2
  while (length <= eid) length *= 2
  resize(length)
}

export function clearEntity(eid: number): void {
  const c = columns
  for (let i = 0; i < c.plain.length; i++) c.plain[i]![eid] = c.plainFill[i]!
  for (let i = 0; i < c.strided.length; i++) c.strided[i]!.fill(0, eid * c.stride[i]!, (eid + 1) * c.stride[i]!)
  for (let i = 0; i < STORE.length; i++) STORE[i]![eid] = undefined
}

export function resetEntityStorage(): void {
  if (capacity !== INITIAL_CAPACITY) resize(INITIAL_CAPACITY)
  for (const arr of STORE) arr.fill(undefined)
}

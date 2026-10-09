import statusesJson from '../assets/statuses.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { StatusDef, StatusId } from '../types/statuses'

export const STATUSES = fromJson<Record<StatusId, StatusDef>>(statusesJson)

export const STATUS_IDS: readonly StatusId[] = keysOf(STATUSES)

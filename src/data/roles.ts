import rolesJson from '../assets/roles.json'
import { fromJson } from './json'
import type { RoleDef, RoleId } from '../types/roles'

export const ROLES = fromJson<Record<RoleId, RoleDef>>(rolesJson)

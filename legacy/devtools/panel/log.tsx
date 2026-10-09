import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { devLogEntries, LOG_CHANGED, logEvents, markLogRead } from '../log'
import type { DevLogLevel } from '../log'
import { clock } from '../util'
import { useEvent } from './live'

const MAX_SHOWN = 80

/** 日志开着就算读过：未读角标随之清零 */
export function LogView({ filter }: { readonly filter: DevLogLevel | 'all' }): ReactNode {
  const changed = useEvent(logEvents, LOG_CHANGED, 300)
  useEffect(() => {
    markLogRead()
  }, [changed])
  const entries = devLogEntries().filter((e) => filter === 'all' || e.level === filter)
  const shown = entries.slice(-MAX_SHOWN).reverse()
  return (
    <div className="dt-log dt-mono">
      {shown.map((e, i) => (
        <div key={i} className={`dt-log-${e.level}`}>{`${clock(e.at)}  ${e.text}`}</div>
      ))}
      {entries.length > shown.length && <div className="dt-muted">{`还有 ${entries.length - shown.length} 条更早的记录`}</div>}
    </div>
  )
}

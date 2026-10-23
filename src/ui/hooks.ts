import { useEffect, useState } from 'react'

/** Re-renders on a fixed beat, for countdowns. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, enabled])
  return now
}

/**
 * Keeps the screen on while a workout is open, so rest countdowns stay in
 * view. iOS drops the lock whenever the app is hidden, so it's taken again
 * each time the app comes back.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    let stopped = false
    const acquire = () => {
      if (stopped || document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (stopped) void l.release()
          else lock = l
        },
        // Refused (low power mode, say): the screen just sleeps as usual.
        () => {},
      )
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [active])
}

import { useRegisterSW } from 'virtual:pwa-register/react'

// A new version waits for a tap instead of reloading on its own, so an
// update can never yank the screen away mid-set.
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div className="banner">
      <span>A new version is ready.</span>
      <button className="btn btn-small" onClick={() => void updateServiceWorker(true)}>
        Update
      </button>
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { setCustomExercises } from '../data/exercises.ts'
import { setCustomSchemes } from '../data/schemes.ts'
import { db } from '../db/db.ts'
import { activeSession } from '../db/sessions.ts'
import { ExerciseRatings } from './screens/ExerciseRatings.tsx'
import { Home } from './screens/Home.tsx'
import { ExerciseLibrary, ProgramLibrary, SchemeLibrary } from './screens/Library.tsx'
import { ProfileTargets } from './screens/ProfileTargets.tsx'
import { ProgramEditor } from './screens/ProgramEditor.tsx'
import { ProfileCreate } from './screens/ProfileCreate.tsx'
import { ProfileDetail } from './screens/ProfileDetail.tsx'
import { ProfileEdit } from './screens/ProfileEdit.tsx'
import { Profiles } from './screens/Profiles.tsx'
import { Progress } from './screens/Progress.tsx'
import { Session } from './screens/Session.tsx'
import { SessionSummary } from './screens/SessionSummary.tsx'
import { Settings } from './screens/Settings.tsx'
import { StartWeek } from './screens/StartWeek.tsx'
import { StartWorkout } from './screens/StartWorkout.tsx'
import { WeekView } from './screens/WeekView.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/progress', label: 'Progress', end: false },
  { to: '/profiles', label: 'Profiles', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

// Once per launch, not on every visit to Home.
let checkedForWorkout = false

/**
 * iOS kills home-screen apps freely. If one dies mid-workout, reopening it
 * should land back on the workout, not on Home.
 */
function useResumeWorkout() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    if (checkedForWorkout) return
    checkedForWorkout = true
    if (location.pathname !== '/') return
    void activeSession().then((session) => {
      if (session) navigate('/session', { replace: true })
    })
  }, [location.pathname, navigate])
}

/** The screen scrolls inside its own frame (see .app), so a new screen has to start at its top by hand. */
function useScrollReset() {
  const ref = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    ref.current?.scrollTo(0, 0)
  }, [pathname])
  return ref
}

export function App() {
  useResumeWorkout()
  const scroller = useScrollReset()
  // Custom exercises and schemes live in IndexedDB; the lookups every screen
  // uses keep a copy. Refreshing them here, above every screen, means they all
  // re-render with them when one is added.
  const custom = useLiveQuery(() => db.exercises.toArray(), [])
  if (custom) setCustomExercises(custom)
  const schemes = useLiveQuery(() => db.schemes.toArray(), [])
  if (schemes) setCustomSchemes(schemes)
  return (
    <div className="app">
      <UpdateBanner />
      <main className="scroller" ref={scroller}>
        <div className="screen">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/workout" element={<StartWorkout />} />
            <Route path="/session" element={<Session />} />
            <Route path="/sessions/:id" element={<SessionSummary />} />
            <Route path="/start-week" element={<StartWeek />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/profiles" element={<Profiles />} />
            <Route path="/profiles/new" element={<ProfileCreate />} />
            <Route path="/profiles/:id" element={<ProfileDetail />} />
            <Route path="/profiles/:id/edit" element={<ProfileEdit />} />
            <Route path="/profiles/:id/week" element={<WeekView />} />
            <Route path="/profiles/:id/program" element={<ProgramEditor />} />
            <Route path="/profiles/:id/targets" element={<ProfileTargets />} />
            <Route path="/profiles/:id/exercises" element={<ExerciseRatings />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/exercises" element={<ExerciseLibrary />} />
            <Route path="/settings/schemes" element={<SchemeLibrary />} />
            <Route path="/settings/programs" element={<ProgramLibrary />} />
          </Routes>
        </div>
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tab">
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

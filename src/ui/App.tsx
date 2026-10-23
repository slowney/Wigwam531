import { NavLink, Route, Routes } from 'react-router'
import { Home } from './screens/Home'
import { Progress } from './screens/Progress'
import { Profiles } from './screens/Profiles'
import { Settings } from './screens/Settings'
import { UpdateBanner } from './UpdateBanner'

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/progress', label: 'Progress', end: false },
  { to: '/profiles', label: 'Profiles', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export function App() {
  return (
    <div className="app">
      <UpdateBanner />
      <main className="screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
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

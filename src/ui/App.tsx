import { NavLink, Route, Routes } from 'react-router'
import { Home } from './screens/Home.tsx'
import { ProfileCreate } from './screens/ProfileCreate.tsx'
import { ProfileDetail } from './screens/ProfileDetail.tsx'
import { ProfileEdit } from './screens/ProfileEdit.tsx'
import { Profiles } from './screens/Profiles.tsx'
import { Progress } from './screens/Progress.tsx'
import { Settings } from './screens/Settings.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'

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
          <Route path="/profiles/new" element={<ProfileCreate />} />
          <Route path="/profiles/:id" element={<ProfileDetail />} />
          <Route path="/profiles/:id/edit" element={<ProfileEdit />} />
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

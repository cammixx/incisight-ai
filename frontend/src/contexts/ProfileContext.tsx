import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

export interface ProfileData {
  id?: string
  display_name: string | null
  avatar_url: string | null
  skin_type: string | null
  skin_goals: string[]
  avoid_list: string[]
}

interface ProfileContextValue {
  profile: ProfileData | null
  loading: boolean
  refetch: () => void
  update: (updates: Partial<ProfileData>) => void
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  refetch: () => {},
  update: () => {},
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    setLoading(true)
    apiFetch<ProfileData>('/api/profile')
      .then(setProfile)
      .catch((err) => console.error('Failed to load profile:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refetch() }, [refetch])

  const update = useCallback((updates: Partial<ProfileData>) => {
    setProfile((prev) => prev ? { ...prev, ...updates } : prev)
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, loading, refetch, update }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}

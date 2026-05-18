import { useEffect, useRef, useState } from 'react'
import { Trash2, Key, Camera } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useProfile } from '../contexts/ProfileContext'

type SkinType = 'Oily' | 'Dry' | 'Combination' | 'Sensitive'
const SKIN_TYPES: SkinType[] = ['Oily', 'Dry', 'Combination', 'Sensitive']
const GOALS = ['Hydration', 'Anti-aging', 'Brightening', 'Acne control', 'Soothing', 'SPF protection']

interface Profile {
  id: string
  display_name: string | null
  skin_type: SkinType | null
  skin_goals: string[]
  avoid_list: string[]
  avatar_url: string | null
}

export default function Profile() {
  const { profile: ctxProfile, update: updateCtxProfile } = useProfile()
  // Local edit-only state — does not duplicate ctxProfile
  const [editSkinType, setEditSkinType] = useState<SkinType | null>(null)
  const [editGoals, setEditGoals] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
      if (data.user?.id) setUserId(data.user.id)
    })
  }, [])

  async function save(updates: Partial<Profile>) {
    setSaving(true)
    setSaved(false)
    const updated = await apiFetch<Profile>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    updateCtxProfile(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setAvatarUploading(true)
    try {
      const path = `${userId}/avatar`
      const { error } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type,
      })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const urlWithBust = `${publicUrl}?t=${Date.now()}`
      await save({ avatar_url: urlWithBust })
    } catch (err: any) {
      console.error('Avatar upload failed:', err.message)
    } finally {
      setAvatarUploading(false)
      if (avatarRef.current) avatarRef.current.value = ''
    }
  }

  function startEditing() {
    setEditName(ctxProfile?.display_name || '')
    setEditSkinType((ctxProfile?.skin_type as SkinType) ?? null)
    setEditGoals(ctxProfile?.skin_goals ?? [])
    setEditing(true)
  }

  async function saveEdits() {
    await save({
      display_name: editName.trim() || null,
      skin_type: editSkinType,
      skin_goals: editGoals,
    } as Partial<Profile>)
    setEditing(false)
  }

  function toggleGoal(goal: string) {
    setEditGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    )
  }

  async function handleResetPassword() {
    if (!email) return
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) setResetMessage(error.message)
    else setResetMessage('Password reset link sent to your email.')
    setTimeout(() => setResetMessage(null), 4000)
  }

  async function handleDeleteAccount() {
    try {
      await apiFetch('/api/profile', { method: 'DELETE' })
      await supabase.auth.signOut()
    } catch {
      // silent
    }
  }

  if (!ctxProfile) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  const profile = ctxProfile as Profile
  const profileIncomplete = !profile.skin_type && profile.skin_goals.length === 0

  return (
    <div className="min-h-screen">
      <PageHeader title="Your Account">
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && <span className="text-xs text-green-500">Saved</span>}
      </PageHeader>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">

        {profileIncomplete && !editing && (
          <button
            onClick={startEditing}
            className="w-full flex items-center justify-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 text-center"
          >
            <span className="text-sm text-rose-600 whitespace-nowrap">Complete your skin profile below to unlock personalized insights ↓↓↓</span>
          </button>
        )}

        {/* Avatar */}
        <section className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-rose-100 flex items-center justify-center overflow-hidden border-2 border-rose-200">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-rose-400">
                  {profile.display_name ? profile.display_name[0].toUpperCase() : '?'}
                </span>
              )}
            </div>
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-0 right-0 w-7 h-7 bg-rose-400 text-white rounded-full flex items-center justify-center shadow-md disabled:opacity-50 transition-colors"
              title="Change photo"
            >
              <Camera size={13} />
            </button>
          </div>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          {avatarUploading && <p className="text-xs text-gray-400">Uploading…</p>}
          <p className="text-sm font-semibold text-gray-700">{profile.display_name || '—'}</p>
        </section>

        {/* Profile information */}
        <section>
          <div className="bg-white rounded-2xl border border-rose-100 divide-y divide-rose-50">
            {/* Username */}
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-sm font-medium text-gray-900">Username</p>
              {editing ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdits()}
                  className="w-40 px-3 py-1.5 rounded-lg border border-rose-200/60 text-sm text-right focus:outline-none focus:ring-2 focus:ring-rose-300"
                  autoFocus
                />
              ) : (
                <p className="text-sm text-gray-500">{profile.display_name || '—'}</p>
              )}
            </div>
            {/* Email */}
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-sm font-medium text-gray-900">Email</p>
              <p className="text-sm text-gray-500">{email}</p>
            </div>
            {/* Skin type */}
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-sm font-medium text-gray-900">Skin Type</p>
              {editing ? (
                <div className="flex gap-1.5">
                  {SKIN_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setEditSkinType(type)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        editSkinType === type
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{profile.skin_type || '—'}</p>
              )}
            </div>
            {/* Goals */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-900">Skin Goals</p>
                {!editing && (
                  <p className="text-sm text-gray-500">
                    {profile.skin_goals.length > 0 ? profile.skin_goals.join(', ') : '—'}
                  </p>
                )}
              </div>
              {editing && (
                <div className="flex flex-wrap gap-1.5">
                  {GOALS.map((goal) => (
                    <button
                      key={goal}
                      onClick={() => toggleGoal(goal)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        editGoals.includes(goal)
                          ? 'bg-rose-400 text-white border-rose-400'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Edit / Save buttons */}
            <div className="flex items-center justify-end gap-2 px-5 py-3">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    className="px-4 py-1.5 text-sm text-white bg-rose-400 rounded-lg font-medium"
                  >
                    Save
                  </button>
                </>
              ) : (
                <button onClick={startEditing} className="text-xs text-rose-400 hover:underline font-medium">
                  Edit
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Account actions */}
        <section className="space-y-3 pt-4 border-t border-gray-100">
          <button
            onClick={handleResetPassword}
            className="w-full flex items-center gap-2 text-sm text-gray-600 transition-colors"
          >
            <Key size={16} />
            Reset password
          </button>
          {resetMessage && <p className="text-xs text-green-600">{resetMessage}</p>}

          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="w-full flex items-center gap-2 text-sm text-gray-600 transition-colors"
            >
              <Trash2 size={16} />
              Delete Your Account
            </button>
          ) : (
            <div className="bg-red-50 rounded-xl p-4 space-y-3">
              <p className="text-sm text-red-600 font-medium">Are you sure? This action cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium"
                >
                  Yes, delete my account
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="flex-1 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

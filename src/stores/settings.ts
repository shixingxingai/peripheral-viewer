import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/storage'

export type Accent = 'cyan' | 'violet' | 'amber'
export type Language = 'zh' | 'en'
export type MotionPreference = 'system' | 'reduced'

interface SettingsState {
  accent: Accent
  language: Language
  motion: MotionPreference
  telemetryEnabled: boolean
  retentionDays: number
  notifications: boolean
  autostart: boolean
  setAccent: (accent: Accent) => void
  setLanguage: (language: Language) => void
  setMotion: (motion: MotionPreference) => void
  setTelemetryEnabled: (value: boolean) => void
  setRetentionDays: (value: number) => void
  setNotifications: (value: boolean) => void
  setAutostart: (value: boolean) => void
}

export function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent
}

export function applyMotion(motion: MotionPreference): void {
  document.documentElement.dataset.motion = motion
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      accent: 'cyan',
      language: 'zh',
      motion: 'system',
      telemetryEnabled: true,
      retentionDays: 7,
      notifications: true,
      autostart: false,
      setAccent: (accent) => {
        applyAccent(accent)
        set({ accent })
      },
      setLanguage: (language) => set({ language }),
      setMotion: (motion) => {
        applyMotion(motion)
        set({ motion })
      },
      setTelemetryEnabled: (telemetryEnabled) => set({ telemetryEnabled }),
      setRetentionDays: (retentionDays) => set({ retentionDays }),
      setNotifications: (notifications) => set({ notifications }),
      setAutostart: (autostart) => set({ autostart }),
    }),
    {
      name: STORAGE_KEYS.settings,
      partialize: (state) => ({
        accent: state.accent,
        language: state.language,
        motion: state.motion,
        telemetryEnabled: state.telemetryEnabled,
        retentionDays: state.retentionDays,
        notifications: state.notifications,
        autostart: state.autostart,
      }),
    },
  ),
)

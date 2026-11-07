import { create } from 'zustand'
import type { PageId } from '@/types/device'
import { useDeviceStore } from './devices'

export type ToastVariant = 'default' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

const PAGES: PageId[] = ['overview', 'viewer', 'topology', 'telemetry', 'layout', 'settings']

function readPage(): PageId {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return (PAGES as string[]).includes(hash) ? (hash as PageId) : 'overview'
}

interface UiState {
  page: PageId
  drawerOpen: boolean
  paletteOpen: boolean
  toasts: Toast[]
  setPage: (page: PageId) => void
  openDevice: (id: string) => void
  closeDrawer: () => void
  setPaletteOpen: (open: boolean) => void
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

let toastCounter = 0

export const useUiStore = create<UiState>((set, get) => ({
  page: typeof window === 'undefined' ? 'overview' : readPage(),
  drawerOpen: false,
  paletteOpen: false,
  toasts: [],
  setPage: (page) => {
    if (get().page !== page) {
      window.location.hash = `#/${page}`
      window.scrollTo({ top: 0 })
    }
    set({ page })
  },
  openDevice: (id) => {
    useDeviceStore.getState().select(id)
    set({ drawerOpen: true })
  },
  closeDrawer: () => set({ drawerOpen: false }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  pushToast: (toast) => {
    const id = `toast-${++toastCounter}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
    }, 4600)
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}))

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/storage'
import { prefersReducedMotion } from '@/lib/utils'

interface ViewerState {
  autoRotate: boolean
  wireframe: boolean
  showAnchors: boolean
  showCable: boolean
  bloom: boolean
  setAutoRotate: (value: boolean) => void
  setWireframe: (value: boolean) => void
  setShowAnchors: (value: boolean) => void
  setShowCable: (value: boolean) => void
  setBloom: (value: boolean) => void
}

const defaults = {
  autoRotate: !prefersReducedMotion(),
  wireframe: false,
  showAnchors: true,
  showCable: true,
  bloom: true,
}

export const useViewerStore = create<ViewerState>()(
  persist(
    (set) => ({
      ...defaults,
      setAutoRotate: (autoRotate) => set({ autoRotate }),
      setWireframe: (wireframe) => set({ wireframe }),
      setShowAnchors: (showAnchors) => set({ showAnchors }),
      setShowCable: (showCable) => set({ showCable }),
      setBloom: (bloom) => set({ bloom }),
    }),
    { name: STORAGE_KEYS.viewer },
  ),
)

import { create } from 'zustand'
import type { DeskLayout, LayoutItem } from '@/types/device'

interface LayoutState {
  items: LayoutItem[]
  name: string
  dirty: boolean
  loaded: boolean
  updatedAt: number | null
  setItems: (items: LayoutItem[], dirty?: boolean) => void
  moveItem: (deviceId: string, x: number, y: number) => void
  addItem: (item: LayoutItem) => void
  removeItem: (deviceId: string) => void
  rotateItem: (deviceId: string) => void
  updateItem: (deviceId: string, patch: Partial<Omit<LayoutItem, 'deviceId'>>) => void
  setName: (name: string) => void
  hydrate: (layout: DeskLayout | null, defaults: LayoutItem[]) => void
  markSaved: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  items: [],
  name: '我的桌面',
  dirty: false,
  loaded: false,
  updatedAt: null,
  setItems: (items, dirty = true) => set({ items, dirty }),
  moveItem: (deviceId, x, y) =>
    set((state) => ({
      items: state.items.map((item) => (item.deviceId === deviceId ? { ...item, x, y } : item)),
      dirty: true,
    })),
  addItem: (item) =>
    set((state) => ({
      items: state.items.some((existing) => existing.deviceId === item.deviceId)
        ? state.items
        : [...state.items, item],
      dirty: true,
    })),
  removeItem: (deviceId) =>
    set((state) => ({
      items: state.items.filter((item) => item.deviceId !== deviceId),
      dirty: true,
    })),
  rotateItem: (deviceId) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.deviceId === deviceId ? { ...item, rotation: (item.rotation + 90) % 360 } : item,
      ),
      dirty: true,
    })),
  updateItem: (deviceId, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.deviceId === deviceId ? { ...item, ...patch } : item)),
      dirty: true,
    })),
  setName: (name) => set({ name, dirty: true }),
  hydrate: (layout, defaults) =>
    set({
      items: layout?.items ?? defaults,
      name: layout?.name ?? '我的桌面',
      updatedAt: layout?.updatedAt ?? null,
      dirty: false,
      loaded: true,
    }),
  markSaved: () => set({ dirty: false, updatedAt: Date.now() }),
}))

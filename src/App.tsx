import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { ToastViewport } from '@/components/layout/ToastViewport'
import { Topbar } from '@/components/layout/Topbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DeviceDrawer } from '@/features/devices/DeviceDrawer'
import { useDeviceSync } from '@/hooks/useDeviceData'
import { loadRealSnapshot } from '@/lib/backend'
import { changeLanguage } from '@/lib/i18n'
import { applyAccent, applyMotion, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { PageId } from '@/types/device'

const OverviewPage = lazy(() =>
  import('@/features/devices/OverviewPage').then((module) => ({ default: module.OverviewPage })),
)
const ViewerPage = lazy(() =>
  import('@/features/viewer3d/ViewerPage').then((module) => ({ default: module.ViewerPage })),
)
const TopologyPage = lazy(() =>
  import('@/features/topology/TopologyPage').then((module) => ({ default: module.TopologyPage })),
)
const TelemetryPage = lazy(() =>
  import('@/features/telemetry/TelemetryPage').then((module) => ({
    default: module.TelemetryPage,
  })),
)
const LayoutPage = lazy(() =>
  import('@/features/layout/LayoutPage').then((module) => ({ default: module.LayoutPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center" aria-hidden="true">
      <span className="h-1 w-16 animate-pulse rounded-full bg-accent/40" />
    </div>
  )
}

const PAGE_IDS: PageId[] = ['overview', 'viewer', 'topology', 'telemetry', 'layout', 'settings']

function readPageFromHash(): PageId | null {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return (PAGE_IDS as string[]).includes(hash) ? (hash as PageId) : null
}

export default function App() {
  const { t } = useTranslation()
  const page = useUiStore((state) => state.page)
  const setPage = useUiStore((state) => state.setPage)
  const accent = useSettingsStore((state) => state.accent)
  const motionPreference = useSettingsStore((state) => state.motion)
  const language = useSettingsStore((state) => state.language)
  const { refresh } = useDeviceSync()

  useEffect(() => {
    void loadRealSnapshot()
  }, [])

  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  useEffect(() => {
    applyMotion(motionPreference)
  }, [motionPreference])

  useEffect(() => {
    void changeLanguage(language)
    document.title = language === 'zh' ? '外设视界 · Periphery' : 'Periphery · Peripheral Viewer'
  }, [language])

  useEffect(() => {
    if (!window.location.hash) window.location.hash = `#/${page}`
    const onHashChange = () => {
      const next = readPageFromHash()
      if (next) useUiStore.setState({ page: next })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [page])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        useUiStore.getState().setPaletteOpen(true)
        return
      }

      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const index = Number.parseInt(event.key, 10)
        if (index >= 1 && index <= PAGE_IDS.length) {
          event.preventDefault()
          setPage(PAGE_IDS[index - 1])
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPage])

  let content: React.ReactNode
  switch (page) {
    case 'viewer':
      content = <ViewerPage />
      break
    case 'topology':
      content = <TopologyPage />
      break
    case 'telemetry':
      content = <TelemetryPage />
      break
    case 'layout':
      content = <LayoutPage />
      break
    case 'settings':
      content = <SettingsPage />
      break
    default:
      content = <OverviewPage onRefresh={refresh} />
  }

  return (
    <TooltipProvider>
      <div className="app-shell">
        <Sidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Topbar onRefresh={refresh} />
          <div className="relative min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 overflow-y-auto overflow-x-hidden scroll-thin page-scroll"
                aria-label={t(`nav.${page}`)}
              >
                <Suspense fallback={<PageFallback />}>{content}</Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
          <StatusBar />
        </div>
        <DeviceDrawer />
        <CommandPalette onRefresh={refresh} />
        <ToastViewport />
      </div>
    </TooltipProvider>
  )
}

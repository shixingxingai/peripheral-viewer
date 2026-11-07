import {
  Anchor,
  Box,
  Cable,
  Camera,
  ChevronDown,
  Info,
  Rotate3d,
  RotateCcw,
  Sparkles,
  SquareDashed,
  Usb,
} from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type * as THREE from 'three'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { StatusBadge } from '@/components/common/ConnectionBadge'
import { DeviceGlyph } from '@/components/common/DeviceGlyph'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { cn, downloadDataUrl, prefersReducedMotion } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useViewerStore } from '@/stores/viewer'
import type { DeviceCategory } from '@/types/device'
import { ViewerScene } from './ViewerScene'
import { ViewerSidebar } from './ViewerSidebar'

class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D scene error', error, info)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

function HudButton({
  active,
  label,
  onClick,
  children,
  danger,
}: {
  active?: boolean
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
          active
            ? 'border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.12)] text-accent'
            : 'border-transparent text-ink-faint hover:bg-white/[0.06] hover:text-ink',
          danger && 'hover:text-rose-300',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function ViewerPage() {
  const { t } = useTranslation()
  const devices = useDeviceStore((state) => state.devices)
  const selectedId = useDeviceStore((state) => state.selectedId)
  const select = useDeviceStore((state) => state.select)
  const autoRotate = useViewerStore((state) => state.autoRotate)
  const wireframe = useViewerStore((state) => state.wireframe)
  const showAnchors = useViewerStore((state) => state.showAnchors)
  const showCable = useViewerStore((state) => state.showCable)
  const bloom = useViewerStore((state) => state.bloom)
  const setAutoRotate = useViewerStore((state) => state.setAutoRotate)
  const setWireframe = useViewerStore((state) => state.setWireframe)
  const setShowAnchors = useViewerStore((state) => state.setShowAnchors)
  const setShowCable = useViewerStore((state) => state.setShowCable)
  const setBloom = useViewerStore((state) => state.setBloom)
  const motionPreference = useSettingsStore((state) => state.motion)
  const openDevice = useUiStore((state) => state.openDevice)
  const setPage = useUiStore((state) => state.setPage)
  const pushToast = useUiStore((state) => state.pushToast)
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)

  const device = devices.find((item) => item.id === selectedId) ?? devices[0] ?? null
  const reduced =
    motionPreference === 'reduced' || (motionPreference === 'system' && prefersReducedMotion())
  const effectiveAutoRotate = autoRotate && !reduced

  useEffect(() => {
    // 切换设备时清掉上一个设备的锚点选中态
    if (!device?.id) return
    setActiveAnchor(null)
  }, [device?.id])

  if (!device) {
    return (
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center p-6">
        <EmptyState
          icon={Box}
          title={t('viewer.empty.title')}
          description={t('viewer.empty.detail')}
          action={
            <Button variant="primary" size="sm" onClick={() => setPage('overview')}>
              {t('overview.title')}
            </Button>
          }
        />
      </div>
    )
  }

  const handleScreenshot = () => {
    const gl = glRef.current
    if (!gl) {
      pushToast({ title: t('toast.screenshotFailed'), variant: 'error' })
      return
    }
    try {
      const dataUrl = gl.domElement.toDataURL('image/png')
      const safeName = device.name.replace(/[\\/:*?"<>|\s]+/g, '-').toLowerCase()
      downloadDataUrl(`${safeName || t('viewer.screenshotName')}-view.png`, dataUrl)
      pushToast({ title: t('toast.screenshotSaved'), variant: 'success' })
    } catch (error) {
      pushToast({
        title: t('toast.screenshotFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    }
  }

  const categories = [...new Set(devices.map((item) => item.category))] as DeviceCategory[]

  return (
    <div className="flex h-full min-h-[660px] flex-col gap-3 p-3 xl:gap-4 xl:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(var(--accent-rgb),0.22)] bg-[rgba(var(--accent-rgb),0.08)] text-accent">
            <Box className="h-4 w-4" strokeWidth={1.7} />
          </span>
          <div>
            <div className="flex items-center gap-2 text-[8.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
              INSPECTION / 3D
              <span className="hidden h-2.5 w-px bg-line sm:block" />
              <span className="hidden items-center gap-1.5 text-[8px] tracking-[0.14em] sm:flex">
                <span className="live-dot scale-[0.65]" />
                {t('common.live')}
              </span>
            </div>
            <h1 className="mt-0.5 text-[21px] font-semibold tracking-[-0.03em] text-ink">
              {t('viewer.title')}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <CategoryIcon category={device.category} className="h-3.5 w-3.5" />
            </span>
            <select
              value={device.id}
              onChange={(event) => select(event.target.value)}
              aria-label={t('viewer.selectDevice')}
              className="h-9 max-w-[300px] appearance-none truncate rounded-lg border border-line bg-white/[0.025] pl-8 pr-8 text-[11px] text-ink outline-none transition-colors hover:border-line-strong focus:border-[rgba(var(--accent-rgb),0.4)]"
            >
              {categories.map((category) => (
                <optgroup key={category} label={t(`category.${category}`)}>
                  {devices
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {item.manufacturer}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint" />
          </div>
          <Button
            variant="secondary"
            size="md"
            icon={<Info className="h-3.5 w-3.5" />}
            onClick={() => openDevice(device.id)}
          >
            <span className="hidden sm:inline">{t('overview.card.view')}</span>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
        <div className="panel relative min-h-[500px] flex-1 overflow-hidden rounded-2xl bg-[#06080d]">
          <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(var(--accent-rgb),0.05),transparent_60%)]" />
          <SceneBoundary
            fallback={
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
                <div className="w-52 opacity-80">
                  <DeviceGlyph category={device.category} accent={device.accent} />
                </div>
                <p className="text-[11px] text-ink-muted">{t('viewer.loading')}</p>
                <p className="font-mono text-[9px] text-ink-faint">
                  WebGL context unavailable · 2D fallback
                </p>
              </div>
            }
          >
            <ViewerScene
              device={device}
              autoRotate={autoRotate}
              wireframe={wireframe}
              showAnchors={showAnchors}
              showCable={showCable}
              bloom={bloom}
              resetToken={resetToken}
              activeAnchorId={activeAnchor}
              onCanvasReady={(gl) => {
                glRef.current = gl
              }}
            />
          </SceneBoundary>

          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />

            <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#070a11]/72 px-3 py-2 shadow-lg backdrop-blur-xl">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg border"
                style={{
                  borderColor: 'rgba(148,163,184,0.14)',
                  background: 'rgba(255,255,255,0.025)',
                  color: device.accent,
                }}
              >
                <CategoryIcon category={device.category} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="max-w-[190px] truncate text-[11.5px] font-medium leading-tight text-ink">
                  {device.name}
                </p>
                <p className="mt-0.5 max-w-[190px] truncate font-mono text-[8px] uppercase tracking-[0.08em] text-ink-faint">
                  {device.manufacturer} · {device.connection.protocol}
                </p>
              </div>
              <StatusBadge status={device.status} label={t(`status.${device.status}`)} size="sm" />
            </div>

            <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-[#070a11]/72 p-1 shadow-lg backdrop-blur-xl">
              <HudButton
                active={effectiveAutoRotate}
                label={t('viewer.controls.autoRotate')}
                onClick={() => setAutoRotate(!autoRotate)}
              >
                <Rotate3d className="h-3.5 w-3.5" strokeWidth={1.7} />
              </HudButton>
              <HudButton
                active={wireframe}
                label={t('viewer.controls.wireframe')}
                onClick={() => setWireframe(!wireframe)}
              >
                <SquareDashed className="h-3.5 w-3.5" strokeWidth={1.7} />
              </HudButton>
              <HudButton
                active={showAnchors}
                label={t('viewer.controls.anchors')}
                onClick={() => setShowAnchors(!showAnchors)}
              >
                <Anchor className="h-3.5 w-3.5" strokeWidth={1.7} />
              </HudButton>
              <HudButton
                active={showCable}
                label={t('viewer.controls.cable')}
                onClick={() => setShowCable(!showCable)}
              >
                <Cable className="h-3.5 w-3.5" strokeWidth={1.7} />
              </HudButton>
              <HudButton
                active={bloom}
                label={t('viewer.controls.bloom')}
                onClick={() => setBloom(!bloom)}
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
              </HudButton>
              <span className="mx-0.5 h-4 w-px bg-white/[0.09]" />
              <HudButton
                label={t('viewer.controls.reset')}
                onClick={() => setResetToken((value) => value + 1)}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} />
              </HudButton>
              <HudButton label={t('viewer.controls.screenshot')} onClick={handleScreenshot}>
                <Camera className="h-3.5 w-3.5" strokeWidth={1.7} />
              </HudButton>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5">
              <div className="flex w-fit items-center gap-2 rounded-md border border-white/[0.07] bg-[#070a11]/60 px-2 py-1 font-mono text-[8.5px] tracking-wide text-ink-faint backdrop-blur-md">
                <Usb className="h-2.5 w-2.5" />
                {t('viewer.hints')}
              </div>
              <div className="flex w-fit items-center gap-2 rounded-md border border-white/[0.07] bg-[#070a11]/60 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/80 backdrop-blur-md">
                <span className="h-1 w-1 rounded-full bg-emerald-400/80" />
                {t('viewer.performance.demand')} · {t('viewer.performance.dpr')} ·{' '}
                {t('viewer.performance.fps')}
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2">
              {device.rgb?.enabled ? (
                <span className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-[#070a11]/60 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint backdrop-blur-md">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: device.rgb.color,
                      boxShadow: `0 0 8px ${device.rgb.color}`,
                    }}
                  />
                  RGB · {device.rgb.mode}
                </span>
              ) : null}
              <span className="rounded-md border border-white/[0.07] bg-[#070a11]/60 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/80 backdrop-blur-md">
                {effectiveAutoRotate
                  ? t('viewer.performance.continuous')
                  : t('viewer.performance.demand')}
              </span>
            </div>

            <span className="pointer-events-none absolute left-2.5 top-2.5 h-3 w-3 border-l border-t border-white/15" />
            <span className="pointer-events-none absolute right-2.5 top-2.5 h-3 w-3 border-r border-t border-white/15" />
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 h-3 w-3 border-b border-l border-white/15" />
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 h-3 w-3 border-b border-r border-white/15" />
          </div>
        </div>

        <aside className="w-full shrink-0 xl:min-h-0 xl:w-[336px] xl:overflow-y-auto xl:pr-1 scroll-thin">
          <ViewerSidebar
            device={device}
            activeAnchorId={activeAnchor}
            onAnchorSelect={setActiveAnchor}
          />
        </aside>
      </div>
    </div>
  )
}

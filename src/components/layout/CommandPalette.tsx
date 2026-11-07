import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Activity,
  ArrowRight,
  Box,
  CornerDownLeft,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  type LucideIcon,
  Network,
  Palette,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Kbd } from '@/components/ui/kbd'
import { useHotplugSimulation } from '@/hooks/useDeviceData'
import { getDataSource } from '@/lib/backend/source'
import { canSimulateHotplug } from '@/lib/dataSourceText'
import { changeLanguage } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { type Accent, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { PageId } from '@/types/device'

const PAGE_ICONS: Record<PageId, LucideIcon> = {
  overview: LayoutDashboard,
  viewer: Box,
  topology: Network,
  telemetry: Activity,
  layout: LayoutTemplate,
  settings: Settings,
}

const PAGE_IDS: PageId[] = ['overview', 'viewer', 'topology', 'telemetry', 'layout', 'settings']
const ACCENTS: Accent[] = ['cyan', 'violet', 'amber']

interface PaletteItem {
  id: string
  group: 'pages' | 'devices' | 'actions'
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  onSelect: () => void
}

export function CommandPalette({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { t } = useTranslation()
  const open = useUiStore((state) => state.paletteOpen)
  const setOpen = useUiStore((state) => state.setPaletteOpen)
  const setPage = useUiStore((state) => state.setPage)
  const openDevice = useUiStore((state) => state.openDevice)
  const devices = useDeviceStore((state) => state.devices)
  const accent = useSettingsStore((state) => state.accent)
  const setAccent = useSettingsStore((state) => state.setAccent)
  const language = useSettingsStore((state) => state.language)
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const simulateHotplug = useHotplugSimulation()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const items = useMemo<PaletteItem[]>(() => {
    const normalized = query.trim().toLowerCase()
    const matches = (value: string) => value.toLowerCase().includes(normalized)

    const pageItems: PaletteItem[] = PAGE_IDS.map((page) => ({
      id: `page-${page}`,
      group: 'pages' as const,
      label: t(`nav.${page}`),
      description: t('palette.pages'),
      icon: (() => {
        const Icon = PAGE_ICONS[page]
        return <Icon className="h-4 w-4" strokeWidth={1.7} />
      })(),
      onSelect: () => {
        setPage(page)
        setOpen(false)
      },
    })).filter((item) => !normalized || matches(item.label))

    const deviceItems: PaletteItem[] = devices
      .filter((device) => {
        if (!normalized) return true
        return matches(
          `${device.name} ${device.manufacturer} ${device.connection.protocol} ${device.serial ?? ''}`,
        )
      })
      .slice(0, 7)
      .map((device) => ({
        id: `device-${device.id}`,
        group: 'devices' as const,
        label: device.name,
        description: `${device.manufacturer} · ${device.connection.protocol}`,
        icon: (
          <span style={{ color: device.accent }}>
            <CategoryIcon category={device.category} className="h-4 w-4" />
          </span>
        ),
        onSelect: () => {
          openDevice(device.id)
          setOpen(false)
        },
      }))

    const actions: PaletteItem[] = [
      {
        id: 'action-refresh',
        group: 'actions',
        label: t('palette.actionRefresh'),
        description: t('topbar.refresh'),
        icon: <RefreshCw className="h-4 w-4" strokeWidth={1.7} />,
        shortcut: 'R',
        onSelect: () => {
          setOpen(false)
          void onRefresh()
        },
      },
      {
        id: 'action-hotplug',
        group: 'actions',
        label: t('palette.actionHotplug'),
        description: t('common.simulate'),
        icon: <PlugZap className="h-4 w-4" strokeWidth={1.7} />,
        onSelect: () => {
          setOpen(false)
          void simulateHotplug()
        },
      },
      {
        id: 'action-accent',
        group: 'actions',
        label: t('palette.actionTheme'),
        description: accent.toUpperCase(),
        icon: <Palette className="h-4 w-4" strokeWidth={1.7} />,
        onSelect: () => {
          const next = ACCENTS[(ACCENTS.indexOf(accent) + 1) % ACCENTS.length]
          setAccent(next)
          setOpen(false)
        },
      },
      {
        id: 'action-language',
        group: 'actions',
        label: t('palette.actionLanguage'),
        description: language === 'zh' ? 'English' : '简体中文',
        icon: <Languages className="h-4 w-4" strokeWidth={1.7} />,
        onSelect: () => {
          const next = language === 'zh' ? 'en' : 'zh'
          setLanguage(next)
          void changeLanguage(next)
          setOpen(false)
        },
      },
    ]
      .filter((item) => {
        if (item.id === 'action-hotplug' && !canSimulateHotplug(getDataSource())) return false
        return !normalized || matches(`${item.label} ${item.description ?? ''}`)
      })
      .map((item) => ({ ...item, group: 'actions' as const }))

    return [...pageItems, ...deviceItems, ...actions]
  }, [
    accent,
    devices,
    language,
    onRefresh,
    openDevice,
    query,
    setAccent,
    setLanguage,
    setOpen,
    setPage,
    simulateHotplug,
    t,
  ])

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, items.length - 1)))
  }, [items.length])

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const activeItem = items[activeIndex]

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return
    item.onSelect()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % Math.max(1, items.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + items.length) % Math.max(1, items.length))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(0, items.length - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runItem(activeItem)
    }
  }

  let flatIndex = 0
  const groupLabel = (group: PaletteItem['group'], first: boolean) => (
    <p
      className={cn(
        'px-2 pb-1 pt-2 text-[8.5px] font-semibold uppercase tracking-[0.2em] text-ink-faint/80',
        !first && 'mt-1 border-t border-white/[0.04] pt-2.5',
      )}
    >
      {t(`palette.${group}`)}
    </p>
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[75] bg-black/62 backdrop-blur-[3px]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[11vh] z-[76] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-strong bg-[#080c14]/98 shadow-[0_50px_120px_-30px_rgba(0,0,0,1)]"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            {t('topbar.paletteHint')}
          </DialogPrimitive.Title>

          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4">
            <Search className="h-4 w-4 text-ink-faint" strokeWidth={1.8} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('palette.placeholder')}
              className="h-[52px] flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
            <Kbd>Esc</Kbd>
          </div>

          <div ref={listRef} className="max-h-[min(460px,60vh)] overflow-y-auto scroll-thin p-1.5">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Search className="h-6 w-6 text-ink-faint/60" strokeWidth={1.4} />
                <p className="text-[11.5px] text-ink-faint">{t('palette.noResults')}</p>
              </div>
            ) : (
              (['pages', 'devices', 'actions'] as const).map((group, groupIndex) => {
                const groupItems = items.filter((item) => item.group === group)
                if (groupItems.length === 0) return null
                return (
                  <div key={group}>
                    {groupLabel(group, groupIndex === 0)}
                    {groupItems.map((item) => {
                      const index = flatIndex++
                      const active = index === activeIndex
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-index={index}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => runItem(item)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                            active ? 'bg-[rgba(var(--accent-rgb),0.09)]' : 'hover:bg-white/[0.035]',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                              active
                                ? 'border-[rgba(var(--accent-rgb),0.25)] bg-[rgba(var(--accent-rgb),0.09)] text-accent'
                                : 'border-line bg-white/[0.025] text-ink-faint',
                            )}
                          >
                            {item.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-ink">
                              {item.label}
                            </span>
                            {item.description ? (
                              <span className="mt-0.5 block truncate text-[10px] text-ink-faint">
                                {item.description}
                              </span>
                            ) : null}
                          </span>
                          {active ? (
                            <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                          ) : item.shortcut ? (
                            <Kbd>{item.shortcut}</Kbd>
                          ) : (
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-transparent" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-white/[0.06] px-3.5 py-2.5 text-[9.5px] text-ink-faint">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t('palette.hint').split('·')[0]}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd>
            </span>
            <span className="ml-auto font-mono tracking-wide text-ink-faint/60">
              {devices.length} DEVICES · LOCAL INDEX
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

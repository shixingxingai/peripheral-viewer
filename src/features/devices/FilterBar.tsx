import { ArrowDownUp, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { type StatusFilter, useDeviceStore } from '@/stores/devices'
import type { DeviceCategory, DeviceSnapshot } from '@/types/device'

const CATEGORY_ORDER: DeviceCategory[] = [
  'keyboard',
  'mouse',
  'headset',
  'monitor',
  'webcam',
  'gamepad',
  'microphone',
  'speaker',
  'other',
]

export function FilterBar({ devices }: { devices: DeviceSnapshot[] }) {
  const { t } = useTranslation()
  const search = useDeviceStore((state) => state.search)
  const category = useDeviceStore((state) => state.category)
  const status = useDeviceStore((state) => state.status)
  const sort = useDeviceStore((state) => state.sort)
  const setSearch = useDeviceStore((state) => state.setSearch)
  const setCategory = useDeviceStore((state) => state.setCategory)
  const setStatus = useDeviceStore((state) => state.setStatus)
  const setSort = useDeviceStore((state) => state.setSort)

  const counts = new Map<DeviceCategory, number>()
  for (const device of devices) {
    counts.set(device.category, (counts.get(device.category) ?? 0) + 1)
  }

  const hasFilters = search !== '' || category !== 'all' || status !== 'all'
  const clear = () => {
    setSearch('')
    setCategory('all')
    setStatus('all')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[290px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
            strokeWidth={1.8}
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('overview.searchPlaceholder')}
            className="h-9 w-full rounded-lg border border-line bg-white/[0.022] pl-9 pr-8 text-[11.5px] text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-[rgba(var(--accent-rgb),0.4)]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-faint hover:bg-white/[0.05] hover:text-ink"
              aria-label={t('common.cancel')}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: t('overview.filter.statusAll') },
              { value: 'online', label: t('overview.filter.statusOnline') },
              { value: 'warning', label: t('overview.filter.statusWarning') },
            ]}
          />

          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <ArrowDownUp className="h-3 w-3" strokeWidth={1.8} />
            </span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="h-8 appearance-none rounded-lg border border-line bg-black/20 pl-7 pr-7 text-[10.5px] text-ink-muted outline-none transition-colors hover:border-line-strong focus:border-[rgba(var(--accent-rgb),0.4)]"
              aria-label={t('overview.sort.label')}
            >
              <option value="recent">{t('overview.sort.recent')}</option>
              <option value="name">{t('overview.sort.name')}</option>
              <option value="battery">{t('overview.sort.battery')}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint" />
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={clear}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] text-ink-faint transition-colors hover:bg-white/[0.04] hover:text-ink"
            >
              <X className="h-3 w-3" />
              {t('overview.empty.reset')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scroll-thin">
        <SlidersHorizontal className="mr-1 h-3 w-3 shrink-0 text-ink-faint/70" />
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10.5px] transition-colors',
            category === 'all'
              ? 'border-[rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.09)] text-accent'
              : 'border-transparent bg-white/[0.02] text-ink-muted hover:border-line hover:text-ink',
          )}
        >
          {t('category.all')}
          <span className="font-mono text-[9px] opacity-60">{devices.length}</span>
        </button>
        {CATEGORY_ORDER.map((item) => {
          const count = counts.get(item) ?? 0
          if (count === 0) return null
          const active = category === item
          return (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(active ? 'all' : item)}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10.5px] transition-colors',
                active
                  ? 'border-[rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.09)] text-accent'
                  : 'border-transparent bg-white/[0.02] text-ink-muted hover:border-line hover:text-ink',
              )}
            >
              <CategoryIcon category={item} className="h-3 w-3" />
              {t(`category.${item}`)}
              <span className="font-mono text-[9px] opacity-60">{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

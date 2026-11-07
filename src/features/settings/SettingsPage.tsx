import { useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Check,
  Cpu,
  Database,
  Download,
  Gauge,
  HardDrive,
  Info,
  Languages,
  MonitorSmartphone,
  Palette,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '@/components/common/Logo'
import { PageHeader } from '@/components/common/PageHeader'
import { SectionCard } from '@/components/common/SectionCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useDataSource } from '@/hooks/useDataSource'
import { backend, demoBackend, loadRealSnapshot, switchToDemoData } from '@/lib/backend'
import {
  DATA_SOURCE_LABEL_KEY,
  DATA_SOURCE_SHORT,
  DATA_SOURCE_STORAGE,
  isLiveSource,
} from '@/lib/dataSourceText'
import { changeLanguage } from '@/lib/i18n'
import { cn, downloadBlob } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import {
  type Accent,
  type Language,
  type MotionPreference,
  useSettingsStore,
} from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const ACCENTS: Array<{ value: Accent; color: string; color2: string; labelKey: string }> = [
  {
    value: 'cyan',
    color: '#67e8f9',
    color2: '#a78bfa',
    labelKey: 'settings.appearance.accentCyan',
  },
  {
    value: 'violet',
    color: '#a78bfa',
    color2: '#f472b6',
    labelKey: 'settings.appearance.accentViolet',
  },
  {
    value: 'amber',
    color: '#fbbf24',
    color2: '#fb923c',
    labelKey: 'settings.appearance.accentAmber',
  },
]

function SettingRow({
  icon: Icon,
  title,
  detail,
  children,
  last,
}: {
  icon: typeof Bell
  title: string
  detail?: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap',
        !last && 'border-b border-white/[0.045]',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-ink-faint">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-ink">{title}</p>
        {detail ? (
          <p className="mt-0.5 text-[9.5px] leading-relaxed text-ink-faint">{detail}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const accent = useSettingsStore((state) => state.accent)
  const language = useSettingsStore((state) => state.language)
  const motion = useSettingsStore((state) => state.motion)
  const telemetryEnabled = useSettingsStore((state) => state.telemetryEnabled)
  const retentionDays = useSettingsStore((state) => state.retentionDays)
  const notifications = useSettingsStore((state) => state.notifications)
  const autostart = useSettingsStore((state) => state.autostart)
  const setAccent = useSettingsStore((state) => state.setAccent)
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const setMotion = useSettingsStore((state) => state.setMotion)
  const setTelemetryEnabled = useSettingsStore((state) => state.setTelemetryEnabled)
  const setRetentionDays = useSettingsStore((state) => state.setRetentionDays)
  const setNotifications = useSettingsStore((state) => state.setNotifications)
  const setAutostart = useSettingsStore((state) => state.setAutostart)
  const devices = useDeviceStore((state) => state.devices)
  const pushToast = useUiStore((state) => state.pushToast)
  const [exporting, setExporting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [scanning, setScanning] = useState(false)

  const { source, meta } = useDataSource()
  const isTauri = source === 'tauri'
  const online = devices.filter((device) => device.status !== 'offline').length

  const applyLanguage = (next: Language) => {
    setLanguage(next)
    void changeLanguage(next)
  }

  const exportData = async () => {
    setExporting(true)
    try {
      const [snapshot, diagnostics, events, layout] = await Promise.all([
        backend.listDevices(),
        backend.getDiagnostics(),
        backend.getEvents(),
        backend.loadLayout(),
      ])
      const payload = {
        exportedAt: new Date().toISOString(),
        dataSource: source,
        snapshot: meta,
        backendMode: backend.mode,
        preferences: {
          accent,
          language,
          motion,
          telemetryEnabled,
          retentionDays,
          notifications,
          autostart,
        },
        devices: snapshot,
        diagnostics,
        events,
        layout,
      }
      downloadBlob(
        `periphery-export-${new Date().toISOString().slice(0, 10)}.json`,
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      )
      pushToast({ title: t('settings.data.exportDone'), variant: 'success' })
    } catch (error) {
      pushToast({
        title: t('toast.loadFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  const resetDemo = async () => {
    if (!demoBackend || source === 'tauri') return
    setResetting(true)
    try {
      switchToDemoData()
      const snapshot = await backend.refreshDevices()
      useDeviceStore.getState().replaceAll(snapshot)
      await queryClient.invalidateQueries()
      pushToast({ title: t('settings.data.resetDone'), variant: 'success' })
    } catch (error) {
      pushToast({
        title: t('toast.refreshFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    } finally {
      setResetting(false)
    }
  }

  const rescanDevices = async () => {
    if (source === 'tauri') return
    setScanning(true)
    try {
      const loaded = await loadRealSnapshot(true)
      if (!loaded) {
        pushToast({ title: t('settings.data.scanMissing'), variant: 'warning' })
        return
      }
      const snapshot = await backend.refreshDevices()
      useDeviceStore.getState().replaceAll(snapshot)
      await queryClient.invalidateQueries()
      pushToast({ title: t('settings.data.scanDone'), variant: 'success' })
    } catch (error) {
      pushToast({
        title: t('toast.refreshFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    } finally {
      setScanning(false)
    }
  }

  const resetPreferences = () => {
    setAccent('cyan')
    setMotion('system')
    setTelemetryEnabled(true)
    setRetentionDays(7)
    setNotifications(true)
    setAutostart(false)
    applyLanguage('zh')
    pushToast({ title: t('settings.actions.resetPreferencesDone'), variant: 'success' })
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-5 xl:px-7 xl:py-6">
      <PageHeader
        eyebrow={
          <>
            <span className="text-accent/80">PREFERENCES</span>
            <span className="text-ink-faint/40">/</span>
            <span>LOCAL</span>
          </>
        }
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <Button
            variant="secondary"
            size="md"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={resetPreferences}
          >
            {t('settings.actions.resetPreferences')}
          </Button>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_312px]">
        <div className="space-y-3">
          <SectionCard title={t('settings.appearance.title')} bodyClassName="p-4">
            <div className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-xl border border-white/[0.06] bg-[#070b12] p-3.5">
              <div className="absolute inset-0 bg-[radial-gradient(100%_140%_at_0%_0%,rgba(var(--accent-rgb),0.13),transparent_60%)]" />
              <LogoMark size={42} className="relative" />
              <div className="relative min-w-0">
                <p className="text-[13px] font-semibold tracking-[-0.02em] text-ink">
                  {t('settings.about.tagline')}
                </p>
                <p className="mt-0.5 truncate text-[9.5px] text-ink-faint">
                  {t('settings.about.localOnly')}
                </p>
              </div>
              <span className="relative ml-auto flex items-center gap-1.5 rounded-md border border-[rgba(var(--accent-rgb),0.24)] bg-[rgba(var(--accent-rgb),0.08)] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-accent">
                <Sparkles className="h-2.5 w-2.5" />
                {accent}
              </span>
            </div>

            <div className="rounded-xl border border-white/[0.05] bg-white/[0.014] p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-ink-muted">
                  <Palette className="h-3 w-3 text-ink-faint" />
                  {t('settings.appearance.accent')}
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/60">
                  {ACCENTS.find((item) => item.value === accent)?.color}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {ACCENTS.map((item) => {
                  const active = accent === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setAccent(item.value)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                        active
                          ? 'border-[rgba(var(--accent-rgb),0.34)] bg-[rgba(var(--accent-rgb),0.06)]'
                          : 'border-white/[0.05] hover:border-white/[0.14]',
                      )}
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15"
                        style={{
                          background: `linear-gradient(135deg, ${item.color}, ${item.color2})`,
                          boxShadow: active ? `0 0 12px ${item.color}55` : undefined,
                        }}
                      >
                        {active ? (
                          <Check className="h-2.5 w-2.5 text-[#041014]" strokeWidth={3} />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'truncate text-[9.5px]',
                          active ? 'text-ink' : 'text-ink-faint',
                        )}
                      >
                        {t(item.labelKey)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-2">
              <SettingRow
                icon={Languages}
                title={t('settings.appearance.language')}
                detail="中文 / English"
              >
                <Segmented<Language>
                  value={language}
                  onChange={applyLanguage}
                  options={[
                    { value: 'zh', label: t('settings.appearance.languageZh') },
                    { value: 'en', label: t('settings.appearance.languageEn') },
                  ]}
                />
              </SettingRow>
              <SettingRow
                icon={Sparkles}
                title={t('settings.appearance.motion')}
                detail={t('settings.appearance.motionHint')}
                last
              >
                <Segmented<MotionPreference>
                  value={motion}
                  onChange={setMotion}
                  options={[
                    { value: 'system', label: t('settings.appearance.motionSystem') },
                    { value: 'reduced', label: t('settings.appearance.motionReduced') },
                  ]}
                />
              </SettingRow>
            </div>
          </SectionCard>

          <SectionCard title={t('settings.data.title')} bodyClassName="p-4">
            <SettingRow
              icon={Gauge}
              title={t('settings.data.telemetry')}
              detail={t('settings.data.telemetryDetail')}
            >
              <Switch
                checked={telemetryEnabled}
                onCheckedChange={(value) => {
                  setTelemetryEnabled(value)
                  pushToast({
                    title: value ? t('toast.telemetryOn') : t('toast.telemetryOff'),
                    variant: value ? 'success' : 'warning',
                  })
                }}
              />
            </SettingRow>
            <SettingRow
              icon={Database}
              title={t('settings.data.retention')}
              detail={DATA_SOURCE_STORAGE[source]}
            >
              <Segmented<string>
                value={String(retentionDays)}
                onChange={(value) => setRetentionDays(Number(value))}
                options={[
                  { value: '1', label: t('settings.data.retention1') },
                  { value: '7', label: t('settings.data.retention7') },
                  { value: '30', label: t('settings.data.retention30') },
                ]}
              />
            </SettingRow>

            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-400/14 bg-emerald-400/[0.035] p-3">
              <ShieldCheck
                className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-300/80"
                strokeWidth={1.8}
              />
              <div>
                <p className="text-[10px] font-medium text-emerald-200/90">
                  {t('settings.data.local')}
                </p>
                <p className="mt-0.5 text-[9px] leading-relaxed text-emerald-200/50">
                  {t('settings.data.localDetail')}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="h-3 w-3" />}
                onClick={() => void exportData()}
                disabled={exporting}
              >
                {exporting ? t('common.loading') : t('settings.data.export')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<RotateCcw className="h-3 w-3" />}
                onClick={() => void resetDemo()}
                disabled={isTauri || resetting}
              >
                {t('settings.data.reset')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="h-3 w-3" />}
                onClick={() => void rescanDevices()}
                disabled={isTauri || scanning}
              >
                {scanning ? t('common.loading') : t('settings.data.scan')}
              </Button>
              <span className="ml-auto self-center text-[8.5px] text-ink-faint/60">
                {t('settings.data.exportDetail')}
              </span>
            </div>
          </SectionCard>

          <SectionCard title={t('settings.notifications.title')} bodyClassName="p-4">
            <SettingRow
              icon={Bell}
              title={t('settings.notifications.enable')}
              detail={t('settings.notifications.enableDetail')}
            >
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </SettingRow>
            <SettingRow
              icon={Power}
              title={t('settings.notifications.autostart')}
              detail={t('settings.notifications.autostartDetail')}
              last
            >
              <div className="flex items-center gap-2">
                {!isTauri ? (
                  <Badge variant="neutral" size="sm">
                    {t('settings.notifications.tauriOnly')}
                  </Badge>
                ) : null}
                <Switch checked={autostart} onCheckedChange={setAutostart} disabled={!isTauri} />
              </div>
            </SettingRow>
          </SectionCard>

          <SectionCard title={t('settings.about.title')} bodyClassName="p-4">
            <div className="flex items-center gap-3">
              <LogoMark size={38} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-ink">
                  {t('settings.about.tagline')}
                </p>
                <p className="mt-0.5 text-[9px] text-ink-faint">
                  {t('settings.about.description')}
                </p>
              </div>
              <Badge variant={source === 'demo' ? 'warning' : 'success'} size="sm">
                {source === 'demo'
                  ? t('settings.about.backendDemo')
                  : t(DATA_SOURCE_LABEL_KEY[source])}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2">
                <p className="text-[8.5px] text-ink-faint">{t('settings.about.version')}</p>
                <p className="mt-0.5 font-mono text-[10px] text-ink-muted">0.2.0 · MVP</p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2">
                <p className="text-[8.5px] text-ink-faint">{t('settings.about.stack')}</p>
                <p className="mt-0.5 font-mono text-[9px] text-ink-muted">
                  {t('settings.about.stackValue')}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2">
                <p className="text-[8.5px] text-ink-faint">{t('settings.about.backend')}</p>
                <p className="mt-0.5 font-mono text-[9px] text-ink-muted">
                  {source === 'tauri'
                    ? 'Get-PnpDevice · CfgMgr'
                    : source === 'snapshot'
                      ? 'Get-PnpDevice + hidapi (snapshot)'
                      : 'demo · seeded simulator'}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2">
                <p className="text-[8.5px] text-ink-faint">{t('settings.about.localOnly')}</p>
                <p className="mt-0.5 font-mono text-[9px] text-emerald-300/70">
                  NO CLOUD · NO ADMIN
                </p>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/50">
              <Terminal className="h-2.5 w-2.5" />
              DESKTOP-NYX · read-only inventory · rev 01
            </p>
          </SectionCard>
        </div>

        <aside className="space-y-3">
          <SectionCard title={t('settings.sidebar.title')} bodyClassName="p-3">
            <div className="space-y-1.5">
              {[
                {
                  label: t('settings.about.backend'),
                  value: DATA_SOURCE_SHORT[source],
                  tone: source === 'demo' ? 'text-amber-300' : 'text-emerald-300',
                },
                {
                  label: t('settings.sidebar.storage'),
                  value: DATA_SOURCE_STORAGE[source],
                  tone: 'text-ink-muted',
                },
                {
                  label: t('settings.sidebar.devices'),
                  value: `${online} / ${devices.length}`,
                  tone: 'text-ink-muted',
                },
                {
                  label: t('settings.data.telemetry'),
                  value: telemetryEnabled
                    ? t('settings.sidebar.telemetryOn')
                    : t('settings.sidebar.telemetryOff'),
                  tone: telemetryEnabled ? 'text-emerald-300' : 'text-amber-300',
                },
                {
                  label: t('settings.about.health'),
                  value:
                    source === 'tauri'
                      ? t('settings.about.healthOk')
                      : source === 'snapshot'
                        ? t('source.snapshot')
                        : t('settings.about.healthDemo'),
                  tone: 'text-ink-muted',
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between gap-3 border-b border-white/[0.045] py-1.5 last:border-0"
                >
                  <span className="text-[9px] text-ink-faint">{row.label}</span>
                  <span className={cn('text-right text-[9px] leading-relaxed', row.tone)}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-white/[0.05] bg-white/[0.016] px-2 py-1.5">
              <span className="live-dot scale-[0.55]" />
              <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">
                {source === 'tauri'
                  ? 'EVENT CHANNEL HEALTHY'
                  : source === 'snapshot'
                    ? 'STATIC SNAPSHOT'
                    : 'SIMULATOR HEARTBEAT'}
              </span>
              <span className="ml-auto font-mono text-[8px] text-emerald-300/80">
                {isLiveSource(source) ? '10 Hz' : '—'}
              </span>
            </div>
          </SectionCard>

          <SectionCard title={t('settings.shortcuts.title')} bodyClassName="p-3">
            {[
              { icon: Terminal, label: t('settings.shortcuts.palette'), keys: ['⌘/Ctrl', 'K'] },
              {
                icon: MonitorSmartphone,
                label: t('settings.shortcuts.pages'),
                keys: ['1', '…', '6'],
              },
              { icon: Info, label: t('settings.shortcuts.close'), keys: ['Esc'] },
            ].map((row) => {
              const Icon = row.icon
              return (
                <div
                  key={row.label}
                  className="flex items-center gap-2 border-b border-white/[0.045] py-2 last:border-0"
                >
                  <Icon className="h-3 w-3 shrink-0 text-ink-faint" strokeWidth={1.7} />
                  <span className="flex-1 text-[9.5px] text-ink-muted">{row.label}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </div>
              )
            })}
          </SectionCard>

          <div className="panel relative overflow-hidden p-3.5">
            <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(52,211,153,0.06),transparent_60%)]" />
            <div className="relative flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300/80" strokeWidth={1.7} />
              <p className="text-[10.5px] font-semibold text-ink">{t('settings.data.local')}</p>
              <Badge variant="success" size="sm" className="ml-auto">
                LOCAL
              </Badge>
            </div>
            <p className="relative mt-2 text-[9px] leading-relaxed text-ink-faint">
              {t('settings.data.localDetail')}
            </p>
            <div className="relative mt-2 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-faint/60">
              <Cpu className="h-2.5 w-2.5" />
              USER-SPACE · READ-ONLY · CSP
            </div>
          </div>

          {source === 'demo' ? (
            <div className="flex items-start gap-2 rounded-xl border border-sky-400/14 bg-sky-400/[0.035] p-3 text-[9px] leading-relaxed text-sky-200/60">
              <Info className="mt-px h-3 w-3 shrink-0 text-sky-300/80" />
              <span>
                Demo mode: backend calls are served by a seeded simulator. Build with Tauri to
                enumerate real HID devices.
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-between px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/40">
            <span className="flex items-center gap-1">
              <HardDrive className="h-2.5 w-2.5" />
              PERIPHERY · 0.2.0
            </span>
            <span className="flex items-center gap-1">
              <TriangleAlert className="h-2.5 w-2.5" />
              NO ADMIN
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}

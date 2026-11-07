import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatCompact(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(digits || 1)}k`
  return `${Math.round(value)}`
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export type Lang = 'zh' | 'en'

export function formatRelativeTime(ts: number, lang: Lang = 'zh'): string {
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const formatter = new Intl.RelativeTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    numeric: 'auto',
  })

  if (abs < 60_000) return formatter.format(Math.round(diff / 1000), 'second')
  if (abs < 3_600_000) return formatter.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86_400_000) return formatter.format(Math.round(diff / 3_600_000), 'hour')
  return formatter.format(Math.round(diff / 86_400_000), 'day')
}

export function formatClock(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(ts)
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)} 小时`
  return `${(seconds / 86_400).toFixed(1)} 天`
}

export function batteryTone(battery: number | null | undefined): 'good' | 'warn' | 'bad' | 'none' {
  if (battery === null || battery === undefined) return 'none'
  if (battery <= 20) return 'bad'
  if (battery <= 40) return 'warn'
  return 'good'
}

export function signalTone(signal: number | null | undefined): 'good' | 'warn' | 'bad' | 'none' {
  if (signal === null || signal === undefined) return 'none'
  if (signal >= -50) return 'good'
  if (signal >= -65) return 'warn'
  return 'bad'
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const int = Number.parseInt(value, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function deviceInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

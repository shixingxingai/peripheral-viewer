import { describe, expect, it } from 'vitest'
import {
  batteryTone,
  clamp,
  cn,
  deviceInitials,
  formatCompact,
  formatDuration,
  formatNumber,
  hexToRgba,
  shortId,
  signalTone,
} from './utils'

describe('格式化与工具类函数', () => {
  it('clamp 处理上下界', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('formatCompact 按千与百万缩写', () => {
    expect(formatCompact(999)).toBe('999')
    expect(formatCompact(1500)).toBe('1.5k')
    expect(formatCompact(2_500_000)).toBe('2.5M')
    expect(formatCompact(Number.NaN)).toBe('—')
  })

  it('formatNumber 空值显示占位符', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
    expect(formatNumber(Number.NaN)).toBe('—')
    expect(formatNumber(1234)).toContain('1')
  })

  it('formatDuration 按量级切换单位', () => {
    expect(formatDuration(30)).toBe('30 秒')
    expect(formatDuration(120)).toBe('2 分钟')
    expect(formatDuration(7200)).toBe('2.0 小时')
    expect(formatDuration(172800)).toBe('2.0 天')
  })

  it('batteryTone 与 signalTone 的分级边界', () => {
    expect(batteryTone(null)).toBe('none')
    expect(batteryTone(20)).toBe('bad')
    expect(batteryTone(40)).toBe('warn')
    expect(batteryTone(41)).toBe('good')
    expect(signalTone(undefined)).toBe('none')
    expect(signalTone(-40)).toBe('good')
    expect(signalTone(-60)).toBe('warn')
    expect(signalTone(-80)).toBe('bad')
  })

  it('hexToRgba 支持 3 位与 6 位颜色', () => {
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(hexToRgba('#67e8f9', 1)).toBe('rgba(103, 232, 249, 1)')
  })

  it('deviceInitials 与 shortId 生成缩写', () => {
    expect(deviceInitials('Viper V3 Pro')).toBe('VV')
    expect(deviceInitials('键盘')).toBe('键盘')
    expect(shortId('1234567890123456')).toBe('123456…3456')
    expect(shortId('short')).toBe('short')
  })

  it('cn 合并冲突的 Tailwind 类', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', false && 'hidden', 'font-mono')).toBe('text-red-500 font-mono')
  })
})

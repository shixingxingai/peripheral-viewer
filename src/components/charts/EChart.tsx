import type { LineSeriesOption } from 'echarts/charts'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  type GridComponentOption,
  MarkLineComponent,
  TooltipComponent,
  type TooltipComponentOption,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

export type EChartOption = ComposeOption<
  LineSeriesOption | GridComponentOption | TooltipComponentOption
>

export function EChart({ option, className }: { option: EChartOption; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const chart = echarts.init(element, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={containerRef} className={cn('h-full w-full', className)} />
}

import { useSyncExternalStore } from 'react'
import { type DataSourceState, getDataSourceState, subscribeDataSource } from '@/lib/backend/source'

/** 响应式读取当前数据源，避免组件在渲染期读取可变单例导致文案滞后。 */
export function useDataSource(): DataSourceState {
  return useSyncExternalStore(subscribeDataSource, getDataSourceState, getDataSourceState)
}

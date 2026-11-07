# 外设视界 · Periphery

[English](./README.en.md)

一个面向 Windows 的**电脑外设可视化查看器**：把本机真实外接设备整理成设备总览、3D 模型、端口拓扑、实时遥测与桌面布局，并提供 Tauri 2 桌面端。

项目采用「浏览器前端 + 可替换数据源」的结构：同一套 UI 既能加载**本机真实扫描数据**，也能在桌面端由 **Rust 后端实时采集**，还能在没有设备的环境用**演示数据**运行。

> 当前版本为 `0.1.0`。前端 6 个页面、真实设备采集、Tauri 桌面端与安装包均已可运行；厂商私有协议遥测、精确 glTF 资产库、SQLite 等仍属于后续规划，详见[已知限制](#已知限制与后续规划)。

## 功能

| 页面 | 内容 |
| --- | --- |
| 设备总览 | 设备卡片、状态过滤、排序、搜索、健康概览、设备详情抽屉 |
| 3D 查看 | 基于参数的 7 类设备模型（键盘 / 鼠标 / 耳机 / 显示器 / 摄像头 / 手柄 / 麦克风）、接口锚点、线缆、视角控制 |
| 端口拓扑 | 按 `LocationInfo` 还原 host → hub → device 层级，elkjs 自动布局 |
| 实时遥测 | ECharts 曲线、指标切换、CSV 导出；读不到的字段显示「不可用」而非猜测值 |
| 桌面布局 | 拖拽摆放设备、PNG / JSON 导出（导出物带数据源标注） |
| 设置 | 中英双语、主题、动效、数据源切换、快照载入 |

其它：命令面板（`Ctrl+K`）、数字键 `1`–`6` 切页、Toast、状态栏数据源标签、中英 i18n。

## 三种数据源

应用按「Tauri 优先 → 本机扫描快照 → 演示数据」的顺序自动选择，设置页可切回演示数据。

| 模式 | 来源 | 说明 |
| --- | --- | --- |
| `tauri` | Rust 后端实时调用 PowerShell PnP 接口 | 桌面端默认；3 秒轮询 diff，变化时推送 `devices://changed` |
| `snapshot` | `public/real-devices.json` | 浏览器端由 `npm run scan:devices` 生成的静态快照 |
| `demo` | 内置 `DemoBackend` | 固定种子伪随机数据，用于演示与开发 |

**数据可信度约定**：所有采集只读；电量、DPI、回报率、RGB 等读不到就留空，绝不用猜测值填充；真实模式下禁用模拟热插拔与伪遥测 ticker。

`public/real-devices.json` 含设备序列号，已加入 `.gitignore`，不会提交到仓库。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2、Rust（serde / anyhow / tracing / sha2） |
| 前端 | React 19、TypeScript、Vite 7、Tailwind CSS 4 |
| 3D / 图表 / 拓扑 | three.js + React Three Fiber + drei、ECharts、elkjs、xyflow |
| 状态 / 数据 | zustand（persist）、TanStack Query、i18next、Radix UI、motion |
| 工程化 | Biome（lint / format）、Vitest、TypeScript `noEmit` |
| 设备采集 | Windows `Get-PnpDevice` + PnP 属性；可选 Python `hidapi` 补充厂商名 / 序列号 / usage page |

## 目录结构

```
src/
  components/       通用 UI（layout / common / charts / ui）
  features/         6 个功能页面（devices / viewer3d / topology / telemetry / layout / settings）
  hooks/            设备同步、数据源订阅
  lib/backend/      DemoBackend / TauriBackend / 数据源状态与快照加载
  lib/i18n.ts       中英文案
  stores/           zustand
  types/device.ts   数据契约（DeviceSnapshot、PeripheralBackend、DataSource…）
src-tauri/
  src/device/       Windows PnP 采集与设备建模
  src/topology.rs   拓扑还原
  src/diagnosis.rs  诊断
  src/layout_store.rs 布局持久化
  src/lib.rs        Tauri commands 与事件推送
  src/main.rs       桌面入口
  icons/            应用图标
  tauri.conf.json   窗口、CSP、打包配置
scripts/
  scan-devices.ps1  PowerShell 采集脚本（Rust 通过 include_str! 直接复用同一份）
  build-snapshot.py 生成浏览器端真实快照
public/             静态资源（favicon.svg；扫描快照生成于此）
```

## 快速开始

### 前提

- **Node.js ≥ 20.19**（Vite 7 要求）、npm
- **浏览器版真实扫描**：Windows + PowerShell，Python 3；可选 `pip install hidapi` 以补充 HID 属性
- **桌面端**：Rust 工具链、Windows C++ 链接器（MSVC Build Tools 或 MinGW-w64）、[WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)

### 浏览器开发

```bash
npm install
npm run dev          # http://127.0.0.1:1420/
npm run build        # 生产构建，输出到 dist/
npm run preview      # 预览构建产物
```

构建产物使用相对路径，可直接静态托管。`dist/` 已加入 `.gitignore`。

### 生成本机真实设备快照

```bash
npm run scan:devices
```

脚本调用 `scripts/scan-devices.ps1` 枚举 PnP 设备，过滤声卡虚拟端点、根集线器与全 0 占位序列号，输出 `public/real-devices.json`。打开应用后状态栏显示 **SCAN**；若要回到演示数据，在设置页的数据源区域切换。

### 桌面端

```bash
npm run tauri -- dev
npm run tauri -- build --bundles nsis
```

- 开发模式会自动启动 `npm run dev`（端口 1420）。
- 安装包输出到 `src-tauri/target/release/bundle/nsis/`，主程序在 `src-tauri/target/release/peripheral-viewer.exe`。
- **必须用 `tauri` CLI 构建生产版**：直接执行 `cargo build --release` 会生成指向 `127.0.0.1:1420` 的开发模式 exe。
- 修改 `dist/` 或 `tauri.conf.json` 后，若 `generate_context!` 未重新嵌入资源，先执行 `cargo clean -p peripheral-viewer` 再构建。
- 使用 **GNU（MinGW-w64）工具链**时，`WebView2Loader.dll` 必须随 exe 分发；仓库已内置该 DLL 并通过 `bundle.resources` 打进安装包。单独拷贝 exe 而不带 DLL 会启动失败。

### 校验

```bash
npm run lint        # Biome
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build
```

当前状态：lint 0 错误、typecheck 0 错误、20 个测试通过、生产构建通过。

## 维护注意事项

- **不要随意增加 `manualChunks` 规则**：`vite.config.ts` 目前只把不依赖 React 的 `elkjs` 单独拆出，其余交给 Rollup 自动组织（页面级 `React.lazy` 拆分保留）。把 React / three / vendor 拆成多个互相依赖的 chunk 会造成循环依赖，导致 `Cannot read properties of undefined (reading 'useLayoutEffect')` 并整页黑屏。
- **CSP 必须放行 Tauri IPC**：`tauri.conf.json` 的 `connect-src` 含 `ipc:` 与 `http://ipc.localhost`；缺少它们时 `list_devices` 等命令会被浏览器拒绝，页面能渲染但拿不到任何设备数据。
- **采集脚本是单一来源**：Rust 侧通过 `include_str!("../../../scripts/scan-devices.ps1")` 与 Python 快照脚本共用同一份 PowerShell 采集逻辑，修改时请同时考虑两端。
- **命令契约**：前端 `src/lib/backend/tauri.ts` 的 invoke 与 `src-tauri/src/lib.rs` 的 command 名称一一对应，改动需同步。

## 已知限制与后续规划

- 设备采集基于用户态 PnP 只读接口，**未接入内核驱动**；热插拔采用轮询 diff，而非 `CM_Register_Notification` 设备通知。
- 厂商私有协议（HID++ / OpenRGB 等）、真实遥测采样、精确 glTF 模型库与设备目录、SQLite 持久化与迁移尚未实现；3D 模型是按类别构造的参数化模型。
- 桌面端尚未做代码签名、自动更新与崩溃上报。
- `elkjs` 约 1.44 MB，仅在打开拓扑页时按需加载，构建时仍会给出体积警告。
- 演示模式的拓扑图使用固定设备清单，模拟热插拔产生的设备不会入图。
- 桌面端依赖系统已安装的 WebView2 Runtime（[Evergreen](https://developer.microsoft.com/microsoft-edge/webview2/)）。

## 许可证

暂未指定开源许可证。

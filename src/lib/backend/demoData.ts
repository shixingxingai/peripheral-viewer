import type {
  DeviceAnchor,
  DeviceCategory,
  DeviceEventLog,
  DevicePort,
  DeviceSnapshot,
  Diagnosis,
  TopologyEdge,
  TopologyGraph,
  TopologyNode,
} from '@/types/device'
import { DEMO_DEVICES, DEMO_FIRST_SEEN, DEMO_LAST_SEEN } from './demoDevices'
import type { DemoDeviceSeed } from './demoTypes'

const ANCHOR_TEMPLATES: Record<DeviceCategory, DeviceAnchor[]> = {
  keyboard: [
    { id: 'usb', label: 'USB-C 接口', position: [0.205, 0.024, -0.068], kind: 'port' },
    { id: 'knob', label: '音量旋钮', position: [0.19, 0.052, -0.045], kind: 'feature' },
    { id: 'glow', label: 'RGB 灯带', position: [0, 0.012, 0.082], kind: 'rgb' },
  ],
  mouse: [
    { id: 'usb', label: 'USB-C 接口', position: [0, 0.03, -0.061], kind: 'port' },
    { id: 'sensor', label: '光学传感器', position: [0, 0.002, 0.015], kind: 'feature' },
    { id: 'logo', label: 'Logo 灯区', position: [0, 0.047, 0.032], kind: 'rgb' },
  ],
  headset: [
    { id: 'usb', label: 'USB-C 接口', position: [-0.085, 0.045, 0.014], kind: 'port' },
    { id: 'power', label: '电源键', position: [0.085, 0.045, 0.014], kind: 'feature' },
    { id: 'band', label: '头梁', position: [0, 0.142, 0], kind: 'feature' },
  ],
  monitor: [
    { id: 'usbc', label: 'USB-C 输入', position: [0.19, 0.15, -0.012], kind: 'port' },
    { id: 'dp', label: 'DisplayPort', position: [0.24, 0.11, -0.012], kind: 'port' },
    { id: 'panel', label: '显示面板', position: [0, 0.26, 0.012], kind: 'feature' },
  ],
  webcam: [
    { id: 'usb', label: 'USB-C 接口', position: [0, 0.055, -0.022], kind: 'port' },
    { id: 'lens', label: '镜头', position: [0, 0.055, 0.025], kind: 'feature' },
    { id: 'led', label: '状态灯', position: [0.032, 0.063, 0.014], kind: 'rgb' },
  ],
  gamepad: [
    { id: 'usb', label: 'USB-C 接口', position: [0, 0.045, 0.03], kind: 'port' },
    { id: 'stick', label: '摇杆', position: [-0.045, 0.052, 0.02], kind: 'feature' },
    { id: 'trigger', label: '扳机键', position: [0.06, 0.04, -0.03], kind: 'feature' },
  ],
  microphone: [
    { id: 'usb', label: 'USB-C 接口', position: [0, 0.025, -0.05], kind: 'port' },
    { id: 'ring', label: 'RGB 灯环', position: [0, 0.075, 0], kind: 'rgb' },
    { id: 'capsule', label: '拾音头', position: [0, 0.13, 0], kind: 'feature' },
  ],
  speaker: [
    { id: 'usb', label: 'USB-C 接口', position: [0, 0.03, -0.04], kind: 'port' },
    { id: 'driver', label: '扬声器单元', position: [0, 0.08, 0.02], kind: 'feature' },
  ],
  other: [{ id: 'usb', label: '接口', position: [0, 0.02, 0], kind: 'port' }],
}

const BASE_PORTS: Record<DeviceCategory, DevicePort[]> = {
  keyboard: [
    { id: 'usb-c', label: 'USB-C 数据/供电', kind: 'usb-c', status: 'linked', speed: 'USB 2.0' },
    {
      id: 'usb-a',
      label: 'USB-A 直通',
      kind: 'usb-a',
      status: 'idle',
      speed: 'USB 2.0',
      note: '可接鼠标或 U 盘',
    },
  ],
  mouse: [{ id: 'usb-c', label: 'USB-C 充电', kind: 'usb-c', status: 'idle', speed: '5 V / 1 A' }],
  headset: [
    { id: 'usb-c', label: 'USB-C 充电', kind: 'usb-c', status: 'idle', speed: '5 V / 1 A' },
    { id: 'audio', label: '3.5 mm 音频', kind: 'audio', status: 'idle' },
  ],
  monitor: [
    { id: 'usb-c', label: 'USB-C 上行 / 90W PD', kind: 'usb-c', status: 'linked', speed: '5 Gbps' },
    { id: 'dp', label: 'DisplayPort 1.4', kind: 'display', status: 'linked', speed: 'HBR3' },
    { id: 'hdmi', label: 'HDMI 2.0', kind: 'display', status: 'idle', speed: '18 Gbps' },
  ],
  webcam: [{ id: 'usb-c', label: 'USB-C 视频', kind: 'usb-c', status: 'linked', speed: '5 Gbps' }],
  gamepad: [
    { id: 'usb-c', label: 'USB-C 充电/有线', kind: 'usb-c', status: 'idle', speed: 'USB 2.0' },
    { id: 'audio', label: '3.5 mm 耳机', kind: 'audio', status: 'idle' },
  ],
  microphone: [
    { id: 'usb-c', label: 'USB-C 数据', kind: 'usb-c', status: 'linked', speed: 'USB 2.0' },
    { id: 'audio', label: '3.5 mm 监听', kind: 'audio', status: 'idle' },
  ],
  speaker: [{ id: 'usb-c', label: 'USB-C 音频', kind: 'usb-c', status: 'linked' }],
  other: [{ id: 'usb-c', label: 'USB 接口', kind: 'usb-c', status: 'linked' }],
}

function portsFor(device: DemoDeviceSeed): DevicePort[] {
  const ports = BASE_PORTS[device.category].map((port) => ({ ...port }))

  if (device.connection.kind === 'wireless') {
    ports.unshift({
      id: 'wireless',
      label: device.connection.receiver ?? '无线接收器',
      kind: 'wireless',
      status: 'linked',
      speed: device.connection.protocol,
    })
  }
  if (device.connection.kind === 'bluetooth') {
    ports.unshift({
      id: 'bluetooth',
      label: 'Bluetooth 连接',
      kind: 'wireless',
      status: 'linked',
      speed: device.connection.protocol,
      note: `信号 ${device.connection.signal ?? '—'} dBm`,
    })
  }
  if (device.category === 'webcam' && device.connection.speed?.includes('480')) {
    ports[0] = {
      ...ports[0],
      status: 'warning',
      speed: '480 Mbps',
      note: 'USB 3.2 设备降速',
    }
  }
  return ports
}

export function buildDemoDevices(): DeviceSnapshot[] {
  return DEMO_DEVICES.map((seed) => ({
    ...seed,
    ports: portsFor(seed),
    anchors: ANCHOR_TEMPLATES[seed.category].map((anchor) => ({
      ...anchor,
      position: [...anchor.position] as [number, number, number],
    })),
    firstSeen: DEMO_FIRST_SEEN,
    lastSeen: DEMO_LAST_SEEN,
  }))
}

function deviceNode(id: string, seed: DemoDeviceSeed, parentId: string): TopologyNode {
  return {
    id,
    type: 'device',
    label: seed.name,
    subtitle: `${seed.manufacturer} · ${seed.connection.protocol}`,
    status: seed.status === 'warning' ? 'warning' : seed.status === 'online' ? 'ok' : 'idle',
    deviceId: seed.id,
    parentId,
    meta: {
      连接: seed.connection.protocol,
      位置: seed.location ?? '未知',
      固件: seed.firmware ?? '—',
      VIDPID:
        seed.vendorId.toString(16).toUpperCase().padStart(4, '0') +
        ':' +
        seed.productId.toString(16).toUpperCase().padStart(4, '0'),
    },
  }
}

export function buildDemoTopology(devices: DeviceSnapshot[]): TopologyGraph {
  const warnings = new Set(devices.filter((d) => d.status === 'warning').map((d) => d.id))

  const nodes: TopologyNode[] = [
    {
      id: 'host',
      type: 'host',
      label: 'DESKTOP-NYX',
      subtitle: 'Windows 11 24H2 · B650M AORUS ELITE AX',
      status: 'ok',
      meta: { 系统: 'Windows 11 24H2', 主板: 'B650M AORUS ELITE AX', 芯片组: 'AMD B650' },
    },
    {
      id: 'ctrl-usb-1',
      type: 'controller',
      label: 'xHCI 控制器 #1',
      subtitle: 'USB 3.2 Gen 2x2 · 20 Gbps',
      parentId: 'host',
      status: warnings.size > 0 ? 'warning' : 'ok',
      meta: { 驱动: 'AMD USB xHCI', 总线: 'PCIe 4.0 x4', 端口: '8 个' },
    },
    {
      id: 'ctrl-usb-2',
      type: 'controller',
      label: 'xHCI 控制器 #2',
      subtitle: 'USB 3.2 Gen 2 · 10 Gbps',
      parentId: 'host',
      status: 'ok',
      meta: { 驱动: 'AMD USB xHCI', 总线: 'PCIe 4.0 x2', 端口: '6 个' },
    },
    {
      id: 'ctrl-bt',
      type: 'radio',
      label: '蓝牙射频',
      subtitle: 'Intel AX211 · Bluetooth 5.3',
      parentId: 'host',
      status: 'ok',
      meta: { 驱动: 'Intel Bluetooth', 频段: '2.4 GHz', 协议: 'BLE / Classic' },
    },
    {
      id: 'ctrl-gpu',
      type: 'display',
      label: 'GPU 显示输出',
      subtitle: 'NVIDIA RTX 4070 SUPER',
      parentId: 'host',
      status: 'ok',
      meta: { 驱动: 'NVIDIA 566.36', 输出: '3× DP 1.4a · 1× HDMI 2.1' },
    },
    {
      id: 'hub-anker',
      type: 'hub',
      label: '匿名 USB 2.0 Hub',
      subtitle: '3 端口 · 480 Mbps · 供电 82%',
      parentId: 'ctrl-usb-1',
      status: 'warning',
      meta: { 位置: 'Port_#0003', 端口: '3 / 4 已用', 供电: '82% 预算', 协商: 'USB 2.0' },
    },
    {
      id: 'hub-lightspeed',
      type: 'hub',
      label: 'Lightspeed 接收器',
      subtitle: 'USB-A · 2.4 GHz 私有协议',
      parentId: 'ctrl-usb-2',
      status: 'ok',
      meta: { 位置: 'Port_#0003', 轮询: '1000 Hz', 信道: '自适应跳频' },
    },
    {
      id: 'hub-xbox',
      type: 'hub',
      label: 'Xbox 无线适配器',
      subtitle: 'USB-A · Xbox Wireless',
      parentId: 'ctrl-usb-2',
      status: 'ok',
      meta: { 位置: 'Port_#0004', 配对设备: '1', 协议: 'Xbox Wireless' },
    },
    {
      id: 'hub-8bitdo',
      type: 'hub',
      label: '8BitDo USB 接收器',
      subtitle: 'USB-A · 2.4 GHz',
      parentId: 'ctrl-usb-2',
      status: 'ok',
      meta: { 位置: 'Port_#0007', 配对设备: '1', 延迟: '2.8 ms' },
    },
    {
      id: 'hub-nova',
      type: 'hub',
      label: 'Arctis Nova 基站',
      subtitle: 'USB-A · 双频 2.4 GHz',
      parentId: 'ctrl-usb-2',
      status: 'ok',
      meta: { 位置: 'Port_#0004', 协议: '2.4 GHz 双频', 功能: '双音频 / ChatMix' },
    },
  ]

  const deviceParents: Array<[string, string, string, string]> = [
    ['node-razer', '2c8e4f7a91b3d650', 'ctrl-usb-1', 'USB 3.0 · 5 Gbps'],
    ['node-keychron', '9f1b6d2e48a7c305', 'ctrl-usb-1', 'USB 2.0 · 480 Mbps'],
    ['node-facecam', '1e7d4b9c30a2f586', 'hub-anker', '480 Mbps · 降速'],
    ['node-brio', '5b2f8c1a96d4e703', 'ctrl-usb-1', 'USB 2.0 · 480 Mbps'],
    ['node-hyperx', '6f9b2d84e1c7a350', 'ctrl-usb-1', 'USB 2.0 · 480 Mbps'],
    ['node-gpro', '7d3a91c4b2e8f601', 'hub-lightspeed', '2.4 GHz · 1 ms'],
    ['node-xbox', 'a9d3f7e02c6b4185', 'hub-xbox', 'Xbox Wireless'],
    ['node-8bitdo', 'c4e1a8b35f9d2706', 'hub-8bitdo', '2.4 GHz · 2.8 ms'],
    ['node-arctis', '4a7c2e91d5b8f043', 'hub-nova', '2.4 GHz 双频'],
    ['node-sony', '8b5f3a27d9c1e406', 'ctrl-bt', 'BT 5.2 · LDAC'],
    ['node-mxmaster', 'b2a5e8c69d0f3714', 'ctrl-bt', 'BT 5.1 · BLE'],
    ['node-dell', 'd6c0e1a4f7b2a958', 'ctrl-gpu', 'DP 1.4 · HBR3'],
    ['node-lg', 'f3a8b5c60d7e4129', 'ctrl-gpu', 'DP 1.4 · HBR3'],
  ]

  const edges: TopologyEdge[] = [
    { id: 'e-host-1', source: 'host', target: 'ctrl-usb-1', label: 'PCIe 4.0' },
    { id: 'e-host-2', source: 'host', target: 'ctrl-usb-2', label: 'PCIe 4.0' },
    { id: 'e-host-3', source: 'host', target: 'ctrl-bt', label: 'CNVio2' },
    { id: 'e-host-4', source: 'host', target: 'ctrl-gpu', label: 'PCIe 4.0 x16' },
    { id: 'e-ctrl1-hub', source: 'ctrl-usb-1', target: 'hub-anker', label: 'USB 2.0 · 480 Mbps' },
    { id: 'e-ctrl2-ls', source: 'ctrl-usb-2', target: 'hub-lightspeed', label: 'USB 2.0' },
    { id: 'e-ctrl2-xbox', source: 'ctrl-usb-2', target: 'hub-xbox', label: 'USB 2.0' },
    { id: 'e-ctrl2-8bitdo', source: 'ctrl-usb-2', target: 'hub-8bitdo', label: 'USB 2.0' },
    { id: 'e-ctrl2-nova', source: 'ctrl-usb-2', target: 'hub-nova', label: 'USB 2.0' },
  ]

  for (const [nodeId, seedId, parent, label] of deviceParents) {
    const seed = DEMO_DEVICES.find((d) => d.id === seedId)
    if (!seed) continue
    nodes.push(deviceNode(nodeId, seed, parent))
    edges.push({
      id: `e-${parent}-${nodeId}`,
      source: parent,
      target: nodeId,
      label,
      status: warnings.has(seed.id) ? 'warning' : 'ok',
      speed: label,
    })
  }

  // Keep device order stable and readable: host, controllers, hubs, devices.
  const rank: Record<TopologyNode['type'], number> = {
    host: 0,
    controller: 1,
    radio: 1,
    display: 1,
    hub: 2,
    device: 3,
  }
  nodes.sort((a, b) => rank[a.type] - rank[b.type])

  return { nodes, edges, scannedAt: Date.now() }
}

export function buildDemoDiagnostics(devices: DeviceSnapshot[]): Diagnosis[] {
  const now = Date.now()
  const byId = (id: string) => devices.find((d) => d.id === id)
  const facecam = byId('1e7d4b9c30a2f586')
  const xbox = byId('a9d3f7e02c6b4185')

  return [
    {
      id: 'diag-usb-negotiation',
      severity: 'warning',
      scope: 'topology',
      deviceId: facecam?.id,
      title: 'USB 3.2 设备降速运行',
      detail: 'Facecam Pro 在匿名 USB 2.0 Hub 上仅协商到 480 Mbps，4K60 采集可能出现丢帧。',
      suggestion: '将摄像头改接主板后置 USB 3.x 端口，或更换支持 5 Gbps 的 Hub。',
      createdAt: now - 1000 * 60 * 14,
    },
    {
      id: 'diag-battery-low',
      severity: 'warning',
      scope: 'device',
      deviceId: xbox?.id,
      title: '手柄电量偏低',
      detail: 'Xbox Elite 无线控制器电量剩余 24%，按当前使用强度预计可再用约 3 小时。',
      suggestion: '连接 USB-C 充电线，或更换已充电的电池组。',
      createdAt: now - 1000 * 60 * 6,
    },
    {
      id: 'diag-firmware',
      severity: 'info',
      scope: 'device',
      deviceId: '9f1b6d2e48a7c305',
      title: '键盘固件有可用更新',
      detail: 'Keychron Q1 HE 当前固件 1.2.4，最新版本 1.3.0 优化了快速触发校准。',
      suggestion: '首版仅提示更新，不会写入设备。可在官方工具中手动升级。',
      createdAt: now - 1000 * 60 * 60 * 5,
    },
    {
      id: 'diag-hub-power',
      severity: 'info',
      scope: 'topology',
      title: '集线器供电余量偏低',
      detail: '匿名 USB 2.0 Hub 的供电预算已使用 82%，同时接入摄像头与麦克风时可能不稳定。',
      suggestion: '将高功耗设备直连主板，或使用带独立供电的 Hub。',
      createdAt: now - 1000 * 60 * 60 * 2,
    },
    {
      id: 'diag-privacy',
      severity: 'info',
      scope: 'system',
      title: '遥测数据仅保存在本地',
      detail: '采样数据写入本地 SQLite，默认保留 7 天，不会上传到云端。',
      suggestion: '可在「设置 → 数据与隐私」中关闭遥测或清空历史。',
      createdAt: now - 1000 * 60 * 60 * 24,
    },
  ]
}

export function buildDemoEvents(devices: DeviceSnapshot[]): DeviceEventLog[] {
  const now = Date.now()
  const name = (id: string) => devices.find((d) => d.id === id)?.name ?? '未知设备'
  return [
    {
      id: 'evt-1',
      ts: now - 1000 * 60 * 14,
      kind: 'warning',
      deviceId: '1e7d4b9c30a2f586',
      message: `${name('1e7d4b9c30a2f586')} 速率协商为 USB 2.0（480 Mbps）`,
    },
    {
      id: 'evt-2',
      ts: now - 1000 * 60 * 42,
      kind: 'connected',
      deviceId: 'c4e1a8b35f9d2706',
      message: `${name('c4e1a8b35f9d2706')} 已连接`,
    },
    {
      id: 'evt-3',
      ts: now - 1000 * 60 * 60 * 2,
      kind: 'info',
      deviceId: '7d3a91c4b2e8f601',
      message: `${name('7d3a91c4b2e8f601')} 接收器切换至低干扰信道`,
    },
    {
      id: 'evt-4',
      ts: now - 1000 * 60 * 60 * 4,
      kind: 'connected',
      deviceId: '8b5f3a27d9c1e406',
      message: `${name('8b5f3a27d9c1e406')} 通过蓝牙已连接 · LDAC`,
    },
    {
      id: 'evt-5',
      ts: now - 1000 * 60 * 60 * 9,
      kind: 'disconnected',
      deviceId: 'a9d3f7e02c6b4185',
      message: `${name('a9d3f7e02c6b4185')} 短暂断开 1.2 秒后重连`,
    },
    {
      id: 'evt-6',
      ts: now - 1000 * 60 * 60 * 14,
      kind: 'info',
      deviceId: 'd6c0e1a4f7b2a958',
      message: `${name('d6c0e1a4f7b2a958')} 显示模式切换为 4K 60 Hz HDR`,
    },
  ]
}

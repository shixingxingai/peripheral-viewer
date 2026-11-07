use serde::{Deserialize, Serialize};

use crate::battery::BatteryProbeInfo;

#[cfg(target_os = "windows")]
mod hid;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsProvider;

/// 跨平台共享的常量：状态值、事件类型与协议约定集中于此，避免各模块硬编码同一批字符串。
pub mod consts {
    /// PnP 设备上报的正常状态值。
    pub const PNP_STATUS_OK: &str = "OK";

    /// 归一化后的状态 / 级别值（设备、拓扑、诊断共用）。
    pub const STATUS_ONLINE: &str = "online";
    pub const STATUS_WARNING: &str = "warning";
    pub const STATUS_OK: &str = "ok";
    pub const SEVERITY_INFO: &str = "info";

    /// 事件类型（与前端 DeviceEventLog.kind 对应）。
    pub const EVENT_INFO: &str = "info";
    pub const EVENT_CONNECTED: &str = "connected";
    pub const EVENT_DISCONNECTED: &str = "disconnected";

    /// 拓扑根节点固定标识。
    pub const HOST_NODE_ID: &str = "host";

    /// 事件队列保留上限与 PowerShell 采集超时（秒）。
    pub const MAX_EVENTS: usize = 200;
    pub const SCAN_TIMEOUT_SECS: u64 = 30;

    /// 前后端约定的设备变更事件名（与 TauriBackend.onDevicesChanged 对应）。
    /// 事件名由前端 TauriBackend.subscribe 监听，改动必须前后端同步。
    pub const DEVICES_CHANGED_EVENT: &str = "devices://changed";
}

/// 平台无关的数据契约。前端只认 DeviceSnapshot，平台差异全部收敛到 provider。
/// 所有字段以 camelCase 序列化，字段名严格对应 src/types/device.ts。
pub trait DeviceProvider: Send + Sync {
    fn enumerate(&self) -> anyhow::Result<Vec<DeviceSnapshot>>;
    fn source_name(&self) -> &'static str;
}

pub fn create_provider() -> Box<dyn DeviceProvider> {
    #[cfg(target_os = "windows")]
    {
        Box::new(WindowsProvider::new())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Box::new(UnsupportedProvider)
    }
}

#[cfg(not(target_os = "windows"))]
struct UnsupportedProvider;

#[cfg(not(target_os = "windows"))]
impl DeviceProvider for UnsupportedProvider {
    fn enumerate(&self) -> anyhow::Result<Vec<DeviceSnapshot>> {
        anyhow::bail!("macOS / Linux 适配器尚未实现，当前版本仅支持 Windows")
    }
    fn source_name(&self) -> &'static str {
        "unsupported"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceConnection {
    pub kind: String,
    pub protocol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receiver: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal_quality: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePort {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAnchor {
    pub id: String,
    pub label: String,
    pub position: [f64; 3],
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTelemetry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub polling_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dpi: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub id: String,
    pub name: String,
    pub manufacturer: String,
    pub vendor_id: u16,
    pub product_id: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
    pub category: String,
    pub connection: DeviceConnection,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub battery: Option<u8>,
    pub charging: bool,
    /// 电量数据来源与校准状态；None 表示没有匹配到厂商探针。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub battery_probe: Option<BatteryProbeInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub firmware: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interface_number: Option<u8>,
    pub capabilities: Vec<String>,
    pub ports: Vec<DevicePort>,
    pub anchors: Vec<DeviceAnchor>,
    pub telemetry: DeviceTelemetry,
    pub accent: String,
    pub first_seen: i64,
    pub last_seen: i64,
    pub reconnect_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rgb: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyGraph {
    pub nodes: Vec<TopologyNode>,
    pub edges: Vec<TopologyEdge>,
    pub scanned_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnosis {
    pub id: String,
    pub severity: String,
    pub scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    pub title: String,
    pub detail: String,
    pub suggestion: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceEventLog {
    pub id: String,
    pub ts: i64,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryPoint {
    pub ts: i64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutItem {
    pub device_id: String,
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
    pub scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeskLayout {
    pub id: String,
    pub name: String,
    pub items: Vec<LayoutItem>,
    pub updated_at: i64,
}

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// 类别到主题色的集中映射；未识别类别回退为中性灰。
pub fn accent_for(category: &str) -> &'static str {
    match category {
        "keyboard" => "#67e8f9",
        "mouse" => "#a3e635",
        "headset" => "#c4b5fd",
        "monitor" => "#fbbf24",
        "webcam" => "#f472b6",
        "gamepad" => "#fb7185",
        "microphone" => "#38bdf8",
        "speaker" => "#34d399",
        _ => "#94a3b8",
    }
}

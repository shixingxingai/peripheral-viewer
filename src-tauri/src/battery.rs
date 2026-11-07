//! 厂商电量探针：配置驱动、只读优先。
//!
//! 与 `scripts/battery_probe.py` 读取同一份 `config/battery-probes.json`，
//! 保证浏览器快照与桌面端得到一致的匹配规则与解码方式。
//!
//! 约定：
//! - 只有 `decode.status == "calibrated"` 且 `percentOffset` 有值时才输出电量；
//! - 其余情况一律返回 `None`，绝不用猜测值、启发式或固定值填充；
//! - 默认绝不向设备写入。`output-query` 型探针在配置与命令都授权时才可能写，
//!   当前桌面端不提供写入口，因此始终是只读。

use std::collections::HashMap;

use hidapi::{DeviceInfo, HidApi};
use serde::{Deserialize, Serialize};

/// 编译期嵌入配置：用户改完 JSON 重新构建即可生效，运行时无需外部文件。
const CONFIG_JSON: &str = include_str!("../../config/battery-probes.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryProbeInfo {
    pub probe_id: String,
    pub vendor: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BatteryReading {
    pub battery: Option<u8>,
    pub charging: Option<bool>,
    pub probe: BatteryProbeInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeConfig {
    #[allow(dead_code)]
    schema_version: u32,
    probes: Vec<Probe>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Probe {
    id: String,
    vendor: String,
    enabled: bool,
    #[serde(rename = "match")]
    matcher: MatchRule,
    transport: Transport,
    decode: Decode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchRule {
    vendor_id: String,
    product_ids: Vec<String>,
    usage_page: String,
    #[serde(default)]
    usages: Vec<u16>,
    #[serde(default)]
    name_contains: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Transport {
    report_ids: Vec<u16>,
    report_lengths: HashMap<String, usize>,
    #[serde(default)]
    report_path_hints: HashMap<String, String>,
    #[serde(default)]
    #[allow(dead_code)]
    write_required: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Decode {
    status: String,
    percent_report_id: u16,
    percent_offset: Option<usize>,
    percent_scale: f64,
    percent_range: [f64; 2],
    #[serde(default)]
    charging: Option<ChargingRule>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChargingRule {
    offset: usize,
    #[serde(default = "default_mask")]
    mask: u8,
    #[serde(default = "one")]
    value_when_charging: u8,
}

fn default_mask() -> u8 {
    1
}

fn one() -> u8 {
    1
}

/// 探测所有已启用探针，按 (VID, PID) 建索引，供设备映射时 O(1) 查询。
pub fn probe_all() -> HashMap<(u16, u16), BatteryReading> {
    let mut out = HashMap::new();
    let config: ProbeConfig = match serde_json::from_str(CONFIG_JSON) {
        Ok(config) => config,
        Err(error) => {
            tracing::warn!(%error, "电量探针配置解析失败，电量保持不可用");
            return out;
        }
    };
    let api = match HidApi::new() {
        Ok(api) => api,
        Err(error) => {
            tracing::debug!(%error, "hidapi 初始化失败，电量保持不可用");
            return out;
        }
    };

    for probe in config.probes.iter().filter(|probe| probe.enabled) {
        let reports = read_probe(&api, probe);
        let (battery, charging, status, reason) = decode(&reports, &probe.decode);
        let reading = BatteryReading {
            battery,
            charging,
            probe: BatteryProbeInfo {
                probe_id: probe.id.clone(),
                vendor: probe.vendor.clone(),
                status,
                reason,
            },
        };
        let Ok(vid) = u16::from_str_radix(&probe.matcher.vendor_id, 16) else {
            continue;
        };
        for pid in probe.matcher.product_ids.iter().filter(|pid| *pid != "*") {
            if let Ok(pid_num) = u16::from_str_radix(pid, 16) {
                out.insert((vid, pid_num), reading.clone());
            }
        }
    }
    out
}

fn read_probe(api: &HidApi, probe: &Probe) -> HashMap<u16, Vec<u8>> {
    let mut reports = HashMap::new();
    for info in api.device_list() {
        if !matches(probe, info) {
            continue;
        }
        let path_text = info.path().to_string_lossy().to_lowercase();
        for report_id in &probe.transport.report_ids {
            // Report ID 属于特定 HID collection；配置里声明路径提示时只读对应 collection。
            if let Some(hint) = probe.transport.report_path_hints.get(&report_id.to_string()) {
                if !path_text.contains(&hint.to_lowercase()) {
                    continue;
                }
            }
            let length = probe
                .transport
                .report_lengths
                .get(&report_id.to_string())
                .copied()
                .unwrap_or(64);
            if let Some(buffer) = read_input_report(api, info, *report_id, length) {
                reports.entry(*report_id).or_insert(buffer);
            }
        }
    }
    reports
}

fn read_input_report(api: &HidApi, info: &DeviceInfo, report_id: u16, length: usize) -> Option<Vec<u8>> {
    let device = api.open_path(info.path()).ok()?;
    let mut buffer = vec![0u8; length.max(1)];
    buffer[0] = report_id as u8;
    let read = device.get_input_report(&mut buffer).ok()?;
    if read == 0 {
        return None;
    }
    buffer.truncate(read.min(buffer.len()));
    Some(buffer)
}

fn matches(probe: &Probe, info: &DeviceInfo) -> bool {
    if format!("{:04X}", info.vendor_id()) != probe.matcher.vendor_id.to_uppercase() {
        return false;
    }
    if format!("{:04X}", info.usage_page()) != probe.matcher.usage_page.to_uppercase() {
        return false;
    }
    let products: Vec<String> = probe.matcher.product_ids.iter().map(|id| id.to_uppercase()).collect();
    if !products.iter().any(|id| id == "*") && !products.contains(&format!("{:04X}", info.product_id())) {
        return false;
    }
    if !probe.matcher.usages.is_empty() && !probe.matcher.usages.contains(&info.usage()) {
        return false;
    }
    if !probe.matcher.name_contains.is_empty() {
        let haystack = format!(
            "{} {}",
            info.manufacturer_string().unwrap_or_default(),
            info.product_string().unwrap_or_default()
        )
        .to_lowercase();
        let hit = probe
            .matcher
            .name_contains
            .iter()
            .any(|needle| haystack.contains(&needle.to_lowercase()));
        if !hit {
            return false;
        }
    }
    true
}

/// 返回 (电量, 充电中, 状态, 原因)。未校准时电量恒为 None。
fn decode(reports: &HashMap<u16, Vec<u8>>, config: &Decode) -> (Option<u8>, Option<bool>, String, Option<String>) {
    if config.status == "disabled" {
        return (None, None, "disabled".into(), Some("探针已被配置禁用".into()));
    }
    let Some(offset) = config.percent_offset else {
        return (
            None,
            None,
            "uncalibrated".into(),
            Some("厂商协议尚未校准：未确认电量子节，按约定不显示猜测值".into()),
        );
    };
    if config.status != "calibrated" {
        return (
            None,
            None,
            "uncalibrated".into(),
            Some("厂商协议尚未校准：未确认电量子节，按约定不显示猜测值".into()),
        );
    }
    let Some(raw) = reports.get(&config.percent_report_id) else {
        return (
            None,
            None,
            "error".into(),
            Some(format!("未读到 Report ID {}", config.percent_report_id)),
        );
    };
    if offset >= raw.len() {
        return (
            None,
            None,
            "error".into(),
            Some(format!("percentOffset={offset} 超出实际报告长度 {}", raw.len())),
        );
    }
    let value = raw[offset] as f64 * config.percent_scale;
    let [low, high] = config.percent_range;
    if !(low..=high).contains(&value) {
        return (
            None,
            None,
            "error".into(),
            Some(format!(
                "字节 0x{:02X} 换算为 {value}，超出合法范围 {low}..{high}；请重新校准",
                raw[offset]
            )),
        );
    }
    let charging = config.charging.as_ref().and_then(|rule| {
        raw.get(rule.offset).map(|byte| {
            (byte & rule.mask) == (rule.value_when_charging & rule.mask)
        })
    });
    (Some(value.round() as u8), charging, "calibrated".into(), None)
}

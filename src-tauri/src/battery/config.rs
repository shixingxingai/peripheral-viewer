//! 内置探针定义：`config/battery-probes.json` 在编译期嵌入，作为只读基线（L0）。
//!
//! 用户校准结果不写这里，而是写到 `calibration.rs` 管理的用户覆盖层（L1）。
//! 合并规则：L1 只能覆盖 `decode`，`match` / `transport` 一律以基线为准，
//! 避免用户改配置时把只读通道改成写通道。

use std::{collections::HashMap, sync::OnceLock};

use serde::{Deserialize, Serialize};

const BUNDLED_JSON: &str = include_str!("../../../config/battery-probes.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeConfig {
    #[allow(dead_code)]
    pub schema_version: u32,
    #[serde(default)]
    #[allow(dead_code)]
    pub defaults: Defaults,
    #[serde(default)]
    pub probes: Vec<Probe>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Defaults {
    /// 采样超时与写门控沿用配置值；桌面端只读，因此这里只做反序列化保留。
    #[serde(default)]
    #[allow(dead_code)]
    pub read_timeout_ms: u64,
    #[serde(default)]
    #[allow(dead_code)]
    pub allow_device_writes: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub id: String,
    pub vendor: String,
    #[serde(default)]
    pub display_name: String,
    pub enabled: bool,
    #[serde(rename = "match")]
    pub matcher: MatchRule,
    pub transport: Transport,
    pub decode: Decode,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchRule {
    pub vendor_id: String,
    pub product_ids: Vec<String>,
    pub usage_page: String,
    #[serde(default)]
    pub usages: Vec<u16>,
    #[serde(default)]
    pub name_contains: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transport {
    /// `input-report` / `output-query`；仅用于界面展示与校验提示，不改读取行为。
    #[serde(default)]
    pub kind: String,
    pub report_ids: Vec<u16>,
    pub report_lengths: HashMap<String, usize>,
    #[serde(default)]
    pub report_path_hints: HashMap<String, String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub write_required: bool,
}

/// 解码配置。同时作为 L0 基线与 L1 覆盖层的结构，二者字段完全一致，
/// 校验规则也共用一套，避免两端对「什么算合法校准」理解不同。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decode {
    pub status: String,
    pub percent_report_id: u16,
    pub percent_offset: Option<usize>,
    pub percent_scale: f64,
    pub percent_range: [f64; 2],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub charging: Option<ChargingRule>,
    /// 仅基线使用：通道本身不含电量字段时，说明要如实反映「读不到」而非「待校准」。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChargingRule {
    pub offset: usize,
    #[serde(default = "default_mask")]
    pub mask: u8,
    #[serde(default = "one")]
    pub value_when_charging: u8,
}

fn default_mask() -> u8 {
    1
}

fn one() -> u8 {
    1
}

/// 解析内置配置；失败时返回 None，电量整体保持不可用（不猜测）。
pub fn bundled() -> Option<&'static ProbeConfig> {
    static CACHE: OnceLock<Option<ProbeConfig>> = OnceLock::new();
    CACHE
        .get_or_init(
            || match serde_json::from_str::<ProbeConfig>(BUNDLED_JSON) {
                Ok(config) => Some(config),
                Err(error) => {
                    tracing::error!(%error, "电量探针内置配置解析失败，电量保持不可用");
                    None
                }
            },
        )
        .as_ref()
}

pub fn probes() -> &'static [Probe] {
    bundled().map(|config| config.probes.as_slice()).unwrap_or(&[])
}

pub fn probe_by_id(id: &str) -> Option<&'static Probe> {
    probes().iter().find(|probe| probe.id == id)
}

/// 解析 `"24AE"` 形式的 VID 字符串。
pub fn parse_hex_id(value: &str) -> Option<u16> {
    u16::from_str_radix(value.trim(), 16).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_config_parses_and_contains_known_probes() {
        let config = bundled().expect("内置配置必须可解析");
        assert!(config.probes.iter().any(|probe| probe.id == "rapoo-2.4g-output-query"));
        assert!(config.probes.iter().any(|probe| probe.id == "dareu-2.4g-input-report"));
    }

    #[test]
    fn probes_carry_transport_kind_for_ui() {
        let rapoo = probe_by_id("rapoo-2.4g-output-query").expect("雷柏探针存在");
        assert_eq!(rapoo.transport.kind, "output-query");
        assert_eq!(parse_hex_id(&rapoo.matcher.vendor_id), Some(0x24AE));
    }
}

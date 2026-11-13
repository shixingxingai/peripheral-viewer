//! 厂商电量探针：配置驱动、只读优先。
//!
//! 分三层：
//! - L0 `config/battery-probes.json`：编译期嵌入的只读基线（`config.rs`）；
//! - L1 `%APPDATA%/peripheral-viewer/battery-calibration.json`：用户校准覆盖层（`calibration.rs`）；
//! - L2 向导会话草稿：只存在于前端内存，保存时才写入 L1。
//!
//! 合并规则：L1 只覆盖 `decode`，`match` / `transport` 永远以 L0 为准，
//! 因此用户校准不可能把只读通道变成写通道。
//!
//! 约定：
//! - 只有 `status == "calibrated"` 且 `percentOffset` 有值时才输出电量；
//! - 其余情况一律返回 `None`，绝不用猜测值、启发式或固定值填充；
//! - 默认绝不向设备写入：桌面端不提供写入口，`output-query` 只走只读快照。

mod calibration;
pub mod config;

use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use hidapi::{DeviceInfo, HidApi};
use serde::{Deserialize, Serialize};

pub use calibration::{CalibrationSample, OverlayEntry};

use crate::device::now_ms;

/// 电量结果缓存时长：枚举每 3 秒一次，但电量按 0.2 Hz 刷新就够，
/// 避免每次轮询都重新打开 HID 通道。
const CACHE_TTL: Duration = Duration::from_secs(15);
/// 单次采样的两次读取间隔。
const SAMPLE_INTERVAL: Duration = Duration::from_millis(150);
/// 采样次数上限：足够判断静态/动态，又不会明显拖慢界面。
const MAX_SAMPLE_TIMES: u8 = 5;

const UNCALIBRATED_REASON: &str = "厂商协议尚未校准：未确认电量子节，按约定不显示猜测值";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryProbeInfo {
    pub probe_id: String,
    pub vendor: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// false 表示通道本身不含电量字段：界面应显示「无法读取」而不是「待校准」。
    pub channel_available: bool,
    /// 校准置信度：unverified / single-sample / multi-sample / verified。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<String>,
    /// `bundled`（内置基线）或 `user`（用户校准）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calibrated_by: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BatteryReading {
    pub battery: Option<u8>,
    pub charging: Option<bool>,
    pub probe: BatteryProbeInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryChannel {
    pub probe_id: String,
    pub vendor: String,
    pub display_name: String,
    pub vendor_id: Option<u16>,
    pub product_ids: Vec<String>,
    pub usage_page: String,
    pub usages: Vec<u16>,
    pub transport_kind: String,
    pub report_ids: Vec<u16>,
    pub report_lengths: HashMap<String, usize>,
    /// 当前机器上是否有匹配该探针的 HID 接口。
    pub present: bool,
    pub enabled: bool,
    pub status: String,
    pub channel_available: bool,
    pub reason: Option<String>,
    pub effective_decode: config::Decode,
    pub calibrated_by: String,
    pub confidence: Option<String>,
    pub calibrated_at: Option<i64>,
    pub samples: Vec<CalibrationSample>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSamples {
    pub report_id: u16,
    pub length: usize,
    /// 按采样顺序排列的原始字节（hex，不含 Report ID）。
    pub samples: Vec<String>,
    /// 多次采样完全相同：多半是事件触发型通道，需要用户先操作设备。
    pub stable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatterySampleResult {
    pub probe_id: String,
    pub captured_at: i64,
    pub hidapi_available: bool,
    pub interfaces: Vec<String>,
    pub reports: Vec<ReportSamples>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationState {
    pub path: String,
    pub healthy: bool,
    pub error: Option<String>,
    pub entries: Vec<OverlayEntry>,
    pub channels: Vec<BatteryChannel>,
}

/// 电量索引：先按 (VID, PID)，再按序列号细化。
///
/// 同一型号的两台接收器固件编码可能不同，所以序列号级校准优先于通用校准；
/// 没有序列号时退回通用条目，保证「只校准了一台」不会污染另一台。
#[derive(Debug, Clone, Default)]
pub struct BatteryIndex {
    generic: HashMap<(u16, u16), BatteryReading>,
    by_serial: HashMap<(u16, u16), HashMap<String, BatteryReading>>,
}

impl BatteryIndex {
    pub fn get(&self, vid: u16, pid: u16, serial: Option<&str>) -> Option<&BatteryReading> {
        if let Some(serial) = serial.filter(|value| !value.trim().is_empty()) {
            if let Some(hit) = self
                .by_serial
                .get(&(vid, pid))
                .and_then(|entries| entries.get(serial))
            {
                return Some(hit);
            }
        }
        self.generic.get(&(vid, pid))
    }
}

struct CacheEntry {
    at: Instant,
    generation: u64,
    readings: BatteryIndex,
}

fn cache() -> &'static Mutex<Option<CacheEntry>> {
    static CACHE: OnceLock<Mutex<Option<CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// 校准变更后立即失效，保证「保存即生效」不看 TTL 脸色。
pub fn invalidate_cache() {
    if let Ok(mut guard) = cache().lock() {
        *guard = None;
    }
}

fn cached(generation: u64) -> Option<BatteryIndex> {
    let guard = cache().lock().ok()?;
    let entry = guard.as_ref()?;
    if entry.generation == generation && entry.at.elapsed() < CACHE_TTL {
        Some(entry.readings.clone())
    } else {
        None
    }
}

fn store_cache(generation: u64, readings: BatteryIndex) {
    if let Ok(mut guard) = cache().lock() {
        *guard = Some(CacheEntry {
            at: Instant::now(),
            generation,
            readings,
        });
    }
}

/// 探测所有已启用探针，建 (VID, PID) + 序列号的索引，供设备映射时 O(1) 查询。
///
/// 带 15 秒缓存：枚举每 3 秒一次，没必要每次都重开 HID 通道。
pub fn probe_all() -> BatteryIndex {
    let generation = calibration::generation();
    if let Some(hit) = cached(generation) {
        return hit;
    }
    let readings = probe_all_fresh();
    store_cache(generation, readings.clone());
    readings
}

fn reading_for(
    probe: &config::Probe,
    decode: config::Decode,
    calibrated_by: &'static str,
    confidence: Option<String>,
    reports: &HashMap<u16, Vec<u8>>,
) -> BatteryReading {
    let (battery, charging, status, reason) = decode_reports(reports, &decode);
    BatteryReading {
        battery,
        charging,
        probe: BatteryProbeInfo {
            probe_id: probe.id.clone(),
            vendor: probe.vendor.clone(),
            status,
            reason,
            channel_available: decode.unavailable_reason.is_none(),
            confidence,
            calibrated_by: Some(calibrated_by.to_string()),
        },
    }
}

fn probe_all_fresh() -> BatteryIndex {
    let mut index = BatteryIndex::default();
    let Some(probe_config) = config::bundled() else {
        return index;
    };
    let (overlay, _, _) = calibration::snapshot();
    let api = match HidApi::new() {
        Ok(api) => api,
        Err(error) => {
            tracing::debug!(%error, "hidapi 初始化失败，电量保持不可用");
            return index;
        }
    };

    for probe in probe_config.probes.iter().filter(|probe| probe.enabled) {
        let Some(vid) = config::parse_hex_id(&probe.matcher.vendor_id) else {
            continue;
        };
        let pids: Vec<u16> = probe
            .matcher
            .product_ids
            .iter()
            .filter(|pid| *pid != "*")
            .filter_map(|pid| config::parse_hex_id(pid))
            .collect();
        if pids.is_empty() {
            continue;
        }

        // 通道只读一次：序列号级校准只改解码方式，不需要重复访问设备。
        let reports = read_probe(&api, probe);

        let generic = calibration::select_entry(&overlay.entries, &probe.id, None);
        let (decode, calibrated_by, confidence) = effective_decode(probe, generic);
        let generic_reading = reading_for(probe, decode, calibrated_by, confidence, &reports);
        for pid in &pids {
            index.generic.insert((vid, *pid), generic_reading.clone());
        }

        for entry in overlay.entries.iter().filter(|item| item.probe_id == probe.id) {
            let Some(serial) = entry.serial.as_deref().filter(|value| !value.trim().is_empty()) else {
                continue;
            };
            let (decode, calibrated_by, confidence) = effective_decode(probe, Some(entry));
            let reading = reading_for(probe, decode, calibrated_by, confidence, &reports);
            for pid in &pids {
                index
                    .by_serial
                    .entry((vid, *pid))
                    .or_default()
                    .insert(serial.to_string(), reading.clone());
            }
        }
    }
    index
}

/// 合并 L0 基线与 L1 覆盖层，返回实际生效的 decode。
fn effective_decode(
    probe: &config::Probe,
    entry: Option<&OverlayEntry>,
) -> (config::Decode, &'static str, Option<String>) {
    match entry {
        Some(entry) => {
            let mut decode = entry.decode.clone();
            if decode.status == "calibrated" {
                // 用户已校准出电量，基线里「该通道无电量」的说明必须清掉，
                // 否则界面仍会显示「无法读取」，与事实相反。
                decode.unavailable_reason = None;
            } else if decode.unavailable_reason.is_none() {
                decode.unavailable_reason = probe.decode.unavailable_reason.clone();
            }
            let confidence = if entry.confidence.is_empty() {
                None
            } else {
                Some(entry.confidence.clone())
            };
            (decode, "user", confidence)
        }
        None => (probe.decode.clone(), "bundled", None),
    }
}

/// 只由配置决定的状态，不依赖是否能读到报告。
fn status_of(decode: &config::Decode) -> (&'static str, Option<String>) {
    if decode.status == "disabled" {
        return ("disabled", Some("探针已被配置禁用".into()));
    }
    if decode.status != "calibrated" || decode.percent_offset.is_none() {
        return (
            "uncalibrated",
            Some(
                decode
                    .unavailable_reason
                    .clone()
                    .unwrap_or_else(|| UNCALIBRATED_REASON.into()),
            ),
        );
    }
    ("calibrated", None)
}

/// 返回 (电量, 充电中, 状态, 原因)。未校准或越界时电量恒为 None。
fn decode_reports(
    reports: &HashMap<u16, Vec<u8>>,
    decode: &config::Decode,
) -> (Option<u8>, Option<bool>, String, Option<String>) {
    let (status, reason) = status_of(decode);
    if status != "calibrated" {
        return (None, None, status.into(), reason);
    }
    let Some(offset) = decode.percent_offset else {
        return (None, None, "uncalibrated".into(), Some(UNCALIBRATED_REASON.into()));
    };
    let Some(raw) = reports.get(&decode.percent_report_id) else {
        return (
            None,
            None,
            "error".into(),
            Some(format!("未读到 Report ID {}", decode.percent_report_id)),
        );
    };
    if offset >= raw.len() {
        return (
            None,
            None,
            "error".into(),
            Some(format!(
                "percentOffset={offset} 超出实际报告长度 {}",
                raw.len()
            )),
        );
    }
    let value = raw[offset] as f64 * decode.percent_scale;
    let [low, high] = decode.percent_range;
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
    let charging = decode.charging.as_ref().and_then(|rule| {
        raw.get(rule.offset)
            .map(|byte| (byte & rule.mask) == (rule.value_when_charging & rule.mask))
    });
    (Some(value.round() as u8), charging, "calibrated".into(), None)
}

fn read_probe(api: &HidApi, probe: &config::Probe) -> HashMap<u16, Vec<u8>> {
    let mut reports = HashMap::new();
    for info in api.device_list() {
        if !matches(probe, info) {
            continue;
        }
        let path_text = info.path().to_string_lossy().to_lowercase();
        for report_id in &probe.transport.report_ids {
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
    Some(payload_only(buffer, report_id))
}

/// 去掉 Report ID 前缀，保证偏移语义与 Python 端 / 校准样本一致。
///
/// hidapi 在 Windows 上要求调用前把 Report ID 写进 buf[0]，成功后被设备回填，
/// 因此返回的缓冲区通常带 Report ID 首字节；而校准偏移（含雷柏的 offset 5）
/// 是按「不含 Report ID 的 payload」标注的。不做这步归一化，桌面端会比快照少读一个字节，
/// 同一条配置在两端解出不同的电量。
///
/// 首字节不等于 Report ID 时（某些后端已自行剥离）原样返回，两种情况都安全。
fn payload_only(mut buffer: Vec<u8>, report_id: u16) -> Vec<u8> {
    if buffer.len() > 1 && buffer[0] == report_id as u8 {
        buffer.remove(0);
    }
    buffer
}

fn matches(probe: &config::Probe, info: &DeviceInfo) -> bool {
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

fn matched_interfaces(api: &HidApi, probe: &config::Probe) -> Vec<String> {
    api.device_list()
        .filter(|info| matches(probe, info))
        .map(|info| {
            format!(
                "{:04X}:{:04X} UP={:04X} U={} iface={}",
                info.vendor_id(),
                info.product_id(),
                info.usage_page(),
                info.usage(),
                info.interface_number()
            )
        })
        .collect()
}

/// 通道总览：给设置页与向导第 1 步用。
pub fn channels() -> Vec<BatteryChannel> {
    let (overlay, _, _) = calibration::snapshot();
    let api = HidApi::new().ok();
    config::probes()
        .iter()
        .map(|probe| {
            let entry = calibration::select_entry(&overlay.entries, &probe.id, None);
            let (decode, calibrated_by, confidence) = effective_decode(probe, entry);
            let (status, reason) = status_of(&decode);
            let present = api
                .as_ref()
                .map(|api| api.device_list().any(|info| matches(probe, info)))
                .unwrap_or(false);
            BatteryChannel {
                probe_id: probe.id.clone(),
                vendor: probe.vendor.clone(),
                display_name: probe.display_name.clone(),
                vendor_id: config::parse_hex_id(&probe.matcher.vendor_id),
                product_ids: probe.matcher.product_ids.clone(),
                usage_page: probe.matcher.usage_page.clone(),
                usages: probe.matcher.usages.clone(),
                transport_kind: probe.transport.kind.clone(),
                report_ids: probe.transport.report_ids.clone(),
                report_lengths: probe.transport.report_lengths.clone(),
                present,
                enabled: probe.enabled,
                status: status.to_string(),
                channel_available: decode.unavailable_reason.is_none(),
                reason,
                effective_decode: decode,
                calibrated_by: calibrated_by.to_string(),
                confidence,
                calibrated_at: entry.map(|item| item.calibrated_at),
                samples: entry.map(|item| item.samples.clone()).unwrap_or_default(),
            }
        })
        .collect()
}

/// 只读采样：同一 Report 连续读 `times` 次，用于向导第 3 步判断通道是静态还是动态。
pub fn sample(probe_id: &str, times: u8) -> Result<BatterySampleResult, String> {
    let probe = config::probe_by_id(probe_id).ok_or_else(|| format!("未知探针 ID: {probe_id}"))?;
    let times = times.clamp(1, MAX_SAMPLE_TIMES);
    let api = HidApi::new().map_err(|error| format!("hidapi 初始化失败: {error}"))?;
    let interfaces = matched_interfaces(&api, probe);
    if interfaces.is_empty() {
        return Err("本机没有匹配该探针的 HID 接口，请确认设备已连接".into());
    }

    // 按 report id 累积，保持配置顺序；同一 Report 只在第一个命中的接口上采样。
    let mut collected: HashMap<u16, Vec<String>> = HashMap::new();
    let mut errors = Vec::new();
    for round in 0..times {
        for info in api.device_list().filter(|info| matches(probe, info)) {
            let path_text = info.path().to_string_lossy().to_lowercase();
            for report_id in &probe.transport.report_ids {
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
                match read_input_report(&api, info, *report_id, length) {
                    Some(buffer) => {
                        let slot = collected.entry(*report_id).or_default();
                        if slot.len() == round as usize {
                            slot.push(buffer.iter().map(|byte| format!("{byte:02x}")).collect());
                        }
                    }
                    None => errors.push(format!("Report {report_id} 读取失败（第 {} 次）", round + 1)),
                }
            }
        }
        if round + 1 < times {
            thread::sleep(SAMPLE_INTERVAL);
        }
    }

    let mut reports: Vec<ReportSamples> = collected
        .into_iter()
        .map(|(report_id, samples)| {
            let stable = samples.len() > 1 && samples.iter().all(|item| *item == samples[0]);
            let length = samples.first().map(|item| item.len() / 2).unwrap_or(0);
            ReportSamples {
                report_id,
                length,
                samples,
                stable,
            }
        })
        .collect();
    reports.sort_by_key(|item| item.report_id);
    errors.sort();
    errors.dedup();

    Ok(BatterySampleResult {
        probe_id: probe_id.to_string(),
        captured_at: now_ms(),
        hidapi_available: true,
        interfaces,
        reports,
        errors,
    })
}

/// 启动时预热校准覆盖层：明确「用的是内置基线还是用户校准」。
pub fn init() {
    calibration::init();
}

/// 未适配的厂商 HID 接口：给「从 0 适配新厂商」用的只读探测结果。
///
/// 只读：不写任何字节。生成的片段需要进 `config/battery-probes.json` 随版本发布，
/// 因为 overlay 按设计不允许新增 transport。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnmatchedInterface {
    pub vendor_id: u16,
    pub product_id: u16,
    pub usage_page: u16,
    pub usage: u16,
    pub interface: i32,
    pub manufacturer: String,
    pub product: String,
    pub reports: Vec<ReportSamples>,
    pub path_hint: String,
}

/// 扫描未被任何探针匹配的厂商自定义 HID 接口，并尝试只读采样。
///
/// 标准用途页（Generic Desktop / Consumer / Sensor）直接跳过：那里不会有电量。
pub fn scan_unmatched(max_report_id: u8) -> Result<Vec<UnmatchedInterface>, String> {
    let api = HidApi::new().map_err(|error| format!("hidapi 初始化失败: {error}"))?;
    let probes = config::probes();
    let upper = max_report_id.clamp(1, 16);
    let mut out: Vec<UnmatchedInterface> = Vec::new();

    for info in api.device_list() {
        if matches!(info.usage_page(), 0x0001 | 0x000C | 0x000D) {
            continue;
        }
        if probes.iter().any(|probe| matches(probe, info)) {
            continue;
        }
        let vendor_id = info.vendor_id();
        let product_id = info.product_id();
        let usage_page = info.usage_page();
        let usage = info.usage();
        let interface = info.interface_number();
        // 同一接口会有多条 collection，按五元组去重。
        if out.iter().any(|item| {
            item.vendor_id == vendor_id
                && item.product_id == product_id
                && item.usage_page == usage_page
                && item.usage == usage
                && item.interface == interface
        }) {
            continue;
        }

        let mut reports = Vec::new();
        for report_id in 0..=upper {
            let mut samples: Vec<String> = Vec::new();
            for _ in 0..2 {
                if let Some(buffer) = read_input_report(&api, info, u16::from(report_id), 64) {
                    samples.push(buffer.iter().map(|byte| format!("{byte:02x}")).collect());
                }
            }
            if samples.is_empty() {
                continue;
            }
            let length = samples.first().map(|item| item.len() / 2).unwrap_or(0);
            let stable = samples.len() > 1 && samples.iter().all(|item| *item == samples[0]);
            reports.push(ReportSamples {
                report_id: u16::from(report_id),
                length,
                samples,
                stable,
            });
        }

        let path_text = info.path().to_string_lossy().to_string();
        out.push(UnmatchedInterface {
            vendor_id,
            product_id,
            usage_page,
            usage,
            interface,
            manufacturer: info.manufacturer_string().unwrap_or_default().to_string(),
            product: info.product_string().unwrap_or_default().to_string(),
            reports,
            path_hint: path_text
                .rsplit('\\')
                .next()
                .unwrap_or(&path_text)
                .to_string(),
        });
    }

    out.sort_by_key(|item| (item.vendor_id, item.product_id, item.usage_page, item.interface));
    Ok(out)
}

pub fn calibration_state() -> CalibrationState {
    let (overlay, healthy, error) = calibration::snapshot();
    CalibrationState {
        path: calibration::path().display().to_string(),
        healthy,
        error,
        entries: overlay.entries,
        channels: channels(),
    }
}

/// 保存一条校准并让电量缓存失效（调用方随后应重新枚举设备以推送新值）。
pub fn save_calibration(mut entry: OverlayEntry) -> Result<CalibrationState, String> {
    if entry.calibrated_at == 0 {
        entry.calibrated_at = now_ms();
    }
    if entry.source.is_none() {
        entry.source = Some("wizard".into());
    }
    calibration::upsert(entry)?;
    invalidate_cache();
    Ok(calibration_state())
}

pub fn reset_calibration(probe_id: &str, serial: Option<&str>) -> Result<CalibrationState, String> {
    calibration::remove(probe_id, serial)?;
    invalidate_cache();
    Ok(calibration_state())
}

pub fn export_calibration() -> Result<String, String> {
    calibration::export_json()
}

pub fn import_calibration(json: &str) -> Result<CalibrationState, String> {
    calibration::import_json(json)?;
    invalidate_cache();
    Ok(calibration_state())
}

#[cfg(test)]
mod tests {
    use super::config::{ChargingRule, Decode};
    use super::*;

    fn decode_cfg(status: &str, offset: Option<usize>, unavailable_reason: Option<&str>) -> Decode {
        Decode {
            status: status.into(),
            percent_report_id: 188,
            percent_offset: offset,
            percent_scale: 1.0,
            percent_range: [0.0, 100.0],
            charging: None,
            unavailable_reason: unavailable_reason.map(str::to_string),
        }
    }

    fn probe() -> config::Probe {
        config::probes()
            .iter()
            .find(|probe| probe.id == "rapoo-2.4g-output-query")
            .cloned()
            .expect("雷柏探针存在")
    }

    fn entry(decode: Decode) -> OverlayEntry {
        OverlayEntry {
            probe_id: "rapoo-2.4g-output-query".into(),
            serial: None,
            decode,
            confidence: "single-sample".into(),
            samples: Vec::new(),
            calibrated_at: 1,
            source: Some("wizard".into()),
        }
    }

    #[test]
    fn uncalibrated_uses_configured_reason() {
        let config = decode_cfg("uncalibrated", None, Some("该通道不含电量字段"));
        let (battery, _, status, reason) = decode_reports(&HashMap::new(), &config);
        assert_eq!(battery, None);
        assert_eq!(status, "uncalibrated");
        assert_eq!(reason.as_deref(), Some("该通道不含电量字段"));
    }

    #[test]
    fn uncalibrated_falls_back_to_default_reason() {
        let config = decode_cfg("uncalibrated", None, None);
        let (_, _, _, reason) = decode_reports(&HashMap::new(), &config);
        assert!(reason.unwrap_or_default().contains("未确认电量子节"));
    }

    #[test]
    fn decodes_calibrated_report() {
        let mut reports = HashMap::new();
        reports.insert(188u16, vec![0xb0, 0x42, 0x80, 0x0c, 0x01, 0x3d]);
        let (battery, charging, status, reason) =
            decode_reports(&reports, &decode_cfg("calibrated", Some(5), None));
        assert_eq!(battery, Some(61));
        assert_eq!(charging, None);
        assert_eq!(status, "calibrated");
        assert_eq!(reason, None);
    }

    #[test]
    fn out_of_range_byte_returns_unavailable_not_guess() {
        let mut reports = HashMap::new();
        // 0xFF = 255，超出 0..100，必须判定为需要重新校准而不是夹到 100。
        reports.insert(188u16, vec![0xb0, 0x42, 0x80, 0x0c, 0x01, 0xff]);
        let (battery, _, status, reason) =
            decode_reports(&reports, &decode_cfg("calibrated", Some(5), None));
        assert_eq!(battery, None);
        assert_eq!(status, "error");
        assert!(reason.unwrap_or_default().contains("请重新校准"));
    }

    #[test]
    fn missing_report_returns_unavailable() {
        let (battery, _, status, _) = decode_reports(&HashMap::new(), &decode_cfg("calibrated", Some(5), None));
        assert_eq!(battery, None);
        assert_eq!(status, "error");
    }

    #[test]
    fn charging_rule_is_applied() {
        let mut config = decode_cfg("calibrated", Some(5), None);
        config.charging = Some(ChargingRule {
            offset: 4,
            mask: 1,
            value_when_charging: 1,
        });
        let mut reports = HashMap::new();
        reports.insert(188u16, vec![0xb0, 0x42, 0x80, 0x0c, 0x01, 0x30]);
        let (battery, charging, _, _) = decode_reports(&reports, &config);
        assert_eq!(battery, Some(48));
        assert_eq!(charging, Some(true));
    }

    /// 用户校准必须在合并后清掉基线的「通道无电量」说明，
    /// 否则界面会把刚校准好的设备显示成「无法读取」。
    #[test]
    fn user_calibration_clears_baseline_unavailable_reason() {
        let probe = probe();
        let baseline = decode_cfg(
            "uncalibrated",
            None,
            Some("该接收器的 HID 通道不含电量字段"),
        );
        let mut probe_with_reason = probe.clone();
        probe_with_reason.decode = baseline;

        let user = entry(decode_cfg("calibrated", Some(5), None));
        let (effective, source, confidence) = effective_decode(&probe_with_reason, Some(&user));
        assert_eq!(source, "user");
        assert_eq!(confidence.as_deref(), Some("single-sample"));
        assert_eq!(effective.unavailable_reason, None);
        assert!(status_of(&effective).0 == "calibrated");
    }

    /// 未校准的用户条目不能让通道变成「可校准」。
    #[test]
    fn user_uncalibrated_entry_keeps_channel_unavailable() {
        let probe = probe();
        let mut probe_with_reason = probe.clone();
        probe_with_reason.decode = decode_cfg("uncalibrated", None, Some("通道不含电量字段"));

        let user = entry(decode_cfg("uncalibrated", None, None));
        let (effective, _, _) = effective_decode(&probe_with_reason, Some(&user));
        assert_eq!(effective.unavailable_reason.as_deref(), Some("通道不含电量字段"));
        assert_eq!(status_of(&effective).0, "uncalibrated");
    }

    #[test]
    fn baseline_is_used_when_no_user_entry() {
        let probe = probe();
        let (effective, source, confidence) = effective_decode(&probe, None);
        assert_eq!(source, "bundled");
        assert_eq!(confidence, None);
        assert_eq!(effective.percent_offset, probe.decode.percent_offset);
    }

    /// hidapi 回填 Report ID 时必须剥掉，否则校准偏移整体错一位。
    #[test]
    fn strips_report_id_prefix_from_input_report() {
        let buffer = vec![0xBC, 0xB0, 0x42, 0x80, 0x0C, 0x01, 0x3D];
        let payload = payload_only(buffer, 0xBC);
        assert_eq!(payload.len(), 6);
        // 偏移 5 在剥离后正好是电量字节，与 config 里 Rapoo 的校准一致。
        assert_eq!(payload[5], 0x3D);
        let (battery, _, status, _) = decode_reports(
            &HashMap::from([(188u16, payload)]),
            &decode_cfg("calibrated", Some(5), None),
        );
        assert_eq!(battery, Some(61));
        assert_eq!(status, "calibrated");
    }

    /// 后端已经剥离过时不重复剥离（首字节是 payload 而非 Report ID）。
    #[test]
    fn keeps_buffer_when_report_id_is_absent() {
        let buffer = vec![0xB0, 0x42, 0x80, 0x0C, 0x01, 0x3D];
        assert_eq!(payload_only(buffer.clone(), 0xBC), buffer);
    }

    fn reading(value: u8) -> BatteryReading {
        BatteryReading {
            battery: Some(value),
            charging: None,
            probe: BatteryProbeInfo {
                probe_id: "rapoo-2.4g-output-query".into(),
                vendor: "Rapoo".into(),
                status: "calibrated".into(),
                reason: None,
                channel_available: true,
                confidence: Some("single-sample".into()),
                calibrated_by: Some("user".into()),
            },
        }
    }

    /// 序列号级校准优先，未知序列号退回通用条目，绝不串台。
    #[test]
    fn index_prefers_serial_scoped_reading() {
        let mut index = BatteryIndex::default();
        index.generic.insert((0x24AE, 0x185A), reading(48));
        index
            .by_serial
            .entry((0x24AE, 0x185A))
            .or_default()
            .insert("SN-A".into(), reading(61));

        assert_eq!(index.get(0x24AE, 0x185A, Some("SN-A")).and_then(|item| item.battery), Some(61));
        assert_eq!(index.get(0x24AE, 0x185A, Some("SN-Z")).and_then(|item| item.battery), Some(48));
        assert_eq!(index.get(0x24AE, 0x185A, None).and_then(|item| item.battery), Some(48));
        // 空白序列号等同于无序列号。
        assert_eq!(index.get(0x24AE, 0x185A, Some("  ")).and_then(|item| item.battery), Some(48));
        assert!(index.get(0x1234, 0x5678, None).is_none());
    }
}

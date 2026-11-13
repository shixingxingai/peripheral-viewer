//! 用户校准覆盖层（L1）：运行时读写，热生效，不改二进制。
//!
//! 约定：
//! - 只能覆盖 `decode`（以及追加校准样本），**不允许**覆盖 `match` / `transport`，
//!   否则用户误配就能把只读通道变成写通道，破坏只读承诺；
//! - 整份文件校验失败时**整份忽略**并上报错误，绝不静默使用半份配置；
//! - 落盘走「临时文件 + 备份 + rename」，失败时内存状态不变。

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{OnceLock, RwLock},
};

use serde::{Deserialize, Serialize};

use super::{config, now_ms};

pub const SCHEMA_VERSION: u32 = 1;
/// 置信度等级，从低到高；只用于界面呈现与降级判断，不参与解码。
pub const CONFIDENCE_LEVELS: [&str; 4] = ["unverified", "single-sample", "multi-sample", "verified"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayFile {
    pub schema_version: u32,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub entries: Vec<OverlayEntry>,
}

impl Default for OverlayFile {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            updated_at: 0,
            entries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayEntry {
    pub probe_id: String,
    /// 预留：按序列号细化到单个设备。当前版本按 probeId 整体生效。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
    pub decode: config::Decode,
    #[serde(default)]
    pub confidence: String,
    #[serde(default)]
    pub samples: Vec<CalibrationSample>,
    #[serde(default)]
    pub calibrated_at: i64,
    /// `wizard`（界面向导）/ `import`（导入）/ `manual`（手工编辑）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationSample {
    /// 采样时厂商官方驱动显示的电量百分比。
    pub reference: u8,
    /// 原始报告字节（hex，不含 Report ID）。
    pub raw: String,
    pub report_id: u16,
    #[serde(default)]
    pub captured_at: i64,
}

struct Store {
    path: PathBuf,
    overlay: OverlayFile,
    /// false 表示文件存在但不可用：界面必须提示「已回到内置配置」。
    healthy: bool,
    error: Option<String>,
    /// 每次写入自增，用于让电量缓存失效。
    generation: u64,
}

static STORE: OnceLock<RwLock<Store>> = OnceLock::new();

pub fn default_path() -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var("APPDATA")
            .ok()
            .filter(|value| !value.trim().is_empty())
        {
            return PathBuf::from(appdata)
                .join("peripheral-viewer")
                .join("battery-calibration.json");
        }
    }
    std::env::temp_dir()
        .join("peripheral-viewer")
        .join("battery-calibration.json")
}

fn load_from(path: PathBuf) -> Store {
    let (overlay, healthy, error) = match fs::read(&path) {
        Ok(bytes) if bytes.is_empty() => (OverlayFile::default(), true, None),
        Ok(bytes) => match serde_json::from_slice::<OverlayFile>(&bytes) {
            Ok(overlay) => {
                let problems = validate(&overlay);
                if problems.is_empty() {
                    (overlay, true, None)
                } else {
                    let message = problems.join("；");
                    tracing::warn!("用户电量校准文件校验失败（{}）: {}", path.display(), message);
                    (OverlayFile::default(), false, Some(message))
                }
            }
            Err(error) => {
                tracing::warn!("解析用户电量校准文件失败（{}）: {}", path.display(), error);
                (OverlayFile::default(), false, Some(format!("解析失败: {error}")))
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (OverlayFile::default(), true, None),
        Err(error) => {
            tracing::warn!("读取用户电量校准文件失败（{}）: {}", path.display(), error);
            (
                OverlayFile::default(),
                false,
                Some(format!("读取失败: {error}")),
            )
        }
    };

    Store {
        path,
        overlay,
        healthy,
        error,
        generation: 1,
    }
}

fn store() -> &'static RwLock<Store> {
    STORE.get_or_init(|| RwLock::new(load_from(default_path())))
}

/// 启动时预热，确保第一条日志 / 状态查询来自真实文件而不是懒加载瞬间。
pub fn init() {
    let _ = store();
}

pub fn path() -> PathBuf {
    store()
        .read()
        .map(|store| store.path.clone())
        .unwrap_or_else(|_| default_path())
}

pub fn generation() -> u64 {
    store().read().map(|store| store.generation).unwrap_or(0)
}

/// 返回 (覆盖层, 是否健康, 错误说明)。
pub fn snapshot() -> (OverlayFile, bool, Option<String>) {
    match store().read() {
        Ok(store) => (store.overlay.clone(), store.healthy, store.error.clone()),
        Err(_) => (OverlayFile::default(), false, Some("校准存储锁不可用".into())),
    }
}

/// 选取生效条目：序列号级优先，其次通用条目（serial 为空）。
pub fn select_entry<'a>(
    entries: &'a [OverlayEntry],
    probe_id: &str,
    serial: Option<&str>,
) -> Option<&'a OverlayEntry> {
    if let Some(serial) = serial.filter(|value| !value.trim().is_empty()) {
        if let Some(hit) = entries
            .iter()
            .find(|item| item.probe_id == probe_id && item.serial.as_deref() == Some(serial))
        {
            return Some(hit);
        }
    }
    entries
        .iter()
        .find(|item| item.probe_id == probe_id && item.serial.is_none())
}

/// 单条校验：给向导用，保存前就能拿到具体字段错误。
pub fn validate_entry(entry: &OverlayEntry) -> Vec<String> {
    let Some(probe) = config::probe_by_id(&entry.probe_id) else {
        return vec![format!("未知探针 ID: {}", entry.probe_id)];
    };

    let mut errors = Vec::new();
    let tag = entry.probe_id.clone();
    let decode = &entry.decode;

    if !matches!(decode.status.as_str(), "calibrated" | "uncalibrated" | "disabled") {
        errors.push(format!("{tag}: status 只能是 calibrated|uncalibrated|disabled"));
    }
    if !probe.transport.report_ids.contains(&decode.percent_report_id) {
        errors.push(format!(
            "{tag}: percentReportId={} 不在 transport.reportIds 中",
            decode.percent_report_id
        ));
    }
    if let Some(offset) = decode.percent_offset {
        if offset > 1023 {
            errors.push(format!("{tag}: percentOffset 必须 ≤ 1023"));
        }
        if let Some(length) = probe
            .transport
            .report_lengths
            .get(&decode.percent_report_id.to_string())
        {
            if offset >= *length {
                errors.push(format!(
                    "{tag}: percentOffset={offset} 超出 Report {} 的声明长度 {length}",
                    decode.percent_report_id
                ));
            }
        }
    }
    if !decode.percent_scale.is_finite() || decode.percent_scale <= 0.0 || decode.percent_scale > 100.0 {
        errors.push(format!("{tag}: percentScale 必须是 (0, 100] 内的有限数"));
    }
    let [low, high] = decode.percent_range;
    if !low.is_finite() || !high.is_finite() || low >= high || low < -1000.0 || high > 1000.0 {
        errors.push(format!("{tag}: percentRange 必须是 [min, max] 且 min < max"));
    }
    if decode.status == "calibrated" && decode.percent_offset.is_none() {
        errors.push(format!("{tag}: status=calibrated 时必须填写 percentOffset"));
    }
    if let Some(charging) = &decode.charging {
        if charging.offset > 1023 {
            errors.push(format!("{tag}: charging.offset 必须 ≤ 1023"));
        }
    }
    if !entry.confidence.is_empty() && !CONFIDENCE_LEVELS.contains(&entry.confidence.as_str()) {
        errors.push(format!("{tag}: confidence 只能是 {}", CONFIDENCE_LEVELS.join("|")));
    }
    if let Some(serial) = &entry.serial {
        if serial.trim().is_empty() {
            errors.push(format!("{tag}: serial 若存在则不能为空白"));
        }
    }
    for sample in &entry.samples {
        if sample.reference > 100 {
            errors.push(format!("{tag}: 校准样本的参考电量必须 ≤ 100"));
        }
        if sample.raw.is_empty() || sample.raw.len() % 2 != 0 {
            errors.push(format!("{tag}: 校准样本 raw 必须是偶数长度的 hex"));
        } else if !sample.raw.chars().all(|c| c.is_ascii_hexdigit()) {
            errors.push(format!("{tag}: 校准样本 raw 含非 hex 字符"));
        }
        if !probe.transport.report_ids.contains(&sample.report_id) {
            errors.push(format!("{tag}: 校准样本引用了未声明的 Report {}", sample.report_id));
        }
    }
    errors
}

/// 整份校验：任何一条有问题都算整份不可用（配合「整份忽略」策略）。
pub fn validate(overlay: &OverlayFile) -> Vec<String> {
    let mut errors = Vec::new();
    if overlay.schema_version != SCHEMA_VERSION {
        errors.push(format!(
            "schemaVersion 必须为 {SCHEMA_VERSION}，实际 {}",
            overlay.schema_version
        ));
    }
    // 唯一性以 (probeId, serial) 为单位：同一探针可以有针对不同设备的校准。
    let mut seen: Vec<(String, String)> = Vec::new();
    for entry in &overlay.entries {
        let key = (
            entry.probe_id.clone(),
            entry.serial.clone().unwrap_or_default(),
        );
        if seen.contains(&key) {
            errors.push(format!(
                "探针 {} 出现重复校准记录（serial={}）",
                entry.probe_id,
                if key.1.is_empty() { "通用" } else { key.1.as_str() }
            ));
        } else {
            seen.push(key);
        }
        errors.extend(validate_entry(entry));
    }
    errors
}

/// 原子写：先写临时文件，备份旧文件，再替换。任何一步失败都不动内存状态。
fn write_overlay(path: &Path, overlay: &OverlayFile) -> Result<(), String> {
    let text = serde_json::to_string_pretty(overlay).map_err(|error| format!("序列化校准失败: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建目录失败 {}: {error}", parent.display()))?;
    }
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, &text).map_err(|error| format!("写入临时文件失败 {}: {error}", temp.display()))?;
    if path.exists() {
        let backup = path.with_extension("json.bak");
        if let Err(error) = fs::copy(path, &backup) {
            tracing::warn!("备份旧校准文件失败（{}）: {}", backup.display(), error);
        }
        // Windows 的 rename 不覆盖已存在文件，先删除再改名。
        fs::remove_file(path).map_err(|error| format!("替换旧文件失败 {}: {error}", path.display()))?;
    }
    fs::rename(&temp, path).map_err(|error| format!("提交校准文件失败 {}: {error}", path.display()))?;
    Ok(())
}

/// 写入一条校准（同 probeId 已存在则整体替换），并让缓存失效。
pub fn upsert(mut entry: OverlayEntry) -> Result<(), String> {
    let problems = validate_entry(&entry);
    if !problems.is_empty() {
        return Err(problems.join("；"));
    }
    let mut guard = store()
        .write()
        .map_err(|_| "校准存储锁不可用".to_string())?;
    if entry.calibrated_at == 0 {
        entry.calibrated_at = now_ms();
    }
    let mut next = guard.overlay.clone();
    // 同 (probeId, serial) 视为同一条记录：序列号级校准不能互相覆盖，也不能顶掉通用条目。
    next.entries.retain(|item| {
        !(item.probe_id == entry.probe_id && item.serial == entry.serial)
    });
    next.entries.push(entry);
    next.updated_at = now_ms();

    let problems = validate(&next);
    if !problems.is_empty() {
        return Err(problems.join("；"));
    }
    write_overlay(&guard.path, &next)?;
    guard.overlay = next;
    guard.healthy = true;
    guard.error = None;
    guard.generation = guard.generation.wrapping_add(1);
    Ok(())
}

/// 删除一条校准，回到内置基线。serial 为空时只删通用条目。
pub fn remove(probe_id: &str, serial: Option<&str>) -> Result<(), String> {
    let mut guard = store()
        .write()
        .map_err(|_| "校准存储锁不可用".to_string())?;
    let mut next = guard.overlay.clone();
    let before = next.entries.len();
    next.entries.retain(|item| {
        !(item.probe_id == probe_id && item.serial.as_deref() == serial)
    });
    if before == next.entries.len() {
        return Ok(());
    }
    next.updated_at = now_ms();
    write_overlay(&guard.path, &next)?;
    guard.overlay = next;
    guard.healthy = true;
    guard.error = None;
    guard.generation = guard.generation.wrapping_add(1);
    Ok(())
}

pub fn export_json() -> Result<String, String> {
    let (overlay, _, _) = snapshot();
    serde_json::to_string_pretty(&overlay).map_err(|error| format!("导出失败: {error}"))
}

/// 导入：整份替换，先校验再落盘；失败时现有校准保持不变。
pub fn import_json(text: &str) -> Result<(), String> {
    let overlay: OverlayFile = serde_json::from_str(text).map_err(|error| format!("导入内容不是合法 JSON: {error}"))?;
    let problems = validate(&overlay);
    if !problems.is_empty() {
        return Err(problems.join("；"));
    }
    let mut guard = store()
        .write()
        .map_err(|_| "校准存储锁不可用".to_string())?;
    write_overlay(&guard.path, &overlay)?;
    guard.overlay = overlay;
    guard.healthy = true;
    guard.error = None;
    guard.generation = guard.generation.wrapping_add(1);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_calibrated() -> config::Decode {
        config::Decode {
            status: "calibrated".into(),
            percent_report_id: 188,
            percent_offset: Some(5),
            percent_scale: 1.0,
            percent_range: [0.0, 100.0],
            charging: None,
            unavailable_reason: None,
        }
    }

    fn entry(probe_id: &str, decode: config::Decode) -> OverlayEntry {
        OverlayEntry {
            probe_id: probe_id.into(),
            serial: None,
            decode,
            confidence: "single-sample".into(),
            samples: Vec::new(),
            calibrated_at: 0,
            source: Some("wizard".into()),
        }
    }

    #[test]
    fn accepts_calibration_matching_declared_report() {
        let problems = validate_entry(&entry("rapoo-2.4g-output-query", decode_calibrated()));
        assert!(problems.is_empty(), "应接受合法校准，实际: {problems:?}");
    }

    #[test]
    fn rejects_offset_beyond_declared_report_length() {
        // Report 188 声明长度 12 字节，偏移 99 必须被拒，避免写进越界配置。
        let mut decode = decode_calibrated();
        decode.percent_offset = Some(99);
        let problems = validate_entry(&entry("rapoo-2.4g-output-query", decode));
        assert!(problems.iter().any(|item| item.contains("超出 Report 188")), "{problems:?}");
    }

    #[test]
    fn rejects_report_id_not_in_transport() {
        let mut decode = decode_calibrated();
        decode.percent_report_id = 7;
        let problems = validate_entry(&entry("rapoo-2.4g-output-query", decode));
        assert!(problems.iter().any(|item| item.contains("不在 transport.reportIds")), "{problems:?}");
    }

    #[test]
    fn rejects_unknown_probe() {
        let problems = validate_entry(&entry("not-a-real-probe", decode_calibrated()));
        assert_eq!(problems.len(), 1);
        assert!(problems[0].contains("未知探针"));
    }

    #[test]
    fn rejects_calibrated_without_offset() {
        let mut decode = decode_calibrated();
        decode.percent_offset = None;
        let problems = validate_entry(&entry("rapoo-2.4g-output-query", decode));
        assert!(problems.iter().any(|item| item.contains("必须填写 percentOffset")), "{problems:?}");
    }

    #[test]
    fn rejects_bad_scale_and_range() {
        let mut decode = decode_calibrated();
        decode.percent_scale = 0.0;
        decode.percent_range = [100.0, 0.0];
        let problems = validate_entry(&entry("rapoo-2.4g-output-query", decode));
        assert!(problems.iter().any(|item| item.contains("percentScale")), "{problems:?}");
        assert!(problems.iter().any(|item| item.contains("percentRange")), "{problems:?}");
    }

    #[test]
    fn rejects_malformed_sample_hex() {
        let mut item = entry("rapoo-2.4g-output-query", decode_calibrated());
        item.samples.push(CalibrationSample {
            reference: 48,
            raw: "zz1".into(),
            report_id: 188,
            captured_at: 0,
        });
        let problems = validate_entry(&item);
        assert!(problems.iter().any(|entry| entry.contains("hex")), "{problems:?}");
    }

    #[test]
    fn duplicate_entries_are_rejected_as_a_whole_file() {
        let overlay = OverlayFile {
            schema_version: SCHEMA_VERSION,
            updated_at: 0,
            entries: vec![
                entry("rapoo-2.4g-output-query", decode_calibrated()),
                entry("rapoo-2.4g-output-query", decode_calibrated()),
            ],
        };
        let problems = validate(&overlay);
        assert!(problems.iter().any(|item| item.contains("重复校准记录")), "{problems:?}");
    }

    #[test]
    fn same_probe_with_different_serials_is_allowed() {
        let mut second = entry("rapoo-2.4g-output-query", decode_calibrated());
        second.serial = Some("SN-A".into());
        let mut third = entry("rapoo-2.4g-output-query", decode_calibrated());
        third.serial = Some("SN-B".into());
        let overlay = OverlayFile {
            schema_version: SCHEMA_VERSION,
            updated_at: 0,
            entries: vec![entry("rapoo-2.4g-output-query", decode_calibrated()), second, third],
        };
        assert!(validate(&overlay).is_empty(), "{:?}", validate(&overlay));
    }

    #[test]
    fn duplicate_serial_entries_are_rejected() {
        let mut first = entry("rapoo-2.4g-output-query", decode_calibrated());
        first.serial = Some("SN-A".into());
        let mut second = entry("rapoo-2.4g-output-query", decode_calibrated());
        second.serial = Some("SN-A".into());
        let overlay = OverlayFile {
            schema_version: SCHEMA_VERSION,
            updated_at: 0,
            entries: vec![first, second],
        };
        let problems = validate(&overlay);
        assert!(problems.iter().any(|item| item.contains("SN-A")), "{problems:?}");
    }

    #[test]
    fn select_entry_prefers_serial_then_falls_back_to_generic() {
        let generic = entry("rapoo-2.4g-output-query", decode_calibrated());
        let mut scoped = entry("rapoo-2.4g-output-query", decode_calibrated());
        scoped.serial = Some("SN-A".into());
        scoped.decode.percent_offset = Some(6);
        let entries = vec![generic, scoped];

        let hit = select_entry(&entries, "rapoo-2.4g-output-query", Some("SN-A")).expect("命中序列号级");
        assert_eq!(hit.decode.percent_offset, Some(6));

        // 未知序列号退回通用条目，不会误用别的设备的校准。
        let fallback = select_entry(&entries, "rapoo-2.4g-output-query", Some("SN-Z")).expect("退回通用");
        assert_eq!(fallback.decode.percent_offset, Some(5));

        // 没有序列号信息（如 PnP 未给出）同样退回通用条目。
        let anonymous = select_entry(&entries, "rapoo-2.4g-output-query", None).expect("通用");
        assert_eq!(anonymous.serial, None);
    }

    #[test]
    fn wrong_schema_version_is_rejected() {
        let overlay = OverlayFile {
            schema_version: 99,
            entries: Vec::new(),
            updated_at: 0,
        };
        assert!(!validate(&overlay).is_empty());
    }

    #[test]
    fn write_and_reload_roundtrip_keeps_values() {
        let dir = std::env::temp_dir().join(format!("periphery-calib-{}", std::process::id()));
        let path = dir.join("battery-calibration.json");
        let overlay = OverlayFile {
            schema_version: SCHEMA_VERSION,
            updated_at: 1,
            entries: vec![entry("rapoo-2.4g-output-query", decode_calibrated())],
        };
        write_overlay(&path, &overlay).expect("写入应成功");

        let loaded: OverlayFile = serde_json::from_slice(&fs::read(&path).expect("文件存在")).expect("可反序列化");
        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(loaded.entries[0].decode.percent_offset, Some(5));

        // 二次写入必须覆盖旧文件（Windows 下 rename 不覆盖，实现里先删再改名）。
        let mut second = overlay.clone();
        second.entries[0].decode.percent_offset = Some(6);
        write_overlay(&path, &second).expect("二次写入应成功");
        let reloaded: OverlayFile = serde_json::from_slice(&fs::read(&path).expect("文件存在")).expect("可反序列化");
        assert_eq!(reloaded.entries[0].decode.percent_offset, Some(6));
        assert!(path.with_extension("json.bak").exists(), "应保留备份");

        let _ = fs::remove_dir_all(&dir);
    }
}

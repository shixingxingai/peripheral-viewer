use super::hid::{usage_index, HidSignals};
use super::*;
use anyhow::Context;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

/// 与 scripts/build-snapshot.py 共用同一份采集脚本，避免浏览器快照与桌面端数据口径不一致。
const SCAN_SCRIPT: &str = include_str!("../../../scripts/scan-devices.ps1");

/// 系统内置音频关键词：命中即视为非外设。
const SYSTEM_AUDIO_KEYWORDS: &[&str] = &[
    "amd",
    "realtek",
    "high definition audio",
    "nvidia",
    "digital output",
    "streaming audio",
    "总线",
    "audio device on",
];

/// 系统 USB 主控 / 集线器关键词。
const USB_HUB_KEYWORDS: &[&str] = &["根集线器", "root hub", "hub", "控制器"];

/// 这些名称过于泛化，不适合作为展示名。
const BLOCKED_NAME_KEYWORDS: &[&str] = &[
    "标准",
    "generic",
    "unknown",
    "usb input device",
    "hid-compliant",
    "符合 hid",
];

/// 泛化厂商名。
const STANDARD_VENDOR_KEYWORDS: &[&str] = &["标准", "(standard"];

/// 名称中提示无线接收器的关键词。
const WIRELESS_NAME_KEYWORDS: &[&str] = &["receiver", "2.4g", "wireless"];

pub struct WindowsProvider;

impl WindowsProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DeviceProvider for WindowsProvider {
    fn enumerate(&self) -> anyhow::Result<Vec<DeviceSnapshot>> {
        let rows = scan_pnp()?;
        Ok(build_devices(rows))
    }

    fn source_name(&self) -> &'static str {
        "Get-PnpDevice / CfgMgr"
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PnpRow {
    #[serde(default)]
    class: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    instance_id: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    manufacturer: String,
    #[serde(default)]
    bus_desc: Option<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    driver: Option<String>,
}

/// 采集编排：写脚本 -> 带超时运行 PowerShell -> 读取并解析 JSON。
fn scan_pnp() -> anyhow::Result<Vec<PnpRow>> {
    let base = std::env::temp_dir().join("peripheral-viewer");
    fs::create_dir_all(&base)
        .with_context(|| format!("创建扫描缓存目录失败: {}", base.display()))?;
    let script_path = base.join("scan-devices.ps1");
    let json_path = base.join("pnp-raw.json");
    fs::write(&script_path, SCAN_SCRIPT)
        .with_context(|| format!("写入扫描脚本失败: {}", script_path.display()))?;
    // 清掉上一轮结果，避免采集失败时误把陈旧 JSON 当作本次数据。
    let _ = fs::remove_file(&json_path);

    let mut command = Command::new("powershell");
    command
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script_path)
        .arg("-Output")
        .arg(&json_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    run_powershell(&mut command)
        .with_context(|| format!("运行设备采集脚本失败: {}", script_path.display()))?;
    parse_scan_result(&json_path)
}

/// 运行采集子进程并施加超时：超时后主动终止，避免 watcher 线程被挂起的 PowerShell 卡死。
/// stdout 仅为脚本输出路径，直接丢弃；stderr 仅用于失败诊断。
fn run_powershell(command: &mut Command) -> anyhow::Result<()> {
    let mut child = command
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .context("启动 PowerShell 失败，请确认系统可用 powershell")?;

    let timeout = Duration::from_secs(consts::SCAN_TIMEOUT_SECS);
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    anyhow::bail!(
                        "设备扫描超时（超过 {} 秒），已终止无响应的 PowerShell 子进程",
                        timeout.as_secs()
                    );
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                anyhow::bail!("等待 PowerShell 子进程失败: {}", error);
            }
        }
    };

    let mut stderr = String::new();
    if let Some(mut pipe) = child.stderr.take() {
        let _ = pipe.read_to_string(&mut stderr);
    }
    if !status.success() {
        let detail = if stderr.trim().is_empty() {
            "（无错误输出）"
        } else {
            stderr.trim()
        };
        anyhow::bail!(
            "设备扫描失败（PowerShell 退出码 {:?}）: {}",
            status.code(),
            detail
        );
    }
    Ok(())
}

/// 从采集结果文件还原行数组：明确区分读取失败、非 UTF-8、空输出与 JSON 解析失败。
fn parse_scan_result(path: &Path) -> anyhow::Result<Vec<PnpRow>> {
    let bytes = fs::read(path)
        .with_context(|| format!("读取扫描结果失败: {}", path.display()))?;
    let text = String::from_utf8(bytes).context("扫描结果不是有效的 UTF-8 文本")?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        anyhow::bail!(
            "扫描结果为空（{}），PowerShell 未写出有效数据",
            path.display()
        );
    }
    let byte_len = text.len();
    let rows: Vec<PnpRow> = serde_json::from_str(trimmed).with_context(|| {
        format!(
            "解析扫描结果失败（{} 字节）: {}",
            byte_len,
            path.display()
        )
    })?;
    Ok(rows)
}

/// 统一的子串匹配，消除散落各处的 contains 循环。
fn contains_any(text: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|keyword| text.contains(keyword))
}

/// 从设备实例路径解析 VID / PID / MI；解析不到时返回 0 / None，绝不猜测。
#[derive(Debug, Clone, Copy, Default)]
struct DeviceIds {
    vendor_id: u16,
    product_id: u16,
    interface: Option<u8>,
}

fn hex_value(text: &str, prefix: &str, width: usize) -> Option<u16> {
    let start = text.find(prefix)? + prefix.len();
    let end = start.checked_add(width)?;
    let slice = text.get(start..end)?;
    u16::from_str_radix(slice, 16).ok()
}

fn parse_ids(instance_id: &str) -> DeviceIds {
    if instance_id.trim().is_empty() {
        return DeviceIds::default();
    }
    DeviceIds {
        vendor_id: hex_value(instance_id, "VID_", 4).unwrap_or(0),
        product_id: hex_value(instance_id, "PID_", 4).unwrap_or(0),
        interface: hex_value(instance_id, "MI_", 2).map(|value| value as u8),
    }
}

/// 分组键：优先 VID:PID；无 VID/PID 时退回实例路径（此时实例路径必非空）。
fn group_key(row: &PnpRow) -> String {
    let ids = parse_ids(&row.instance_id);
    if ids.vendor_id != 0 || ids.product_id != 0 {
        format!("{:04x}:{:04x}", ids.vendor_id, ids.product_id)
    } else {
        row.instance_id.clone()
    }
}

/// 系统内置音频 / USB 主控与集线器不属于「外设」。
fn is_system_device(row: &PnpRow) -> bool {
    let text = format!("{} {}", row.name, row.bus_desc.as_deref().unwrap_or("")).to_lowercase();
    if matches!(row.class.as_str(), "AudioEndpoint" | "MEDIA")
        && contains_any(&text, SYSTEM_AUDIO_KEYWORDS)
    {
        return true;
    }
    row.class == "USB" && contains_any(&text, USB_HUB_KEYWORDS)
}

/// 过滤：丢弃没有任何实例标识的空行与系统内置设备。
fn filter_rows(rows: Vec<PnpRow>) -> Vec<PnpRow> {
    rows.into_iter()
        .filter(|row| !row.instance_id.trim().is_empty())
        .filter(|row| !is_system_device(row))
        .collect()
}

/// 分组：按 VID:PID 或实例路径聚合，同一物理设备的多条 PnP 记录归为一组。
fn group_rows(rows: Vec<PnpRow>) -> BTreeMap<String, Vec<PnpRow>> {
    let mut groups: BTreeMap<String, Vec<PnpRow>> = BTreeMap::new();
    for row in rows {
        groups.entry(group_key(&row)).or_default().push(row);
    }
    groups
}

/// 组内所有可读文本拼接为小写，供类别 / 名称推断复用。
fn combined_text(rows: &[PnpRow]) -> String {
    rows.iter()
        .map(|row| {
            format!(
                "{} {} {}",
                row.name,
                row.bus_desc.as_deref().unwrap_or(""),
                row.driver.as_deref().unwrap_or("")
            )
            .to_lowercase()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn has_class(rows: &[PnpRow], classes: &[&str]) -> bool {
    rows.iter().any(|row| classes.contains(&row.class.as_str()))
}

/// 判定设备类别：优先用 HID 用途信号区分组合接收器的键盘/鼠标，
/// 信号不足时才退回 PnP class 与名称关键词。
fn infer_category(rows: &[PnpRow], signals: Option<&HidSignals>) -> &'static str {
    if let Some(category) = signals.and_then(HidSignals::category) {
        return category;
    }
    let text = combined_text(rows);
    if has_class(rows, &["Keyboard"]) || contains_any(&text, &["keyboard", "键盘"]) {
        "keyboard"
    } else if has_class(rows, &["Mouse"]) || contains_any(&text, &["mouse", "鼠标"]) {
        "mouse"
    } else if has_class(rows, &["Monitor"]) || text.contains("display") {
        "monitor"
    } else if has_class(rows, &["Camera", "Image"]) || text.contains("webcam") {
        "webcam"
    } else if contains_any(&text, &["gamepad", "手柄"]) {
        "gamepad"
    } else if contains_any(&text, &["microphone", "麦克风"]) {
        "microphone"
    } else if contains_any(&text, &["speaker", "扬声器"]) {
        "speaker"
    } else if has_class(rows, &["AudioEndpoint", "MEDIA"]) {
        "headset"
    } else {
        "other"
    }
}

fn infer_name(rows: &[PnpRow]) -> String {
    for row in rows {
        for candidate in [
            row.bus_desc.as_deref(),
            Some(row.name.as_str()),
            row.driver.as_deref(),
        ] {
            if let Some(value) = candidate {
                let trimmed = value.trim();
                if !trimmed.is_empty()
                    && !contains_any(&trimmed.to_lowercase(), BLOCKED_NAME_KEYWORDS)
                {
                    return trimmed.to_string();
                }
            }
        }
    }
    rows.first()
        .map(|row| row.name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "未命名设备".to_string())
}

fn infer_manufacturer(rows: &[PnpRow]) -> String {
    for row in rows {
        let value = row.manufacturer.trim();
        if !value.is_empty()
            && !contains_any(&value.to_lowercase(), STANDARD_VENDOR_KEYWORDS)
        {
            return value.to_string();
        }
    }
    "未知厂商".to_string()
}

/// 连接方式：只依据蓝牙标记、名称关键词与类别，读不到即按 USB HID 归类。
fn infer_connection(rows: &[PnpRow], category: &str, name: &str) -> (&'static str, &'static str) {
    let is_bluetooth = rows.iter().any(|row| row.class == "Bluetooth")
        || rows
            .first()
            .map_or(false, |row| row.instance_id.contains("BTH"));
    if is_bluetooth {
        ("bluetooth", "Bluetooth")
    } else if contains_any(&name.to_lowercase(), WIRELESS_NAME_KEYWORDS) {
        ("wireless", "2.4 GHz 无线")
    } else if category == "monitor" {
        ("wired", "视频线缆")
    } else {
        ("usb", "USB HID")
    }
}

fn infer_status(rows: &[PnpRow]) -> &'static str {
    if !rows.is_empty() && rows.iter().all(|row| row.status == consts::PNP_STATUS_OK) {
        consts::STATUS_ONLINE
    } else {
        consts::STATUS_WARNING
    }
}

/// 优先用设备实例路径末段作为稳定标识；接入 hidapi 后应替换为真实序列号。
fn serial_hint(rows: &[PnpRow]) -> Option<String> {
    for row in rows {
        let tail = row.instance_id.rsplit('\\').next().unwrap_or("");
        if !tail.is_empty() && !tail.contains('&') && tail.chars().any(|c| c != '0') {
            return Some(tail.to_string());
        }
    }
    None
}

fn stable_id(rows: &[PnpRow], ids: DeviceIds, location: Option<&str>) -> String {
    let fingerprint = format!(
        "{:04x}|{:04x}|{}|{}|{}",
        ids.vendor_id,
        ids.product_id,
        serial_hint(rows).unwrap_or_default(),
        location.unwrap_or(""),
        rows.first().map(|row| row.instance_id.as_str()).unwrap_or(""),
    );
    let digest = Sha256::digest(fingerprint.as_bytes());
    digest[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// 端口按类别推断；只描述接口形态，不伪造速率或描述符字段。
fn build_ports(category: &str, connection_kind: &str) -> Vec<DevicePort> {
    let port = |id: &str, label: &str, kind: &str| DevicePort {
        id: id.to_string(),
        label: label.to_string(),
        kind: kind.to_string(),
        speed: None,
        status: "linked".to_string(),
        note: Some("按设备类别推断，未读取 USB 描述符".to_string()),
    };
    match category {
        "monitor" => vec![
            port("display", "视频输入", "display"),
            port("power", "电源", "power"),
        ],
        "headset" | "speaker" | "microphone" => vec![port("audio", "音频接口", "audio")],
        _ => {
            let kind = if connection_kind == "usb" {
                "usb-a"
            } else {
                "wireless"
            };
            vec![port(kind, "数据接口", kind)]
        }
    }
}

/// 将一个分组映射为设备快照；空组返回 None，由上层跳过。
///
/// `battery` 由配置驱动的厂商探针提供：命中时填入电量与来源信息，
/// 未命中或未校准时保持 `None`，不会用猜测值填充。
fn map_group(
    group: &[PnpRow],
    now: i64,
    battery: &crate::battery::BatteryIndex,
    usages: &HashMap<(u16, u16), HidSignals>,
) -> Option<DeviceSnapshot> {
    let primary = group.first()?;
    let ids = parse_ids(&primary.instance_id);
    let serial = serial_hint(group);
    // 序列号级校准优先于通用校准：同型号两台接收器可以各自校准。
    let reading = battery.get(ids.vendor_id, ids.product_id, serial.as_deref());
    let category = infer_category(group, usages.get(&(ids.vendor_id, ids.product_id)));
    let name = infer_name(group);
    let location = group.iter().find_map(|row| row.location.clone());
    let (kind, protocol) = infer_connection(group, category, &name);

    Some(DeviceSnapshot {
        id: stable_id(group, ids, location.as_deref()),
        name,
        manufacturer: infer_manufacturer(group),
        vendor_id: ids.vendor_id,
        product_id: ids.product_id,
        serial,
        category: category.to_string(),
        connection: DeviceConnection {
            kind: kind.to_string(),
            protocol: protocol.to_string(),
            // 只读、用户态：读不到的遥测一律留空，绝不用猜测值填充。
            speed: None,
            receiver: None,
            signal: None,
            signal_quality: None,
        },
        status: infer_status(group).to_string(),
        battery: reading.and_then(|item| item.battery),
        charging: reading.and_then(|item| item.charging).unwrap_or(false),
        battery_probe: reading.map(|item| item.probe.clone()),
        firmware: None,
        location: location.clone(),
        interface_number: ids.interface,
        capabilities: Vec::new(),
        ports: build_ports(category, kind),
        anchors: Vec::new(),
        telemetry: DeviceTelemetry::default(),
        accent: accent_for(category).to_string(),
        first_seen: now,
        last_seen: now,
        reconnect_count: 0,
        model_id: None,
        rgb: None,
    })
}

/// 编排：过滤 -> 分组 -> 映射（跳过空组）-> 排序。空输入直接返回空列表。
fn build_devices(rows: Vec<PnpRow>) -> Vec<DeviceSnapshot> {
    if rows.is_empty() {
        return Vec::new();
    }
    let now = now_ms();
    // 厂商电量探针走配置驱动的只读 HID 调用；结果按 (VID, PID) 索引后逐设备填充。
    let battery = crate::battery::probe_all();
    // HID 用途索引：组合接收器靠它区分主功能是键盘还是鼠标。
    let usages = usage_index();
    let mut devices: Vec<DeviceSnapshot> = group_rows(filter_rows(rows))
        .into_values()
        .filter(|group| !group.is_empty())
        .filter_map(|group| map_group(&group, now, &battery, &usages))
        .collect();

    devices.sort_by(|a, b| a.category.cmp(&b.category).then(a.name.cmp(&b.name)));
    devices
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(class: &str, name: &str) -> PnpRow {
        PnpRow {
            class: class.to_string(),
            name: name.to_string(),
            instance_id: String::new(),
            status: "OK".to_string(),
            manufacturer: String::new(),
            bus_desc: None,
            location: None,
            driver: None,
        }
    }

    /// 组合接收器：没有 HID 信号时沿用既有「键盘优先」规则，有信号则按主接口修正。
    #[test]
    fn combo_group_is_disambiguated_by_hid_signals() {
        let rows = vec![
            row("Mouse", "HID-compliant mouse"),
            row("Keyboard", "HID Keyboard Device"),
        ];
        assert_eq!(infer_category(&rows, None), "keyboard");

        let mouse_primary = HidSignals {
            keyboard: 1,
            mouse: 1,
            primary_usage: Some(0x0002),
            primary_interface: Some(0),
        };
        assert_eq!(infer_category(&rows, Some(&mouse_primary)), "mouse");
    }

    #[test]
    fn plain_devices_keep_text_fallback() {
        assert_eq!(infer_category(&[row("Monitor", "Mi Monitor")], None), "monitor");
        assert_eq!(infer_category(&[row("USB", "AURA LED Controller")], None), "other");
    }
}

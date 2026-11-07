use crate::device::{consts, now_ms, DeviceSnapshot, Diagnosis};

/// 只基于已读到的真实数据下结论，不推测供电、速率或掉线原因。
/// 空设备列表时仍保留系统级「遥测不可用」提示。
pub fn build(devices: &[DeviceSnapshot]) -> Vec<Diagnosis> {
    let now = now_ms();
    let mut result = Vec::new();

    // 无 id 的设备无法生成稳定诊断 id，直接跳过。
    for device in devices.iter().filter(|device| !device.id.is_empty()) {
        if device.status.as_str() == consts::STATUS_WARNING {
            result.push(Diagnosis {
                id: format!("diag-status-{}", device.id),
                severity: consts::STATUS_WARNING.to_string(),
                scope: "device".to_string(),
                device_id: Some(device.id.clone()),
                title: "设备状态异常".to_string(),
                detail: format!("系统报告的 {} 状态不是 OK。", device.name),
                suggestion: "在 Windows 设备管理器中检查驱动与硬件状态。".to_string(),
                created_at: now,
            });
        }
        if device.serial.is_none() {
            result.push(Diagnosis {
                id: format!("diag-serial-{}", device.id),
                severity: consts::SEVERITY_INFO.to_string(),
                scope: "device".to_string(),
                device_id: Some(device.id.clone()),
                title: "无法唯一识别".to_string(),
                detail: "该设备未提供序列号，稳定 ID 退化为 VID/PID + 位置信息。".to_string(),
                suggestion: "更换 USB 端口后，该设备可能被视为新设备。".to_string(),
                created_at: now,
            });
        }
    }

    result.push(Diagnosis {
        id: "diag-telemetry".to_string(),
        severity: consts::SEVERITY_INFO.to_string(),
        scope: "system".to_string(),
        device_id: None,
        title: "遥测数据不可用".to_string(),
        detail: "电量、DPI、回报率需要厂商私有协议支持，当前版本未读取这些值。".to_string(),
        suggestion: "接入 hidapi / HID++ / OpenRGB 适配器后，相应指标会自动显示。".to_string(),
        created_at: now,
    });

    result
}

//! HID 用途摘要：区分组合接收器的「主功能」是键盘还是鼠标。
//!
//! 组合式 2.4G 接收器会同时枚举出键盘集合和鼠标集合（游戏鼠标的宏键集合、
//! 键盘的鼠标模拟集合都很常见），只按 PnP class「有 Keyboard 就是键盘」判定
//! 会把鼠标误判成键盘。规则与 `scripts/device_category.py` 保持一致：
//!
//! 1. generic-desktop 集合数量：键盘集合多即键盘，鼠标集合多即鼠标；
//! 2. 数量相同：以接口号最小的主接口（USB 复合设备的主功能）用途为准；
//! 3. 没有可用信号（hidapi 不可用）：返回 `None`，由调用方退回名称启发式。

use std::collections::HashMap;

use hidapi::HidApi;

/// HID Usage Page: Generic Desktop。
const USAGE_PAGE_GENERIC_DESKTOP: u16 = 0x0001;
/// Generic Desktop / Mouse。
const USAGE_MOUSE: u16 = 0x0002;
/// Generic Desktop / Keyboard。
const USAGE_KEYBOARD: u16 = 0x0006;

/// 单个 (VID, PID) 下的 HID 用途统计。
#[derive(Debug, Clone, Copy, Default)]
pub struct HidSignals {
    pub keyboard: usize,
    pub mouse: usize,
    /// 接口号最小的那个 general-desktop 集合的用途。
    pub primary_usage: Option<u16>,
    /// 主接口对应的接口号，仅用于挑选 `primary_usage`。
    pub primary_interface: Option<i32>,
}

impl HidSignals {
    /// 信号足以判定时返回类别；不足则返回 `None`，交回文本启发式。
    pub fn category(&self) -> Option<&'static str> {
        if self.keyboard > self.mouse {
            return Some("keyboard");
        }
        if self.mouse > self.keyboard {
            return Some("mouse");
        }
        if self.keyboard > 0 {
            // 数量相同：主接口用途代表产品主功能。
            return Some(if self.primary_usage == Some(USAGE_MOUSE) {
                "mouse"
            } else {
                "keyboard"
            });
        }
        None
    }

    /// 记录一个 general-desktop 集合；接口号更小时更新主接口。
    fn record(&mut self, usage: u16, interface: i32) {
        match usage {
            USAGE_KEYBOARD => self.keyboard += 1,
            USAGE_MOUSE => self.mouse += 1,
            _ => return,
        }
        if interface >= 0 && self.primary_interface.is_none_or(|current| interface < current) {
            self.primary_interface = Some(interface);
            self.primary_usage = Some(usage);
        }
    }
}

/// 枚举 HID 接口并按 (VID, PID) 汇总用途信号。
///
/// 只读枚举，不打开任何设备；失败时返回空索引，设备类别退回名称启发式。
pub fn usage_index() -> HashMap<(u16, u16), HidSignals> {
    let mut index: HashMap<(u16, u16), HidSignals> = HashMap::new();
    let api = match HidApi::new() {
        Ok(api) => api,
        Err(error) => {
            tracing::debug!(%error, "hidapi 初始化失败，设备类别退回名称启发式");
            return index;
        }
    };
    for info in api.device_list() {
        if info.usage_page() != USAGE_PAGE_GENERIC_DESKTOP {
            continue;
        }
        index
            .entry((info.vendor_id(), info.product_id()))
            .or_default()
            .record(info.usage(), info.interface_number());
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signals(keyboard: usize, mouse: usize, primary: Option<(u16, i32)>) -> HidSignals {
        HidSignals {
            keyboard,
            mouse,
            primary_usage: primary.map(|item| item.0),
            primary_interface: primary.map(|item| item.1),
        }
    }

    #[test]
    fn combo_receiver_with_primary_mouse_is_mouse() {
        // Rapoo 24AE:185A 实测：iface0 鼠标，iface1 键盘（宏键），各 1 个集合。
        let item = signals(1, 1, Some((USAGE_MOUSE, 0)));
        assert_eq!(item.category(), Some("mouse"));
    }

    #[test]
    fn more_keyboard_collections_win() {
        // Dareu 260D:1092 实测：两个键盘集合 + 一个鼠标集合。
        let item = signals(2, 1, Some((USAGE_MOUSE, 0)));
        assert_eq!(item.category(), Some("keyboard"));
    }

    #[test]
    fn tie_with_primary_keyboard_stays_keyboard() {
        let item = signals(1, 1, Some((USAGE_KEYBOARD, 0)));
        assert_eq!(item.category(), Some("keyboard"));
    }

    #[test]
    fn no_signal_falls_back() {
        assert_eq!(signals(0, 0, None).category(), None);
    }

    #[test]
    fn record_keeps_lowest_interface_as_primary() {
        let mut item = HidSignals::default();
        item.record(USAGE_KEYBOARD, 2);
        item.record(USAGE_MOUSE, 0);
        item.record(USAGE_KEYBOARD, 1);
        assert_eq!(item.keyboard, 2);
        assert_eq!(item.mouse, 1);
        assert_eq!(item.primary_usage, Some(USAGE_MOUSE));
    }
}

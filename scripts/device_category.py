"""把 PnP 分组与 HID 用途映射为设备类别。

为什么需要单独判定：组合式 2.4G 接收器会同时枚举出键盘集合和鼠标集合
（游戏鼠标的宏键/多媒体键集合、键盘的鼠标模拟集合都很常见），
只按「有 Keyboard 就是键盘」判定会把鼠标误判成键盘。

判据优先级：
1. HID generic-desktop 集合数量：键盘集合多即键盘，鼠标集合多即鼠标；
2. 数量相同：以 USB 主接口（接口号最小）的用途为准；
3. 没有 HID 信号（hidapi 不可用）：退回 PnP class / 名称关键词。

与 `src-tauri/src/device/hid.rs` 保持同一套规则。
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

USAGE_PAGE_GENERIC_DESKTOP = 0x0001
USAGE_MOUSE = 0x0002
USAGE_KEYBOARD = 0x0006


def hid_signals(hid_items: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """统计 generic-desktop 集合数量，并记录主接口（接口号最小）的用途。"""
    keyboard = 0
    mouse = 0
    primary: tuple[int, int] | None = None

    for item in hid_items:
        if item.get("usage_page") != USAGE_PAGE_GENERIC_DESKTOP:
            continue
        usage = item.get("usage")
        if usage == USAGE_KEYBOARD:
            keyboard += 1
        elif usage == USAGE_MOUSE:
            mouse += 1
        else:
            continue

        interface = item.get("interface_number")
        if isinstance(interface, int) and interface >= 0 and (primary is None or interface < primary[0]):
            primary = (interface, usage)

    return {
        "keyboard": keyboard,
        "mouse": mouse,
        "primaryUsage": primary[1] if primary else None,
    }


def classify(
    classes: set[str],
    names: list[str],
    signals: Mapping[str, Any] | None = None,
) -> str:
    """返回设备类别；`signals` 来自 `hid_signals`，缺失时退回关键词判定。"""
    signals = signals or {}
    keyboard = int(signals.get("keyboard") or 0)
    mouse = int(signals.get("mouse") or 0)

    if keyboard > mouse:
        return "keyboard"
    if mouse > keyboard:
        return "mouse"
    if keyboard and mouse:
        # 组合接收器：主接口用途代表产品主功能。
        return "mouse" if signals.get("primaryUsage") == USAGE_MOUSE else "keyboard"

    return _classify_by_text(classes, names)


def _classify_by_text(classes: set[str], names: list[str]) -> str:
    joined = " ".join(names).lower()
    if "Keyboard" in classes or "keyboard" in joined or "键盘" in joined:
        return "keyboard"
    if "Mouse" in classes or "mouse" in joined or "鼠标" in joined:
        return "mouse"
    if "Monitor" in classes or "display" in joined or "显示器" in joined:
        return "monitor"
    if classes & {"Camera", "Image"} or "webcam" in joined or "摄像头" in joined:
        return "webcam"
    if "gamepad" in joined or "手柄" in joined:
        return "gamepad"
    if "microphone" in joined or "麦克风" in joined:
        return "microphone"
    if "speaker" in joined or "扬声器" in joined:
        return "speaker"
    if classes & {"AudioEndpoint", "MEDIA"} or "headset" in joined or "耳机" in joined:
        return "headset"
    return "other"

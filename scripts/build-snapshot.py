#!/usr/bin/env python3
"""把本机真实外设扫描结果转换成前端可直接消费的快照。

数据来源：
  1. scripts/scan-devices.ps1 -> Get-PnpDevice / Get-PnpDeviceProperty（VID/PID、父设备、位置）
  2. hidapi（可选）-> 厂商名、产品名、序列号、usage page / usage
  3. scripts/battery_probe.py（可选）-> 按 config/battery-probes.json 读取厂商电量

原则：只读、不猜测。只有探针校准完成（decode.status=calibrated）才写入电量；
其余指标与未校准设备一律留空，由前端显示「不可用」，绝不用模拟值填充。

用法：
  python scripts/build-snapshot.py
  python scripts/build-snapshot.py --no-battery   # 跳过 HID 电量探测（更快）
输出：public/real-devices.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

from device_category import classify, hid_signals

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent
RAW_PATH = WORKSPACE / "temp" / "pnp-raw.json"
OUT_PATH = ROOT / "public" / "real-devices.json"
OPTIONAL_HID_PATH = WORKSPACE / "temp" / "pylib"

ACCENTS = {
    "keyboard": "#67e8f9",
    "mouse": "#a3e635",
    "headset": "#c4b5fd",
    "monitor": "#fbbf24",
    "webcam": "#f472b6",
    "gamepad": "#fb7185",
    "microphone": "#38bdf8",
    "speaker": "#34d399",
    "other": "#94a3b8",
}

CLASS_RANK = {
    "Keyboard": 100,
    "Mouse": 95,
    "Monitor": 90,
    "Camera": 85,
    "Image": 84,
    "AudioEndpoint": 80,
    "MEDIA": 78,
    "Bluetooth": 70,
    "HIDClass": 60,
    "USB": 40,
}


def run_scan() -> list[dict]:
    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ROOT / "scripts" / "scan-devices.ps1"),
            "-Output",
            str(RAW_PATH),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0 or not RAW_PATH.exists():
        raise RuntimeError(f"扫描脚本执行失败: {proc.stderr.strip() or proc.stdout.strip()}")
    payload = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    return payload if isinstance(payload, list) else [payload]


def read_hid() -> list[dict]:
    if OPTIONAL_HID_PATH.exists():
        sys.path.insert(0, str(OPTIONAL_HID_PATH))
    try:
        import hid  # type: ignore
    except ImportError:
        return []
    try:
        return list(hid.enumerate())
    except Exception:
        return []


def parse_ids(instance_id: str) -> tuple[int, int, int | None]:
    vid = re.search(r"VID_([0-9A-Fa-f]{4})", instance_id)
    pid = re.search(r"PID_([0-9A-Fa-f]{4})", instance_id)
    mi = re.search(r"MI_([0-9A-Fa-f]{2})", instance_id)
    return (
        int(vid.group(1), 16) if vid else 0,
        int(pid.group(1), 16) if pid else 0,
        int(mi.group(1), 16) if mi else None,
    )


SYSTEM_AUDIO = re.compile(
    r"AMD|Realtek|High Definition Audio|NVIDIA|Digital Output|Streaming Audio|总线|Audio Device on",
    re.IGNORECASE,
)


def is_peripheral_row(row: dict) -> bool:
    """过滤声卡虚拟端点，只保留真实可被看见/插拔的外设。"""
    name = f"{row.get('name') or ''} {row.get('busDesc') or ''}"
    if row.get("class") in {"AudioEndpoint", "MEDIA"} and SYSTEM_AUDIO.search(name):
        return False
    if row.get("class") == "USB" and re.search(
        r"根集线器|Root Hub|Generic USB Hub|USB\d|Hub|控制器", name, re.IGNORECASE
    ):
        return False
    return True


def group_key(row: dict) -> str:
    vid, pid, _ = parse_ids(row.get("instanceId", ""))
    if vid or pid:
        return f"{vid:04x}:{pid:04x}"
    return row.get("instanceId", "unknown")


def pick_name(names: list[str], fallback: str) -> str:
    blocked = ("标准", "generic", "unknown", "usb input device", "hid-compliant")
    for name in names:
        clean = (name or "").strip()
        if clean and not any(word in clean.lower() for word in blocked):
            return clean
    return (fallback or "未命名设备").strip()


def pick_vendor(values: list[str]) -> str:
    blocked = ("标准", "generic", "(standard", "unknown")
    for value in values:
        clean = (value or "").strip()
        if clean and not any(word in clean.lower() for word in blocked):
            return clean
    return "未知厂商"


def make_ports(category: str, connection_kind: str) -> list[dict]:
    if category == "monitor":
        return [
            {"id": "display", "label": "视频输入", "kind": "display", "status": "linked", "note": "按设备类别推断"},
            {"id": "power", "label": "电源", "kind": "power", "status": "linked", "note": "按设备类别推断"},
        ]
    if category in {"headset", "speaker", "microphone"}:
        return [{"id": "audio", "label": "音频接口", "kind": "audio", "status": "linked", "note": "按设备类别推断"}]
    kind = "wireless" if connection_kind in {"wireless", "bluetooth"} else "usb-a"
    return [{"id": kind, "label": "数据接口", "kind": kind, "status": "linked", "note": "按设备类别推断"}]


def build_devices(
    rows: list[dict],
    hid_rows: list[dict],
    battery_index: dict[tuple[str, str], dict] | None = None,
) -> list[dict]:
    battery_index = battery_index or {}
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        if is_peripheral_row(row):
            groups[group_key(row)].append(row)

    hid_by_key: dict[str, list[dict]] = defaultdict(list)
    for item in hid_rows:
        key = f"{item.get('vendor_id', 0):04x}:{item.get('product_id', 0):04x}"
        hid_by_key[key].append(item)

    now_ms = int(__import__("time").time() * 1000)
    devices: list[dict] = []

    for key, items in groups.items():
        vid, pid, interface = parse_ids(items[0].get("instanceId", ""))
        # 厂商探针按 (VID, PID) 命中；未命中时保持 None，交前端显示「不可用」。
        probe = battery_index.get((f"{vid:04X}", f"{pid:04X}"))
        hid_items = hid_by_key.get(key, [])
        classes = {row.get("class", "") for row in items}
        names = [row.get("busDesc") or "" for row in items]
        names += [row.get("name") or "" for row in items]
        names += [str(item.get("product_string") or "") for item in hid_items]

        # 组合接收器会同时有键盘/鼠标集合，按 HID 集合数量与主接口用途区分。
        category = classify(classes, names, hid_signals(hid_items))
        name = pick_name(names, items[0].get("name", ""))
        vendor = pick_vendor(
            [str(item.get("manufacturer_string") or "") for item in hid_items]
            + [row.get("manufacturer") or "" for row in items]
        )
        # hidapi 常把「无序列号」报成全 0 占位串，不能当成真实序列号展示。
        serial = next(
            (
                value
                for item in hid_items
                if (value := str(item.get("serial_number") or ""))
                and value.strip("0")
            ),
            None,
        )
        location = next((row.get("location") or "" for row in items if row.get("location")), None)
        parent = next((row.get("parent") or "" for row in items if row.get("parent")), None)
        usage_page = hid_items[0].get("usage_page") if hid_items else None
        usage = hid_items[0].get("usage") if hid_items else None

        joined = name.lower()
        if any(row.get("class") == "Bluetooth" for row in items) or "bth" in key.lower():
            connection_kind, protocol = "bluetooth", "Bluetooth"
        elif "receiver" in joined or "2.4g" in joined or "wireless" in joined:
            connection_kind, protocol = "wireless", "2.4 GHz 无线"
        elif category == "monitor":
            connection_kind, protocol = "wired", "视频线缆"
        else:
            connection_kind, protocol = "usb", "USB HID"

        status = "online" if all(row.get("status") == "OK" for row in items) else "warning"
        fingerprint = f"{vid:04x}|{pid:04x}|{serial or ''}|{location or ''}|{key}"
        device_id = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:16]

        devices.append(
            {
                "id": device_id,
                "modelId": None,
                "name": name,
                "manufacturer": vendor,
                "vendorId": vid,
                "productId": pid,
                "serial": serial,
                "category": category,
                "connection": {"kind": connection_kind, "protocol": protocol},
                "status": status,
                "battery": (probe or {}).get("battery"),
                "charging": bool((probe or {}).get("charging")),
                "batteryProbe": (probe or {}).get("probe"),
                "firmware": None,
                "location": location,
                "interfaceNumber": interface,
                "usagePage": usage_page,
                "usage": usage,
                "capabilities": [],
                "ports": make_ports(category, connection_kind),
                "anchors": [],
                "telemetry": {
                    "pollingRate": None,
                    "dpi": None,
                    "signal": None,
                    "temperature": None,
                    "latency": None,
                },
                "rgb": None,
                "accent": ACCENTS.get(category, ACCENTS["other"]),
                "firstSeen": now_ms,
                "lastSeen": now_ms,
                "reconnectCount": 0,
                "_parent": parent,
                "_classRank": max((CLASS_RANK.get(c, 0) for c in classes), default=0),
            }
        )

    devices.sort(key=lambda d: (-d["_classRank"], d["category"], d["name"]))
    return devices


def build_topology(devices: list[dict], scanned_at: int) -> dict:
    nodes: list[dict] = [
        {
            "id": "host",
            "type": "host",
            "label": "本机",
            "subtitle": "Windows",
            "status": "ok",
            "meta": {"source": "Get-PnpDevice"},
        }
    ]
    edges: list[dict] = []
    hubs: dict[str, str] = {}

    for device in devices:
        location = device.get("location") or ""
        match = re.search(r"Hub_#\d+", location)
        hub_label = match.group(0) if match else None
        parent_id = "host"
        if hub_label:
            if hub_label not in hubs:
                hub_id = f"hub-{len(hubs) + 1}"
                hubs[hub_label] = hub_id
                nodes.append(
                    {
                        "id": hub_id,
                        "type": "hub",
                        "label": hub_label,
                        "subtitle": "USB Hub",
                        "status": "ok",
                        "parentId": "host",
                        "meta": {"location": location},
                    }
                )
                edges.append({"id": f"e-host-{hub_id}", "source": "host", "target": hub_id, "status": "ok"})
            parent_id = hubs[hub_label]

        node_id = f"dev-{device['id']}"
        nodes.append(
            {
                "id": node_id,
                "type": "device",
                "label": device["name"],
                "subtitle": device["manufacturer"],
                "status": "warning" if device["status"] == "warning" else "ok",
                "deviceId": device["id"],
                "parentId": parent_id,
                "meta": {
                    "vid": f"{device['vendorId']:04X}",
                    "pid": f"{device['productId']:04X}",
                    "location": location or "未知",
                },
            }
        )
        edges.append(
            {
                "id": f"e-{parent_id}-{node_id}",
                "source": parent_id,
                "target": node_id,
                "status": "ok",
                "label": device["connection"]["protocol"],
            }
        )

    return {"nodes": nodes, "edges": edges, "scannedAt": scanned_at}


def build_diagnostics(devices: list[dict], scanned_at: int) -> list[dict]:
    result: list[dict] = []
    for device in devices:
        if device["status"] == "warning":
            result.append(
                {
                    "id": f"diag-status-{device['id']}",
                    "severity": "warning",
                    "scope": "device",
                    "deviceId": device["id"],
                    "title": "设备状态异常",
                    "detail": f"系统报告的 {device['name']} 状态不是 OK。",
                    "suggestion": "在 Windows 设备管理器中检查驱动与硬件状态。",
                    "createdAt": scanned_at,
                }
            )
        if not device.get("serial"):
            result.append(
                {
                    "id": f"diag-serial-{device['id']}",
                    "severity": "info",
                    "scope": "device",
                    "deviceId": device["id"],
                    "title": "无法唯一识别",
                    "detail": "该设备未提供序列号，稳定 ID 退化为 VID/PID + 位置信息。",
                    "suggestion": "更换 USB 端口后，该设备可能被视为新设备。",
                    "createdAt": scanned_at,
                }
            )

    probed = [device for device in devices if device.get("batteryProbe")]
    pending = [
        device for device in probed
        if device["batteryProbe"].get("status") == "uncalibrated"
    ]
    calibrated = [
        device for device in probed
        if device["batteryProbe"].get("status") == "calibrated"
    ]

    if pending:
        vendors = "、".join(sorted({device["batteryProbe"]["vendor"] for device in pending}))
        result.append(
            {
                "id": "diag-battery-uncalibrated",
                "severity": "info",
                "scope": "system",
                "title": "电量通道已识别，待校准",
                "detail": f"{len(pending)} 台设备（{vendors}）的厂商私有电量通道已识别，但协议尚未校准，因此暂不显示电量。",
                "suggestion": "运行 python scripts/battery_probe.py --capture --reference <厂商驱动显示的电量> 采样，"
                              "换电量后再采一次并用 --suggest 生成解码建议。",
                "createdAt": scanned_at,
            }
        )

    if not calibrated:
        result.append(
            {
                "id": "diag-telemetry",
                "severity": "info",
                "scope": "system",
                "title": "遥测数据不可用",
                "detail": "电量、DPI、回报率等需要厂商私有协议支持；当前扫描未读取或尚未校准这些值。",
                "suggestion": "接入 HID++ / OpenRGB 等协议适配器并完成校准后，相应指标会自动显示。",
                "createdAt": scanned_at,
            }
        )
    return result


def probe_batteries() -> dict[tuple[str, str], dict]:
    """调用配置驱动的厂商电量探针；任何异常都降级为空索引，绝不阻断主扫描。"""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import battery_probe  # noqa: PLC0415

        report = battery_probe.probe_all()
        index = battery_probe.battery_by_device(report)
        ready = sum(1 for item in report["results"] if item["battery"] is not None)
        print(
            f"battery probes: {len(report['results'])} configured, {ready} calibrated, "
            f"hidapi={'yes' if report['hidapiAvailable'] else 'no'}"
        )
        for item in report["results"]:
            print(f"  {item['vendor']:<6} {item['status']:<12} battery={item['battery']}")
        return index
    except Exception as exc:  # noqa: BLE001
        print(f"battery probes skipped: {exc}")
        return {}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成本机外设快照（只读）")
    parser.add_argument(
        "--no-battery",
        action="store_true",
        help="跳过厂商电量探测，只做 PnP + hidapi 基础扫描",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = run_scan()
    hid_rows = read_hid()
    battery_index = {} if args.no_battery else probe_batteries()
    now_ms = int(__import__("time").time() * 1000)
    devices = build_devices(rows, hid_rows, battery_index)
    for device in devices:
        device.pop("_parent", None)
        device.pop("_classRank", None)

    snapshot = {
        "scannedAt": now_ms,
        "source": "Get-PnpDevice + hidapi" if hid_rows else "Get-PnpDevice",
        "deviceCount": len(devices),
        "devices": devices,
        "topology": build_topology(devices, now_ms),
        "diagnostics": build_diagnostics(devices, now_ms),
        "events": [
            {
                "id": f"evt-scan-{now_ms}",
                "ts": now_ms,
                "kind": "info",
                "message": f"本机扫描完成，发现 {len(devices)} 个外设（{len(rows)} 个 PnP 节点）",
            }
        ],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT_PATH} with {len(devices)} devices from {len(rows)} PnP nodes")
    for device in devices[:12]:
        print(f"  {device['category']:<10} {device['name'][:38]:<38} {device['vendorId']:04X}:{device['productId']:04X}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

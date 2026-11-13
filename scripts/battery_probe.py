#!/usr/bin/env python3
"""厂商电量探针引擎（配置驱动、只读优先）。

设计约定：
  1. config/battery-probes.json 是唯一的用户维护入口，新增厂商无需改本文件。
  2. 默认绝不向设备写入任何字节；只有「配置允许 + 命令行 --allow-write + 查询已校准」
     三者同时满足才会发送 Output report。
  3. status != calibrated 或 percentOffset 为空时，一律返回 battery=null，
     绝不用猜测值、启发式或固定值填充。
  4. 每个 HID 读取放在独立子进程中并设硬超时，避免 hidapi 同步调用挂死扫描流程。

命令：
  python scripts/battery_probe.py --validate
  python scripts/battery_probe.py --list
  python scripts/battery_probe.py --probe [--json] [--verbose]
  python scripts/battery_probe.py --capture --reference 87 [--label "驱动显示 87%"]
  python scripts/battery_probe.py --suggest
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "battery-probes.json"
CAPTURE_DIR = ROOT.parent / "temp" / "battery-captures"
WORKER_FLAG = "--_read-worker"

# 用户校准覆盖层（L1）：与桌面端 src-tauri/src/battery/calibration.rs 使用同一路径、
# 同一份 schema、同一套「只覆盖 decode」的合并规则。
OVERLAY_SCHEMA_VERSION = 1

# 未校准时的默认说明；配置里的 decode.unavailableReason 可覆盖它。
UNCALIBRATED_REASON = "厂商协议尚未校准：未确认电量子节，按约定不显示猜测值"

try:
    import hid  # type: ignore
except ImportError:
    hid = None  # 允许在没有 hidapi 的环境里优雅降级


class ConfigError(Exception):
    """配置不合法，阻止任何设备访问。"""


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError(f"无法读取配置 {path}: {exc}") from exc
    errors = validate_config(cfg)
    if errors:
        raise ConfigError("配置校验失败:\n  - " + "\n  - ".join(errors))
    return cfg


def _hex(value: Any, field: str, errors: list[str], size: int | None = None) -> str | None:
    if not isinstance(value, str) or not value or not all(c in "0123456789abcdefABCDEF" for c in value):
        errors.append(f"{field} 必须是十六进制字符串，实际为 {value!r}")
        return None
    if size is not None and len(value) != size * 2:
        errors.append(f"{field} 长度应为 {size} 字节，实际 {len(value) // 2} 字节")
        return None
    return value.upper()


def validate_config(cfg: Any) -> list[str]:
    """返回全部问题（不提前返回），方便用户一次修完。"""
    errors: list[str] = []
    if not isinstance(cfg, dict):
        return ["根节点必须是对象"]
    if cfg.get("schemaVersion") != 1:
        errors.append("schemaVersion 必须为 1")
    defaults = cfg.get("defaults")
    if not isinstance(defaults, dict):
        errors.append("defaults 必须是对象")
    elif not isinstance(defaults.get("readTimeoutMs"), int) or defaults["readTimeoutMs"] <= 0:
        errors.append("defaults.readTimeoutMs 必须是正整数")
    probes = cfg.get("probes")
    if not isinstance(probes, list) or not probes:
        errors.append("probes 必须是非空数组")
        return errors

    seen: set[str] = set()
    for i, probe in enumerate(probes):
        tag = f"probes[{i}]"
        if not isinstance(probe, dict):
            errors.append(f"{tag} 必须是对象")
            continue
        pid = probe.get("id")
        if not isinstance(pid, str) or not pid.strip():
            errors.append(f"{tag}.id 必须是非空字符串")
        elif pid in seen:
            errors.append(f"{tag}.id 重复: {pid}")
        else:
            seen.add(pid)
        if not isinstance(probe.get("vendor"), str) or not probe["vendor"]:
            errors.append(f"{tag}.vendor 必须是非空字符串")
        if not isinstance(probe.get("enabled"), bool):
            errors.append(f"{tag}.enabled 必须是布尔值")

        match = probe.get("match")
        if not isinstance(match, dict):
            errors.append(f"{tag}.match 必须是对象")
        else:
            _hex(match.get("vendorId"), f"{tag}.match.vendorId", errors, size=2)
            _hex(match.get("usagePage"), f"{tag}.match.usagePage", errors, size=2)
            pids = match.get("productIds")
            if not isinstance(pids, list) or not pids:
                errors.append(f"{tag}.match.productIds 必须是非空数组")
            else:
                for j, item in enumerate(pids):
                    if item != "*":
                        _hex(item, f"{tag}.match.productIds[{j}]", errors, size=2)
            if not isinstance(match.get("usages"), list):
                errors.append(f"{tag}.match.usages 必须是数组")

        transport = probe.get("transport")
        if not isinstance(transport, dict):
            errors.append(f"{tag}.transport 必须是对象")
        else:
            kind = transport.get("kind")
            if kind not in ("input-report", "output-query"):
                errors.append(f"{tag}.transport.kind 只能是 input-report 或 output-query")
            ids = transport.get("reportIds")
            lengths = transport.get("reportLengths")
            if not isinstance(ids, list) or not ids or not all(isinstance(x, int) and 0 <= x <= 255 for x in ids):
                errors.append(f"{tag}.transport.reportIds 必须是 0..255 的整数数组")
            if not isinstance(lengths, dict) or not lengths:
                errors.append(f"{tag}.transport.reportLengths 必须是非空对象")
            else:
                for key, value in lengths.items():
                    if not str(key).isdigit() or not isinstance(value, int) or not 1 <= value <= 1024:
                        errors.append(f"{tag}.transport.reportLengths[{key}] 长度必须为 1..1024")
                if isinstance(ids, list):
                    for rid in ids:
                        if str(rid) not in lengths:
                            errors.append(f"{tag}.transport.reportLengths 缺少 Report ID {rid} 的长度")
            hints = transport.get("reportPathHints") or {}
            if hints:
                if not isinstance(hints, dict):
                    errors.append(f"{tag}.transport.reportPathHints 必须是对象")
                elif isinstance(ids, list):
                    for key, value in hints.items():
                        if str(key) not in {str(x) for x in ids}:
                            errors.append(f"{tag}.transport.reportPathHints[{key}] 不在 reportIds 中")
                        if not isinstance(value, str) or not value:
                            errors.append(f"{tag}.transport.reportPathHints[{key}] 必须是非空字符串")
            if kind == "output-query":
                query = transport.get("query")
                if not isinstance(query, dict) or query.get("status") not in ("calibrated", "uncalibrated"):
                    errors.append(f"{tag}.transport.query 需要 status=calibrated|uncalibrated")
                elif query.get("status") == "calibrated":
                    if not isinstance(query.get("reportId"), int):
                        errors.append(f"{tag}.transport.query.reportId 校准后必须是整数")
                    _hex(query.get("bytesHex"), f"{tag}.transport.query.bytesHex", errors)

        decode = probe.get("decode")
        if not isinstance(decode, dict):
            errors.append(f"{tag}.decode 必须是对象")
        else:
            status = decode.get("status")
            if status not in ("calibrated", "uncalibrated", "disabled"):
                errors.append(f"{tag}.decode.status 只能是 calibrated|uncalibrated|disabled")
            if not isinstance(decode.get("percentReportId"), int):
                errors.append(f"{tag}.decode.percentReportId 必须是整数")
            offset = decode.get("percentOffset")
            if offset is not None and (not isinstance(offset, int) or offset < 0 or offset > 1023):
                errors.append(f"{tag}.decode.percentOffset 必须是 0..1023 的整数或 null")
            if not isinstance(decode.get("percentScale"), (int, float)) or decode["percentScale"] <= 0:
                errors.append(f"{tag}.decode.percentScale 必须是正数")
            rng = decode.get("percentRange")
            if not isinstance(rng, list) or len(rng) != 2 or rng[0] >= rng[1]:
                errors.append(f"{tag}.decode.percentRange 必须是 [min, max]")
            if status == "calibrated" and offset is None:
                errors.append(f"{tag}.decode.status=calibrated 时必须填写 percentOffset")
            # 无论是否校准，解码目标都必须是 transport 声明过的 Report ID，便于提前发现配置错误。
            if isinstance(transport, dict) and isinstance(transport.get("reportIds"), list):
                if decode.get("percentReportId") not in transport["reportIds"]:
                    errors.append(f"{tag}.decode.percentReportId 不在 transport.reportIds 中")
            charging = decode.get("charging")
            if charging is not None:
                if not isinstance(charging, dict) or not isinstance(charging.get("offset"), int):
                    errors.append(f"{tag}.decode.charging 需要 offset 整数")
    return errors


def overlay_path() -> Path:
    """用户校准覆盖层位置，与 Rust 端 calibration::default_path() 保持一致。"""
    appdata = os.environ.get("APPDATA")
    if appdata and appdata.strip():
        return Path(appdata) / "peripheral-viewer" / "battery-calibration.json"
    import tempfile

    return Path(tempfile.gettempdir()) / "peripheral-viewer" / "battery-calibration.json"


def validate_overlay(overlay: Any, cfg: dict[str, Any]) -> list[str]:
    """校验覆盖层。任何一条不合格都算整份无效（与桌面端策略一致）。"""
    errors: list[str] = []
    if not isinstance(overlay, dict):
        return ["覆盖层根节点必须是对象"]
    if overlay.get("schemaVersion") != OVERLAY_SCHEMA_VERSION:
        errors.append(f"schemaVersion 必须为 {OVERLAY_SCHEMA_VERSION}")
    entries = overlay.get("entries")
    if not isinstance(entries, list):
        return errors + ["entries 必须是数组"]

    probes = {probe["id"]: probe for probe in cfg.get("probes", [])}
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        tag = f"entries[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{tag} 必须是对象")
            continue
        probe_id = entry.get("probeId")
        if probe_id not in probes:
            errors.append(f"{tag}: 未知探针 {probe_id!r}")
            continue
        if probe_id in seen:
            errors.append(f"{tag}: 探针 {probe_id} 出现多条校准记录")
        seen.add(probe_id)

        probe = probes[probe_id]
        transport = probe["transport"]
        decode = entry.get("decode")
        if not isinstance(decode, dict):
            errors.append(f"{tag}.decode 必须是对象")
            continue
        status = decode.get("status")
        if status not in ("calibrated", "uncalibrated", "disabled"):
            errors.append(f"{tag}.decode.status 只能是 calibrated|uncalibrated|disabled")
        report_id = decode.get("percentReportId")
        if report_id not in transport["reportIds"]:
            errors.append(f"{tag}: percentReportId={report_id} 不在 transport.reportIds 中")
        offset = decode.get("percentOffset")
        if offset is not None:
            if not isinstance(offset, int) or not 0 <= offset <= 1023:
                errors.append(f"{tag}.decode.percentOffset 必须是 0..1023 的整数或 null")
            else:
                declared = transport.get("reportLengths", {}).get(str(report_id))
                if isinstance(declared, int) and offset >= declared:
                    errors.append(
                        f"{tag}: percentOffset={offset} 超出 Report {report_id} 的声明长度 {declared}"
                    )
        if status == "calibrated" and offset is None:
            errors.append(f"{tag}: status=calibrated 时必须填写 percentOffset")
        scale = decode.get("percentScale")
        if not isinstance(scale, (int, float)) or scale <= 0 or scale > 100:
            errors.append(f"{tag}: percentScale 必须是 (0, 100] 内的数")
        rng = decode.get("percentRange")
        if (
            not isinstance(rng, list)
            or len(rng) != 2
            or not all(isinstance(item, (int, float)) for item in rng)
            or rng[0] >= rng[1]
        ):
            errors.append(f"{tag}: percentRange 必须是 [min, max] 且 min < max")
    return errors


def read_overlay(
    cfg: dict[str, Any], path: Path | None = None
) -> tuple[dict[str, dict[str, Any]], str | None]:
    """返回 ({probeId: entry}, 错误说明)。文件不存在属于正常情况。"""
    target = path or overlay_path()
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}, None
    except (OSError, json.JSONDecodeError) as exc:
        return {}, f"读取用户校准失败: {exc}"
    errors = validate_overlay(raw, cfg)
    if errors:
        return {}, "用户校准无效: " + "；".join(errors)
    return {entry["probeId"]: entry for entry in raw["entries"]}, None


def effective_decode(
    probe: dict[str, Any], entry: dict[str, Any] | None
) -> tuple[dict[str, Any], str, str | None]:
    """合并 L0 基线与 L1 覆盖层：覆盖层只改 decode，match / transport 永远用基线。"""
    if not entry:
        return dict(probe["decode"]), "bundled", None
    decode = dict(entry["decode"])
    if decode.get("status") == "calibrated":
        # 已校准出电量后，基线的「该通道无电量」说明必须清掉，否则界面自相矛盾。
        decode.pop("unavailableReason", None)
    elif not decode.get("unavailableReason"):
        decode["unavailableReason"] = probe["decode"].get("unavailableReason")
    confidence = entry.get("confidence") or None
    return decode, "user", confidence


def normalize_interfaces() -> list[dict[str, Any]]:
    """枚举本机 HID 接口，只保留配置中可能出现的厂商自定义接口信息。"""
    if hid is None:
        return []
    result = []
    for item in hid.enumerate():
        path = item.get("path")
        if isinstance(path, str):
            path_bytes = path.encode("utf-8", "replace")
        else:
            path_bytes = bytes(path or b"")
        result.append({
            "vendorId": f"{item.get('vendor_id', 0):04X}",
            "productId": f"{item.get('product_id', 0):04X}",
            "usagePage": f"{item.get('usage_page', 0):04X}",
            "usage": item.get("usage", 0),
            "interface": item.get("interface_number"),
            "pathHex": path_bytes.hex(),
            "manufacturer": item.get("manufacturer_string") or "",
            "product": item.get("product_string") or "",
        })
    return result


def matches(iface: dict[str, Any], probe: dict[str, Any]) -> bool:
    m = probe["match"]
    if iface["vendorId"] != m["vendorId"].upper():
        return False
    if iface["usagePage"] != m["usagePage"].upper():
        return False
    allowed = {str(x).upper() for x in m["productIds"]}
    if "*" not in allowed and iface["productId"] not in allowed:
        return False
    usages = m.get("usages") or []
    if usages and iface["usage"] not in usages:
        return False
    needles = m.get("nameContains") or []
    if needles:
        haystack = f"{iface['manufacturer']} {iface['product']}".lower()
        if not any(str(n).lower() in haystack for n in needles):
            return False
    return True


def read_one(iface: dict[str, Any], report_id: int, length: int, timeout_ms: int) -> dict[str, Any]:
    """在独立子进程里执行一次只读 HID 读取，带硬超时。"""
    if hid is None:
        return {"ok": False, "error": "hidapi 未安装"}
    cmd = [sys.executable, str(Path(__file__).resolve()), WORKER_FLAG,
           iface["pathHex"], str(report_id), str(length)]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=max(2.0, timeout_ms / 1000 + 2),
            env=os.environ.copy(),
        )
        payload = json.loads(proc.stdout.decode("utf-8", "replace") or "{}")
        return payload
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"读取超时（>{timeout_ms}ms），已放弃该 Report ID"}
    except (json.JSONDecodeError, OSError) as exc:
        return {"ok": False, "error": f"读取子进程失败: {exc}"}


def read_reports(iface: dict[str, Any], probe: dict[str, Any], timeout_ms: int,
                 allow_write: bool, defaults: dict[str, Any]) -> dict[str, Any]:
    """按 transport 声明读取原始字节；output-query 的写操作受三重门控。"""
    transport = probe["transport"]
    reports: dict[str, str] = {}
    errors: list[str] = []
    wrote = False
    query_ok = False

    if transport["kind"] == "output-query":
        query = transport.get("query") or {}
        config_allows = bool(defaults.get("allowDeviceWrites", False))
        if query.get("status") == "calibrated" and allow_write and config_allows:
            # 仅在三重门控都满足时发送厂商查询命令；命令内容完全来自配置。
            payload = bytes.fromhex(query["bytesHex"])
            result = write_one(iface, int(query["reportId"]), payload, timeout_ms)
            if result.get("ok"):
                wrote = True
                query_ok = True
            else:
                errors.append(f"查询命令发送失败: {result.get('error')}")
        elif probe["decode"].get("status") != "calibrated":
            # 已经通过只读状态快照校准时，这条提示只会造成误导，不再输出。
            errors.append("需要厂商查询命令，但尚未校准或写操作未获授权；仅执行只读采样")

    hints = transport.get("reportPathHints") or {}
    path_text = bytes.fromhex(iface["pathHex"]).decode("utf-8", "replace").lower()
    for rid in transport["reportIds"]:
        hint = hints.get(str(rid))
        # Report ID 属于特定 HID collection；配置里声明了路径提示时，只在该 collection 上读取。
        if hint and str(hint).lower() not in path_text:
            continue
        length = int(transport["reportLengths"][str(rid)])
        result = read_one(iface, rid, length, timeout_ms)
        if result.get("ok"):
            reports[str(rid)] = result["hex"]
        elif result.get("error"):
            errors.append(f"ID {rid}: {result['error']}")
    return {"reports": reports, "errors": errors, "wrote": wrote, "queryOk": query_ok}


def write_one(iface: dict[str, Any], report_id: int, payload: bytes, timeout_ms: int) -> dict[str, Any]:
    """发送 Output report（仅在配置校准 + 配置允许 + --allow-write 三重门控后调用）。"""
    if hid is None:
        return {"ok": False, "error": "hidapi 未安装"}
    cmd = [sys.executable, str(Path(__file__).resolve()), WORKER_FLAG,
           iface["pathHex"], str(report_id), "0", payload.hex()]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, timeout=max(2.0, timeout_ms / 1000 + 2),
            env=os.environ.copy(),
        )
        return json.loads(proc.stdout.decode("utf-8", "replace") or "{}")
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "查询命令写入超时"}
    except (json.JSONDecodeError, OSError) as exc:
        return {"ok": False, "error": f"写入子进程失败: {exc}"}


def decode(reports: dict[str, str], cfg: dict[str, Any]) -> dict[str, Any]:
    """只在校准完成时产出电量，其余一律返回 null + 原因。"""
    status = cfg.get("status")
    if status == "disabled":
        return {"battery": None, "charging": None, "status": "disabled", "reason": "探针已被配置禁用"}
    offset = cfg.get("percentOffset")
    if status != "calibrated" or offset is None:
        return {
            "battery": None,
            "charging": None,
            "status": "uncalibrated",
            # 配置可用 unavailableReason 覆盖默认说明：有的通道确实不含电量字段，
            # 与「待校准」不是一回事，界面必须如实区分。
            "reason": cfg.get("unavailableReason") or UNCALIBRATED_REASON,
            "channelAvailable": not bool(cfg.get("unavailableReason")),
        }
    rid = str(cfg["percentReportId"])
    raw = reports.get(rid)
    if not raw:
        return {"battery": None, "charging": None, "status": "error", "reason": f"未读到 Report ID {rid}"}
    try:
        data = bytes.fromhex(raw)
    except ValueError:
        return {"battery": None, "charging": None, "status": "error", "reason": "原始字节格式异常"}
    if offset >= len(data):
        return {
            "battery": None, "charging": None, "status": "error",
            "reason": f"percentOffset={offset} 超出实际报告长度 {len(data)}",
        }
    low, high = cfg["percentRange"]
    value = data[offset] * float(cfg["percentScale"])
    if not low <= value <= high:
        return {
            "battery": None, "charging": None, "status": "error",
            "reason": f"字节 0x{data[offset]:02X} 换算为 {value}，超出合法范围 {low}..{high}；请重新校准",
        }
    charging = None
    charging_cfg = cfg.get("charging")
    if isinstance(charging_cfg, dict) and charging_cfg.get("offset") is not None:
        idx = int(charging_cfg["offset"])
        if idx < len(data):
            mask = int(charging_cfg.get("mask", 1))
            expected = int(charging_cfg.get("valueWhenCharging", 1))
            charging = (data[idx] & mask) == (expected & mask)
    return {"battery": round(value), "charging": charging, "status": "calibrated", "reason": None}


def probe_all(cfg: dict[str, Any] | None = None, allow_write: bool = False,
              verbose: bool = False, overlay_file: Path | None = None) -> dict[str, Any]:
    cfg = cfg or load_config()
    timeout_ms = int(cfg["defaults"]["readTimeoutMs"])
    interfaces = normalize_interfaces()
    overlay, overlay_error = read_overlay(cfg, overlay_file)
    results = []
    for probe in cfg["probes"]:
        started = time.monotonic()
        matched = [i for i in interfaces if matches(i, probe)] if hid else []
        # 合并用户校准：只覆盖 decode，读取方式永远来自内置配置。
        decode_cfg, calibrated_by, confidence = effective_decode(probe, overlay.get(probe["id"]))
        entry: dict[str, Any] = {
            "probeId": probe["id"],
            "vendor": probe["vendor"],
            "displayName": probe.get("displayName", ""),
            "match": {
                "vendorId": probe["match"]["vendorId"],
                "productIds": probe["match"]["productIds"],
            },
            "transportKind": probe["transport"]["kind"],
            "enabled": probe["enabled"],
            "status": "disabled" if not probe["enabled"] else "no-match",
            "battery": None,
            "charging": None,
            "reason": None,
            "reports": {},
            "interfaces": [],
            "wrote": False,
            "durationMs": 0,
            "calibratedBy": calibrated_by,
            "confidence": confidence,
        }
        if not probe["enabled"]:
            entry["reason"] = "探针已在配置中禁用"
        elif hid is None:
            entry["status"] = "error"
            entry["reason"] = "hidapi 未安装：无法访问 HID 私有通道（pip install hidapi）"
        elif not matched:
            entry["reason"] = "本机没有匹配该厂商规则的 HID 接口"
        else:
            all_reports: dict[str, str] = {}
            all_errors: list[str] = []
            wrote_any = False
            for iface in matched:
                reading = read_reports(iface, probe, timeout_ms, allow_write, cfg["defaults"])
                all_reports.update(reading["reports"])
                all_errors.extend(reading["errors"])
                wrote_any = wrote_any or reading["wrote"]
                entry["interfaces"].append({
                    "vendorId": iface["vendorId"], "productId": iface["productId"],
                    "usagePage": iface["usagePage"], "usage": iface["usage"],
                    "interface": iface["interface"],
                })
            entry["reports"] = all_reports
            entry["wrote"] = wrote_any
            decoded = decode(all_reports, decode_cfg)
            entry.update(decoded)
            expected_ids = {str(x) for x in probe["transport"]["reportIds"]}
            missing_ids = sorted(expected_ids - set(all_reports.keys()))
            unique_errors = [e for e in dict.fromkeys(all_errors) if not e.startswith("ID ")]
            if missing_ids:
                unique_errors.append(f"以下 Report ID 未能读取: {', '.join(missing_ids)}")
            if unique_errors:
                entry["errors"] = unique_errors
                if verbose:
                    parts = [entry["reason"] or "", *unique_errors]
                    entry["reason"] = "; ".join(p for p in parts if p)
        entry["durationMs"] = round((time.monotonic() - started) * 1000)
        results.append(entry)

    return {
        "schemaVersion": 1,
        "generatedAt": int(time.time() * 1000),
        "hidapiAvailable": hid is not None,
        "allowDeviceWrites": allow_write and bool(cfg["defaults"].get("allowDeviceWrites")),
        "overlayPath": str(overlay_file or overlay_path()),
        "overlayError": overlay_error,
        "results": results,
    }


def battery_by_device(report: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    """把探针结果按 (VID, PID) 建索引，供快照生成使用。"""
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for item in report["results"]:
        key_base = item["match"]["vendorId"].upper()
        for pid in item["match"]["productIds"]:
            if pid == "*":
                continue
            index[(key_base, str(pid).upper())] = {
                "battery": item["battery"],
                "charging": item["charging"],
                "probe": {
                    "probeId": item["probeId"],
                    "vendor": item["vendor"],
                    "status": item["status"],
                    "reason": item.get("reason"),
                    # false 表示通道本身不含电量字段，界面应显示「无法读取」而非「待校准」。
                    "channelAvailable": item.get("channelAvailable", True),
                    "confidence": item.get("confidence"),
                    "calibratedBy": item.get("calibratedBy"),
                },
            }
    return index


def print_human(report: dict[str, Any], verbose: bool = False) -> None:
    print(f"hidapi: {'可用' if report['hidapiAvailable'] else '未安装'}   "
          f"写操作: {'已授权' if report['allowDeviceWrites'] else '禁止（默认）'}")
    print("-" * 78)
    for item in report["results"]:
        value = f"{item['battery']}%" if item["battery"] is not None else "不可用"
        print(f"[{item['vendor']:<6}] {item['probeId']}")
        print(f"  状态={item['status']:<12} 电量={value:<8} "
              f"方式={item['transportKind']:<13} 耗时={item['durationMs']}ms"
              f"  校准={item.get('calibratedBy', '-')}"
              + (f"/{item['confidence']}" if item.get("confidence") else ""))
        if item["reason"]:
            print(f"  说明: {item['reason']}")
        if verbose and item["reports"]:
            for rid, raw in item["reports"].items():
                print(f"  Report {rid}: {raw}")
        if verbose and item.get("errors"):
            for err in item["errors"]:
                print(f"  警告: {err}")
    print("-" * 78)
    print("提示: status=uncalibrated 是预期行为；请用 --capture / --suggest 校准后再启用电量显示。")


def cmd_capture(args: argparse.Namespace, cfg: dict[str, Any]) -> int:
    if args.reference is None:
        print("--capture 需要 --reference，请填入此刻厂商驱动显示的真实电量百分比", file=sys.stderr)
        return 2
    report = probe_all(cfg, allow_write=args.allow_write, verbose=True,
                       overlay_file=args.overlay)
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = CAPTURE_DIR / f"capture-{stamp}.json"
    path.write_text(
        json.dumps({
            "capturedAt": stamp,
            "referencePercent": args.reference,
            "label": args.label or "",
            "report": report,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print_human(report, verbose=True)
    print(f"采样已保存: {path}")
    return 0


def suggest_single_point(samples: list[dict[str, Any]], cfg: dict[str, Any]) -> int:
    """只有 1 个电量参考值时的候选分析。

    单点无法区分「电量」与「恰好同值的其它状态量」，因此只输出候选与建议片段，
    由用户决定是否启用；改变电量后再采一次即可进入严格的多点校验。
    """
    print(f"只有 1 个电量样本（{[s.get('referencePercent') for s in samples]}），执行单点候选分析。")
    print("单点只能给出候选，需改变电量后再采一次才能确认。")
    print("=" * 78)
    probes_by_id = {probe["id"]: probe for probe in cfg["probes"]}
    hits: list[tuple[str, str, str, int, int]] = []
    for sample in samples:
        reference = sample.get("referencePercent")
        for item in sample.get("report", {}).get("results", []):
            probe = probes_by_id.get(item.get("probeId", ""))
            if not probe:
                continue
            for rid, raw in item.get("reports", {}).items():
                try:
                    data = bytes.fromhex(raw)
                except ValueError:
                    continue
                for index, value in enumerate(data):
                    if value == reference:
                        hits.append((probe["id"], probe["vendor"], rid, index, value))
    if not hits:
        print("没有字节等于参考值。电量可能是缩放编码（如 0..200）、BCD，或需要先发送查询命令。")
        return 1
    for probe_id, vendor, rid, index, value in hits:
        print(f"  [{vendor}] Report {rid} 偏移 {index} = {value}（与参考电量一致）")
    probe_id, vendor, rid, index, _ = hits[0]
    snippet = {
        "id": probe_id,
        "decode": {
            "status": "calibrated",
            "percentReportId": int(rid),
            "percentOffset": index,
            "percentScale": 1,
            "percentRange": [0, 100],
        },
    }
    print("=" * 78)
    print("建议的 decode 片段（单点推断，建议二次验证后再长期依赖）:")
    print("  " + json.dumps(snippet, ensure_ascii=False))
    return 0


def cmd_suggest(args: argparse.Namespace, cfg: dict[str, Any]) -> int:
    files = sorted(CAPTURE_DIR.glob("capture-*.json")) if CAPTURE_DIR.exists() else []
    if not files:
        print("还没有采样。请先运行 --capture --reference <厂商驱动显示的电量>。", file=sys.stderr)
        return 2
    samples: list[dict[str, Any]] = []
    for path in files:
        try:
            samples.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    refs = {s.get("referencePercent") for s in samples if s.get("referencePercent") is not None}
    if len(refs) < 2:
        return suggest_single_point(samples, cfg)

    probes_by_id = {p["id"]: p for p in cfg["probes"]}
    found_any = False
    print(f"分析 {len(samples)} 次采样，参考电量: {sorted(refs)}")
    print("=" * 78)
    for probe_id, probe in probes_by_id.items():
        series: list[tuple[int, dict[str, str]]] = []
        for sample in samples:
            for item in sample.get("report", {}).get("results", []):
                if item["probeId"] == probe_id and item.get("reports"):
                    series.append((sample["referencePercent"], item["reports"]))
        if len(series) < 2:
            continue
        lengths: dict[str, set[int]] = {}
        for _, reports in series:
            for rid, raw in reports.items():
                lengths.setdefault(rid, set()).add(len(raw) // 2)
        candidates = []
        for rid, sizes in lengths.items():
            if len(sizes) > 1:
                continue  # 长度不稳定，跳过
            size = next(iter(sizes))
            usable = [(ref, bytes.fromhex(reports[rid])) for ref, reports in series if rid in reports]
            if len(usable) != len(series) or len({len(buf) for _, buf in usable}) != 1:
                continue
            for offset in range(size):
                for scale in (1, 0.5, 2):
                    if all(abs(buf[offset] * scale - ref) < 0.51 for ref, buf in usable):
                        candidates.append({"reportId": int(rid), "offset": offset, "scale": scale})
        print(f"[{probe['vendor']}] {probe_id}")
        if not candidates:
            print("  未找到与电量线性对应的字节。可能需要先发送厂商查询命令（output-query），")
            print("  或电量并非以 0..100 的单字节直接编码。请使用外部抓包工具定位协议。")
        else:
            found_any = True
            for c in candidates[:8]:
                print(f"  候选: reportId={c['reportId']} percentOffset={c['offset']} "
                      f"percentScale={c['scale']}")
            best = candidates[0]
            snippet = {
                "id": probe_id,
                "decode": {
                    "status": "calibrated",
                    "percentReportId": best["reportId"],
                    "percentOffset": best["offset"],
                    "percentScale": best["scale"],
                    "percentRange": [0, 100],
                },
            }
            print("  建议填入 config/battery-probes.json 的 decode 片段:")
            print("  " + json.dumps(snippet, ensure_ascii=False))
    print("=" * 78)
    print("候选仅为统计相关性提示，务必用第三个电量值再验证一次后才改为 calibrated。")
    return 0 if found_any else 1


def main() -> int:
    # worker 分支必须先于 argparse：worker 携带的私有参数对 CLI 解析器不可见。
    if WORKER_FLAG in sys.argv:
        return worker_main(sys.argv[sys.argv.index(WORKER_FLAG) + 1:])

    parser = argparse.ArgumentParser(description="厂商电量探针（配置驱动、只读优先）")
    parser.add_argument("--validate", action="store_true", help="校验配置文件")
    parser.add_argument("--list", action="store_true", help="列出本机 HID 接口与命中的探针")
    parser.add_argument("--probe", action="store_true", help="执行探测（默认动作）")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    parser.add_argument("--verbose", action="store_true", help="打印原始 report 字节")
    parser.add_argument("--capture", action="store_true", help="采样一次用于校准")
    parser.add_argument("--reference", type=int, help="此刻厂商驱动显示的真实电量百分比")
    parser.add_argument("--label", type=str, help="采样备注")
    parser.add_argument("--suggest", action="store_true", help="分析采样并给解码建议")
    parser.add_argument("--allow-write", action="store_true",
                        help="显式授权发送厂商查询命令（仍需配置校准并开启 allowDeviceWrites）")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--overlay", type=Path, default=None,
                        help="用户校准覆盖层路径（默认 %APPDATA%/peripheral-viewer/battery-calibration.json）")
    args = parser.parse_args()

    try:
        cfg = load_config(args.config)
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if args.validate:
        print(f"配置校验通过: {args.config}（{len(cfg['probes'])} 个探针）")
        for probe in cfg["probes"]:
            print(f"  - {probe['vendor']:<6} {probe['id']}  "
                  f"transport={probe['transport']['kind']}  decode={probe['decode']['status']}")
        overlay, overlay_error = read_overlay(cfg, args.overlay)
        target = args.overlay or overlay_path()
        if overlay_error:
            print(f"用户校准无效（整份忽略）: {overlay_error}", file=sys.stderr)
            print(f"  文件: {target}", file=sys.stderr)
            return 1
        if overlay:
            print(f"用户校准: {len(overlay)} 条覆盖（{target}）")
            for probe_id, entry in overlay.items():
                decode = entry["decode"]
                print(f"  - {probe_id}: status={decode['status']} "
                      f"report={decode['percentReportId']} offset={decode['percentOffset']} "
                      f"scale={decode['percentScale']} confidence={entry.get('confidence') or '-'}")
        else:
            print(f"用户校准: 无（{target} 不存在或为空）")
        return 0

    if args.list:
        interfaces = normalize_interfaces()
        vendor_ifaces = [i for i in interfaces if i["usagePage"] not in ("0001", "000C", "000D")]
        print(f"HID 接口 {len(interfaces)} 个，其中厂商自定义 {len(vendor_ifaces)} 个")
        for iface in vendor_ifaces:
            hits = [p["id"] for p in cfg["probes"] if matches(iface, p)]
            print(f"  {iface['vendorId']}:{iface['productId']} UP={iface['usagePage']} "
                  f"U={iface['usage']} iface={iface['interface']} -> {', '.join(hits) or '未匹配'}")
        return 0

    if args.capture:
        return cmd_capture(args, cfg)
    if args.suggest:
        return cmd_suggest(args, cfg)

    report = probe_all(cfg, allow_write=args.allow_write, verbose=args.verbose,
                       overlay_file=args.overlay)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report, verbose=args.verbose)
    return 0


def worker_main(argv: list[str]) -> int:
    """子进程：一次 HID 调用。3 个参数 = 只读 input report；4 个参数 = 写 Output report 后可选读取。

    length=0 表示只写不读。写路径只有在主进程三重门控全部通过时才会被触发。
    """
    if len(argv) not in (3, 4) or hid is None:
        print(json.dumps({"ok": False, "error": "参数错误或 hidapi 不可用"}))
        return 1
    path_hex, report_id, length = argv[0], int(argv[1]), int(argv[2])
    write_hex = argv[3] if len(argv) == 4 else None
    try:
        handle = hid.device()
        handle.open_path(bytes.fromhex(path_hex))
        if write_hex is not None:
            handle.write(bytes.fromhex(write_hex))
        result = handle.get_input_report(report_id, length) if length > 0 else b""
        handle.close()
        print(json.dumps({"ok": True, "hex": bytes(result).hex(), "wrote": write_hex is not None}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": repr(exc)[:200]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

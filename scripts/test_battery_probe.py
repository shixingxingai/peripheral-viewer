"""battery_probe 的核心规则单测：匹配、解码边界、配置校验。

运行：python -m unittest discover -s scripts -p "test_*.py"
这些用例不访问真实设备，只锁定「未校准时绝不输出电量」等关键约定。
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import battery_probe as bp


def decode_cfg(**overrides):
    cfg = {
        "status": "uncalibrated",
        "percentReportId": 5,
        "percentOffset": None,
        "percentScale": 1,
        "percentRange": [0, 100],
        "charging": None,
    }
    cfg.update(overrides)
    return cfg


class DecodeTests(unittest.TestCase):
    def test_uncalibrated_never_outputs_battery(self):
        result = bp.decode({"5": "aa0100"}, decode_cfg())
        self.assertIsNone(result["battery"])
        self.assertEqual(result["status"], "uncalibrated")

    def test_uncalibrated_uses_configured_reason(self):
        # 通道本身不含电量字段时，说明必须如实反映「读不到」，而不是「待校准」。
        cfg = decode_cfg(unavailableReason="该通道不含电量字段")
        result = bp.decode({"5": "aa0100"}, cfg)
        self.assertIsNone(result["battery"])
        self.assertEqual(result["reason"], "该通道不含电量字段")

    def test_uncalibrated_falls_back_to_default_reason(self):
        result = bp.decode({"5": "aa0100"}, decode_cfg())
        self.assertIn("未确认电量子节", result["reason"])

    def test_channel_available_flag_distinguishes_cases(self):
        # 通道不含电量字段时 channelAvailable=False，界面据此显示「无法读取」。
        missing = bp.decode({"5": "aa0100"}, decode_cfg(unavailableReason="该通道不含电量字段"))
        pending = bp.decode({"5": "aa0100"}, decode_cfg())
        self.assertFalse(missing["channelAvailable"])
        self.assertTrue(pending["channelAvailable"])

    def test_calibrated_reads_offset(self):
        result = bp.decode({"5": "aa0132"}, decode_cfg(status="calibrated", percentOffset=2))
        self.assertEqual(result["battery"], 50)
        self.assertEqual(result["status"], "calibrated")

    def test_scale_is_applied(self):
        result = bp.decode({"5": "aa0132"}, decode_cfg(status="calibrated", percentOffset=2, percentScale=0.5))
        self.assertEqual(result["battery"], 25)

    def test_out_of_range_reports_error(self):
        result = bp.decode({"5": "aaff"}, decode_cfg(status="calibrated", percentOffset=1))
        self.assertIsNone(result["battery"])
        self.assertEqual(result["status"], "error")
        self.assertIn("超出", result["reason"])

    def test_offset_beyond_length_reports_error(self):
        result = bp.decode({"5": "aa01"}, decode_cfg(status="calibrated", percentOffset=9))
        self.assertIsNone(result["battery"])
        self.assertIn("超出实际报告长度", result["reason"])

    def test_missing_report_reports_error(self):
        result = bp.decode({}, decode_cfg(status="calibrated", percentOffset=1))
        self.assertIsNone(result["battery"])
        self.assertEqual(result["status"], "error")

    def test_charging_bit(self):
        result = bp.decode(
            {"5": "aa3201"},
            decode_cfg(
                status="calibrated",
                percentOffset=1,
                charging={"offset": 2, "mask": 1, "valueWhenCharging": 1},
            ),
        )
        self.assertEqual(result["battery"], 50)
        self.assertTrue(result["charging"])

    def test_disabled_probe(self):
        result = bp.decode({"5": "aa0132"}, decode_cfg(status="disabled", percentOffset=2))
        self.assertIsNone(result["battery"])
        self.assertEqual(result["status"], "disabled")


class MatchTests(unittest.TestCase):
    def setUp(self):
        self.probe = {
            "match": {
                "vendorId": "260D",
                "productIds": ["1092"],
                "usagePage": "FF00",
                "usages": [1],
                "nameContains": [],
            }
        }
        self.iface = {
            "vendorId": "260D",
            "productId": "1092",
            "usagePage": "FF00",
            "usage": 1,
            "manufacturer": "",
            "product": "",
        }

    def test_exact_match(self):
        self.assertTrue(bp.matches(self.iface, self.probe))

    def test_usage_mismatch(self):
        self.assertFalse(bp.matches(dict(self.iface, usage=2), self.probe))

    def test_vendor_mismatch(self):
        self.assertFalse(bp.matches(dict(self.iface, vendorId="24AE"), self.probe))

    def test_wildcard_product(self):
        probe = {
            "match": {
                "vendorId": "260D",
                "productIds": ["*"],
                "usagePage": "FF00",
                "usages": [],
                "nameContains": [],
            }
        }
        self.assertTrue(bp.matches(self.iface, probe))

    def test_name_filter(self):
        probe = {
            "match": {
                "vendorId": "260D",
                "productIds": ["1092"],
                "usagePage": "FF00",
                "usages": [],
                "nameContains": ["receiver"],
            }
        }
        self.assertFalse(bp.matches(self.iface, probe))
        self.assertTrue(bp.matches(dict(self.iface, product="USB 2.4G Receiver"), probe))


class ValidateTests(unittest.TestCase):
    def test_repo_config_is_valid(self):
        cfg = bp.load_config()
        self.assertGreaterEqual(len(cfg["probes"]), 2)
        self.assertEqual(bp.validate_config(cfg), [])

    def test_calibrated_without_offset_is_rejected(self):
        cfg = {
            "schemaVersion": 1,
            "defaults": {"readTimeoutMs": 400, "allowDeviceWrites": False},
            "probes": [
                {
                    "id": "x",
                    "vendor": "X",
                    "displayName": "x",
                    "enabled": True,
                    "match": {
                        "vendorId": "260D",
                        "productIds": ["1092"],
                        "usagePage": "FF00",
                        "usages": [1],
                        "nameContains": [],
                    },
                    "transport": {
                        "kind": "input-report",
                        "reportIds": [5],
                        "reportLengths": {"5": 24},
                        "writeRequired": False,
                    },
                    "decode": {
                        "status": "calibrated",
                        "percentReportId": 5,
                        "percentOffset": None,
                        "percentScale": 1,
                        "percentRange": [0, 100],
                        "charging": None,
                    },
                }
            ],
        }
        errors = bp.validate_config(cfg)
        self.assertTrue(any("percentOffset" in error for error in errors))

    def test_report_id_outside_transport_is_rejected(self):
        cfg = bp.load_config()
        probe = cfg["probes"][0]
        probe["decode"] = dict(probe["decode"], percentReportId=99)
        errors = bp.validate_config(cfg)
        self.assertTrue(any("percentReportId" in error for error in errors))


class IndexTests(unittest.TestCase):
    def test_battery_by_device_index(self):
        report = {
            "results": [
                {
                    "probeId": "p",
                    "vendor": "V",
                    "status": "calibrated",
                    "battery": 42,
                    "charging": False,
                    "match": {"vendorId": "260D", "productIds": ["1092"]},
                }
            ]
        }
        index = bp.battery_by_device(report)
        self.assertEqual(index[("260D", "1092")]["battery"], 42)
        self.assertEqual(index[("260D", "1092")]["probe"]["status"], "calibrated")


class OverlayTests(unittest.TestCase):
    """用户校准覆盖层（L1）：与桌面端 calibration.rs 共用同一套规则。"""

    def setUp(self):
        self.cfg = bp.load_config()
        self.rapoo = next(p for p in self.cfg["probes"] if p["id"] == "rapoo-2.4g-output-query")
        self.dareu = next(p for p in self.cfg["probes"] if p["id"] == "dareu-2.4g-input-report")

    def entry(self, probe_id, **decode_overrides):
        decode = {
            "status": "calibrated",
            "percentReportId": 188,
            "percentOffset": 5,
            "percentScale": 1,
            "percentRange": [0, 100],
        }
        decode.update(decode_overrides)
        return {"probeId": probe_id, "decode": decode, "confidence": "single-sample"}

    def test_calibrated_overlay_wins_and_reports_source(self):
        decode, source, confidence = bp.effective_decode(self.rapoo, self.entry("rapoo-2.4g-output-query"))
        self.assertEqual(source, "user")
        self.assertEqual(confidence, "single-sample")
        self.assertEqual(decode["percentOffset"], 5)

    def test_calibration_clears_baseline_unavailable_reason(self):
        # 达尔优基线声明「通道无电量」；用户若能校准出来，这条说明必须消失，
        # 否则界面会同时显示「61%」和「无法读取」。
        entry = self.entry("dareu-2.4g-input-report", percentReportId=5, percentOffset=2)
        decode, source, _ = bp.effective_decode(self.dareu, entry)
        self.assertEqual(source, "user")
        self.assertNotIn("unavailableReason", decode)

    def test_uncalibrated_overlay_keeps_baseline_unavailable_reason(self):
        entry = {
            "probeId": "dareu-2.4g-input-report",
            "decode": {
                "status": "uncalibrated",
                "percentReportId": 5,
                "percentOffset": None,
                "percentScale": 1,
                "percentRange": [0, 100],
            },
        }
        decode, source, _ = bp.effective_decode(self.dareu, entry)
        self.assertEqual(source, "user")
        self.assertIn("unavailableReason", decode)

    def test_overlay_cannot_override_transport(self):
        entry = self.entry("rapoo-2.4g-output-query")
        entry["transport"] = {"kind": "output-query", "query": {"status": "calibrated", "reportId": 186, "bytesHex": "00"}}
        decode, _, _ = bp.effective_decode(self.rapoo, entry)
        self.assertNotIn("transport", decode)
        self.assertNotIn("query", decode)

    def test_valid_overlay_is_loaded(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "battery-calibration.json"
            path.write_text(
                json.dumps({"schemaVersion": 1, "entries": [self.entry("rapoo-2.4g-output-query")]}),
                encoding="utf-8",
            )
            overlay, error = bp.read_overlay(self.cfg, path)
            self.assertIsNone(error)
            self.assertIn("rapoo-2.4g-output-query", overlay)

    def test_missing_overlay_is_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            overlay, error = bp.read_overlay(self.cfg, Path(tmp) / "nope.json")
            self.assertEqual(overlay, {})
            self.assertIsNone(error)

    def test_corrupt_overlay_is_ignored_as_a_whole(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "battery-calibration.json"
            path.write_text("{not json", encoding="utf-8")
            overlay, error = bp.read_overlay(self.cfg, path)
            self.assertEqual(overlay, {})
            self.assertIn("读取用户校准失败", error)

    def test_unknown_probe_invalidates_whole_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "battery-calibration.json"
            path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "entries": [
                            self.entry("rapoo-2.4g-output-query"),
                            self.entry("not-a-probe"),
                        ],
                    }
                ),
                encoding="utf-8",
            )
            overlay, error = bp.read_overlay(self.cfg, path)
            self.assertEqual(overlay, {})
            self.assertIn("未知探针", error)

    def test_offset_beyond_declared_length_is_rejected(self):
        errors = bp.validate_overlay(
            {"schemaVersion": 1, "entries": [self.entry("rapoo-2.4g-output-query", percentOffset=99)]},
            self.cfg,
        )
        self.assertTrue(any("声明长度" in error for error in errors), errors)

    def test_report_id_outside_transport_is_rejected(self):
        errors = bp.validate_overlay(
            {"schemaVersion": 1, "entries": [self.entry("rapoo-2.4g-output-query", percentReportId=7)]},
            self.cfg,
        )
        self.assertTrue(any("transport.reportIds" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()

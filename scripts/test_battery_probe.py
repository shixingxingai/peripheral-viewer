"""battery_probe 的核心规则单测：匹配、解码边界、配置校验。

运行：python -m unittest discover -s scripts -p "test_*.py"
这些用例不访问真实设备，只锁定「未校准时绝不输出电量」等关键约定。
"""

from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()

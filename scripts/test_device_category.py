"""device_category 的判定规则单测。

运行：python -m unittest discover -s scripts -p "test_*.py"

用例取自本机实测数据：组合式 2.4G 接收器会同时枚举出键盘集合与鼠标集合，
只按「有 Keyboard 就判键盘」会把鼠标误判成键盘（Rapoo 24AE:185A 即如此）。
"""

from __future__ import annotations

import unittest

import device_category as dc


def hid(interface: int, usage: int, usage_page: int = 0x0001) -> dict:
    return {"interface_number": interface, "usage_page": usage_page, "usage": usage}


class HidSignalsTests(unittest.TestCase):
    def test_counts_collections_per_usage(self):
        rows = [hid(0, dc.USAGE_MOUSE), hid(1, dc.USAGE_KEYBOARD)]
        signals = dc.hid_signals(rows)
        self.assertEqual(signals["mouse"], 1)
        self.assertEqual(signals["keyboard"], 1)
        self.assertEqual(signals["primaryUsage"], dc.USAGE_MOUSE)

    def test_ignores_non_generic_desktop_pages(self):
        rows = [hid(0, 0x0001, usage_page=0x000C), hid(1, 0x0001, usage_page=0xFF00)]
        signals = dc.hid_signals(rows)
        self.assertEqual((signals["mouse"], signals["keyboard"]), (0, 0))
        self.assertIsNone(signals["primaryUsage"])

    def test_primary_usage_uses_lowest_interface_number(self):
        # 枚举顺序不保证有序，主接口要按接口号取最小，而不是按出现顺序。
        rows = [hid(2, dc.USAGE_KEYBOARD), hid(0, dc.USAGE_MOUSE), hid(1, dc.USAGE_KEYBOARD)]
        self.assertEqual(dc.hid_signals(rows)["primaryUsage"], dc.USAGE_MOUSE)

    def test_missing_interface_number_is_ignored_for_primary(self):
        rows = [{"interface_number": -1, "usage_page": 0x0001, "usage": dc.USAGE_MOUSE}]
        signals = dc.hid_signals(rows)
        self.assertEqual(signals["mouse"], 1)
        self.assertIsNone(signals["primaryUsage"])

    def test_empty_input(self):
        self.assertEqual(dc.hid_signals([]), {"keyboard": 0, "mouse": 0, "primaryUsage": None})


class ClassifyTests(unittest.TestCase):
    def test_combo_receiver_with_primary_mouse_is_mouse(self):
        # Rapoo 24AE:185A 实测：iface0 鼠标，iface1 键盘（宏键），各 1 个集合。
        rows = [hid(0, dc.USAGE_MOUSE), hid(1, dc.USAGE_KEYBOARD)]
        classes = {"USB", "HIDClass", "Mouse", "Keyboard"}
        self.assertEqual(dc.classify(classes, ["Rapoo Gaming Device"], dc.hid_signals(rows)), "mouse")

    def test_receiver_with_more_keyboard_collections_is_keyboard(self):
        # Dareu 260D:1092 实测：两个键盘集合 + 一个鼠标集合。
        rows = [hid(0, dc.USAGE_MOUSE), hid(1, dc.USAGE_KEYBOARD), hid(2, dc.USAGE_KEYBOARD)]
        classes = {"USB", "HIDClass", "Mouse", "Keyboard"}
        self.assertEqual(dc.classify(classes, ["USB 2.4G Receiver"], dc.hid_signals(rows)), "keyboard")

    def test_tie_with_primary_keyboard_stays_keyboard(self):
        rows = [hid(0, dc.USAGE_KEYBOARD), hid(1, dc.USAGE_MOUSE)]
        self.assertEqual(dc.classify(set(), [], dc.hid_signals(rows)), "keyboard")

    def test_pure_mouse(self):
        rows = [hid(0, dc.USAGE_MOUSE)]
        self.assertEqual(dc.classify({"Mouse"}, [], dc.hid_signals(rows)), "mouse")

    def test_keyboard_only(self):
        rows = [hid(0, dc.USAGE_KEYBOARD), hid(1, dc.USAGE_KEYBOARD)]
        self.assertEqual(dc.classify({"Keyboard"}, [], dc.hid_signals(rows)), "keyboard")

    def test_without_hid_signals_falls_back_to_pnp_class(self):
        self.assertEqual(dc.classify({"Keyboard"}, ["HID Keyboard Device"]), "keyboard")
        self.assertEqual(dc.classify({"Mouse"}, ["HID-compliant mouse"]), "mouse")

    def test_monitor_and_audio_fallbacks(self):
        self.assertEqual(dc.classify({"Monitor"}, ["Mi Monitor"]), "monitor")
        self.assertEqual(dc.classify({"AudioEndpoint"}, ["耳机"]), "headset")
        self.assertEqual(dc.classify({"USB"}, ["AURA LED Controller"]), "other")


if __name__ == "__main__":
    unittest.main()

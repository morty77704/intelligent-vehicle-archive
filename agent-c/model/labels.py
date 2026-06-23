DAMAGE_LABELS = [
    "scratch_front_bumper",
    "scratch_rear_bumper",
    "scratch_left_door",
    "scratch_right_door",
    "scratch_hood",
    "scratch_trunk",
    "dent_front_bumper",
    "dent_rear_bumper",
    "dent_left_door",
    "dent_right_door",
    "dent_hood",
    "dent_trunk",
    "glass_crack",
    "paint_peel",
    "broken_light",
    "normal",
]

SEVERITY_LABELS = ["mild", "moderate", "severe"]

BINARY_CLASS_TO_CONDITION = {
    "00-damage": "scratch_front_bumper",
    "damage": "scratch_front_bumper",
    "01-whole": "normal",
    "whole": "normal",
    "normal": "normal",
}


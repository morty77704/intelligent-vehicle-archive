import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.recognizer import MockPlateRecognizer, YoloPaddlePlateRecognizer


def test_mock_recognizer_returns_contract_fields():
    result = MockPlateRecognizer().recognize("ZmFrZS1pbWFnZQ==").as_dict()

    assert result == {
        "plate": "京A12345",
        "plate_type": "蓝牌",
        "location": "北京",
        "confidence": 0.97,
    }


def test_best_ocr_text_selects_highest_confidence_candidate():
    text, confidence = YoloPaddlePlateRecognizer._best_ocr_text([
        [
            [[[0, 0], [1, 0], [1, 1], [0, 1]], ("京A12345", 0.80)],
            [[[0, 0], [1, 0], [1, 1], [0, 1]], ("沪AD12345", 0.92)],
        ]
    ])

    assert text == "沪AD12345"
    assert confidence == 0.92


def test_best_ocr_text_rejects_empty_result():
    with pytest.raises(ValueError, match="OCR 未识别到车牌文本"):
        YoloPaddlePlateRecognizer._best_ocr_text([])

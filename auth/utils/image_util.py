"""图片处理工具模块"""
import base64
import io
import numpy as np
from PIL import Image


def decode_base64_image(b64_str):
    """将 base64 字符串解码为 numpy 数组 (RGB)"""
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_bytes = base64.b64decode(b64_str)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(img)


def decode_base64_bytes(b64_str):
    """将 base64 字符串解码为二进制数据"""
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    return base64.b64decode(b64_str)

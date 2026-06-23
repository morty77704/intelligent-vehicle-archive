# Agent B - 车牌识别模块

Agent B 负责从车辆图片中识别车牌，并提供车牌归属、违章记录、年检和维保概要查询能力。当前版本是可演示的接口闭环：推理结果使用稳定模拟数据，工具接口使用规则解析和模拟数据库，后续可替换为 YOLOv8 + PaddleOCR 的真实模型链路。

## 职责范围

- 车牌检测与识别：`POST /api/plate/infer`
- 车牌归属信息：`POST /api/plate/tools/plate_info`
- 违章记录查询：`POST /api/plate/tools/violation`
- 年检/保险/维保概要：`POST /api/plate/tools/history`
- 健康检查：`GET /api/plate/health`

## 当前实现

- `infer` 返回演示车牌 `京A12345`，保持与系统整合链路稳定。
- `query_plate_info` 复用 `api/plate_rules.py`，支持常见中国车牌格式校验、输入规范化、省份归属解析和蓝/绿牌类型判断。
- `check_violation` 和 `query_vehicle_history` 使用模拟数据，适合答辩演示。
- 非法车牌会返回 HTTP 400，避免调度层继续使用脏数据。

支持的规范化示例：

| 输入 | 规范化结果 |
| --- | --- |
| `京A·12345` | `京A12345` |
| `京A-12345` | `京A12345` |
| `京ａ．１２３４５` | `京A12345` |
| `粤BDF5678` | `粤BDF5678` |

支持的车牌类型：

| 类型 | 示例 | 说明 |
| --- | --- | --- |
| 蓝牌 | `京A12345` | 常见 7 位小型汽车号牌 |
| 小型新能源绿牌 | `沪AD12345`、`粤BDF5678` | 8 位，第三位为 `D/F` |
| 大型新能源绿牌 | `京A12345D` | 8 位，末位为 `D/F` |

## 运行方式

在项目根目录执行：

```bash
cd agent-b
python -m uvicorn api.main:app --host 127.0.0.1 --port 8002
```

健康检查：

```bash
curl http://127.0.0.1:8002/api/plate/health
```

## 数据集准备

当前本机数据集路径：

```text
D:\车牌数据集\datasets
```

已识别的数据目录：

- `ccpd_sample/ccpd_sample/base`：蓝牌样本，约 10000 张。
- `ccpd_sample/ccpd_sample/green`：绿牌样本，约 5769 张。
- `ccpd_green/ccpd_green/train|val|test`：新能源绿牌划分数据，约 11776 张。

生成 Agent B 训练前的轻量 manifest 和 YOLO 检测标注：

```bash
python agent-b/tools/prepare_ccpd.py --dataset-root "D:\车牌数据集\datasets" --output-dir agent-b/data/generated --limit 500
```

输出目录：

```text
agent-b/data/generated/
  ccpd_manifest.jsonl
  ccpd_manifest.csv
  yolo_plate/images.txt
  yolo_plate/labels/*.txt
```

说明：

- 脚本从 CCPD 文件名解析车牌、检测框、图片尺寸和蓝/绿牌类型。
- 默认只抽样 500 张，先用于验证解析和训练流程；需要全量时传 `--limit 0`。
- `agent-b/data/` 已加入 `.gitignore`，不会把数据集或生成标注提交进仓库。

生成 Ultralytics YOLOv8 可直接训练的数据集：

```bash
python agent-b/tools/prepare_ccpd.py ^
  --dataset-root "D:\车牌数据集\datasets" ^
  --output-dir agent-b/data/generated ^
  --limit 120 ^
  --materialize-yolo ^
  --yolo-dataset-dir agent-b/data/yolo_plate_dataset
```

输出结构：

```text
agent-b/data/yolo_plate_dataset/
  plate.yaml
  images/train|val|test
  labels/train|val|test
```

## YOLOv8 检测训练

小样本 smoke training：

```bash
python agent-b/tools/train_yolo_plate.py ^
  --data agent-b/data/yolo_plate_dataset/plate.yaml ^
  --epochs 1 ^
  --batch 4 ^
  --device cpu ^
  --project agent-b/model/runs ^
  --name smoke_plate_yolov8n
```

本机已用 120 张小样本跑通 1 epoch，验证集 12 张，训练流程可用。正式训练时建议：

```bash
python agent-b/tools/prepare_ccpd.py --dataset-root "D:\车牌数据集\datasets" --limit 0 --materialize-yolo
python agent-b/tools/train_yolo_plate.py --epochs 30 --batch 16 --device 0
```

训练完成后，脚本会尝试把 `best.pt` 复制到：

```text
agent-b/model/weights/plate_yolov8n.pt
```

## PaddleOCR 集成方式

默认 API 使用 `MockPlateRecognizer`，保证课堂演示和整合链路稳定。设置环境变量后会切到 YOLOv8 + PaddleOCR 真实识别骨架：

```bash
set PLATE_YOLO_WEIGHTS=agent-b/model/weights/plate_yolov8n.pt
cd agent-b
python -m uvicorn api.main:app --host 127.0.0.1 --port 8002
```

真实识别流程位于 `api/recognizer.py`：

1. YOLOv8 检测车牌框。
2. 裁剪车牌区域。
3. PaddleOCR 识别字符。
4. 调用 `plate_rules.py` 规范化、校验和解析车牌。
5. 返回统一的 `plate / plate_type / location / confidence`。

检测 + 识别联调 smoke test（主 Python 环境）：

```bash
python agent-b/tools/smoke_infer_plate.py ^
  --manifest agent-b/data/generated/ccpd_manifest.jsonl ^
  --weights agent-b/model/weights/plate_yolov8n.pt ^
  --max-images 80
```

当前本机已验证 YOLO 小样本权重能检出车牌框；主 Python 3.13 环境中 `paddleocr==3.7.0` 和 `paddlepaddle==3.3.1` 已安装，官方 OCR 模型也已下载到本机缓存。但 Windows + Python 3.13 + PaddlePaddle 3.3.1 CPU 运行路径会在 OCR 推理时报 Paddle runtime `NotImplementedError`，脚本会明确标记并回退到 manifest 真值继续验证检测和规则链路：

```json
{
  "ocr_status": "paddleocr_runtime_error:NotImplementedError",
  "fallback_used": true
}
```

真实 OCR 已在本机 `E:\anaconda\envs\text` 的 Python 3.9 环境跑通，依赖组合为 `paddleocr==2.7.3`、`paddlepaddle==2.6.2`、`numpy==1.26.4`。验证命令：

```bash
E:\anaconda\envs\text\python.exe agent-b/tools/smoke_ocr_plate.py --manifest agent-b/data/generated/ccpd_manifest.jsonl --index 1
```

验证结果示例：

```json
{
  "expected_plate": "皖AD12238",
  "ocr_text": "皖A·D12238",
  "normalized": "皖AD12238",
  "valid": true,
  "plate_type": "绿牌"
}
```

因此，当前推荐策略是：主项目服务继续使用 mock/YOLO 检测保证整合演示稳定；真实 OCR 训练和验收使用 Python 3.9 的 `text` 环境。

## 接口示例

### 车牌识别

```http
POST /api/plate/infer
Content-Type: application/json

{
  "image": "<base64>"
}
```

响应：

```json
{
  "status": "ok",
  "result": {
    "plate": "京A12345",
    "plate_type": "蓝牌",
    "location": "北京",
    "confidence": 0.97
  },
  "latency_ms": 1.2
}
```

### 车牌归属信息

```http
POST /api/plate/tools/plate_info
Content-Type: application/json

{
  "params": {
    "plate": "京A·12345"
  }
}
```

响应：

```json
{
  "status": "ok",
  "data": {
    "plate": "京A12345",
    "location": "北京市",
    "plate_type": "蓝牌",
    "vehicle_type": "小型汽车",
    "is_new_energy": false
  }
}
```

## 后续替换真实模型的位置

真实模型链路已经封装在 `api/recognizer.py`，建议保留当前工具接口不变，这样 Orchestrator 和前端不需要跟着改。

## 验收标准

- 健康检查返回 `status: ok`。
- `infer` 响应满足 `CONTRACT.md` 的推理格式。
- 三个工具接口都返回 `{ "status": "ok", "data": ... }`。
- 蓝牌、小型新能源绿牌、大型新能源绿牌均可正确解析。
- 非法车牌输入返回 HTTP 400。
- Orchestrator 可以通过 `detect_plate`、`query_plate_info`、`check_violation`、`query_vehicle_history` 完成整合调用。

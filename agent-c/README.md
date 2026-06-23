# Agent C - 车况检测与维修建议服务

Agent C 提供车辆外观损伤检测、损伤诊断、维修方案和保险建议。服务端口固定为 `8003`。

## 目录

```text
agent-c/
├── api/server.py
├── model/
├── tools/
├── knowledge_base/
├── train/train.py
├── tests/test_api.py
├── TOOLS_SCHEMA.md
└── requirements.txt
```

## 数据集

当前项目根目录下的 `archive/data1a` 是 Kaggle Car Damage Detection 的二分类版本：

- `00-damage`
- `01-whole`

训练脚本会自动读取：

```text
archive/data1a/training
archive/data1a/validation
```

`archive/` 属于本地数据集目录，已在 `.gitignore` 中排除，不应提交到 GitHub。

## 训练

在 PyCharm 已配置的 Python 环境中运行：

```bash
cd C:\Users\86139\Desktop\intelligent-vehicle-archive\agent-c
python train\train.py --data-root ..\archive\data1a --epochs 3 --batch-size 16
```

训练完成后会生成：

```text
agent-c/model/weights/damage_efficientnet_b3.pt
```

权重文件不建议提交到 GitHub。如需共享模型，单独通过 Release、网盘或模型仓库交付。

## 启动 API

```bash
cd C:\Users\86139\Desktop\intelligent-vehicle-archive\agent-c
uvicorn api.server:app --host 0.0.0.0 --port 8003
```

健康检查：

```bash
curl http://127.0.0.1:8003/api/damage/health
```

## API

- `GET /api/damage/health`
- `POST /api/damage/infer`
- `POST /api/damage/tools/diagnose`
- `POST /api/damage/tools/repair`
- `POST /api/damage/tools/insurance`

## 测试

```bash
cd C:\Users\86139\Desktop\intelligent-vehicle-archive\agent-c
pytest tests
```

测试不依赖已训练权重；没有权重时，推理接口会返回 `normal` 的降级结果，以保证契约可用。

## 说明

当前数据集只有 `damage/whole` 二分类标签，无法从数据本身学习 16 个细粒度损伤类型。当前实现做了兼容：

- `01-whole` 映射为 `normal`
- `00-damage` 暂映射为 `scratch_front_bumper`
- 严重程度根据模型置信度估算

如果后续补充按合同枚举命名的细粒度目录，训练脚本仍可读取这些目录名，服务会直接输出对应条件标签。


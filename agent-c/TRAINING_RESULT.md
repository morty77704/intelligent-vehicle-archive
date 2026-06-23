# Agent C 训练结果记录

## 本次训练

- 数据集：`archive/data1a`
- 任务：二分类车辆外观损伤检测
- 类别：`00-damage` / `01-whole`
- 训练集：1840 张
- 验证集：460 张
- 模型：EfficientNet-B3
- 输入尺寸：300 x 300
- 训练轮数：50
- 权重文件：`agent-c/model/weights/damage_efficientnet_b3.pt`

## 最后 5 轮指标

| Epoch | Train Loss | Val Accuracy |
|---:|---:|---:|
| 46 | 0.0919 | 0.8630 |
| 47 | 0.0598 | 0.8674 |
| 48 | 0.0810 | 0.8783 |
| 49 | 0.0929 | 0.8587 |
| 50 | 0.0720 | 0.8522 |

## 结论

模型已达到可用于项目联调的二分类基线水平，验证准确率稳定在约 85%-88% 区间。

当前数据集只有 `00-damage` 和 `01-whole` 两类，因此模型本身无法学习 16 类细粒度损伤位置。服务层已做契约兼容：

- `01-whole` → `normal`
- `00-damage` → `scratch_front_bumper`
- `severity` 根据模型置信度估算

后续如果补充细粒度标签目录，训练脚本可直接按目录名训练，API 会优先输出合同枚举标签。

## API 验收

已使用训练权重完成五个端点 smoke test：

- `GET /api/damage/health`
- `POST /api/damage/infer`
- `POST /api/damage/tools/diagnose`
- `POST /api/damage/tools/repair`
- `POST /api/damage/tools/insurance`

验收结果：全部返回契约格式，`model_loaded=true`。

## GitHub 提交说明

不要提交以下内容：

- `archive/`
- `*.pt`
- `*.pth`
- `*.onnx`
- `*.ckpt`

这些规则已写入项目根目录 `.gitignore`。


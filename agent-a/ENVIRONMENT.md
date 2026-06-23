# Agent A — 训练环境说明

## 硬件

| 项目 | 配置 |
|------|------|
| GPU | NVIDIA GeForce RTX 4060 Laptop GPU |
| VRAM | 8.6 GB |
| CUDA | 12.6 |
| Driver | 591.44 |

## Python 环境

| 包 | 版本 |
|----|------|
| Python | 3.13.5 (Miniconda, AMD64) |
| torch | 2.12.1+cu126 |
| torchvision | 0.27.1+cu126 |
| fastapi | 0.138.0 |
| uvicorn | 0.49.0 |
| Pillow | 12.2.0 |
| numpy | 2.4.4 |
| scipy | 1.17.1 |
| tqdm | 4.67.1 |
| scikit-learn | 1.9.0 |
| pandas | 2.3.3 |
| matplotlib | 3.10.6 |

## 安装

```bash
# 方式一：一键安装
cd agent-a
pip install -r requirements.txt

# 方式二：GPU 版 PyTorch 需指定索引
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
pip install -r requirements.txt
```

## 训练参数

| 参数 | 值 |
|------|-----|
| 模型 | EfficientNet-B3 (pretrained ImageNet) |
| 数据集 | Stanford Cars (8144张, 196类) |
| 图像尺寸 | 300×300 |
| Batch Size | 32 |
| Epochs | 50 |
| 学习率 | 1e-4 (AdamW, weight_decay=1e-4) |
| 调度器 | CosineAnnealingLR |
| 混合精度 | AMP (GradScaler) |
| 训练/验证 | 85/15 split (seed=42) |
| 最佳准确率 | 90.25% (epoch 48) |

## 模型文件

| 文件 | 大小 | 说明 |
|------|------|------|
| `model/best.pt` | 126.6 MB | 最佳模型 (val_acc=0.9025) |
| `model/classes.txt` | 5.5 KB | 196 类名称列表 |
| `model/report.txt` | 18.9 KB | 分类报告 |

## 复现步骤

```bash
# 1. 安装依赖
pip install -r requirements.txt
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126

# 2. 准备数据集（Stanford Cars）
#    解压到 agent-a/data/ 下，确保结构为：
#    data/cars_train/  data/cars_test/  data/devkit/

# 3. 训练
python train.py --epochs 50 --batch_size 32

# 4. 启动 API
python api/main.py

# 5. 验证
python test_api.py
```

# PROGRESS — 智能车辆档案系统

> 每个 [ ] 完成后打 [x]，跨会话不丢失进度。

---

## Agent A — 车型识别 (member-a)

### 模型
- [ ] 下载 Stanford Cars / CompCars 数据集
- [ ] 数据预处理 + 标注格式统一
- [ ] EfficientNet-B3 / ResNet50 基线训练
- [ ] 模型调优（准确率 ≥ 85%）
- [ ] 模型导出（.pt / .onnx）

### API (FastAPI, 端口 8001)
- [ ] `GET /api/vehicle/health` 健康检查
- [ ] `POST /api/vehicle/infer` 车型推理
- [ ] `POST /api/vehicle/tools/params` 参数查询
- [ ] `POST /api/vehicle/tools/price` 估价

### 工具
- [ ] `query_vehicle_params` 实现（车型参数数据整理）
- [ ] `estimate_market_price` 实现（估价逻辑）

### 测试
- [ ] API 契约测试（对照 CONTRACT.md）

---

## Agent B — 车牌识别 (member-b)

### 模型
- [x] 下载 CCPD 数据集
- [x] 数据预处理
- [x] YOLOv8 车牌检测训练
- [x] PaddleOCR 字符识别集成
- [x] 端到端测试（检测 + 识别联调）

### API (FastAPI, 端口 8002)
- [x] `GET /api/plate/health` 健康检查
- [x] `POST /api/plate/infer` 车牌推理
- [x] `POST /api/plate/tools/plate_info` 归属信息
- [x] `POST /api/plate/tools/violation` 违章查询
- [x] `POST /api/plate/tools/history` 年检/维保

### 工具
- [x] `query_plate_info` 实现（车牌编码规则解析）
- [x] `check_violation` 实现（模拟数据）
- [x] `query_vehicle_history` 实现（模拟数据）

### 测试
- [x] API 契约测试（对照 CONTRACT.md）

---

## Agent C — 车况检测 (member-c)

### 模型
- [ ] 下载 Car Damage Detection 数据集
- [ ] 数据预处理 + 标签映射
- [ ] 多标签分类模型训练
- [ ] 模型调优

### API (FastAPI, 端口 8003)
- [ ] `GET /api/damage/health` 健康检查
- [ ] `POST /api/damage/infer` 车况推理
- [ ] `POST /api/damage/tools/diagnose` 损伤诊断
- [ ] `POST /api/damage/tools/repair` 维修方案
- [ ] `POST /api/damage/tools/insurance` 保险建议

### 工具
- [ ] `diagnose_damage` 实现（维修知识库）
- [ ] `estimate_repair` 实现（费用估算）
- [ ] `recommend_insurance` 实现（理赔建议）

### 测试
- [ ] API 契约测试（对照 CONTRACT.md）

---

## Orchestrator — LLM 调度层

- [x] Node.js + Express 项目初始化
- [x] DeepSeek API Function Calling 集成
- [x] 工具注册表（汇总三个 agent 的 tool definitions）
- [x] `POST /api/analyze` 主入口实现
- [x] 三模型并行调用 + 结果合并
- [x] SSE 流式响应
- [x] 档案存储（JSON 文件）

---

## Frontend — Web 前端

- [x] 图片上传/拍照组件
- [x] 档案展示页面
- [ ] 对话交互界面
- [x] 与 orchestrator SSE 对接
- [x] 响应式布局

---

## 集成测试

- [x] 三服务同时启动验证
- [x] 端到端：拍照 → 三模型 → LLM 整合 → 档案展示
- [x] 错误处理：单个模型挂掉时降级输出
- [x] 性能：总响应时间 < 15 秒

---

## 文档 & 答辩

- [ ] 实验报告
- [ ] 答辩 PPT
- [ ] 演示视频/录屏

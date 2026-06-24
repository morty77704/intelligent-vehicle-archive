# 页面定义

## 页面 1：分析页 (analysis-view)

### 组件树
```
analysis-view
├── header (标题 + 副标题)
├── upload-section
│   ├── upload-area (虚线框拖拽区，300px×200px)
│   │   ├── placeholder (图标 + 文字)
│   │   └── preview-img (上传后显示)
│   └── upload-actions
│       ├── btn-retake (重新拍照)
│       └── btn-analyze (开始分析)
├── progress-section (分析时显示，默认隐藏)
│   ├── progress-bar → progress-fill
│   └── progress-steps (5 步骤列表)
├── result-section (档案展示，默认隐藏)
│   ├── report-card (Markdown 渲染)
│   └── btn-new (分析新车)
└── nav-history-link (查看历史 →)
```

### 状态机
```
idle → (选择图片) → preview → (点击分析) → analyzing → (SSE完成) → result
                                                    → (SSE错误) → idle + alert
result → (点击分析新车) → idle
```

---

## 页面 2：历史页 (history-view)

### 组件树
```
history-view
├── top-bar
│   ├── btn-back (← 返回)
│   └── title (📋 历史档案)
├── history-list
│   └── history-item × N
│       ├── time (时间)
│       ├── preview (首行摘要)
│       └── delete-btn (悬停显示)
└── history-detail (点击展开，覆盖列表)
    ├── btn-back-list (← 返回列表)
    └── detail-content (Markdown 渲染)
```

### 状态机
```
list → (点击卡片) → detail → (点击返回) → list
list → (点击返回按钮) → 分析页
```

## 视图切换

两个视图通过 `display: none/block` 切换，不涉及 DOM 销毁。切换动画：淡入淡出 300ms。

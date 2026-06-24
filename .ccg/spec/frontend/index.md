# 前端设计规范

## 技术边界

| 项目 | 选型 | 原因 |
|------|------|------|
| 框架 | 原生 HTML/CSS/JS | 不引入构建工具，直接运行 |
| 动画 | GSAP 3 (CDN) | gsap-core + scrollTrigger |
| Markdown | marked.js (CDN) | 渲染档案报告 |
| 路由 | 无 | 单页切换，不超 2 个视图 |
| 状态 | 无框架 | 全局变量 + DOM 切换 |
| 存储 | localStorage | 仅缓存当前视图状态 |

## 不做的事

- 不用 React/Vue 等框架
- 不做用户登录/鉴权
- 不处理 AI 调度逻辑
- 不做移动端深度适配
- 不做 PWA/Service Worker
- 不直接调 Agent A/B/C 的 API

## 依赖的外部接口

| 接口 | 方法 | 用途 |
|------|------|------|
| `/api/analyze` | POST | 发送 `{image, query}`，接收 SSE 流 |
| `/api/archive` | GET | 获取历史列表 |
| `/api/archive/:id` | GET | 获取单条详情 |

## 文件结构

```
frontend/
├── index.html    # 单页面，包含分析页 + 历史页两个视图
├── style.css     # 全局样式 + GSAP 动画预备
└── app.js        # 上传、SSE、GSAP 动画、页面切换
```

## 兼容目标

- Chrome / Edge 最新版
- Firefox 最新版
- 桌面端优先 (max-width: 880px)
- 移动端基本可用但不做专门优化

# GSAP 动画规范

## 加载 CDN

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
```

只用 `gsap-core`，不需要 ScrollTrigger（历史列表用 CSS transition 即可，避免复杂度）。

---

## 动画清单

### A1. 分析页入场
- **触发**：页面加载 / 从历史页切回
- **效果**：
  - header: `gsap.from(y: -30, opacity: 0, duration: 0.5, ease: power2.out)`
  - upload-section: `gsap.from(y: 30, opacity: 0, duration: 0.5, delay: 0.1, ease: power2.out)`

### A2. 图片预览入场
- **触发**：选择图片后
- **效果**：
  - preview-img: `gsap.from(scale: 0.9, opacity: 0, duration: 0.3, ease: back.out(1.5))`
  - upload-actions: `gsap.from(y: 10, opacity: 0, duration: 0.25)`

### A3. 分析启动过渡
- **触发**：点击"开始分析"
- **效果**：
  - upload-section + result-section 同时 fadeOut (0.2s)
  - progress-section fadeIn (0.3s)
  - 使用 Timeline 控制顺序

### A4. 进度步骤动画
- **触发**：SSE 推送 step 事件
- **效果**：
  - 当前步骤 dot: `scale: 1→1.3→1` 脉冲 (repeat: -1)
  - 完成步骤 dot: `scale: 1→1.5→1` 弹跳一次 + 颜色从灰变绿
  - 步骤文字: 颜色渐变 `#6B7280 → #059669`
  - progress-fill: 宽度平滑过渡 `duration: 0.4, ease: power2`

### A5. 档案报告入场
- **触发**：SSE 推送 report 事件
- **效果**：
  - progress-section fadeOut (0.2s)
  - result-section fadeIn (0.3s)
  - report-card: `gsap.from(y: 20, opacity: 0, duration: 0.5, ease: power3.out)`

### A6. 视图切换
- **触发**：点击导航按钮
- **效果**：
  - 当前视图: `opacity: 1→0, duration: 0.2`
  - 目标视图: `opacity: 0→1, duration: 0.2, delay: 0.15`

### A7. 历史列表入场
- **触发**：进入历史页
- **效果**：
  - 历史卡片 stagger 入场: `gsap.from(y: 20, opacity: 0, stagger: 0.05, duration: 0.3)`

### A8. 按钮交互
- **触发**：hover / click
- **效果**：
  - hover: `scale: 1.03, duration: 0.15`
  - click: `scale: 0.97, duration: 0.1`

---

## 性能约束

- 所有动画 duration ≤ 0.5s
- 不连续触发 3 个以上动画
- 不使用 ScrollTrigger（减少依赖）
- `will-change` 仅用于动画中的元素，动画结束后清除

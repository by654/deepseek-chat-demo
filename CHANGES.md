---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: ea8514a2b017d866bf69dc690a6820b6_0165ab15e41b11f18b4e525400248c00
    ReservedCode1: X5Z/YZF9GJn9failNmTNq8sPAGlHL7t810iPBQW/Pec3PCzHH1zhbYHGkcZqFwY6tGNQFjyJX2YpLUzvbtnAYTJxpGeKgx/8Hib0WJYdf1bze9DSCE07XVxKIIoldPpoFe0a4uWN+4Ary1BjaNMhccIUHQIr7Je7FjAEPZDdQPLldBqRG9UrmH2afKg=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: ea8514a2b017d866bf69dc690a6820b6_0165ab15e41b11f18b4e525400248c00
    ReservedCode2: X5Z/YZF9GJn9failNmTNq8sPAGlHL7t810iPBQW/Pec3PCzHH1zhbYHGkcZqFwY6tGNQFjyJX2YpLUzvbtnAYTJxpGeKgx/8Hib0WJYdf1bze9DSCE07XVxKIIoldPpoFe0a4uWN+4Ary1BjaNMhccIUHQIr7Je7FjAEPZDdQPLldBqRG9UrmH2afKg=
---

# 界面重写与美化说明（CHANGES）

本项目基于 DeepSeek 官方开源 `chat-demo` 静态前端（上游源码 `temp/chat-demo-main`）重写展示层。
本次改动**只涉及样式与构建脚本**，`src/services/` 下的全部业务逻辑、API 端点、SSE 解析、IndexedDB 存储、
会话分支、导入导出、语音朗读等能力保持原样，未改动任何 `.tsx` / `.ts` 源码文件。

## 1. 总体设计方向

| 维度 | 上游 | 现在 |
| --- | --- | --- |
| 主色 | 明快蓝（DeepSeek 蓝） | 青灰蓝 `#2f6b7a`（深色态 `#6fb0be`），与产品调性更克制 |
| 中性色 | 纯灰 | 带轻微青调的板岩灰，暖冷平衡，长文本阅读更舒适 |
| 层次 | 依赖边框区分 | 边框 + 极淡投影 + 背景色阶三重层次，浮层用 `--ui-shadow-lg` |
| 圆角 | 8 / 12px 混用 | 统一令牌体系：6 / 10 / 14 / 18 / 24 / pill |
| 控件高度 | 30~38px | 32 / 36 / 40 / 44px（主输入、发送按钮等触控目标 ≥ 40px） |
| 动效 | 少量 fade | 统一 `--ds-ease-out` 与 `--ds-transition-duration`，侧栏/面板/悬浮层入场过渡 |

所有颜色、圆角、间距、动效均改为令牌引用，组件 CSS 中不再出现硬编码色值，深色与浅色两套主题
共用同一套结构样式，仅切换 `body[data-ds-dark-theme]` 下的令牌值。

## 2. 令牌层（新增 / 重写）

- `src/app/theme.css`：完整重写。保留上游全部 `--dsw-*` 变量名（组件依赖这些键名），
  但取值改为新色系，并新增一层语义令牌 `--ui-*`（`--ui-brand`、`--ui-text-1/2/3`、
  `--ui-border`、`--ui-bg-surface/elevated/subtle`、`--ui-danger-*`、`--ui-overlay`、
  `--ui-tooltip-text`、`--ui-radius-*`、`--ui-shadow-*` 等），新旧令牌通过映射层对接，
  保证既有组件无需改名即可套用新皮肤。
- `src/app/global.css`：重写滚动条、选中态、焦点环、`::selection`、字体平滑与代码字体栈；
  滚动条改为细窄圆角条，暗色态独立配色。
- `src/app/App.module.css`：应用骨架改为侧栏 + 主区的圆角卡片式布局，侧栏与画布之间有
  明确的背景色差与 1px 分隔，移动端断点下自动收起。

## 3. 组件样式明细（26 个 CSS 文件）

### 布局与导航
- `src/app/App.module.css`：外壳、主区容器、移动端下拉层、滚动容器节奏。
- `src/components/sider/Sider.module.css`：侧栏宽度节奏、分组标题、底部设置区、折叠态。
- `src/components/sider/SessionItem.module.css`：会话条目改为圆角行式，悬停/选中用品牌色淡底，
  选中态左侧品牌色竖条，操作按钮默认隐藏、悬停渐显。
- `src/components/session/SessionView.module.css`、`MobileHeader.module.css`、
  `Welcome.module.css`：欢迎标题字号与字距、副标题层次、移动端顶栏高度与毛玻璃。
- `src/components/messages/MessageList.module.css`：消息流最大宽度、留白节奏与滚动阴影。

### 对话内容
- `src/components/messages/UserMessage.module.css`：气泡改为品牌淡底 + 右下角小圆角，
  内边距与行高重算，长文本换行更自然。
- `src/components/messages/AssistantMessage.module.css`：去掉重边框，改为纯文本流式排版，
  操作条（复制/朗读/重新生成）悬停渐显。
- `src/components/messages/ReplyArea.module.css`：思考/工具调用时间线重做——渐隐竖轨、
  品牌色脉冲圆点、耗时标题胶囊悬停底、工具页签胶囊（失败态用中性灰而非刺眼红）。
- `src/components/messages/BranchSwitcher.module.css`（沿用上游，仅通过令牌变化生效）。
- `src/components/messages/MessageFile.module.css`（沿用上游，仅令牌变化生效）。

### 输入区
- `src/components/chatInput/ChatInput.module.css`：输入卡片圆角 18~24px、聚焦时品牌色描边 +
  柔和投影、工具栏分组间距、发送按钮为品牌色实心圆角方形，禁用态降透明度。
- `src/components/files/FileCard.module.css`：附件卡片重写，圆角 14px，悬停品牌色描边 +
  轻投影，失败态用 `--ui-danger-soft` 底 + 危险色文字，删除按钮改为圆形悬浮按钮。

### Markdown 渲染
- `src/components/markdown/markdown.css`：整表重写。标题字距收紧、`h2` 左侧品牌色竖线、
  列表标记品牌色、引用块改为带底色的左侧竖线卡片、表格包圆角边框 + 表头浅底 + 行悬停、
  分隔线改为两端渐隐、行内代码胶囊化（等宽 + 浅底 + 品牌色字）、代码块 14px 圆角 + 1px 边框、
  引用角标（citation）胶囊化并加悬停反馈。
- `src/components/markdown/CodeBlock.module.css`：头部栏高度/字重/复制按钮圆角与悬停。

### 检索与浮层
- `src/components/search/SearchPanel.module.css`：面板宽度计算修正（原 `calc(50vw-4rem)`
  缺空格导致失效，现为 `calc(50vw - 4rem)`），面板改用 surface 底 + 入场位移动画，
  列表项圆角与悬停底色重设。
- `src/components/search/HoverCard.module.css`：浮层圆角 18px、统一边框与 `--ui-shadow-lg`，
  增加 120ms 入场动画。
- `src/components/base/Button.module.css`、`IconButton.module.css`、`Modal.module.css`、
  `Menu.module.css`、`Select.module.css`、`Toast.module.css`、`Tooltip.module.css`：
  基础控件统一尺寸档位、圆角、聚焦环、悬停/按下反馈；弹窗改为 30px 圆角 + 大投影，
  遮罩统一 `--ui-overlay`；菜单/下拉浮层统一 14px 圆角与 6px 内边距。
- `src/components/settings/Settings.module.css`：设置弹窗改为分栏布局，字段标签与说明层次
  清晰，API Key 输入与操作按钮区重排，危险操作（清空数据）使用危险色弱化处理。

## 4. 构建适配（唯一非样式改动）

- `package.json`：`build` 脚本由 `rm -rf dist && NODE_ENV=production rspack build -c rspack.config.ts`
  改为 `node scripts/build.mjs`。原命令依赖 POSIX shell，在 Windows 下会直接失败；
  新脚本用 Node 清理 `dist`、注入 `NODE_ENV=production` 后调用 rspack，
  三平台行为一致。`dev` / `type` / `lint` / `format` 脚本未改。
- `scripts/build.mjs`（新增）：跨平台构建入口，失败时透传非零退出码。
- `rspack.config.ts` 未改动：`output.clean = true` 负责产物清理，
  `CopyRspackPlugin` 继续把根目录 `LICENSE` 复制为 `dist/LICENSE`。

## 5. 未改动清单（功能一致性保障）

- `src/services/**`：API 客户端、SSE 解析、附件上传、语音、IndexedDB、会话/分支/草稿、
  历史导入导出、Markdown 解析、i18n、设置读写——逐字节未改。
- `src/app/App.tsx`、`theme.ts`、`viewport.ts`、`main.tsx`：未改。
- `src/components/**/*.tsx`：未改（仅同名 `*.module.css` 重新实现）。
- API 端点、请求体结构、`__API_ORIGIN__` 注入值、i18n 文案键：未改。

## 6. 验证记录

- `pnpm install`：成功（pnpm 9.15.9 / Node v22.12.0）。
- `pnpm build`：`Rspack compiled successfully`，产物含 `index.html`、`static/css`、`static/js`、`LICENSE`。
- `pnpm type`：`tsc -p tsconfig.json` 退出码 0。
- 样式一致性自检：脚本比对全部 `*.module.css` 定义的类名与 `*.tsx` 中 `styles.*` 引用，
  无缺失类名；全站 `var(--*)` 引用均可在令牌层或组件局部变量中找到定义
  （`--app-viewport-height`、`--app-viewport-top` 由 `viewport.ts` 运行时写入，已带兜底值）。
- 渲染自检：本地无头浏览器（Edge headless）截图，浅色/深色主题下侧栏、欢迎区、输入区、
  设置弹窗布局完整，无溢出与错位。

## 7. 本地运行

```bash
pnpm install
pnpm dev     # 开发服务器，默认 8090
pnpm build   # 产出 dist，可直接静态托管
```


## 修复记录：移动端设置弹窗高度（2026-11-19）

### 问题
390x844 视口下设置弹窗被强制拉满至 786px（占视口 93%），内容仅占上部，底部留白 197px（约 25%）。

### 根因
`src/components/settings/Settings.module.css` 移动端媒体查询中 `.dialog { height: calc(100% - 56px) }` 把卡片高度锁死为视口高度减 56px，且 `.dialogMain` / `.content` 均为 `flex-basis: 0` 的撑满式布局，内容不足时不会回缩。

### 改动（仅样式层，未改动任何 tsx / services）
- `.dialog`（移动端）：`height: calc(100% - 56px)` → `height: auto`；最大高度改为 `max-height: calc(100dvh - 56px)` 并叠加 `max-height: min(calc(100dvh - 56px), 820px)`（前者为旧浏览器回退）。
- `.dialogMain`（移动端）：新增 `flex: 0 1 auto; min-height: 0`，不再以 flex-basis:0 撑满卡片，改为内容驱动、超限时可收缩。
- `.content`（移动端）：新增 `flex: 0 1 auto`，配合既有 `overflow-y: auto` 与 `min-height: 0`，内容超高时在面板内部滚动。
- 桌面端（≥768px）规则未做任何修改。

### 实测（Headless Edge + CDP，DOM 几何度量）
| 视口 / 场景 | 弹窗尺寸 | 占视口 | 底部留白 | 内部滚动 |
|---|---|---|---|---|
| 390x844 通用设置 | 390x618.8 | 73.3% | 16px（原 197px） | 不需要（内容 470px） |
| 390x844 数据管理 | 390x531.0 | 62.9% | 16px | 不需要（内容 382px） |
| 390x600 通用设置（压力测试） | 390x544.0 | 90.7%（触达 max-height 上限） | 内容溢出 | 生效，scrollTop 75 = max 75，末项可见于 583.8 |
| 1440x900 桌面 | 780x512 | 56.9% | 27px | 不需要（与会修改前一致） |

弹窗仍贴底、顶部圆角为抽屉样式；`documentElement.scrollWidth == clientWidth`（390 / 1440），无横向溢出。

### 构建
`pnpm build` → `Rspack compiled successfully in 1.40 s`；产物 `dist/static/css/main.3785790c.css`（96,428 B）已包含新规则。
*（内容由AI生成，仅供参考）*

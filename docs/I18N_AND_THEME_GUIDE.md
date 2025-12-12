# 多语言和多主题功能使用指南

## 功能概览

本项目已成功集成**多语言**和**多主题**功能，提供更好的用户体验。✅ **全系统支持** - 所有页面和组件都已完整集成。

## 📍 位置

设置按钮位于：
- **首页右上角** - 项目列表页面
- **项目编辑页面顶栏** - 项目标题旁边

✨ 设置是全局的，在任何页面切换主题或语言都会立即生效并同步到所有页面！

## 🌐 多语言支持

### 支持的语言
- **简体中文** (zh-CN) - 默认语言
- **English** (en)

### 使用方式
1. 点击首页右上角的设置按钮（⚙️图标）
2. 在"语言"部分选择您想要的语言
3. 界面将立即切换到所选语言
4. 语言设置会保存在本地，下次访问时会自动恢复

### 扩展新语言
如需添加新语言，只需：
1. 在 [src/locales/](src/locales/) 目录下创建新的语言文件（如 `ja.json`）
2. 复制 [zh-CN.json](src/locales/zh-CN.json) 的结构并翻译内容
3. 在 [src/components/providers/I18nProvider.tsx](src/components/providers/I18nProvider.tsx) 中注册新语言

## 🎨 多主题支持

### 支持的主题
- **浅色模式** (Light) - 白天使用的明亮主题
- **深色模式** (Dark) - 夜间使用的暗黑主题（默认）
- **跟随系统** (System) - 自动跟随操作系统主题设置

### 使用方式
1. 点击首页右上角的设置按钮（⚙️图标）
2. 在"主题"部分选择您想要的主题
3. 界面将平滑切换到所选主题
4. 主题设置会保存在本地，下次访问时会自动恢复

### 主题配色方案

**浅色模式**：
- 背景色：纯白 (#ffffff)
- 面板色：浅灰 (#f1f3f5)
- 强调色：紫色 (#7c3aed)

**深色模式**：
- 背景色：深黑 (#09090b)
- 面板色：暗灰 (#18181b)
- 强调色：亮紫 (#a855f7)

## 🛠️ 技术实现

### 使用的技术栈
- **next-themes**: 处理主题切换和系统主题检测
- **自定义 i18n 方案**: 轻量级国际化实现
- **Tailwind CSS**: 支持 `dark:` 前缀的样式切换
- **localStorage**: 持久化用户偏好设置

### 核心文件
- [src/components/providers/ThemeProvider.tsx](src/components/providers/ThemeProvider.tsx) - 主题提供者
- [src/components/providers/I18nProvider.tsx](src/components/providers/I18nProvider.tsx) - 国际化提供者
- [src/components/settings/SettingsPanel.tsx](src/components/settings/SettingsPanel.tsx) - 设置面板组件
- [src/locales/](src/locales/) - 翻译文件目录
- [tailwind.config.ts](tailwind.config.ts) - Tailwind 主题配置

### 已更新支持主题的组件

✅ **页面组件**：
- [src/app/page.tsx](src/app/page.tsx) - 首页
- [src/app/project/[id]/page.tsx](src/app/project/[id]/page.tsx) - 项目编辑页

✅ **布局组件**（共6个，234处样式更新）：
- [src/components/layout/LeftSidebar.tsx](src/components/layout/LeftSidebar.tsx) - 左侧栏（25处更改）
- [src/components/layout/RightPanel.tsx](src/components/layout/RightPanel.tsx) - 右侧面板（7处更改）
- [src/components/layout/AgentPanel.tsx](src/components/layout/AgentPanel.tsx) - Agent面板（29处更改）
- [src/components/layout/ProPanel.tsx](src/components/layout/ProPanel.tsx) - Pro面板（80处更改）
- [src/components/layout/Timeline.tsx](src/components/layout/Timeline.tsx) - 时间轴（49处更改）
- [src/components/canvas/InfiniteCanvas.tsx](src/components/canvas/InfiniteCanvas.tsx) - 画布（44处更改）

✅ **全局样式**：
- [src/app/globals.css](src/app/globals.css) - 支持浅色/深色滚动条
- [src/app/layout.tsx](src/app/layout.tsx) - 集成 ThemeProvider 和 I18nProvider


### 如何在组件中使用

**使用主题**：
```tsx
import { useTheme } from 'next-themes';

function MyComponent() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme('dark')}>
      切换到深色模式
    </button>
  );
}
```

**使用翻译**：
```tsx
import { useI18n } from '@/components/providers/I18nProvider';

function MyComponent() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div>
      <h1>{t('home.title')}</h1>
      <button onClick={() => setLocale('en')}>
        Switch to English
      </button>
    </div>
  );
}
```

## 📝 注意事项

1. **服务端渲染兼容性**：i18n Provider 已处理 SSR 水合问题，确保客户端和服务端渲染一致
2. **主题闪烁预防**：使用 `suppressHydrationWarning` 和 `disableTransitionOnChange` 防止主题切换时的闪烁
3. **翻译缺失处理**：如果翻译键不存在，会返回键本身作为后备显示

## 🚀 快速开始

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 访问 http://localhost:3000（或显示的端口）

3. 点击右上角的设置按钮测试功能

## 🎯 未来扩展

可以考虑添加：
- 更多语言支持（日语、韩语等）
- 更多主题变体（高对比度、护眼模式等）
- 字体大小调节
- 动画速度控制
- 无障碍辅助功能

---

**开发者**: 西羊石 AI
**更新时间**: 2025-12-03

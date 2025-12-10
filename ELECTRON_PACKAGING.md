# Electron 打包部署指南

## 📦 概述

Vibe Agent Pro 已配置为 Electron 桌面应用，支持 macOS、Windows 和 Linux 平台。本指南将帮助您构建、打包和发布应用。

## ✅ 已配置功能

### 1. 自动更新 (Auto-Update)
- ✅ 集成 `electron-updater`
- ✅ 自动检查更新（应用启动后 5 秒）
- ✅ 后台下载更新
- ✅ 退出时自动安装更新
- ✅ 通过 IPC 向前端发送更新状态

### 2. 用户数据持久化
- ✅ IndexedDB 数据存储在 `app.getPath('userData')`
- ✅ 更新时自动保留用户项目数据
- ✅ 创建备份目录 `userData/backups`
- ✅ 跨版本数据迁移

### 3. 平台支持
- ✅ macOS: DMG + ZIP
- ✅ Windows: NSIS 安装程序
- ✅ Linux: AppImage

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 终端 1: 启动 Next.js 开发服务器
npm run dev

# 终端 2: 启动 Electron (需要先运行上面的命令)
npx electron .
```

### 构建生产版本

```bash
# 1. 构建 Next.js 静态文件 + 编译 Electron TypeScript
npm run build:electron

# 2. 打包为 Electron 应用
npm run dist

# 生成的安装包在 dist/ 目录
```

## 📋 构建平台

### macOS
```bash
npm run dist -- --mac
```
生成文件:
- `dist/Vibe Agent Pro-{version}.dmg` (安装镜像)
- `dist/Vibe Agent Pro-{version}-mac.zip` (ZIP 压缩包)

### Windows
```bash
npm run dist -- --win
```
生成文件:
- `dist/Vibe Agent Pro Setup {version}.exe` (NSIS 安装程序)

### Linux
```bash
npm run dist -- --linux
```
生成文件:
- `dist/Vibe-Agent-Pro-{version}.AppImage`

### 构建所有平台
```bash
npm run dist -- --mac --win --linux
```

## 🔄 自动更新配置

### 发布到 GitHub Releases

1. **修改 package.json 中的发布配置**:
```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-github-username",
      "repo": "video-agent-pro"
    }
  }
}
```

2. **创建 GitHub Personal Access Token**:
   - 访问 https://github.com/settings/tokens
   - 生成 token (需要 `repo` 权限)
   - 设置环境变量:
     ```bash
     export GH_TOKEN="your_github_token"
     ```

3. **构建并发布**:
```bash
npm run dist -- --publish always
```

### 其他发布选项

#### Amazon S3
```json
{
  "publish": {
    "provider": "s3",
    "bucket": "your-bucket-name",
    "region": "us-east-1"
  }
}
```

#### 通用 HTTP 服务器
```json
{
  "publish": {
    "provider": "generic",
    "url": "https://your-server.com/updates"
  }
}
```

## 🗂 用户数据位置

用户的项目数据（IndexedDB）存储在以下位置：

- **macOS**: `~/Library/Application Support/Vibe Agent Pro/`
- **Windows**: `%APPDATA%\Vibe Agent Pro\`
- **Linux**: `~/.config/Vibe Agent Pro/`

这些数据在应用更新时**不会被删除**，确保用户项目的持久性。

## 🔧 高级配置

### 代码签名 (macOS)

1. 获取 Apple Developer 证书
2. 配置 `package.json`:
```json
{
  "build": {
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

3. 公证 (Notarization):
```bash
export APPLE_ID="your@email.com"
export APPLE_ID_PASSWORD="app-specific-password"
npm run dist -- --mac
```

### 代码签名 (Windows)

1. 获取代码签名证书 (.pfx 文件)
2. 配置环境变量:
```bash
export WIN_CSC_LINK="path/to/certificate.pfx"
export WIN_CSC_KEY_PASSWORD="certificate_password"
```

3. 构建:
```bash
npm run dist -- --win
```

## 📊 版本管理

### 更新版本号

```bash
# 修改 package.json 中的 version
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.1 -> 0.2.0
npm version major  # 0.2.0 -> 1.0.0
```

### 发布新版本流程

1. 更新版本号
2. 提交代码并打 tag
   ```bash
   git add .
   git commit -m "Release v1.0.0"
   git tag v1.0.0
   git push origin main --tags
   ```
3. 构建并发布
   ```bash
   npm run dist -- --publish always
   ```
4. 用户打开应用时会自动检测到新版本并下载

## 🎨 自定义应用图标

将图标文件放置在 `build/` 目录:

- **macOS**: `build/icon.icns` (1024x1024)
- **Windows**: `build/icon.ico` (256x256)
- **Linux**: `build/icon.png` (512x512)

## 🐛 调试

### 查看 Electron 日志

**开发模式**:
- 主进程日志: 终端输出
- 渲染进程日志: 打开 DevTools (自动开启)

**生产模式**:
```bash
# macOS/Linux
~/Library/Logs/Vibe Agent Pro/main.log
~/.config/Vibe Agent Pro/logs/main.log

# Windows
%USERPROFILE%\AppData\Roaming\Vibe Agent Pro\logs\main.log
```

### 常见问题

#### 1. 更新不工作
- 检查 GitHub token 是否正确
- 确认 `publish` 配置正确
- 检查版本号是否递增

#### 2. 打包失败
- 清理缓存: `rm -rf dist out electron/dist`
- 重新安装依赖: `npm ci`

#### 3. 代码签名失败
- 检查证书是否过期
- 确认环境变量设置正确

## 📚 相关资源

- [electron-builder 文档](https://www.electron.build/)
- [electron-updater 文档](https://www.electron.build/auto-update)
- [Electron 官方文档](https://www.electronjs.org/)

## 💡 最佳实践

1. **测试更新流程**: 在发布前测试自动更新
2. **版本控制**: 遵循语义化版本规范
3. **备份数据**: 提示用户定期备份项目
4. **日志记录**: 保留详细的错误日志
5. **用户通知**: 更新下载完成后提示用户重启

## 🔐 安全建议

1. 不要将 API 密钥硬编码在代码中
2. 使用环境变量或安全存储（如 keytar）
3. 对敏感数据加密
4. 启用代码签名防止篡改
5. 定期更新依赖包修复安全漏洞

---

**注意**: 用户的所有项目数据都存储在 `userData` 目录中，应用更新不会影响这些数据。

# Pixel & Toon Studio · v1.0

本机照片清晰化与艺术风格编辑器。支持 HEIC / HEIF、PNG、JPEG、WebP 导入、八种艺术风格、智能调色、拍立得相框、原图对比、撤销重做、工作区恢复和高清 PNG 导出。照片和模型均在本机处理，无需账号或 API Key。

版本号统一为 **1.0.0**，Git 标签为 **v1.0**，作为后续开发的新起点。

## Mac 安装

打开 `release/Pixel-Toon-Studio-1.0.0-arm64.dmg`，将软件拖入「应用程序」。支持 Apple Silicon、macOS 13 及更新版本，运行不需要 Node.js 或网络。

Finder 中右键照片，选择「打开方式 → Pixel & Toon Studio」，或将照片拖到 Dock 图标即可编辑。工作区保存在 `~/Library/Application Support/Pixel & Toon Studio/`，升级时保留；网页工作区与桌面工作区相互独立。

安装包使用 ad-hoc 签名，尚未进行 Apple 公证。下载后若被 macOS 拦截，可到「系统设置 → 隐私与安全性」选择「仍要打开」。

## 网页启动

需要 Node.js 20 或更新版本。当前 `dist/` 为与桌面版同源构建的 v1.0 网页版本：

```sh
npm start
```

打开 http://127.0.0.1:8787 。首次取得代码时，先执行：

```sh
npm ci
npm run build
npm start
```

生产服务器只提供本机静态文件。`HOST` / `PORT` 可调整监听地址；模型与运行时随构建提供。浏览器首次加载并缓存相应资源后可以离线使用。清理站点数据会清空网页工作区，成品请导出 PNG 保存。

## 后续开发

```sh
npm ci
npm run dev           # 网页开发入口
npm run desktop:start # 构建并启动桌面开发版
npm run build         # 更新 dist/ 网页版本
npm run desktop:dmg   # 生成 release/ 下的 Mac 安装包
```

`npm run desktop:pack` 只生成 `.app`，用于调试。图标和安装背景已放入源码；修改后可用 `npm run desktop:assets` 重新生成，需要 Chrome 和 macOS 图像工具。

每次发布时统一更新 `package.json` 与 `package-lock.json` 的应用版本，重新构建网页和安装包，`release/` 保留当前版本 DMG、SHA-256 和本机桌面应用 `mac-arm64/Pixel & Toon Studio.app`。

## 目录

| 目录 | 用途 |
| --- | --- |
| `src/` | React 编辑器、图片算法、本机模型推理与工作区存储 |
| `desktop/` | Electron 窗口、文件打开、保存、菜单、图标与许可声明 |
| `public/` | 两个正式 ONNX 模型、离线支持及第三方许可证 |
| `server/` | 网页生产版静态服务器 |
| `scripts/` | 构建、资源生成及当前版本浏览器 / 桌面回归脚本 |
| `tests/` | 自动化回归和最小固定样片 |
| `docs/` | 当前相框文案的参考来源 |
| `dist/` | 本机最新网页构建，可重新生成，不上传 Git |
| `release/` | 本机最新 Mac 安装包与桌面应用，不上传 Git |
| `node_modules/` | 本机开发依赖，由 npm ci 生成，不上传 Git |

历史需求稿、开发计划、验收报告、截图、个人照片试验、重复模型源权重、无引用样片和旧安装包已清理。测试输出默认写入系统临时目录。

## 回归验证

```sh
npm run typecheck
npm run verify:model
npm run test:run -- --maxWorkers=1
npm run test:models
# 先启动 npm start；浏览器测试默认使用本机 Google Chrome
npm run test:browser
npm run test:desktop
npm run test:desktop-open
# 验证打包后的应用（在移除打包中间目录前运行）
DESKTOP_EXECUTABLE="$PWD/release/mac-arm64/Pixel & Toon Studio.app/Contents/MacOS/Pixel & Toon Studio" npm run test:editor
```

保留测试代码及其实际使用的三张小 PNG、一个 HEIC、两份模型数值基准，用于验证图片导入、外部文件打开、工作区保存、模型输出与分块接缝。来源与许可见 `tests/fixtures/`，没有个人照片依赖。它们不进入网页或桌面安装包。

## 模型与数据

- **LiveAction SPAN ×2**：默认纹理增强，原生 ×2，Apache-2.0。[说明与来源](public/models/liveaction-span-x2/README.md)。
- **FFDNet**：固定 sigma=15/255 的颗粒降噪，随后双三次放大 ×2，MIT 实现。[说明与来源](public/models/ffdnet-color/README.md)。

模型优先使用 WebGPU，失败后使用 WASM。输入上限 6 MP，输出上限 24 MP / 单边 12,000 px；普通图片导入也受 24 MP / 单边 12,000 px 上限约束。增强不会重绘人脸；严重失焦和运动模糊的修复能力有限。

智能调色是本机光色算法，默认关闭。高清导出包含增强、艺术风格、光色微调与相框，不复制原始 EXIF；「下载底图」只保存模型结果。读取 EXIF 需用户同意。

第三方许可保留在 `public/` 与 [桌面版第三方声明](desktop/THIRD_PARTY_NOTICES.md)；相框文案来源见 [CAPTION_SOURCES.md](docs/CAPTION_SOURCES.md)。

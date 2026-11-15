# 开发与运行

应用版本：1.0.1。Mac 桌面版与网页版共用 React 编辑器、图像处理和模型推理代码。需要 Node.js 20+；Mac 打包需要 macOS。

## 本地启动

```sh
npm ci
npm run dev           # 网页开发服务器
npm run desktop:start # 构建并启动 Electron
```

## 生产版与 Mac 打包

```sh
npm run build         # 生成 dist/
npm start             # http://127.0.0.1:8787
npm run desktop:dmg   # Apple Silicon DMG
```

`HOST` / `PORT` 可调整静态服务器监听地址。`npm run desktop:pack` 只生成 `.app`；`npm run desktop:assets` 重新生成图标和安装背景，需要 Chrome 和 macOS 图像工具。

`dist/`、`release/`、`node_modules/` 不进入 Git。每次发布时统一更新 package.json 与 package-lock.json，重新构建网页和安装包，发布对应版本标签。

## 源码目录

| 目录 | 用途 |
| --- | --- |
| `src/` | React 编辑器、图像算法、Worker、本机模型推理与 IndexedDB 工作区 |
| `desktop/` | Electron 窗口、菜单、文件打开、PNG 保存和桌面素材 |
| `public/` | 正式 ONNX 模型、离线支持和第三方许可证 |
| `server/` | 网页生产版静态服务器 |
| `scripts/` | 构建、资源生成及当前版本浏览器 / 桌面回归脚本 |
| `tests/` | 自动化回归与最小固定样片 |
| `docs/` | 开发说明、产品展示图片和来源记录 |

## 验证

```sh
npm run typecheck
npm run verify:model
npm run test:run -- --maxWorkers=1
npm run test:models
# 先启动 npm start；浏览器测试默认使用本机 Google Chrome
npm run test:browser
npm run test:desktop
npm run test:desktop-open
# 测试打包后的应用
DESKTOP_EXECUTABLE="$PWD/release/mac-arm64/Pixel & Toon Studio.app/Contents/MacOS/Pixel & Toon Studio" npm run test:editor
```

测试采用独立工作区，输出默认写入系统临时目录。tests/fixtures 只保留实际回归所需的公开样片、HEIC 与模型数值基准，不包含个人照片，也不进入应用安装包。

## 模型与处理限制

- [LiveAction SPAN ×2](../public/models/liveaction-span-x2/README.md)：原生 ×2，Apache-2.0。
- [FFDNet](../public/models/ffdnet-color/README.md)：固定 sigma=15/255，原尺寸去噪后双三次放大到 ×2，MIT 实现。

模型优先 WebGPU，失败后使用 WASM。增强输入上限 6 MP，输出上限 24 MP / 单边 12,000 px；普通图片导入上限 24 MP / 单边 12,000 px。智能调色属于本机光色算法，默认关闭。

Mac 工作区位于 `~/Library/Application Support/Pixel & Toon Studio/`，与浏览器工作区独立。网页通过 Service Worker 缓存已取得的资源；首次运行仍需先取得网页、模型及运行时。

[返回产品首页](../README.md)

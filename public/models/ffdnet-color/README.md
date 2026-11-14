# FFDNet 彩色去噪

用途：颗粒降噪，与 LiveAction 的纹理增强互补。使用官方 KAIR FFDNet color 预训练权重，固定噪声水平 sigma=15/255，未重新训练。对干净照片不建议重复去噪，细纹理可能变柔和；不负责重绘人脸或修复严重失焦。

作者：Kai Zhang、Wangmeng Zuo、Lei Zhang。

- 官方项目：https://github.com/cszn/FFDNet
- PyTorch 实现：https://github.com/cszn/KAIR/blob/master/models/network_ffdnet.py
- 官方权重：https://github.com/cszn/KAIR/releases/download/v1.0/ffdnet_color.pth
- KAIR 实现 MIT 许可证见 LICENSE。权重和转换后 ONNX 的 SHA-256 见 model.json。

原生输出与输入同尺寸；应用在去噪后使用全局双三次采样放大到 ×2，不叠加 LiveAction，也不串联两个模型。输入使用反射上下文与重叠融合，支持奇数和细长尺寸；转换包装增加末行/末列复制填充，推理后裁回实际尺寸。

原始权重下载地址和 SHA-256 保存在 model.json。日常开发和构建只需要此目录的 ONNX，不保留重复的 PyTorch 权重或一次性转换工具。

独立 PyTorch 基准：tests/fixtures/models/ffdnet-color-golden.f32，对固定 1×3×9×7、从 0 到 1 线性变化的 RGB 输入推理。npm run test:models 对照 JS WASM 输出并验证不规则分块与整图输出的一致性。

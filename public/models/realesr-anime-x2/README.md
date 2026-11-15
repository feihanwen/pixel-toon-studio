# Real-ESRGAN Compact Anime ×2 (SRVGGNetCompact)

作者 Xintao Wang 等；动漫与插画线条专用轻量超分，原生 ×2 RGB。模型文件 2,413,501 字节，SHA-256 见 model.json。

模型原始发布：https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.3.0

固定 ONNX 导出自官方 RealESRGANv2-animevideo-xsx2.pth（602,956 参数），未改动模型权重；按 BSD-3-Clause 许可发布，附 LICENSE。针对动漫边缘、网点、线稿与色块去伪影优化。

应用优先 WebGPU，失败后切换本机 WASM。分块输入带 32px reflect 上下文、8px 重叠羽化；原生 ×2 输出。输出独立恢复 Alpha。

验证基准 tests/fixtures/models/realesr-anime-x2-golden.f32 由 Python onnxruntime 1.19.2 CPU 对固定 1×3×9×7 RGB 输入产生，输入线性从 0 到 1。JS ONNX runtime 和分块拼接与此独立基准对照。

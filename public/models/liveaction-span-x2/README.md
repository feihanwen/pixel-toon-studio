# LiveAction SPAN ×2

作者 jcj83429；真实影像整图超分，原生 ×2 RGB。模型文件 1,654,748 字节，SHA-256 见 model.json。

模型原始发布：https://github.com/jcj83429/upscaling/tree/main/2xLiveActionV1_SPAN

固定 ONNX 来源及哈希见 model.json。未改动模型权重；作者当前按 Apache-2.0 许可发布，附 LICENSE。作者训练目标为压缩修复、去模糊及去光晕，不以去噪为目标；可能保留噪点或略过锐。并不重绘人脸。

应用优先 WebGPU，失败后切换本机 WASM。分块输入带 48px reflect 上下文、8px 重叠羽化；原生 ×2 输出，不经历 ×4→×2 缩小。输出独立恢复 Alpha。默认使用完整模型结果（混合强度 100）。

验证基准 tests/fixtures/models/liveaction-span-x2-golden.f32 由 Python onnxruntime 1.19.2 CPU 对固定 1×3×9×7 RGB 输入产生，输入线性从 0 到 1。JS ONNX runtime 和分块拼接与此独立基准对照。

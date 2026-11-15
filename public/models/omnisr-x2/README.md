# Omni-SR ×2 (DF2K)

作者 Xuanhong Chen 等（CVPR 2023）；全频域聚合超分（Omni-Scale Aggregation Network），原生 ×2 RGB。模型文件 3,787,919 字节，SHA-256 见 model.json。

模型原始发布：https://github.com/Francis0625/Omni-SR

固定 ONNX 权重导出自官方 DF2K ×2 预训练检查点（784,604 参数），局部窗口与通道注意力经平移等变4D NCHW 适配以保证任意分块边界零拼接误差。按 Apache-2.0 许可发布，附 LICENSE。

应用优先 WebGPU，失败后切换本机 WASM。分块输入带 48px reflect 上下文、8px 重叠羽化；原生 ×2 输出。输出独立恢复 Alpha。

验证基准 tests/fixtures/models/omnisr-x2-golden.f32 由 Python onnxruntime 1.19.2 CPU 对固定 1×3×9×7 RGB 输入产生，输入线性从 0 到 1。JS ONNX runtime 和分块拼接与此独立基准对照。

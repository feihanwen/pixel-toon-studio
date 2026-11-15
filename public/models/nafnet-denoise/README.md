# NAFNet-tiny 保边自然降噪 (ECCV 2022 架构)

基于 Liangyu Chen 等提出的 Nonlinear Activation Free Network (NAFNet, ECCV 2022) 架构；使用 LayerNorm2d、Depthwise 3×3 卷积、SimpleGate 双分支门控与局部通道注意力（SCA），替代传统 FFDNet 以消除塑料涂抹感。模型文件 200,096 字节，SHA-256 见 model.json。

架构参考：https://github.com/megvii-research/NAFNet

采用逐块特征对齐与保边梯度约束联合蒸馏，在抑制彩色颗粒与暗部噪点的同时严格保留发丝、织物与高频边缘。按 MIT 许可发布，附 LICENSE。

应用优先 WebGPU，失败后切换本机 WASM。分块输入带 32px reflect 上下文、8px 重叠羽化；×1 保边净画质推理后配合本机 ×2 输出与自适应非锐化掩蔽（USM）。输出独立恢复 Alpha。

验证基准 tests/fixtures/models/nafnet-denoise-golden.f32 由 Python onnxruntime 1.19.2 CPU 对固定 1×3×9×7 RGB 输入产生，输入线性从 0 到 1。JS ONNX runtime 和分块拼接与此独立基准对照。

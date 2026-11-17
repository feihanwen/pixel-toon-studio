# MediaPipe Multi-Class Selfie Segmentation (ONNX)

- **ID**: `face-seg-multiclass`
- **Role**: On-device facial skin vs. hair segmentation for intelligent mosaic contour fitting.
- **License**: Apache-2.0 (see `LICENSE`).
- **Input**: `input_29` (`[1, 256, 256, 3]`, float32 RGB normalized `[0, 1]`).
- **Output**: `Identity` (`[1, 256, 256, 6]`, float32 class probabilities: background, hair, body_skin, face_skin, clothes, others).

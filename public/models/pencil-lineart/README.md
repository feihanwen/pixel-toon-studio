# Informative Drawings Line Art (ONNX)

- **ID**: `pencil-lineart`
- **Role**: On-device neural line-art & contour sketch generator dedicated solely to the Colored Pencil (`pencil`) style.
- **License**: MIT (see `LICENSE`).
- **Input**: `input` (`[1, 3, H, W]`, float32 RGB normalized `[0, 1]`, `H` and `W` multiples of 8).
- **Output**: `output` (`[1, 1, H, W]`, float32 sketch map where `1` is paper and `0` is drawn line).

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/**
 * 自适应非锐化掩蔽 (Adaptive Unsharp Mask - USM)
 * - 采用可分离 5×5 高斯核 [1, 4, 6, 4, 1] / 16 提取高频细节
 * - 软阈值去噪门控 (Soft Coring)：抑制平坦区域与暗部颗粒放大
 * - 高反差防光晕衰减 (Halo Roll-off)：防止强边缘产生黑白镶边过冲
 * - 极值亮度保护 (Headroom Guard)：保护高光与暗部不发生硬截断
 */
export function applyAdaptiveUsm(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    sharpen: number,
): Uint8ClampedArray {
    const clampedSharpen = Number.isFinite(sharpen) ? Math.max(0, Math.min(100, sharpen)) : 0;
    if (clampedSharpen <= 0 || width < 3 || height < 3) return data;

    const n = width * height;
    const hBlur = new Float32Array(n * 3);
    const blur = new Float32Array(n * 3);

    // Horizontal 5-tap Gaussian pass [1, 4, 6, 4, 1] / 16
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            const x0 = Math.max(0, x - 2);
            const x1 = Math.max(0, x - 1);
            const x2 = x;
            const x3 = Math.min(width - 1, x + 1);
            const x4 = Math.min(width - 1, x + 2);

            const i0 = (row + x0) * 4;
            const i1 = (row + x1) * 4;
            const i2 = (row + x2) * 4;
            const i3 = (row + x3) * 4;
            const i4 = (row + x4) * 4;
            const outIdx = (row + x) * 3;

            hBlur[outIdx] = (data[i0] + 4 * data[i1] + 6 * data[i2] + 4 * data[i3] + data[i4]) * 0.0625;
            hBlur[outIdx + 1] = (data[i0 + 1] + 4 * data[i1 + 1] + 6 * data[i2 + 1] + 4 * data[i3 + 1] + data[i4 + 1]) * 0.0625;
            hBlur[outIdx + 2] = (data[i0 + 2] + 4 * data[i1 + 2] + 6 * data[i2 + 2] + 4 * data[i3 + 2] + data[i4 + 2]) * 0.0625;
        }
    }

    // Vertical 5-tap Gaussian pass [1, 4, 6, 4, 1] / 16
    for (let y = 0; y < height; y++) {
        const y0 = Math.max(0, y - 2) * width;
        const y1 = Math.max(0, y - 1) * width;
        const y2 = y * width;
        const y3 = Math.min(height - 1, y + 1) * width;
        const y4 = Math.min(height - 1, y + 2) * width;

        for (let x = 0; x < width; x++) {
            const i0 = (y0 + x) * 3;
            const i1 = (y1 + x) * 3;
            const i2 = (y2 + x) * 3;
            const i3 = (y3 + x) * 3;
            const i4 = (y4 + x) * 3;
            const outIdx = (y2 + x) * 3;

            blur[outIdx] = (hBlur[i0] + 4 * hBlur[i1] + 6 * hBlur[i2] + 4 * hBlur[i3] + hBlur[i4]) * 0.0625;
            blur[outIdx + 1] = (hBlur[i0 + 1] + 4 * hBlur[i1 + 1] + 6 * hBlur[i2 + 1] + 4 * hBlur[i3 + 1] + hBlur[i4 + 1]) * 0.0625;
            blur[outIdx + 2] = (hBlur[i0 + 2] + 4 * hBlur[i1 + 2] + 6 * hBlur[i2 + 2] + 4 * hBlur[i3 + 2] + hBlur[i4 + 2]) * 0.0625;
        }
    }

    const baseStrength = (clampedSharpen / 100) * 1.65;

    for (let p = 0; p < n; p++) {
        const rgbaIdx = p * 4;
        const rgbIdx = p * 3;

        const r = data[rgbaIdx];
        const g = data[rgbaIdx + 1];
        const b = data[rgbaIdx + 2];

        const br = blur[rgbIdx];
        const bg = blur[rgbIdx + 1];
        const bb = blur[rgbIdx + 2];

        const dr = r - br;
        const dg = g - bg;
        const db = b - bb;

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const blurLuma = 0.299 * br + 0.587 * bg + 0.114 * bb;
        const edgeMag = Math.abs(luma - blurLuma);

        // 1. Soft coring gate: ignore flat/noisy micro-fluctuations
        const noiseGate = smoothstep(1.8, 8.5, edgeMag);
        if (noiseGate <= 0) continue;

        // 2. High-contrast halo roll-off: prevent overshoot on strong step edges
        const haloGate = 1.0 - 0.72 * smoothstep(26.0, 92.0, edgeMag);

        // 3. Luma headroom protection near 0 and 255
        const normLuma = luma / 255.0;
        const headroomGate = 0.35 + 0.65 * Math.sqrt(Math.max(0, 4.0 * normLuma * (1.0 - normLuma)));

        const gain = baseStrength * noiseGate * haloGate * headroomGate;

        data[rgbaIdx] = Math.round(Math.max(0, Math.min(255, r + dr * gain)));
        data[rgbaIdx + 1] = Math.round(Math.max(0, Math.min(255, g + dg * gain)));
        data[rgbaIdx + 2] = Math.round(Math.max(0, Math.min(255, b + db * gain)));
    }

    return data;
}

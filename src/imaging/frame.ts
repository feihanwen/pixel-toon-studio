import type { ExifFields } from '../types/document';
import { captionText } from '../config/captions';
import { getFrameStyle, type FrameStyleId } from '../config/frames';

export interface FrameContent {
    frameStyleId?: FrameStyleId;
    captionId: string;
    showExif: boolean;
    exif: ExifFields | null;
}

export interface FrameLayout {
    width: number;
    height: number;
    x: number;
    y: number;
    photoWidth: number;
    photoHeight: number;
}

export function frameInfo(width: number, height: number, enabled: boolean): FrameLayout {
    if (!enabled) {
        return { width, height, x: 0, y: 0, photoWidth: width, photoHeight: height };
    }
    const short = Math.min(width, height);
    const side = Math.max(4, Math.round(short * 0.04));
    const bottom = Math.max(16, Math.round(short * 0.16));
    return {
        width: width + side * 2,
        height: height + side + bottom,
        x: side,
        y: side,
        photoWidth: width,
        photoHeight: height,
    };
}

export function frameLabel(content: FrameContent) {
    const e = content.showExif ? content.exif : null;
    if (e && Object.values(e).some(Boolean)) {
        return [e.model, e.exposure, e.aperture, e.iso, e.date].filter(Boolean).join(' · ');
    }
    return captionText(content.captionId);
}

export function frameKind(content: FrameContent) {
    return content.showExif && content.exif && Object.values(content.exif).some(Boolean) ? '拍摄信息' : '文案';
}

function wrapFrameLabel(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
    const words = /\p{Script=Han}/u.test(text) ? [...text] : text.split(/\s+/);
    const separator = /\p{Script=Han}/u.test(text) ? '' : ' ';
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const next = line ? line + separator + word : word;
        if (line && ctx.measureText(next).width > width) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    if (lines.length <= 2) return lines;
    let second = lines.slice(1).join(separator);
    while (second.length > 1 && ctx.measureText(second + '…').width > width) {
        second = second.slice(0, -1);
    }
    return [lines[0], second + '…'];
}

function pseudoRandom(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
}

function fillLinearGradient(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    stops: ReadonlyArray< readonly [number, string] >,
    w: number,
    h: number,
) {
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [offset, color] of stops) {
        grad.addColorStop(offset, color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

function drawFourPointStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const inner = r * 0.28;
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? r : inner;
        const px = cx + Math.cos(angle) * rad;
        const py = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

interface TextTheme {
    leftColor: string;
    rightColor: string;
    leftMark?: string;
    plaqueBg?: string;
    plaqueBorder?: string;
    textShadow?: string;
}

function drawFrameBackgroundAndGetTheme(
    ctx: CanvasRenderingContext2D,
    styleId: FrameStyleId,
    layout: FrameLayout,
): TextTheme {
    const { width: cw, height: ch, x: px, y: py, photoWidth: pw, photoHeight: ph } = layout;
    const short = Math.min(pw, ph);
    const unit = Math.max(1, short * 0.0025);

    switch (styleId) {
        case 'classic-ivory': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#f9f5ec'],
                    [1, '#efe7d8'],
                ],
                cw,
                ch,
            );
            return { leftColor: '#666059', rightColor: '#4c4843' };
        }

        case 'darkroom-black': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#1c1d21'],
                    [1, '#0f1013'],
                ],
                cw,
                ch,
            );
            return { leftColor: '#9ca3af', rightColor: '#e4e4e7' };
        }

        case 'sakura-pink': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#fdf2f8'],
                    [0.5, '#fce7f3'],
                    [1, '#fbcfe8'],
                ],
                cw,
                ch,
            );
            // Subtle sakura petals in bottom corners
            ctx.save();
            ctx.fillStyle = 'rgba(244, 114, 182, 0.22)';
            for (let i = 0; i < 6; i++) {
                const rx = cw * (0.08 + pseudoRandom(i + 1) * 0.84);
                const ry = py + ph + (ch - py - ph) * (0.2 + pseudoRandom(i + 10) * 0.65);
                ctx.beginPath();
                ctx.ellipse(rx, ry, unit * 3.2, unit * 1.8, pseudoRandom(i + 20) * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            return { leftColor: '#be185d', rightColor: '#831843' };
        }

        case 'mint-soda': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#ecfdf5'],
                    [0.55, '#d1fae5'],
                    [1, '#a7f3d0'],
                ],
                cw,
                ch,
            );
            ctx.save();
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
            ctx.lineWidth = Math.max(1, unit * 0.8);
            for (let i = 0; i < 7; i++) {
                const rx = cw * (0.06 + pseudoRandom(i + 30) * 0.88);
                const ry = py + ph + (ch - py - ph) * (0.2 + pseudoRandom(i + 40) * 0.65);
                ctx.beginPath();
                ctx.arc(rx, ry, unit * (1.8 + pseudoRandom(i + 50) * 2.5), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            return { leftColor: '#047857', rightColor: '#064e3b' };
        }

        case 'buttercream-yellow': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#fefce8'],
                    [0.6, '#fef3c7'],
                    [1, '#fde68a'],
                ],
                cw,
                ch,
            );
            return { leftColor: '#b45309', rightColor: '#78350f' };
        }

        case 'mist-blue': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#f0f9ff'],
                    [0.6, '#e0f2fe'],
                    [1, '#bae6fd'],
                ],
                cw,
                ch,
            );
            return { leftColor: '#0369a1', rightColor: '#0c4a6e' };
        }

        case 'sunset-glow': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#fda4af'],
                    [0.5, '#fdba74'],
                    [1, '#fde047'],
                ],
                cw,
                ch,
            );
            return { leftColor: '#9a3412', rightColor: '#7c2d12' };
        }

        case 'y2k-aura': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#c084fc'],
                    [0.48, '#60a5fa'],
                    [1, '#f472b6'],
                ],
                cw,
                ch,
            );
            const aura = ctx.createRadialGradient(cw * 0.5, ch * 0.85, unit * 4, cw * 0.5, ch * 0.85, cw * 0.55);
            aura.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
            aura.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = aura;
            ctx.fillRect(0, 0, cw, ch);
            return {
                leftColor: '#ffffff',
                rightColor: '#ffffff',
                textShadow: 'rgba(30, 27, 75, 0.45)',
            };
        }

        case 'cyber-neon': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#090d16'],
                    [0.5, '#111827'],
                    [1, '#1e1b4b'],
                ],
                cw,
                ch,
            );
            // Subtle cyber grid in frame
            ctx.save();
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
            ctx.lineWidth = Math.max(1, unit * 0.5);
            const step = Math.max(10, Math.round(short * 0.03));
            for (let gx = 0; gx < cw; gx += step) {
                ctx.beginPath();
                ctx.moveTo(gx, 0);
                ctx.lineTo(gx, ch);
                ctx.stroke();
            }
            for (let gy = 0; gy < ch; gy += step) {
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(cw, gy);
                ctx.stroke();
            }
            ctx.restore();
            return {
                leftColor: '#f472b6',
                rightColor: '#22d3ee',
                leftMark: 'NEON // STUDIO',
            };
        }

        case 'matcha-latte': {
            fillLinearGradient(
                ctx,
                0,
                0,
                0,
                ch,
                [
                    [0, '#a7f3d0'],
                    [0.55, '#d9f99d'],
                    [1, '#fefce8'],
                ],
                cw,
                ch,
            );
            return { leftColor: '#15803d', rightColor: '#14532d' };
        }

        case 'retro-checkerboard': {
            ctx.fillStyle = '#f5f2eb';
            ctx.fillRect(0, 0, cw, ch);
            const cell = Math.max(8, Math.round(short * 0.025));
            ctx.fillStyle = '#262626';
            for (let row = 0; row * cell < ch; row++) {
                for (let col = 0; col * cell < cw; col++) {
                    if ((row + col) % 2 === 0) {
                        ctx.fillRect(col * cell, row * cell, cell, cell);
                    }
                }
            }
            return {
                leftColor: '#262626',
                rightColor: '#171717',
                plaqueBg: 'rgba(248, 245, 238, 0.94)',
                plaqueBorder: '#262626',
            };
        }

        case 'pop-polka': {
            ctx.fillStyle = '#fffdf9';
            ctx.fillRect(0, 0, cw, ch);
            const spacing = Math.max(12, Math.round(short * 0.032));
            const dotR = Math.max(2, spacing * 0.18);
            for (let row = 0; row * spacing < ch + spacing; row++) {
                for (let col = 0; col * spacing < cw + spacing; col++) {
                    const offsetX = (row % 2) * (spacing * 0.5);
                    ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(244, 114, 182, 0.45)' : 'rgba(96, 165, 250, 0.45)';
                    ctx.beginPath();
                    ctx.arc(col * spacing + offsetX, row * spacing, dotR, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            return {
                leftColor: '#db2777',
                rightColor: '#831843',
                plaqueBg: 'rgba(255, 253, 249, 0.9)',
                plaqueBorder: 'rgba(244, 114, 182, 0.45)',
            };
        }

        case 'candy-stripes': {
            ctx.fillStyle = '#fdf2f8';
            ctx.fillRect(0, 0, cw, ch);
            const stripe = Math.max(8, Math.round(short * 0.022));
            ctx.save();
            ctx.fillStyle = '#fbcfe8';
            for (let d = -ch; d < cw + ch; d += stripe * 2) {
                ctx.beginPath();
                ctx.moveTo(d, 0);
                ctx.lineTo(d + stripe, 0);
                ctx.lineTo(d + stripe - ch, ch);
                ctx.lineTo(d - ch, ch);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            return {
                leftColor: '#be185d',
                rightColor: '#831843',
                plaqueBg: 'rgba(255, 255, 255, 0.88)',
                plaqueBorder: 'rgba(244, 114, 182, 0.4)',
            };
        }

        case 'indigo-denim': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#1e3a5f'],
                    [0.5, '#23426d'],
                    [1, '#172e4d'],
                ],
                cw,
                ch,
            );
            // Diagonal twill weave texture
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
            ctx.lineWidth = Math.max(1, unit * 0.6);
            const twillStep = Math.max(4, Math.round(short * 0.008));
            for (let d = -ch; d < cw + ch; d += twillStep) {
                ctx.beginPath();
                ctx.moveTo(d, 0);
                ctx.lineTo(d + ch, ch);
                ctx.stroke();
            }
            // Outer orange denim stitch
            const stitchInset = Math.max(3, Math.round(px * 0.3));
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = Math.max(1.5, unit * 1.1);
            ctx.setLineDash([Math.max(4, unit * 3), Math.max(3, unit * 2)]);
            ctx.strokeRect(stitchInset, stitchInset, cw - stitchInset * 2, ch - stitchInset * 2);
            ctx.restore();
            return { leftColor: '#fbbf24', rightColor: '#fef3c7' };
        }

        case 'manga-screentone': {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cw, ch);
            const grid = Math.max(5, Math.round(short * 0.012));
            ctx.fillStyle = '#18181b';
            for (let y = grid * 0.5; y < ch; y += grid) {
                for (let x = grid * 0.5; x < cw; x += grid) {
                    const edgeDist = Math.min(x, cw - x, y, ch - y) / Math.max(px, ch - py - ph);
                    const radius = Math.max(0.8, grid * 0.28 * (1 - Math.min(0.65, edgeDist * 0.45)));
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            // Outer comic border
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = Math.max(2, unit * 1.8);
            ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, cw - ctx.lineWidth, ch - ctx.lineWidth);
            return {
                leftColor: '#111111',
                rightColor: '#111111',
                plaqueBg: '#ffffff',
                plaqueBorder: '#111111',
            };
        }

        case 'action-speedlines': {
            ctx.fillStyle = '#fafafa';
            ctx.fillRect(0, 0, cw, ch);
            const cx = px + pw * 0.5;
            const cy = py + ph * 0.5;
            const maxR = Math.hypot(cw, ch);
            ctx.save();
            ctx.fillStyle = '#18181b';
            const rays = 96;
            for (let i = 0; i < rays; i++) {
                const a0 = (i / rays) * Math.PI * 2;
                const spread = (0.15 + pseudoRandom(i + 77) * 0.45) * ((Math.PI * 2) / rays);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, maxR, a0, a0 + spread);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            return {
                leftColor: '#dc2626',
                rightColor: '#111111',
                plaqueBg: '#fef08a',
                plaqueBorder: '#111111',
            };
        }

        case 'pixel-rpg': {
            fillLinearGradient(
                ctx,
                0,
                0,
                0,
                ch,
                [
                    [0, '#1e1b4b'],
                    [1, '#0f172a'],
                ],
                cw,
                ch,
            );
            // Outer pixel gold border
            const borderW = Math.max(2, Math.round(unit * 1.5));
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = borderW;
            ctx.strokeRect(borderW * 1.5, borderW * 1.5, cw - borderW * 3, ch - borderW * 3);
            return {
                leftColor: '#f43f5e',
                rightColor: '#fef08a',
                leftMark: 'HP ♥♥♥♥',
                plaqueBg: 'rgba(15, 23, 42, 0.92)',
                plaqueBorder: '#fbbf24',
            };
        }

        case 'magical-starlight': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#3b0764'],
                    [0.5, '#1e1b4b'],
                    [1, '#311042'],
                ],
                cw,
                ch,
            );
            // Golden sparkles & stars around the border
            for (let i = 0; i < 18; i++) {
                const sx = cw * (0.04 + pseudoRandom(i + 101) * 0.92);
                const sy =
                    i < 10
                        ? py + ph + (ch - py - ph) * (0.15 + pseudoRandom(i + 120) * 0.7)
                        : ch * pseudoRandom(i + 140);
                const sr = unit * (2 + pseudoRandom(i + 160) * 3.2);
                drawFourPointStar(ctx, sx, sy, sr, i % 3 === 0 ? '#fde047' : '#f9a8d4');
            }
            return {
                leftColor: '#f9a8d4',
                rightColor: '#fde68a',
                leftMark: '✦ MAGIC & TOON ✦',
            };
        }

        case 'vaporwave-window': {
            ctx.fillStyle = '#c0c0c0';
            ctx.fillRect(0, 0, cw, ch);
            const bevel = Math.max(2, Math.round(unit * 1.4));
            // Classic 3D outset bevel
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cw, bevel);
            ctx.fillRect(0, 0, bevel, ch);
            ctx.fillStyle = '#404040';
            ctx.fillRect(0, ch - bevel, cw, bevel);
            ctx.fillRect(cw - bevel, 0, bevel, ch);
            ctx.fillStyle = '#808080';
            ctx.fillRect(bevel, ch - bevel * 2, cw - bevel * 2, bevel);
            ctx.fillRect(cw - bevel * 2, bevel, bevel, ch - bevel * 2);
            return {
                leftColor: '#1e3a8a',
                rightColor: '#111827',
                leftMark: '[OK] PIXEL.EXE',
                plaqueBg: '#d4d4d8',
                plaqueBorder: '#808080',
            };
        }

        case 'kraft-paper': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#d8bc94'],
                    [0.5, '#caa97c'],
                    [1, '#b89464'],
                ],
                cw,
                ch,
            );
            // Subtle kraft paper fibers
            ctx.save();
            ctx.strokeStyle = 'rgba(69, 26, 3, 0.08)';
            ctx.lineWidth = Math.max(1, unit * 0.5);
            for (let i = 0; i < 65; i++) {
                const fx = cw * pseudoRandom(i + 201);
                const fy = ch * pseudoRandom(i + 260);
                const len = unit * (4 + pseudoRandom(i + 310) * 8);
                const ang = pseudoRandom(i + 370) * Math.PI;
                ctx.beginPath();
                ctx.moveTo(fx, fy);
                ctx.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
                ctx.stroke();
            }
            ctx.restore();
            return { leftColor: '#5c2d0c', rightColor: '#3e1d06' };
        }

        case 'metallic-silver': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#e2e8f0'],
                    [0.25, '#94a3b8'],
                    [0.5, '#f8fafc'],
                    [0.75, '#64748b'],
                    [1, '#e2e8f0'],
                ],
                cw,
                ch,
            );
            // Fine horizontal brushed lines
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 1;
            const brushStep = Math.max(3, Math.round(unit * 1.2));
            for (let y = 0; y < ch; y += brushStep) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(cw, y);
                ctx.stroke();
            }
            ctx.restore();
            return { leftColor: '#1e293b', rightColor: '#0f172a' };
        }

        case 'film-strip': {
            ctx.fillStyle = '#121215';
            ctx.fillRect(0, 0, cw, ch);
            // Sprocket holes along left and right edges
            const holeW = Math.max(3, Math.round(px * 0.42));
            const holeH = Math.max(5, Math.round(holeW * 1.45));
            const holeStep = Math.max(10, Math.round(holeH * 2.1));
            const leftHoleX = Math.round((px - holeW) * 0.5);
            const rightHoleX = cw - leftHoleX - holeW;
            ctx.fillStyle = '#e4e4e7';
            for (let hy = Math.round(py * 0.6); hy + holeH < ch - py * 0.4; hy += holeStep) {
                ctx.fillRect(leftHoleX, hy, holeW, holeH);
                ctx.fillRect(rightHoleX, hy, holeW, holeH);
            }
            return {
                leftColor: '#f59e0b',
                rightColor: '#fde68a',
                leftMark: '► 24A KODAK 400',
            };
        }

        case 'crumpled-washi': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#faf8f3'],
                    [0.5, '#efeae0'],
                    [1, '#e6dfd1'],
                ],
                cw,
                ch,
            );
            // Subtle washi paper crease lines & flecks
            ctx.save();
            ctx.strokeStyle = 'rgba(120, 113, 108, 0.12)';
            ctx.lineWidth = Math.max(1, unit * 0.7);
            for (let i = 0; i < 22; i++) {
                const x1 = cw * pseudoRandom(i + 401);
                const y1 = ch * pseudoRandom(i + 430);
                const x2 = x1 + (pseudoRandom(i + 460) - 0.5) * short * 0.18;
                const y2 = y1 + (pseudoRandom(i + 490) - 0.5) * short * 0.18;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            ctx.restore();
            return { leftColor: '#78716c', rightColor: '#44403c' };
        }

        case 'washi-tape': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#faf7f0'],
                    [1, '#efe8da'],
                ],
                cw,
                ch,
            );
            return { leftColor: '#64748b', rightColor: '#334155' };
        }

        case 'airmail-postcard': {
            ctx.fillStyle = '#faf6ee';
            ctx.fillRect(0, 0, cw, ch);
            // Red & blue diagonal airmail border stripes along the outer rim
            const rim = Math.max(3, Math.round(px * 0.36));
            const seg = Math.max(10, Math.round(short * 0.03));
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, cw, ch);
            ctx.rect(rim, rim, cw - rim * 2, ch - rim * 2);
            ctx.clip('evenodd');
            for (let idx = -ch; idx < cw + ch; idx += seg * 2) {
                ctx.fillStyle = '#dc2626';
                ctx.beginPath();
                ctx.moveTo(idx, 0);
                ctx.lineTo(idx + seg * 0.7, 0);
                ctx.lineTo(idx + seg * 0.7 - ch, ch);
                ctx.lineTo(idx - ch, ch);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#2563eb';
                ctx.beginPath();
                ctx.moveTo(idx + seg, 0);
                ctx.lineTo(idx + seg * 1.7, 0);
                ctx.lineTo(idx + seg * 1.7 - ch, ch);
                ctx.lineTo(idx + seg - ch, ch);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            return {
                leftColor: '#1d4ed8',
                rightColor: '#1e3a8a',
                leftMark: '✈ AIR MAIL · PAR AVION',
            };
        }

        case 'gothic-thorn': {
            fillLinearGradient(
                ctx,
                0,
                0,
                cw,
                ch,
                [
                    [0, '#09090b'],
                    [0.5, '#18181b'],
                    [1, '#09090b'],
                ],
                cw,
                ch,
            );
            const inset = Math.max(3, Math.round(px * 0.3));
            ctx.strokeStyle = '#71717a';
            ctx.lineWidth = Math.max(1, unit * 0.8);
            ctx.strokeRect(inset, inset, cw - inset * 2, ch - inset * 2);
            return {
                leftColor: '#a1a1aa',
                rightColor: '#e4e4e7',
                leftMark: '† NOCTURNE †',
            };
        }

        case 'stacked-double': {
            // Warm desk surface around the stacked cards
            ctx.fillStyle = '#dfd7c6';
            ctx.fillRect(0, 0, cw, ch);

            // Tilted backing Polaroid card peeking out
            ctx.save();
            ctx.translate(cw * 0.5, ch * 0.5);
            ctx.rotate(-0.022);
            const pad = Math.max(2, Math.round(px * 0.25));
            ctx.fillStyle = 'rgba(28, 25, 23, 0.16)';
            ctx.fillRect(-cw * 0.5 + pad + unit * 2, -ch * 0.5 + pad + unit * 2, cw - pad * 2, ch - pad * 2);
            ctx.fillStyle = '#eee7d7';
            ctx.fillRect(-cw * 0.5 + pad, -ch * 0.5 + pad, cw - pad * 2, ch - pad * 2);
            ctx.restore();

            // Front Polaroid card
            const frontInset = Math.max(2, Math.round(px * 0.22));
            ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
            ctx.fillRect(frontInset + unit * 1.5, frontInset + unit * 1.5, cw - frontInset * 2, ch - frontInset * 2);
            ctx.fillStyle = '#fbf8f1';
            ctx.fillRect(frontInset, frontInset, cw - frontInset * 2, ch - frontInset * 2);
            ctx.strokeStyle = 'rgba(120, 113, 108, 0.25)';
            ctx.lineWidth = Math.max(1, unit * 0.7);
            ctx.strokeRect(frontInset, frontInset, cw - frontInset * 2, ch - frontInset * 2);

            return { leftColor: '#666059', rightColor: '#44403c' };
        }
    }
}

function drawPhotoFrameOverlays(
    ctx: CanvasRenderingContext2D,
    styleId: FrameStyleId,
    layout: FrameLayout,
) {
    const { x: px, y: py, photoWidth: pw, photoHeight: ph, width: cw } = layout;
    const short = Math.min(pw, ph);
    const unit = Math.max(1, short * 0.0025);

    ctx.save();
    switch (styleId) {
        case 'darkroom-black': {
            ctx.strokeStyle = '#3f3f46';
            ctx.lineWidth = Math.max(1, unit * 1.1);
            ctx.strokeRect(px, py, pw, ph);
            break;
        }
        case 'cyber-neon': {
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = Math.max(1.5, unit * 1.4);
            ctx.strokeRect(px, py, pw, ph);
            // Corner tech brackets in neon pink
            const bLen = Math.max(8, Math.round(short * 0.035));
            const bOff = Math.max(2, Math.round(unit * 1.6));
            ctx.strokeStyle = '#ec4899';
            ctx.lineWidth = Math.max(2, unit * 1.6);
            // Top-left
            ctx.beginPath();
            ctx.moveTo(px - bOff, py + bLen);
            ctx.lineTo(px - bOff, py - bOff);
            ctx.lineTo(px + bLen, py - bOff);
            // Top-right
            ctx.moveTo(px + pw - bLen, py - bOff);
            ctx.lineTo(px + pw + bOff, py - bOff);
            ctx.lineTo(px + pw + bOff, py + bLen);
            // Bottom-left
            ctx.moveTo(px - bOff, py + ph - bLen);
            ctx.lineTo(px - bOff, py + ph + bOff);
            ctx.lineTo(px + bLen, py + ph + bOff);
            // Bottom-right
            ctx.moveTo(px + pw - bLen, py + ph + bOff);
            ctx.lineTo(px + pw + bOff, py + ph + bOff);
            ctx.lineTo(px + pw + bOff, py + ph - bLen);
            ctx.stroke();
            break;
        }
        case 'indigo-denim': {
            const off = Math.max(2, Math.round(unit * 1.5));
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = Math.max(1.2, unit * 1.1);
            ctx.setLineDash([Math.max(4, unit * 2.8), Math.max(3, unit * 2)]);
            ctx.strokeRect(px - off, py - off, pw + off * 2, ph + off * 2);
            break;
        }
        case 'manga-screentone':
        case 'action-speedlines': {
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = Math.max(2, unit * 2);
            ctx.strokeRect(px, py, pw, ph);
            break;
        }
        case 'pixel-rpg': {
            const bw = Math.max(2, Math.round(unit * 1.6));
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = bw;
            ctx.strokeRect(px - bw * 0.5, py - bw * 0.5, pw + bw, ph + bw);
            // Corner pixel gems
            const sq = bw * 2.2;
            ctx.fillStyle = '#f43f5e';
            ctx.fillRect(px - sq * 0.6, py - sq * 0.6, sq, sq);
            ctx.fillRect(px + pw - sq * 0.4, py - sq * 0.6, sq, sq);
            ctx.fillRect(px - sq * 0.6, py + ph - sq * 0.4, sq, sq);
            ctx.fillRect(px + pw - sq * 0.4, py + ph - sq * 0.4, sq, sq);
            break;
        }
        case 'magical-starlight': {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = Math.max(1.2, unit * 1.2);
            ctx.strokeRect(px, py, pw, ph);
            const starR = Math.max(4, unit * 4.2);
            drawFourPointStar(ctx, px, py, starR, '#fde047');
            drawFourPointStar(ctx, px + pw, py, starR, '#fde047');
            drawFourPointStar(ctx, px, py + ph, starR, '#fde047');
            drawFourPointStar(ctx, px + pw, py + ph, starR, '#fde047');
            break;
        }
        case 'vaporwave-window': {
            const b = Math.max(2, Math.round(unit * 1.4));
            ctx.fillStyle = '#808080';
            ctx.fillRect(px - b, py - b, pw + b * 2, b);
            ctx.fillRect(px - b, py - b, b, ph + b * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px - b, py + ph, pw + b * 2, b);
            ctx.fillRect(px + pw, py - b, b, ph + b * 2);
            break;
        }
        case 'washi-tape': {
            ctx.strokeStyle = 'rgba(51, 65, 85, 0.16)';
            ctx.lineWidth = Math.max(1, unit * 0.8);
            ctx.strokeRect(px, py, pw, ph);
            // Semi-transparent patterned washi tape across top-center of photo
            const tapeW = Math.max(36, Math.round(pw * 0.24));
            const tapeH = Math.max(10, Math.round(py * 0.72));
            ctx.translate(cw * 0.5, py);
            ctx.rotate(-0.045);
            ctx.fillStyle = 'rgba(251, 146, 60, 0.58)';
            ctx.fillRect(-tapeW * 0.5, -tapeH * 0.55, tapeW, tapeH);
            ctx.strokeStyle = 'rgba(194, 65, 12, 0.35)';
            ctx.lineWidth = Math.max(1, unit * 0.7);
            ctx.setLineDash([Math.max(3, unit * 2), Math.max(2, unit * 1.5)]);
            ctx.strokeRect(-tapeW * 0.5, -tapeH * 0.55, tapeW, tapeH);
            break;
        }
        case 'gothic-thorn': {
            const gap = Math.max(2, Math.round(unit * 1.6));
            ctx.strokeStyle = '#d4d4d8';
            ctx.lineWidth = Math.max(1, unit * 0.9);
            ctx.strokeRect(px, py, pw, ph);
            ctx.strokeRect(px - gap, py - gap, pw + gap * 2, ph + gap * 2);
            const crossR = Math.max(4, unit * 3.8);
            drawFourPointStar(ctx, px, py, crossR, '#e4e4e7');
            drawFourPointStar(ctx, px + pw, py, crossR, '#e4e4e7');
            drawFourPointStar(ctx, px, py + ph, crossR, '#e4e4e7');
            drawFourPointStar(ctx, px + pw, py + ph, crossR, '#e4e4e7');
            break;
        }
        default: {
            ctx.strokeStyle = 'rgba(85, 81, 76, 0.15)';
            ctx.lineWidth = Math.max(1, unit * 0.8);
            ctx.strokeRect(px, py, pw, ph);
            break;
        }
    }
    ctx.restore();
}

export function composeFrame(
    photo: CanvasImageSource,
    width: number,
    height: number,
    enabled: boolean,
    content: FrameContent,
) {
    const layout = frameInfo(width, height, enabled);
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('无法创建相框画布');
    }

    if (!enabled) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(photo, layout.x, layout.y, width, height);
        return canvas;
    }

    const style = getFrameStyle(content.frameStyleId);
    const theme = drawFrameBackgroundAndGetTheme(ctx, style.id, layout);

    ctx.drawImage(photo, layout.x, layout.y, width, height);
    drawPhotoFrameOverlays(ctx, style.id, layout);

    const font = Math.max(7, Math.round(Math.min(width, height) * 0.019));
    const bottomSpace = layout.height - layout.y - height;
    const baseline = layout.y + height + Math.max(font * 1.8, bottomSpace * 0.52);

    // Optional backing plaque for high-contrast patterned frames
    if (theme.plaqueBg) {
        const plaqueH = Math.min(bottomSpace * 0.72, Math.max(font * 2.5, bottomSpace * 0.56));
        const plaqueY = baseline - plaqueH * 0.5;
        ctx.save();
        ctx.fillStyle = theme.plaqueBg;
        ctx.fillRect(layout.x, plaqueY, width, plaqueH);
        if (theme.plaqueBorder) {
            ctx.strokeStyle = theme.plaqueBorder;
            ctx.lineWidth = Math.max(1, Math.round(font * 0.1));
            ctx.strokeRect(layout.x, plaqueY, width, plaqueH);
        }
        ctx.restore();
    }

    const textInset = theme.plaqueBg ? Math.max(6, Math.round(font * 0.6)) : 0;

    ctx.save();
    if (theme.textShadow) {
        ctx.shadowColor = theme.textShadow;
        ctx.shadowBlur = Math.max(2, Math.round(font * 0.25));
    }
    ctx.fillStyle = theme.leftColor;
    ctx.font = `600 ${font}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(
        theme.leftMark ?? 'PIXEL & TOON STUDIO',
        layout.x + textInset,
        baseline,
        Math.max(width * 0.28, 1),
    );

    ctx.fillStyle = theme.rightColor;
    ctx.font = `${font}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    const label = frameLabel(content);
    const allowed = width * 0.59 - textInset;
    const lines = wrapFrameLabel(ctx, label, allowed);
    for (let index = 0; index < lines.length; index++) {
        ctx.fillText(
            lines[index],
            layout.x + width - textInset,
            baseline + (index - (lines.length - 1) / 2) * font * 1.2,
            allowed,
        );
    }
    ctx.restore();

    return canvas;
}

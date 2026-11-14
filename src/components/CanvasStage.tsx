import { useEffect, useRef, useState, type ReactNode } from 'react';
import { composeFrame, frameInfo, type FrameContent } from '../imaging/frame';
interface Props {
    heading: ReactNode;
    resultKey?: string | null;
    original: HTMLCanvasElement | null;
    processed: HTMLCanvasElement | null;
    width: number;
    height: number;
    frameEnabled: boolean;
    content: FrameContent;
    showOriginal: boolean;
    processing: boolean;
}
export function CanvasStage({ heading, resultKey, original, processed, width, height, frameEnabled, content, showOriginal, processing }: Props) {
    const before = useRef<HTMLCanvasElement>(null), after = useRef<HTMLCanvasElement>(null), [split, setSplit] = useState(.5), dragging = useRef(false);
    const [view, setView] = useState<'effect' | 'compare' | 'original'>('effect');
    useEffect(() => { setView('effect'); setSplit(.5); }, [original, resultKey]);
    const originalVisible = showOriginal || view === 'original';
    const comparing = !showOriginal && view === 'compare';
    const layout = frameInfo(width, height, frameEnabled);
    const viewport = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const previewWidth = Math.min(available.width, available.height * layout.width / layout.height);
    useEffect(() => { if (!original || !before.current || !after.current)
        return; for (const [target, photo] of [[before.current, original], [after.current, processed ?? original]] as const) {
        const composed = composeFrame(photo, width, height, frameEnabled, content);
        target.width = composed.width;
        target.height = composed.height;
        target.getContext('2d')?.drawImage(composed, 0, 0);
    } }, [original, processed, width, height, frameEnabled, content.captionId, content.showExif, content.exif]);
    const left = layout.x / layout.width * 100, right = (layout.width - layout.x - layout.photoWidth * split) / layout.width * 100, top = layout.y / layout.height * 100, bottom = (layout.height - layout.y - layout.photoHeight) / layout.height * 100;
    function move(e: React.PointerEvent) { if (!dragging.current)
        return; const rect = e.currentTarget.getBoundingClientRect(), x = (e.clientX - rect.left) * layout.width / rect.width; setSplit(Math.max(0, Math.min(1, (x - layout.x) / layout.photoWidth))); }
    return <div className="stage-outer"><div className="work-heading">{heading}<div className="stage-view-controls" role="group" aria-label="预览显示方式">
  {([['effect', '完整效果'], ['compare', '左右对比'], ['original', '原图']] as const).map(([mode, label]) => <button key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); if (mode === 'compare') setSplit(.5); }}>{label}</button>)}
 </div><div className="work-badge"><span/>实时预览</div></div><div className="stage-viewport" ref={viewport}><div className="stage-inner" style={{ width: previewWidth, height: previewWidth * layout.height / layout.width }} onPointerMove={move} onPointerUp={e => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => dragging.current = false}>
  <canvas ref={after} className="stage-canvas" aria-label="处理后的图片"/>
  <canvas ref={before} className="stage-canvas" style={{ display: originalVisible || comparing ? 'block' : 'none', clipPath: originalVisible ? `inset(${top}% ${100 - (layout.x + layout.photoWidth) / layout.width * 100}% ${bottom}% ${left}%)` : `inset(${top}% ${right}% ${bottom}% ${left}%)` }} aria-label="原图比较区域"/>
  {comparing && <div className="compare-line" style={{ left: `${(layout.x + layout.photoWidth * split) / layout.width * 100}%`, top: `${top}%`, bottom: `${bottom}%` }} onPointerDown={e => { dragging.current = true; const parent = e.currentTarget.parentElement; if (parent) {
        parent.setPointerCapture(e.pointerId);
        const rect = parent.getBoundingClientRect(), x = (e.clientX - rect.left) * layout.width / rect.width;
        setSplit(Math.max(0, Math.min(1, (x - layout.x) / layout.photoWidth)));
    } }} role="slider" aria-label="原图与效果分割线" aria-valuenow={Math.round(split * 100)} aria-valuemin={0} aria-valuemax={100} tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowLeft')
        setSplit(Math.max(0, split - .05)); if (e.key === 'ArrowRight')
        setSplit(Math.min(1, split + .05)); }}><span className="compare-handle">‹ ›</span></div>}
  {processing && <div className="stage-processing"><span className="pulse-dot"/> 正在生成预览</div>}
  {(originalVisible || comparing) && <span className="stage-corner left">原图</span>}{!originalVisible && <span className="stage-corner right">处理效果</span>}
 </div></div><div className="stage-hint">{comparing ? '左侧原图 · 右侧效果 · 拖动分割线比较' : originalVisible ? '正在查看导入原图' : '正在查看完整处理效果'} · 按住空格查看原图</div></div>;
}

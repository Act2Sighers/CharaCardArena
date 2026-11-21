import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CropRect } from '../core/types';
import { CARD_ASPECT } from '../storage/image';

interface Props {
  img: HTMLImageElement;
  src: string;
  initial: CropRect;
  onDone(crop: CropRect): void;
  onCancel(): void;
}

interface View {
  s: number;
  ox: number;
  oy: number;
}

/** 63:88 の枠に合わせて画像を切り抜く。ドラッグで移動、ホイール・ピンチ・スライダーで拡大縮小。 */
export function ImageCropper({ img, src, initial, onDone, onCancel }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [fw, setFw] = useState(0);
  const fh = fw / CARD_ASPECT;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFw(el.clientWidth));
    ro.observe(el);
    setFw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const minScale = fw ? Math.max(fw / iw, fh / ih) : 1;
  const maxScale = minScale * 6;

  const clamp = useCallback(
    (v: View): View => {
      const s = Math.min(maxScale, Math.max(minScale, v.s));
      const ox = Math.min(0, Math.max(fw - iw * s, v.ox));
      const oy = Math.min(0, Math.max(fh - ih * s, v.oy));
      return { s, ox, oy };
    },
    [fw, fh, iw, ih, minScale, maxScale],
  );

  // 枠の大きさが決まったら初期の切り抜き範囲を反映
  useEffect(() => {
    if (!fw) return;
    setView((prev) => {
      if (prev) return clamp(prev);
      const s = fw / initial.w;
      return clamp({ s, ox: -initial.x * s, oy: -initial.y * s });
    });
  }, [fw, initial, clamp]);

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView((v) => {
      if (!v) return v;
      const s = Math.min(maxScale, Math.max(minScale, v.s * factor));
      const k = s / v.s;
      return clamp({ s, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k });
    });
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    if (map.size === 1) {
      setView((v) => (v ? clamp({ ...v, ox: v.ox + cur.x - prev.x, oy: v.oy + cur.y - prev.y }) : v));
    } else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      if (d0 > 0) zoomAt(d1 / d0, (cur.x + other.x) / 2, (cur.y + other.y) / 2);
    }
    map.set(e.pointerId, cur);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const zoomRatio = view ? Math.log(view.s / minScale) / Math.log(maxScale / minScale) : 0;

  const done = () => {
    if (!view) return;
    onDone({ x: -view.ox / view.s, y: -view.oy / view.s, w: fw / view.s, h: fh / view.s });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="画像の切り抜き">
      <div className="modal cropper">
        <h2 className="modal-title">絵柄の範囲を決める</h2>
        <p className="hint">ドラッグで位置、ホイールやピンチ・下のスライダーで大きさを調整します。</p>
        <div
          ref={frameRef}
          className="cropper-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {view && (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                width: iw * view.s,
                height: ih * view.s,
                transform: `translate(${view.ox}px, ${view.oy}px)`,
              }}
            />
          )}
          <div className="cropper-guides" aria-hidden="true" />
        </div>
        <label className="cropper-zoom" htmlFor="crop-zoom">
          <span>縮小</span>
          <input
            id="crop-zoom"
            type="range"
            min={0}
            max={1000}
            value={Math.round(zoomRatio * 1000)}
            onChange={(e) => {
              const r = Number(e.target.value) / 1000;
              const target = minScale * Math.pow(maxScale / minScale, r);
              if (view) zoomAt(target / view.s, fw / 2, fh / 2);
            }}
          />
          <span>拡大</span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>キャンセル</button>
          <button type="button" className="btn btn-primary" onClick={done} disabled={!view}>この範囲にする</button>
        </div>
      </div>
    </div>
  );
}

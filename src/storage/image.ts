import type { CropRect } from '../core/types';

/** カードの縦横比（一般的なトレーディングカード 63mm × 88mm） */
export const CARD_ASPECT = 63 / 88;
export const CARD_W = 630;
export const CARD_H = 880;
/** 元画像は長辺をこの大きさまで縮小して保存する */
const ORIGINAL_MAX = 1600;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = src;
  });
}

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } finally {
    // onload 後なので解放してよい（描画済みのデータは保持される）
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の変換に失敗しました'))), 'image/jpeg', quality);
  });
}

/** 元画像を縮小した JPEG を作る */
export async function downscaleOriginal(img: HTMLImageElement): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, ORIGINAL_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b1d27';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { blob: await toBlob(c, 0.9), w, h };
}

/** 切り抜き範囲（img の座標系）からカード用画像を作る */
export async function renderCrop(img: HTMLImageElement, crop: CropRect): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b1d27';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, CARD_W, CARD_H);
  return toBlob(c, 0.88);
}

/** 画像の中央を最大限に使う初期切り抜き */
export function defaultCrop(w: number, h: number): CropRect {
  if (w / h > CARD_ASPECT) {
    const cw = h * CARD_ASPECT;
    return { x: (w - cw) / 2, y: 0, w: cw, h };
  }
  const ch = w / CARD_ASPECT;
  return { x: 0, y: (h - ch) / 2, w, h: ch };
}

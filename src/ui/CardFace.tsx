import React from 'react';
import { ELEMENTS } from '../core/elements';
import { STYLES } from '../core/styles';
import type { ElementId, StyleId } from '../core/types';
import { useImageUrl } from './AppContext';

/** 明るい属性色の上では暗い文字を使う */
export function inkOn(element: ElementId): string {
  return ['thunder', 'ice', 'wind', 'light', 'earth'].includes(element) ? '#17151c' : '#fbf8f1';
}

export function ElementBadge({ element, size = 'md' }: { element: ElementId; size?: 'sm' | 'md' | 'lg' }) {
  const e = ELEMENTS[element];
  return (
    <span
      className={`el-badge el-badge-${size}`}
      style={{ background: e.color, color: inkOn(element), boxShadow: `0 0 0 1.5px ${e.glow}66, 0 0 10px ${e.glow}55` }}
      aria-label={`${e.name}属性`}
    >
      {e.name}
    </span>
  );
}

interface CardFaceProps {
  name: string;
  element: ElementId;
  style?: StyleId;
  imageRef?: string | null;
  /** 直接 URL を渡す場合（編集中のプレビューなど） */
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function CardFace({ name, element, style, imageRef, imageUrl, size = 'md', className = '' }: CardFaceProps) {
  const stored = useImageUrl(imageUrl ? null : imageRef);
  const url = imageUrl ?? stored;
  const e = ELEMENTS[element];
  return (
    <div
      className={`cardface cardface-${size} ${className}`}
      style={{
        ['--el' as string]: e.color,
        ['--el-glow' as string]: e.glow,
        ['--el-deep' as string]: e.deep,
      }}
    >
      <div className="cardface-art">
        {url ? (
          <img src={url} alt="" draggable={false} />
        ) : (
          <div className="cardface-placeholder" aria-hidden="true">
            <span>{e.name}</span>
          </div>
        )}
      </div>
      <div className="cardface-frame" aria-hidden="true" />
      {style && size !== 'xs' && <div className="cardface-style">{STYLES[style].name}</div>}
      <div className="cardface-band">
        <ElementBadge element={element} size={size === 'lg' ? 'lg' : size === 'md' ? 'md' : 'sm'} />
        <span className="cardface-name">{name || '名前未設定'}</span>
      </div>
    </div>
  );
}

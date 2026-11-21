import React, { useEffect, useRef, useState } from 'react';
import { ELEMENT_ORDER, ELEMENTS, weakTo } from '../core/elements';
import { computeStats, STYLE_ORDER, STYLES, TACTIC_ORDER, TACTICS } from '../core/styles';
import type { Card, CropRect, ElementId, StyleId, TacticId } from '../core/types';
import { defaultCrop, downscaleOriginal, loadImage, loadImageFromFile, renderCrop } from '../storage/image';
import { newId } from '../storage/store';
import { useApp } from './AppContext';
import { CardFace, ElementBadge, inkOn } from './CardFace';
import { ConfirmButton, StatBars } from './common';
import { ImageCropper } from './ImageCropper';

interface PendingImage {
  /** 新しく選んだ元画像（既存の元画像を使い回すときは null） */
  originalBlob: Blob | null;
  originalRef: string | null;
  src: string;
  img: HTMLImageElement;
  crop: CropRect;
  croppedBlob: Blob | null;
  croppedUrl: string | null;
}

export const NAME_MAX = 16;
export const DESC_MAX = 120;

export function CardEditor({ card, onClose }: { card: Card | null; onClose(): void }) {
  const { store, run, toast, imageInUse, teams } = useApp();
  const [name, setName] = useState(card?.name ?? '');
  const [element, setElement] = useState<ElementId>(card?.element ?? 'fire');
  const [style, setStyle] = useState<StyleId>(card?.style ?? 'balance');
  const [tactic, setTactic] = useState<TacticId>(card?.tactic ?? 'rush');
  const [description, setDescription] = useState(card?.description ?? '');
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [cropping, setCropping] = useState<PendingImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingImg, setLoadingImg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const track = (u: string) => {
    objectUrls.current.push(u);
    return u;
  };

  const stats = computeStats(style);
  const el = ELEMENTS[element];

  const pickFile = async (file: File) => {
    setLoadingImg(true);
    try {
      const raw = await loadImageFromFile(file);
      const { blob } = await downscaleOriginal(raw);
      const src = track(URL.createObjectURL(blob));
      const img = await loadImage(src);
      setCropping({
        originalBlob: blob, originalRef: null, src, img,
        crop: defaultCrop(img.naturalWidth, img.naturalHeight), croppedBlob: null, croppedUrl: null,
      });
    } catch {
      toast('画像を読み込めませんでした。JPEG・PNG・WebP などの画像を選んでください。', 'error');
    } finally {
      setLoadingImg(false);
    }
  };

  const recrop = async () => {
    if (pending) {
      setCropping(pending);
      return;
    }
    if (!card?.image) return;
    setLoadingImg(true);
    try {
      const src = await store.imageUrl(card.image.original);
      const img = await loadImage(src);
      setCropping({
        originalBlob: null, originalRef: card.image.original, src, img,
        crop: card.image.crop, croppedBlob: null, croppedUrl: null,
      });
    } catch {
      toast('元の画像を読み込めませんでした。画像を選び直してください。', 'error');
    } finally {
      setLoadingImg(false);
    }
  };

  const finishCrop = async (crop: CropRect) => {
    if (!cropping) return;
    const blob = await renderCrop(cropping.img, crop);
    const url = track(URL.createObjectURL(blob));
    setPending({ ...cropping, crop, croppedBlob: blob, croppedUrl: url });
    setCropping(null);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('カードの名前を入力してください。', 'error');
      return;
    }
    setBusy(true);
    const now = Date.now();
    const ok = await run(async () => {
      let image = card?.image ?? null;
      const old = card?.image ?? null;
      if (pending && pending.croppedBlob) {
        const original = pending.originalBlob ? await store.uploadImage(pending.originalBlob) : pending.originalRef!;
        const cropped = await store.uploadImage(pending.croppedBlob);
        image = { original, cropped, crop: pending.crop };
      }
      const next: Card = {
        id: card?.id ?? newId(),
        name: trimmed.slice(0, NAME_MAX),
        element, style, tactic,
        description: description.trim().slice(0, DESC_MAX),
        image,
        createdAt: card?.createdAt ?? now,
        updatedAt: now,
      };
      await store.saveCard(next);
      // 差し替えで使われなくなった画像を片付ける
      if (old && image && old !== image) {
        if (old.original !== image.original && !imageInUse(old.original, next.id)) await store.deleteImage(old.original);
        if (old.cropped !== image.cropped && !imageInUse(old.cropped, next.id)) await store.deleteImage(old.cropped);
      }
    }, card ? 'カードを保存しました' : 'カードを作成しました');
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!card) return;
    setBusy(true);
    const ok = await run(async () => {
      await store.deleteCard(card.id);
      for (const t of teams) {
        if (t.front.includes(card.id) || t.reserve.includes(card.id)) {
          await store.saveTeam({
            ...t,
            front: t.front.map((x) => (x === card.id ? null : x)),
            reserve: t.reserve.filter((x) => x !== card.id),
            updatedAt: Date.now(),
          });
        }
      }
      if (card.image) {
        if (!imageInUse(card.image.original, card.id)) await store.deleteImage(card.image.original);
        if (!imageInUse(card.image.cropped, card.id)) await store.deleteImage(card.image.cropped);
      }
    }, 'カードを削除しました');
    setBusy(false);
    if (ok) onClose();
  };

  const hasImage = !!pending || !!card?.image;

  return (
    <div className="editor">
      <div className="editor-head">
        <button type="button" className="btn btn-ghost" onClick={onClose}>← 一覧へ</button>
        <h2>{card ? 'カードを編集' : '新しいカード'}</h2>
      </div>
      <div className="editor-body">
        <section className="editor-preview" aria-label="プレビュー">
          <CardFace
            name={name.trim()}
            element={element}
            style={style}
            imageRef={pending ? null : card?.image?.cropped}
            imageUrl={pending?.croppedUrl ?? null}
            size="lg"
          />
          <div className="editor-imgbtns">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={loadingImg || !store.canUploadImages}>
              {hasImage ? '画像を変える' : '画像を選ぶ'}
            </button>
            {hasImage && (
              <button type="button" className="btn" onClick={recrop} disabled={loadingImg}>範囲を調整</button>
            )}
            <input
              ref={fileRef}
              id="card-image-file"
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) pickFile(f);
              }}
            />
          </div>
          {!store.canUploadImages && <p className="hint">この表示では画像を保存できません（編集権限が必要です）。</p>}
          {loadingImg && <p className="hint">画像を読み込み中…</p>}
          <div className="panel">
            <h3 className="panel-title">能力値 <span className="muted">（スタイルで決まります）</span></h3>
            <StatBars stats={stats} />
          </div>
          <div className="panel effect-panel" style={{ ['--el' as string]: el.color }}>
            <h3 className="panel-title">
              <ElementBadge element={element} size="sm" /> 属性効果「{el.effectName}」
            </h3>
            <p>{el.effectText}</p>
            <p className="aff-line">
              <span className="muted">有利:</span> {el.beats.map((b) => ELEMENTS[b].name).join('・')}
              <span className="muted"> ／ 不利:</span> {weakTo(element).map((b) => ELEMENTS[b].name).join('・')}
            </p>
          </div>
        </section>

        <section className="editor-form" aria-label="カードの設定">
          <div className="field">
            <label htmlFor="card-name">名前 <span className="req">必須</span></label>
            <input
              id="card-name"
              type="text"
              value={name}
              maxLength={NAME_MAX}
              placeholder="キャラクターの名前"
              onChange={(e) => setName(e.target.value)}
            />
            <span className="counter">{name.length}/{NAME_MAX}</span>
          </div>

          <fieldset className="field">
            <legend>属性</legend>
            <div className="el-grid">
              {ELEMENT_ORDER.map((id) => {
                const e = ELEMENTS[id];
                const on = id === element;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`el-chip${on ? ' on' : ''}`}
                    style={{
                      ['--el' as string]: e.color,
                      ['--el-glow' as string]: e.glow,
                      ['--ink' as string]: inkOn(id),
                    }}
                    aria-pressed={on}
                    onClick={() => setElement(id)}
                  >
                    <span className="el-chip-kanji">{e.name}</span>
                    <span className="el-chip-name">{e.effectName}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>スタイル <span className="muted">能力値の配分</span></legend>
            <div className="opt-list">
              {STYLE_ORDER.map((id) => {
                const s = STYLES[id];
                return (
                  <button key={id} type="button" className={`opt${id === style ? ' on' : ''}`} aria-pressed={id === style} onClick={() => setStyle(id)}>
                    <span className="opt-name">{s.name}<small>{s.short}</small></span>
                    <span className="opt-text">{s.text}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>戦法 <span className="muted">攻撃する相手の選び方</span></legend>
            <div className="opt-list">
              {TACTIC_ORDER.map((id) => {
                const t = TACTICS[id];
                return (
                  <button key={id} type="button" className={`opt${id === tactic ? ' on' : ''}`} aria-pressed={id === tactic} onClick={() => setTactic(id)}>
                    <span className="opt-name">{t.name}</span>
                    <span className="opt-text">{t.text}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="card-desc">説明文 <span className="muted">任意</span></label>
            <textarea
              id="card-desc"
              rows={3}
              value={description}
              maxLength={DESC_MAX}
              placeholder="キャラクターの紹介など"
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="counter">{description.length}/{DESC_MAX}</span>
          </div>

          <div className="editor-actions">
            {card && (
              <ConfirmButton label="削除" confirmLabel="もう一度押すと削除" onConfirm={remove} disabled={busy} />
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose} disabled={busy}>キャンセル</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </section>
      </div>
      {cropping && (
        <ImageCropper
          img={cropping.img}
          src={cropping.src}
          initial={pending && pending.img === cropping.img ? pending.crop : cropping.crop}
          onDone={finishCrop}
          onCancel={() => setCropping(null)}
        />
      )}
    </div>
  );
}

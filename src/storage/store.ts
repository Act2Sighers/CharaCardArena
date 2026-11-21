import type { BattleEvent, BattleRecord, Card, Team } from '../core/types';

export type BattleMeta = Omit<BattleRecord, 'events'>;

export type Unsub = () => void;

export interface Store {
  /** cloud: claude.ai のアーティファクト保存領域（端末間で共有） / local: この端末のブラウザのみ */
  kind: 'cloud' | 'local';
  /** 画像を保存できるか */
  canUploadImages: boolean;

  subscribeCards(cb: (cards: Card[]) => void, onError: (msg: string) => void): Unsub;
  subscribeTeams(cb: (teams: Team[]) => void, onError: (msg: string) => void): Unsub;
  subscribeBattles(cb: (battles: BattleMeta[]) => void, onError: (msg: string) => void): Unsub;

  saveCard(card: Card): Promise<void>;
  deleteCard(id: string): Promise<void>;
  saveTeam(team: Team): Promise<void>;
  deleteTeam(id: string): Promise<void>;

  saveBattle(record: BattleRecord): Promise<void>;
  setFavorite(id: string, favorite: boolean): Promise<void>;
  deleteBattle(id: string): Promise<void>;
  loadBattleEvents(id: string): Promise<BattleEvent[] | null>;

  uploadImage(blob: Blob): Promise<string>;
  deleteImage(ref: string): Promise<void>;
  /** 画像の表示用 URL */
  imageUrl(ref: string): Promise<string>;
}

export function newId(): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}${r}`;
}

export function errorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case 'quota_exceeded':
    case 'quota_or_state':
      return '保存容量の上限に達しました。不要なカードや履歴を削除してください。';
    case 'too_large':
      return '画像が大きすぎます。別の画像を選んでください。';
    case 'unsupported_type':
      return 'この形式の画像は保存できません。JPEG か PNG を選んでください。';
    case 'rate_limited':
    case 'resource_exhausted':
      return '保存が混み合っています。少し待ってからもう一度お試しください。';
    case 'revoked':
    case 'not_granted':
      return '保存先へのアクセスが許可されていません。ページを開き直してください。';
    default:
      return `保存に失敗しました（${code ?? (e instanceof Error ? e.message : '不明なエラー')}）。もう一度お試しください。`;
  }
}

import React, { useEffect, useState } from 'react';
import { AppProvider, useApp, useStoreInit } from './AppContext';
import { BattlePage } from './BattlePage';
import { CardsPage } from './CardsPage';
import { HistoryPage } from './HistoryPage';
import { RulesPage } from './RulesPage';
import { TeamsPage } from './TeamsPage';

const TABS = [
  { id: 'cards', label: 'カード' },
  { id: 'teams', label: 'チーム' },
  { id: 'battle', label: '対戦' },
  { id: 'history', label: '履歴' },
  { id: 'rules', label: 'ルール' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function readHash(): TabId {
  const h = location.hash.replace('#', '');
  return (TABS.find((t) => t.id === h)?.id ?? 'cards') as TabId;
}

export function App() {
  const store = useStoreInit();
  if (!store) {
    return (
      <div className="boot">
        <p className="brand-word">CharaCardArena</p>
        <p className="hint">保存データに接続しています…</p>
      </div>
    );
  }
  return (
    <AppProvider store={store}>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { store, loadError } = useApp();
  const [tab, setTab] = useState<TabId>(readHash);
  // 同じタブを押し直したときに一覧へ戻すためのキー
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const onHash = () => setTab(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: TabId) => {
    if (id === tab) setResetKey((k) => k + 1);
    setTab(id);
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      // ハッシュを書き換えられない環境でも動作は続ける
    }
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-word">CharaCardArena</span>
          </span>
          <span className={`store-badge ${store.kind}`} title={store.kind === 'cloud' ? 'ログイン中のアカウントに保存され、スマホとPCで共有されます' : 'このブラウザの中だけに保存されます'}>
            {store.kind === 'cloud' ? 'クラウド保存' : 'この端末のみ'}
          </span>
        </div>
        <nav className="tabs" aria-label="メニュー">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`tab${tab === t.id ? ' on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {loadError && <div className="banner-error" role="alert">{loadError}</div>}
      <main className="main" key={`${tab}-${resetKey}`}>
        {tab === 'cards' && <CardsPage />}
        {tab === 'teams' && <TeamsPage />}
        {tab === 'battle' && <BattlePage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'rules' && <RulesPage />}
      </main>
    </div>
  );
}

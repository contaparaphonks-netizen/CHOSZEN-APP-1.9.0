import { useCallback, useEffect, useState } from 'react';
import {
  Gamepad2,
  KeyRound,
  LogOut,
  ShieldCheck,
  Ticket,
  Trophy,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { KeyGate } from './components/KeyGate';
import { DlsHubMode } from './components/modes/DlsHubMode';
import { FootballHubMode } from './components/modes/FootballHubMode';
import { MinhaCarteiraMode } from './components/modes/MinhaCarteiraMode';
import { checkSession, logoutSession, type VerifyKeyResult } from './lib/api';
import type { AuthSession, PanelMode } from './types';

const MENU_MODES: Array<{
  id: PanelMode;
  label: string;
  shortLabel: string;
  icon: typeof Wallet;
}> = [
  { id: 'carteira', label: 'CARTEIRA', shortLabel: 'CARTEIRA', icon: Wallet },
  { id: 'keys-premium', label: 'KEYS PREMIUM', shortLabel: 'KEYS', icon: KeyRound },
  { id: 'codigos-resgate', label: 'CÓDIGOS DE RESGATE', shortLabel: 'CÓDIGOS', icon: Ticket },
  { id: 'menu-futebol', label: 'MENU DE FUTEBOL', shortLabel: 'FUTEBOL', icon: Trophy },
  { id: 'dls-de-boa', label: 'DLS DE BOA', shortLabel: 'DLS', icon: Gamepad2 },
];

type LockedTab = 'choszen' | 'minha-carteira';

function formatBrasiliaHeaderNow(now: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
}

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'locked' | 'unlocked'>('checking');
  const [sessionInfo, setSessionInfo] = useState<AuthSession | null>(null);
  const [lockedTab, setLockedTab] = useState<LockedTab>('choszen');
  const [prefillKey, setPrefillKey] = useState<string | undefined>(undefined);

  const [activeMode, setActiveMode] = useState<PanelMode>('menu-futebol');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [emblemError, setEmblemError] = useState(false);
  const [headerNow, setHeaderNow] = useState<Date>(() => new Date());

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeaderNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;
    checkSession().then((session) => {
      if (!active) return;
      if (session.authenticated) {
        setSessionInfo(session);
        setAuthState('unlocked');
      } else {
        setSessionInfo(null);
        setAuthState('locked');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Automatically enforce Premium Key expiration if active session expires
  useEffect(() => {
    if (authState !== 'unlocked' || sessionInfo?.role !== 'premium' || !sessionInfo?.expiresAt) {
      return;
    }
    const expMs = new Date(sessionInfo.expiresAt).getTime();
    if (Number.isNaN(expMs)) return;

    const checkExpiry = async () => {
      if (Date.now() >= expMs) {
        await logoutSession();
        setSessionInfo(null);
        setAuthState('locked');
        setLockedTab('choszen');
        showToast('Sua Key Premium expirou. Adquira outra na aba MINHA CARTEIRA.');
      }
    };

    const interval = setInterval(checkExpiry, 15000);
    return () => clearInterval(interval);
  }, [authState, sessionInfo, showToast]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  function handleAuthenticated(result: VerifyKeyResult) {
    setSessionInfo({
      authenticated: true,
      role: result.role,
      issuedAt: result.issuedAt,
      activatedAt: result.activatedAt ?? null,
      expiresAt: result.expiresAt ?? null,
      planName: result.planName ?? null,
      keyCode: result.keyCode ?? null,
    });
    setPrefillKey(undefined);
    setAuthState('unlocked');

    if (result.firstActivation && result.expiresAt) {
      const expStr = new Date(result.expiresAt).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      showToast(`1ª ativação confirmada! ${result.planName || 'Key Premium'} válida até ${expStr}.`);
    }
  }

  async function handleLogout() {
    await logoutSession();
    setSessionInfo(null);
    setAuthState('locked');
    setLockedTab('choszen');
    setActiveMode('menu-futebol');
  }

  const toastLayer = (
    <AnimatePresence>
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.16 }}
          role="status"
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 px-4 py-3 rounded-xl bg-[#161C28] border border-blue-500/40 text-xs font-medium text-white shadow-lg max-w-sm"
        >
          {toastMessage}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (authState === 'checking') {
    return (
      <MotionConfig reducedMotion="user">
        <div className="min-h-screen bg-[#090B10] flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-white/15 bg-[#10141D] flex items-center justify-center animate-pulse">
              <ShieldCheck className="w-5 h-5 text-sky-400" />
            </div>
            <p className="text-xs text-slate-400">Verificando acesso CHOSZEN™©...</p>
          </div>
        </div>
      </MotionConfig>
    );
  }

  if (authState === 'locked') {
    return (
      <MotionConfig reducedMotion="user">
        <div className="min-h-screen bg-[#090B10] text-slate-100 flex flex-col">
        <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-white/[0.08] bg-[#0D1017]/90 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-6xl mx-auto h-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/15 bg-[#090B10] flex items-center justify-center">
                {!emblemError ? (
                  <img
                    src="/src/assets/images/choszen_crest_emblem_1795156426033.jpg"
                    alt="CHOSZEN™©"
                    referrerPolicy="no-referrer"
                    onError={() => setEmblemError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                )}
              </div>
              <span className="font-display text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap">
                CHOSZEN™©
              </span>
            </div>

            <nav
              aria-label="Abas iniciais"
              className="flex items-center gap-1.5 p-1 rounded-xl bg-[#090B10] border border-white/[0.08]"
            >
              <button
                type="button"
                onClick={() => setLockedTab('choszen')}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  lockedTab === 'choszen'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                <span>CHOSZEN ™©</span>
              </button>
              <button
                type="button"
                onClick={() => setLockedTab('minha-carteira')}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  lockedTab === 'minha-carteira'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span>MINHA CARTEIRA</span>
              </button>
            </nav>
          </div>
        </header>

        <div className="flex-1">
          {lockedTab === 'choszen' ? (
            <KeyGate onAuthenticated={handleAuthenticated} initialKey={prefillKey} />
          ) : (
            <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              <MinhaCarteiraMode
                onNotify={showToast}
                isOwner={false}
                viewSection="all"
                onGoToKeyGate={(code) => {
                  setPrefillKey(code);
                  setLockedTab('choszen');
                }}
              />
            </main>
          )}
        </div>

        {toastLayer}
        </div>
      </MotionConfig>
    );
  }

  const activeModeObj = MENU_MODES.find((m) => m.id === activeMode) || MENU_MODES[3];
  const isOwner = sessionInfo?.role === 'owner';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#090B10] text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar — Exclusively 5 Primary Menu Modes */}
      <aside className="hidden md:flex md:w-64 lg:w-68 shrink-0 flex-col justify-between bg-[#0D1017] border-r border-white/[0.08] sticky top-0 h-screen">
        <div className="p-5 space-y-7">
          {/* Brand */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/15 bg-[#090B10] shrink-0 flex items-center justify-center">
              {!emblemError ? (
                <img
                  src="/src/assets/images/choszen_crest_emblem_1795156426033.jpg"
                  alt="CHOSZEN™©"
                  referrerPolicy="no-referrer"
                  onError={() => setEmblemError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ShieldCheck className="w-4 h-4 text-sky-400" />
              )}
            </div>
            <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
              CHOSZEN™©
            </span>
          </div>

          {/* Primary Menu — 5 Modes Only */}
          <nav aria-label="Menu principal" className="space-y-1.5">
            {MENU_MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setActiveMode(mode.id)}
                  className={`w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-5 border-t border-white/[0.06] space-y-3">
          {sessionInfo && (
            <div className="px-2 space-y-0.5 text-[11px]">
              <p className="font-semibold text-slate-200 truncate">
                {isOwner ? 'Proprietário · Permanente' : sessionInfo.planName || 'Key Premium'}
              </p>
              {!isOwner && sessionInfo.expiresAt && (
                <p className="font-mono-num text-slate-400">
                  Expira:{' '}
                  {new Date(sessionInfo.expiresAt).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="w-full h-10 px-3.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        {/* Top Bar */}
        <header className="h-14 md:h-16 px-4 sm:px-6 lg:px-8 border-b border-white/[0.08] bg-[#0D1017]/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="md:hidden font-display text-sm font-bold text-white whitespace-nowrap">
              CHOSZEN™©
            </span>
            <span className="md:hidden text-slate-600" aria-hidden="true">
              /
            </span>
            <span className="hidden md:inline text-xs font-medium text-slate-400 whitespace-nowrap">
              CHOSZEN™©
            </span>
            <span className="hidden md:inline text-slate-600" aria-hidden="true">
              /
            </span>
            <span className="text-xs sm:text-sm font-semibold text-white truncate">
              {activeModeObj.label}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline font-mono-num text-xs text-slate-400 whitespace-nowrap">
              {formatBrasiliaHeaderNow(headerNow)} (GMT-3)
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Encerrar Sessão"
              className="md:hidden h-9 w-9 rounded-lg bg-[#161C28] border border-white/[0.1] flex items-center justify-center text-slate-300 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Active Mode Viewport */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeMode === 'carteira' && (
                <MinhaCarteiraMode
                  onNotify={showToast}
                  isOwner={isOwner}
                  viewSection="carteira"
                />
              )}
              {activeMode === 'keys-premium' && (
                <MinhaCarteiraMode
                  onNotify={showToast}
                  isOwner={isOwner}
                  viewSection="keys"
                />
              )}
              {activeMode === 'codigos-resgate' && (
                <MinhaCarteiraMode
                  onNotify={showToast}
                  isOwner={isOwner}
                  viewSection="codigos"
                />
              )}
              {activeMode === 'menu-futebol' && (
                <FootballHubMode onNotify={showToast} isOwner={isOwner} />
              )}
              {activeMode === 'dls-de-boa' && (
                <DlsHubMode onNotify={showToast} isOwner={isOwner} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation — Exclusively 5 Modes */}
      <nav
        aria-label="Navegação móvel"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-[#0D1017]/95 backdrop-blur-md border-t border-white/[0.1] grid grid-cols-5 px-1"
      >
        {MENU_MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setActiveMode(mode.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                isActive ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                {mode.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {toastLayer}
      </div>
    </MotionConfig>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookmarkPlus,
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  Trash2,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  buyPremiumKey,
  fetchAdminRedeemCodes,
  fetchWallet,
  redeemCreditCode,
  removeSavedKey,
  saveReceivedKey,
  updateWalletConfig,
} from '../../lib/api';
import type {
  AcquiredPremiumKey,
  PremiumPlanId,
  RedeemCodeAdminItem,
  RedeemCodeStatus,
  RedeemCodeTier,
  RedeemCodesAdminSnapshot,
  WalletSnapshot,
  WalletTransaction,
} from '../../types';

export type WalletViewSection = 'all' | 'carteira' | 'keys' | 'codigos';

interface MinhaCarteiraModeProps {
  onNotify: (msg: string) => void;
  isOwner?: boolean;
  onGoToKeyGate?: (prefillKey?: string) => void;
  viewSection?: WalletViewSection;
}

type HistoryFilter = 'all' | 'purchases' | 'credits';

function formatDlsCurrency(value: number): string {
  return `DLS$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRemaining(ms: number | null): string {
  if (ms === null) return 'Prazo não iniciado';
  if (ms <= 0) return 'Expirada';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h restantes`;
  if (hours > 0) return `${hours}h ${minutes}m restantes`;
  return `${Math.max(1, minutes)}m restantes`;
}

export function MinhaCarteiraMode({
  onNotify,
  isOwner = false,
  onGoToKeyGate,
  viewSection = 'all',
}: MinhaCarteiraModeProps) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideBalance, setHideBalance] = useState(false);

  // Credit / redeem code state
  const [creditCode, setCreditCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [creditFeedback, setCreditFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Store purchase & saved received keys state
  const [buyingPlanId, setBuyingPlanId] = useState<PremiumPlanId | null>(null);
  const [lastPurchasedKey, setLastPurchasedKey] = useState<AcquiredPremiumKey | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [receivedKeyCode, setReceivedKeyCode] = useState('');
  const [savingReceivedKey, setSavingReceivedKey] = useState(false);
  const [savedKeyFeedback, setSavedKeyFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // History filter
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  // Owner config form state
  const [cfgCreditAmount, setCfgCreditAmount] = useState('');
  const [cfgPrice1d, setCfgPrice1d] = useState('');
  const [cfgPrice7d, setCfgPrice7d] = useState('');
  const [cfgPrice1m, setCfgPrice1m] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Owner-only 100 Redeem Codes Admin Registry
  const [adminCodes, setAdminCodes] = useState<RedeemCodesAdminSnapshot | null>(null);
  const [adminCodesLoading, setAdminCodesLoading] = useState(false);
  const [adminStatusFilter, setAdminStatusFilter] = useState<'all' | RedeemCodeStatus>('all');
  const [adminTierFilter, setAdminTierFilter] = useState<'all' | RedeemCodeTier>('all');
  const [adminSearch, setAdminSearch] = useState('');

  const syncOwnerInputs = useCallback((data: WalletSnapshot) => {
    if (data.config) {
      setCfgCreditAmount(String(data.config.creditAmount));
      setCfgPrice1d(String(data.config.prices['1d']));
      setCfgPrice7d(String(data.config.prices['7d']));
      setCfgPrice1m(String(data.config.prices['1m']));
    }
  }, []);

  const loadAdminCodes = useCallback(async () => {
    if (!isOwner) return;
    setAdminCodesLoading(true);
    try {
      const data = await fetchAdminRedeemCodes();
      setAdminCodes(data);
    } catch {
      // Ignore if not owner
    } finally {
      setAdminCodesLoading(false);
    }
  }, [isOwner]);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWallet();
      setSnapshot(data);
      syncOwnerInputs(data);
      if (isOwner) {
        loadAdminCodes();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a carteira.');
    } finally {
      setLoading(false);
    }
  }, [syncOwnerInputs, isOwner, loadAdminCodes]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // Periodically refresh countdowns while viewing wallet/keys
  useEffect(() => {
    const timer = setInterval(() => {
      fetchWallet()
        .then((data) => {
          setSnapshot(data);
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  async function handleRedeemCredit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = creditCode.trim();
    if (!trimmed) {
      setCreditFeedback({ type: 'error', message: 'Digite um código de resgate válido.' });
      return;
    }

    setRedeeming(true);
    setCreditFeedback(null);
    try {
      const res = await redeemCreditCode(trimmed);
      setSnapshot(res.snapshot);
      syncOwnerInputs(res.snapshot);
      setCreditCode('');
      setCreditFeedback({ type: 'success', message: res.message });
      onNotify(res.message);
      if (isOwner) {
        loadAdminCodes();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao validar código de resgate.';
      setCreditFeedback({ type: 'error', message: msg });
    } finally {
      setRedeeming(false);
    }
  }

  async function handleBuyPlan(planId: PremiumPlanId) {
    setBuyingPlanId(planId);
    try {
      const res = await buyPremiumKey(planId);
      setSnapshot(res.snapshot);
      setLastPurchasedKey(res.key);
      onNotify(res.message);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao concluir compra da Key.');
    } finally {
      setBuyingPlanId(null);
    }
  }

  async function handleCopyKey(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      onNotify('Código copiado para a área de transferência.');
      setTimeout(() => {
        setCopiedCode((prev) => (prev === code ? null : prev));
      }, 2200);
    } catch {
      onNotify('Não foi possível copiar automaticamente. Selecione o código manualmente.');
    }
  }

  async function handleSaveReceivedKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = receivedKeyCode.trim();
    if (!trimmed) {
      setSavedKeyFeedback({ type: 'error', message: 'Digite o código da Key recebida.' });
      return;
    }

    setSavingReceivedKey(true);
    setSavedKeyFeedback(null);
    try {
      const res = await saveReceivedKey(trimmed);
      setSnapshot(res.snapshot);
      syncOwnerInputs(res.snapshot);
      setReceivedKeyCode('');
      setSavedKeyFeedback({ type: 'success', message: res.message });
      onNotify(res.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível salvar a Key recebida.';
      setSavedKeyFeedback({ type: 'error', message: msg });
    } finally {
      setSavingReceivedKey(false);
    }
  }

  async function handleRemoveSavedKey(code: string) {
    try {
      const res = await removeSavedKey(code);
      setSnapshot(res.snapshot);
      onNotify(res.message);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao remover Key salva.');
    }
  }

  async function handleSaveOwnerConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await updateWalletConfig({
        creditAmount: Number(cfgCreditAmount),
        prices: {
          '1d': Number(cfgPrice1d),
          '7d': Number(cfgPrice7d),
          '1m': Number(cfgPrice1m),
        },
      });
      setSnapshot(res.snapshot);
      syncOwnerInputs(res.snapshot);
      onNotify(res.message);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  }

  const visibleTransactions: WalletTransaction[] = useMemo(() => {
    if (!snapshot) return [];
    if (historyFilter === 'purchases') return snapshot.purchaseHistory;
    if (historyFilter === 'credits') return snapshot.creditHistory;
    return snapshot.transactions;
  }, [snapshot, historyFilter]);

  const filteredAdminCodes: RedeemCodeAdminItem[] = useMemo(() => {
    if (!adminCodes) return [];
    const q = adminSearch.trim().toUpperCase();
    return adminCodes.codes.filter((item) => {
      if (adminStatusFilter !== 'all' && item.status !== adminStatusFilter) return false;
      if (adminTierFilter !== 'all' && item.tier !== adminTierFilter) return false;
      if (q && !item.code.includes(q)) return false;
      return true;
    });
  }, [adminCodes, adminStatusFilter, adminTierFilter, adminSearch]);

  if (loading && !snapshot) {
    return (
      <div className="space-y-6">
        <div className="h-44 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-44 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse" />
          <div className="h-44 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse" />
          <div className="h-44 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="p-6 rounded-2xl bg-[#10141D] border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-rose-300">{error}</p>
        <button
          type="button"
          onClick={loadWallet}
          className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-semibold text-rose-200 whitespace-nowrap"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (!snapshot) return null;

  const showCarteira = viewSection === 'all' || viewSection === 'carteira';
  const showKeys = viewSection === 'all' || viewSection === 'keys';
  const showCodigos = viewSection === 'all' || viewSection === 'codigos';

  const headerMeta =
    viewSection === 'keys'
      ? {
          title: 'Keys Premium',
          subtitle:
            'Adquira Keys Premium em dinheiro fictício (DLS$). Keys não utilizadas permanecem como ON — NÃO UTILIZADA até a 1ª ativação em CHOSZEN ™©.',
        }
      : viewSection === 'codigos'
      ? {
          title: 'Códigos de Resgate',
          subtitle:
            'Resgate códigos válidos para creditar moedas imediatamente na sua carteira virtual CHOSZEN™©.',
        }
      : {
          title: 'DLS HUB™ · Carteira Virtual',
          subtitle:
            'Conta virtual em dinheiro exclusivamente fictício (DLS$) para aquisição e controle de Keys Premium. Sem Pix, cartões ou dinheiro real.',
        };

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-white/[0.08]"
      >
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
            {headerMeta.title}
          </h2>
          <p className="text-sm text-slate-400 mt-1">{headerMeta.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={loadWallet}
          className="h-10 px-3.5 rounded-xl bg-[#10141D] border border-white/[0.1] hover:border-blue-500/40 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Saldo</span>
        </button>
      </motion.div>

      {/* Compact Balance Strip when viewing KEYS PREMIUM or CÓDIGOS DE RESGATE */}
      {!showCarteira && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Resumo do Saldo"
          className="rounded-2xl bg-gradient-to-r from-[#1D4ED8] via-[#1E3A8A] to-[#0F172A] border border-white/[0.12] px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-sky-200">
              <Wallet className="w-4 h-4" />
              <span>Saldo disponível na carteira</span>
              <span aria-hidden="true">·</span>
              <span>Dinheiro Fictício</span>
            </div>
            <p className="font-display font-mono-num text-2xl sm:text-3xl font-bold text-white">
              {hideBalance ? 'DLS$ ••••••' : formatDlsCurrency(snapshot.balance)}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-sky-100/90">
            <div className="font-mono-num">
              <span className="text-sky-200/75 block">Keys adquiridas</span>
              <span className="text-sm font-semibold text-white">{snapshot.keys.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setHideBalance((prev) => !prev)}
              aria-label={hideBalance ? 'Mostrar saldo' : 'Ocultar saldo'}
              className="w-10 h-10 rounded-xl bg-black/25 hover:bg-black/40 text-white flex items-center justify-center transition-colors shrink-0"
            >
              {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </motion.section>
      )}

      {/* Banking Hero Card (Carteira or All) */}
      {showCarteira && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
          className={`grid grid-cols-1 ${showCodigos ? 'lg:grid-cols-12' : ''} gap-5 items-stretch`}
        >
          <section
            aria-label="Saldo da Conta Virtual"
            className={`${showCodigos ? 'lg:col-span-7' : ''} rounded-2xl bg-gradient-to-br from-[#1D4ED8] via-[#1E3A8A] to-[#0B1528] border border-white/[0.14] p-6 sm:p-7 flex flex-col justify-between gap-6`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-sky-200">
                  <Wallet className="w-4 h-4" />
                  <span>DLS HUB™ Conta Virtual</span>
                  <span aria-hidden="true">·</span>
                  <span>Dinheiro Fictício</span>
                </div>
                <p className="text-xs text-sky-200/80">Saldo disponível</p>
              </div>

              <button
                type="button"
                onClick={() => setHideBalance((prev) => !prev)}
                aria-label={hideBalance ? 'Mostrar saldo' : 'Ocultar saldo'}
                className="w-10 h-10 rounded-xl bg-black/25 hover:bg-black/40 text-white flex items-center justify-center transition-colors shrink-0"
              >
                {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div>
              <p className="font-display font-mono-num text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
                {hideBalance ? 'DLS$ ••••••' : formatDlsCurrency(snapshot.balance)}
              </p>
            </div>

            <div className="pt-4 border-t border-white/15 grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-sky-200/75">Créditos recebidos</p>
                <p className="font-mono-num text-sm font-semibold text-white mt-0.5">
                  {hideBalance ? '••••' : formatDlsCurrency(snapshot.totalCredited)}
                </p>
              </div>
              <div>
                <p className="text-sky-200/75">Total em compras</p>
                <p className="font-mono-num text-sm font-semibold text-white mt-0.5">
                  {hideBalance ? '••••' : formatDlsCurrency(snapshot.totalSpent)}
                </p>
              </div>
              <div>
                <p className="text-sky-200/75">Keys adquiridas</p>
                <p className="font-mono-num text-sm font-semibold text-white mt-0.5">
                  {snapshot.keys.length}
                </p>
              </div>
            </div>
          </section>

          {/* Redeem Card inline when in 'all' view */}
          {showCodigos && (
            <section
              aria-label="Resgatar Código"
              className="lg:col-span-5 rounded-2xl bg-[#10141D] border border-white/[0.08] p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                    <Ticket className="w-4 h-4" />
                    <span>RESGATAR CÓDIGO</span>
                  </div>
                  <span className="font-mono-num text-xs text-slate-400">
                    Uso único por código
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Resgatar moedas na carteira
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Insira um código de resgate válido para creditar moedas imediatamente na sua carteira. Cada código só pode ser usado uma vez.
                </p>
              </div>

              <form onSubmit={handleRedeemCredit} className="space-y-3">
                <div>
                  <label htmlFor="wallet-credit-code" className="sr-only">
                    Código de resgate
                  </label>
                  <input
                    id="wallet-credit-code"
                    type="text"
                    value={creditCode}
                    onChange={(e) => {
                      setCreditCode(e.target.value);
                      if (creditFeedback) setCreditFeedback(null);
                    }}
                    disabled={redeeming}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Digite o código de resgate"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 font-mono-num focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                {creditFeedback && (
                  <div
                    role={creditFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`p-3 rounded-xl border text-xs leading-relaxed ${
                      creditFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {creditFeedback.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={redeeming}
                  className="w-full h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold tracking-wide transition-colors whitespace-nowrap"
                >
                  {redeeming ? 'Validando código...' : 'RESGATAR CÓDIGO'}
                </button>
              </form>
            </section>
          )}
        </motion.div>
      )}

      {/* Standalone RESGATAR CÓDIGO card when viewSection === 'codigos' */}
      {!showCarteira && showCodigos && (
        <section
          aria-label="Resgatar Código"
          className="rounded-2xl bg-[#10141D] border border-white/[0.08] p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                <Ticket className="w-4 h-4" />
                <span>RESGATAR CÓDIGO</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-white">
                Resgatar moedas na carteira
              </h3>
              <p className="text-xs text-slate-400">
                Insira um código de resgate válido para creditar moedas imediatamente na sua carteira. Cada código só pode ser utilizado uma única vez.
              </p>
            </div>
            <span className="font-mono-num text-xs text-slate-400 shrink-0">
              Uso único garantido
            </span>
          </div>

          <form onSubmit={handleRedeemCredit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="wallet-credit-code-standalone" className="sr-only">
                Código de resgate
              </label>
              <input
                id="wallet-credit-code-standalone"
                type="text"
                value={creditCode}
                onChange={(e) => {
                  setCreditCode(e.target.value);
                  if (creditFeedback) setCreditFeedback(null);
                }}
                disabled={redeeming}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Digite o código de resgate (ex.: CHS-XXXX-XXXX-XXXX)"
                className="flex-1 h-11 px-4 rounded-xl bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 font-mono-num focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={redeeming}
                className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold tracking-wide transition-colors whitespace-nowrap shrink-0"
              >
                {redeeming ? 'Validando código...' : 'RESGATAR CÓDIGO'}
              </button>
            </div>

            {creditFeedback && (
              <div
                role={creditFeedback.type === 'error' ? 'alert' : 'status'}
                className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  creditFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {creditFeedback.message}
              </div>
            )}
          </form>
        </section>
      )}

      {/* Recently Purchased Key Immediate Highlight */}
      {showKeys && lastPurchasedKey && (
        <div
          role="status"
          className="p-5 rounded-2xl bg-[#10141D] border border-emerald-500/35 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-emerald-400">Compra confirmada</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-300">{lastPurchasedKey.planName}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-semibold text-emerald-300">{lastPurchasedKey.status}</span>
            </div>
            <p className="font-mono-num text-lg sm:text-xl font-bold text-white tracking-wider break-all">
              {lastPurchasedKey.code}
            </p>
            <p className="text-xs text-slate-400">
              O prazo de validade não começou ainda. Ele será iniciado somente na primeira ativação dentro da aba inicial CHOSZEN ™©.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyKey(lastPurchasedKey.code)}
              className="h-10 px-4 rounded-xl bg-[#090B10] border border-white/[0.12] hover:border-white/25 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap"
            >
              {copiedCode === lastPurchasedKey.code ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedCode === lastPurchasedKey.code ? 'Copiada' : 'Copiar Key'}</span>
            </button>

            {onGoToKeyGate && (
              <button
                type="button"
                onClick={() => onGoToKeyGate(lastPurchasedKey.code)}
                className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap"
              >
                Ativar em CHOSZEN ™©
              </button>
            )}
          </div>
        </div>
      )}

      {/* Store: Loja de Keys Premium */}
      {showKeys && (
        <section aria-label="Loja de Keys Premium" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 mb-1">
                <ShoppingBag className="w-4 h-4" />
                <span>Loja Oficial DLS HUB™</span>
              </div>
              <h3 className="font-display text-xl font-bold text-white">
                Loja de Keys Premium
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Keys compradas permanecem com status <strong className="text-emerald-400 font-semibold">ON — NÃO UTILIZADA</strong> até a 1ª ativação.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {snapshot.plans.map((plan, idx) => {
              const canAfford = snapshot.balance >= plan.price;
              const isBuying = buyingPlanId === plan.id;
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.24,
                    delay: Math.min(idx * 0.06, 0.24),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="rounded-2xl bg-[#10141D] border border-white/[0.08] p-6 flex flex-col justify-between gap-6"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <span>Duração: {plan.durationLabel}</span>
                      </span>
                    </div>

                    <h4 className="font-display text-lg font-bold text-white">
                      {plan.name}
                    </h4>

                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-xs text-slate-400">Preço em dinheiro fictício</p>
                      <p className="font-display font-mono-num text-2xl font-bold text-white mt-1">
                        {formatDlsCurrency(plan.price)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => handleBuyPlan(plan.id)}
                      disabled={isBuying || !canAfford}
                      className={`w-full h-11 px-4 rounded-xl text-xs font-bold tracking-wide transition-colors whitespace-nowrap ${
                        canAfford
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-[#090B10] border border-white/[0.08] text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isBuying ? 'Processando...' : 'COMPRAR'}
                    </button>
                    {!canAfford && (
                      <p className="text-[11px] text-slate-400 text-center">
                        Saldo fictício insuficiente para este plano.
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Save Received Key Card */}
      {showKeys && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Salvar Key Recebida"
          className="rounded-2xl bg-[#10141D] border border-white/[0.08] p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                <BookmarkPlus className="w-4 h-4" />
                <span>Guardar Key Recebida</span>
              </div>
              <h3 className="font-display text-base font-semibold text-white">
                Salvar uma Key recebida na sua aba de Keys
              </h3>
              <p className="text-xs text-slate-400">
                Recebeu uma Key Premium? Cole o código abaixo para deixá-lo salvo aqui com o status real e acesso rápido para copiar ou ativar.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveReceivedKey} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="save-received-key-input" className="sr-only">
                Código da Key recebida
              </label>
              <input
                id="save-received-key-input"
                type="text"
                value={receivedKeyCode}
                onChange={(e) => {
                  setReceivedKeyCode(e.target.value);
                  if (savedKeyFeedback) setSavedKeyFeedback(null);
                }}
                disabled={savingReceivedKey}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Cole a Key recebida (ex.: DLS-1D-XXXX-XXXX)"
                className="flex-1 h-11 px-4 rounded-xl bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 font-mono-num focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={savingReceivedKey}
                className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-colors whitespace-nowrap shrink-0"
              >
                {savingReceivedKey ? 'Salvando...' : 'SALVAR KEY'}
              </button>
            </div>

            {savedKeyFeedback && (
              <div
                role={savedKeyFeedback.type === 'error' ? 'alert' : 'status'}
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  savedKeyFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {savedKeyFeedback.message}
              </div>
            )}
          </form>
        </motion.section>
      )}

      {/* Acquired & Saved Keys List */}
      {showKeys && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Keys Adquiridas e Salvas"
          className="rounded-2xl bg-[#10141D] border border-white/[0.08] overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-sky-400" />
              <h3 className="font-display text-base font-semibold text-white">
                Keys Adquiridas e Salvas
              </h3>
            </div>
            <span className="font-mono-num text-xs text-slate-400">
              {snapshot.keys.length} {snapshot.keys.length === 1 ? 'key salva' : 'keys salvas'}
            </span>
          </div>

          {snapshot.keys.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <p className="text-sm font-semibold text-white">Nenhuma Key salva ainda</p>
              <p className="text-xs text-slate-400">
                Compre uma Key na loja ou salve uma Key recebida acima para vê-la listada aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {snapshot.keys.map((item) => {
                const isUnused = item.status === 'ON — NÃO UTILIZADA';
                const isActive = item.status === 'ATIVA';
                const originLabel =
                  item.origin === 'starter'
                    ? 'Bônus Inicial'
                    : item.origin === 'received'
                    ? 'Key Recebida'
                    : 'Adquirida na Loja';
                return (
                  <div
                    key={item.id}
                    className="p-5 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-white">{item.planName}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-slate-400">{item.durationLabel}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-sky-300 font-medium">{originLabel}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span
                          className={`font-semibold ${
                            isUnused
                              ? 'text-emerald-400'
                              : isActive
                              ? 'text-sky-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <p className="font-mono-num text-base font-bold text-white tracking-wider break-all">
                        {item.code}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono-num">
                        <span>Registrada: {formatDateTime(item.purchasedAt)}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        {isUnused ? (
                          <span className="text-emerald-300/90">
                            Aguardando 1ª ativação em CHOSZEN ™©
                          </span>
                        ) : (
                          <span>
                            Ativada: {formatDateTime(item.activatedAt)} · Expira: {formatDateTime(item.expiresAt)} ({formatRemaining(item.remainingMs)})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyKey(item.code)}
                        className="h-9 px-3.5 rounded-lg bg-[#090B10] border border-white/[0.1] hover:border-white/25 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {copiedCode === item.code ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedCode === item.code ? 'Copiada' : 'Copiar'}</span>
                      </button>

                      {onGoToKeyGate && item.status !== 'EXPIRADA' && (
                        <button
                          type="button"
                          onClick={() => onGoToKeyGate(item.code)}
                          className="h-9 px-3.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 text-sky-300 text-xs font-semibold whitespace-nowrap"
                        >
                          Usar Key
                        </button>
                      )}

                      {item.origin === 'received' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSavedKey(item.code)}
                          aria-label={`Remover Key salva ${item.code}`}
                          className="h-9 w-9 rounded-lg bg-[#090B10] border border-white/[0.08] hover:border-rose-500/40 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>
      )}

      {/* Transaction History */}
      {showCarteira && (
        <section
          aria-label="Histórico de Transações"
          className="rounded-2xl bg-[#10141D] border border-white/[0.08] overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold text-white">
              Extrato da Carteira
            </h3>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#090B10] border border-white/[0.08] self-start sm:self-auto overflow-x-auto">
              {(
                [
                  { id: 'all', label: `Todas (${snapshot.transactions.length})` },
                  { id: 'purchases', label: `Compras (${snapshot.purchaseHistory.length})` },
                  { id: 'credits', label: `Créditos (${snapshot.creditHistory.length})` },
                ] as Array<{ id: HistoryFilter; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    historyFilter === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {visibleTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhuma transação registrada para este filtro ainda.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {visibleTransactions.map((tx) => {
                const isCredit = tx.type === 'credit';
                return (
                  <div
                    key={tx.id}
                    className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isCredit
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-blue-500/15 text-sky-300'
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{tx.description}</p>
                        <p className="text-xs text-slate-400 font-mono-num mt-0.5">
                          {formatDateTime(tx.createdAt)}
                          {tx.keyCode ? ` · ${tx.keyCode}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`font-mono-num text-sm font-semibold ${
                          isCredit ? 'text-emerald-400' : 'text-slate-100'
                        }`}
                      >
                        {isCredit ? '+' : '-'} {formatDlsCurrency(tx.amount)}
                      </p>
                      <p className="font-mono-num text-[11px] text-slate-500 mt-0.5">
                        Saldo: {formatDlsCurrency(tx.balanceAfter)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Owner Settings Panel */}
      {(showCarteira || showKeys) && isOwner && snapshot.config && (
        <section
          aria-label="Configurações do Proprietário"
          className="rounded-2xl bg-[#10141D] border border-blue-500/30 p-6 space-y-5"
        >
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Acesso Exclusivo do Proprietário</span>
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Configurar Valor de Crédito e Preços da Loja
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ajuste o valor concedido pelo código oficial e os preços em dinheiro fictício das 3 opções de Key Premium.
              </p>
            </div>
            <Settings2 className="w-5 h-5 text-sky-400 shrink-0" />
          </div>

          <form onSubmit={handleSaveOwnerConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="cfg-credit-amount" className="text-xs font-medium text-slate-300">
                  Valor do Crédito (DLS$)
                </label>
                <input
                  id="cfg-credit-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={cfgCreditAmount}
                  onChange={(e) => setCfgCreditAmount(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] font-mono-num text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cfg-price-1d" className="text-xs font-medium text-slate-300">
                  Preço — 1 DIA (DLS$)
                </label>
                <input
                  id="cfg-price-1d"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={cfgPrice1d}
                  onChange={(e) => setCfgPrice1d(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] font-mono-num text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cfg-price-7d" className="text-xs font-medium text-slate-300">
                  Preço — 7 DIAS (DLS$)
                </label>
                <input
                  id="cfg-price-7d"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={cfgPrice7d}
                  onChange={(e) => setCfgPrice7d(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] font-mono-num text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cfg-price-1m" className="text-xs font-medium text-slate-300">
                  Preço — 1 MÊS (DLS$)
                </label>
                <input
                  id="cfg-price-1m"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={cfgPrice1m}
                  onChange={(e) => setCfgPrice1m(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] font-mono-num text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Owner-Only Administrative List of All Redeem Codes */}
      {showCodigos && isOwner && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Lista Administrativa dos Códigos de Resgate"
          className="rounded-2xl bg-[#10141D] border border-blue-500/30 overflow-hidden"
        >
          <div className="p-6 border-b border-white/[0.08] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Lista Administrativa · Uso Restrito do Proprietário</span>
                </div>
                <h3 className="font-display text-lg font-bold text-white">
                  {adminCodes ? adminCodes.total : 200} Códigos de Resgate Cadastrados
                </h3>
              </div>

              <button
                type="button"
                onClick={loadAdminCodes}
                disabled={adminCodesLoading}
                className="h-9 px-3.5 rounded-lg bg-[#090B10] border border-white/[0.12] hover:border-white/25 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${adminCodesLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar Lista</span>
              </button>
            </div>

            {adminCodes && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-white/[0.06] text-xs">
                  <div>
                    <p className="text-slate-400">Total cadastrado</p>
                    <p className="font-mono-num text-base font-bold text-white mt-0.5">
                      {adminCodes.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Disponíveis</p>
                    <p className="font-mono-num text-base font-bold text-emerald-400 mt-0.5">
                      {adminCodes.availableCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Utilizados</p>
                    <p className="font-mono-num text-base font-bold text-rose-400 mt-0.5">
                      {adminCodes.usedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">15 · 70 · 100 moedas</p>
                    <p className="font-mono-num text-xs font-semibold text-slate-200 mt-1">
                      {adminCodes.countsByTier['15']?.available ?? 0}/{adminCodes.countsByTier['15']?.total ?? 0} ·{' '}
                      {adminCodes.countsByTier['70']?.available ?? 0}/{adminCodes.countsByTier['70']?.total ?? 0} ·{' '}
                      {adminCodes.countsByTier['100']?.available ?? 0}/{adminCodes.countsByTier['100']?.total ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">180 · 320 · 500 moedas</p>
                    <p className="font-mono-num text-xs font-semibold text-sky-300 mt-1">
                      {adminCodes.countsByTier['180']?.available ?? 0}/{adminCodes.countsByTier['180']?.total ?? 0} ·{' '}
                      {adminCodes.countsByTier['320']?.available ?? 0}/{adminCodes.countsByTier['320']?.total ?? 0} ·{' '}
                      {adminCodes.countsByTier['500']?.available ?? 0}/{adminCodes.countsByTier['500']?.total ?? 0}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#090B10] border border-white/[0.08]">
                      {(
                        [
                          { id: 'all', label: `Todos (${adminCodes.total})` },
                          { id: 'DISPONÍVEL', label: `DISPONÍVEL (${adminCodes.availableCount})` },
                          { id: 'UTILIZADO', label: `UTILIZADO (${adminCodes.usedCount})` },
                        ] as Array<{ id: 'all' | RedeemCodeStatus; label: string }>
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setAdminStatusFilter(tab.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                            adminStatusFilter === tab.id
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <select
                      aria-label="Filtrar por valor do código"
                      value={adminTierFilter}
                      onChange={(e) => setAdminTierFilter(e.target.value as 'all' | RedeemCodeTier)}
                      className="h-9 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs font-medium text-white"
                    >
                      <option value="all">Todos os valores ({adminCodes.total})</option>
                      <option value="15">15 moedas ({adminCodes.countsByTier['15']?.total ?? 0})</option>
                      <option value="70">70 moedas ({adminCodes.countsByTier['70']?.total ?? 0})</option>
                      <option value="100">100 moedas ({adminCodes.countsByTier['100']?.total ?? 0})</option>
                      <option value="180">180 moedas ({adminCodes.countsByTier['180']?.total ?? 0})</option>
                      <option value="especial-250">ESPECIAL — 250 moedas ({adminCodes.countsByTier['especial-250']?.total ?? 0})</option>
                      <option value="320">320 moedas ({adminCodes.countsByTier['320']?.total ?? 0})</option>
                      <option value="500">500 moedas ({adminCodes.countsByTier['500']?.total ?? 0})</option>
                    </select>
                  </div>

                  <div className="relative w-full lg:w-64">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={adminSearch}
                      onChange={(e) => setAdminSearch(e.target.value)}
                      placeholder="Buscar código..."
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs font-mono-num text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {adminCodesLoading && !adminCodes ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Carregando lista administrativa...
            </div>
          ) : !adminCodes || filteredAdminCodes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum código encontrado para este filtro.
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#0D1017] border-b border-white/[0.08] text-[11px] font-medium text-slate-400">
                  <tr>
                    <th className="py-2.5 pl-6 pr-3 w-12">#</th>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Valor</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 hidden sm:table-cell">Utilizado em</th>
                    <th className="py-2.5 pl-3 pr-6 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs">
                  {filteredAdminCodes.map((item, idx) => {
                    const isAvailable = item.status === 'DISPONÍVEL';
                    return (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 pl-6 pr-3 font-mono-num text-slate-500">
                          {String(idx + 1).padStart(3, '0')}
                        </td>
                        <td className="py-2.5 px-3 font-mono-num font-semibold text-white whitespace-nowrap">
                          {item.code}
                        </td>
                        <td className="py-2.5 px-3 font-mono-num whitespace-nowrap">
                          <span className={item.isSpecial ? 'text-sky-300 font-bold' : 'text-slate-200'}>
                            {item.amount} moedas{item.isSpecial ? ' · ESPECIAL' : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                          <span className={isAvailable ? 'text-emerald-400' : 'text-rose-400'}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono-num text-slate-400 hidden sm:table-cell whitespace-nowrap">
                          {item.usedAt ? formatDateTime(item.usedAt) : '—'}
                        </td>
                        <td className="py-2.5 pl-3 pr-6 text-right">
                          <button
                            type="button"
                            onClick={() => handleCopyKey(item.code)}
                            className="px-2.5 py-1 rounded-md bg-[#090B10] border border-white/[0.1] hover:border-white/25 text-[11px] font-medium text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            {copiedCode === item.code ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedCode === item.code ? 'Copiado' : 'Copiar'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { verifyOfficialKey, type VerifyKeyResult } from '../lib/api';

interface KeyGateProps {
  onAuthenticated: (result: VerifyKeyResult) => void;
  initialKey?: string;
}

export function KeyGate({ onAuthenticated, initialKey }: KeyGateProps) {
  const [keyInput, setKeyInput] = useState(initialKey || '');
  const [showKey, setShowKey] = useState(Boolean(initialKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backdropError, setBackdropError] = useState(false);
  const [emblemError, setEmblemError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialKey) {
      setKeyInput(initialKey);
      setShowKey(true);
      setError(null);
    }
  }, [initialKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput) {
      setError('Digite a Key oficial para acessar o painel.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await verifyOfficialKey(keyInput);
      if (res.authenticated) {
        onAuthenticated(res);
      } else {
        setError('Key inválida.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao validar Key no servidor.');
    } finally {
      setLoading(false);
    }
  }

  function insertTrademarkSymbol() {
    const input = inputRef.current;
    if (!input) {
      setKeyInput((prev) => prev + '™');
      return;
    }
    const start = input.selectionStart ?? keyInput.length;
    const end = input.selectionEnd ?? keyInput.length;
    const next = keyInput.slice(0, start) + '™' + keyInput.slice(end);
    setKeyInput(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + 1, start + 1);
    });
  }

  return (
    <div className="min-h-screen bg-[#090B10] text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#10141D]"
      >
        {/* Visual Identity Showcase Panel */}
        <div className="lg:col-span-7 relative flex flex-col justify-between min-h-[260px] lg:min-h-[540px] p-6 sm:p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-white/[0.08] overflow-hidden">
          {!backdropError ? (
            <img
              src="/src/assets/images/choszen_panel_backdrop_1795156426548.jpg"
              alt="Superfície arquitetônica CHOSZEN™©"
              referrerPolicy="no-referrer"
              onError={() => setBackdropError(true)}
              className="absolute inset-0 w-full h-full object-cover opacity-55"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#111827] via-[#090B10] to-[#0B1220]" />
          )}

          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#090B10] via-[#090B10]/70 to-[#090B10]/45"
          />

          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/15 bg-[#090B10] shrink-0 flex items-center justify-center">
              {!emblemError ? (
                <img
                  src="/src/assets/images/choszen_crest_emblem_1795156426033.jpg"
                  alt="Emblema CHOSZEN™©"
                  referrerPolicy="no-referrer"
                  onError={() => setEmblemError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ShieldCheck className="w-5 h-5 text-sky-400" />
              )}
            </div>
            <div>
              <span className="font-display text-lg font-bold tracking-tight text-white">
                CHOSZEN™©
              </span>
              <p className="text-xs text-slate-400">Painel Web Oficial</p>
            </div>
          </div>

          <div className="relative z-10 mt-10 lg:mt-0 space-y-5 max-w-lg">
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              Central CHOSZEN™© com futebol ao vivo, carteira virtual e DLS De Boa.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Acompanhe jogos de hoje e amanhã no horário de Brasília, acesse transmissões oficiais, gerencie Keys Premium e baixe edições do DLS em um painel único.
            </p>

            <div className="pt-2 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="font-medium text-white">Carteira</p>
                <p className="text-slate-400 mt-0.5">Saldo e extratos</p>
              </div>
              <div>
                <p className="font-medium text-white">Keys Premium</p>
                <p className="text-slate-400 mt-0.5">1D, 7D e 1 Mês</p>
              </div>
              <div>
                <p className="font-medium text-white">Futebol</p>
                <p className="text-slate-400 mt-0.5">Jogos e apps</p>
              </div>
              <div>
                <p className="font-medium text-white">DLS De Boa</p>
                <p className="text-slate-400 mt-0.5">Links MediaFire</p>
              </div>
            </div>
          </div>
        </div>

        {/* Authentication Form Panel */}
        <div className="lg:col-span-5 p-6 sm:p-8 lg:p-10 flex flex-col justify-center bg-[#10141D]">
          <div className="space-y-2 mb-7">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-sky-400">
              <KeyRound className="w-4 h-4" />
              <span>Autenticação Oficial</span>
            </div>
            <h2 className="font-display text-2xl font-semibold text-white">
              Acesso por Key
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Insira a Key oficial permanente ou sua Key Premium adquirida em MINHA CARTEIRA para liberar o painel CHOSZEN™©.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="choszen-key-input" className="text-xs font-medium text-slate-300">
                  Key de Acesso
                </label>
                <button
                  type="button"
                  onClick={insertTrademarkSymbol}
                  className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] whitespace-nowrap"
                  title="Inserir símbolo ™ no cursor"
                >
                  Inserir ™
                </button>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  id="choszen-key-input"
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    if (error) setError(null);
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Digite a Key oficial"
                  className="w-full h-12 pl-4 pr-12 rounded-xl bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 font-mono-num focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:border-sky-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  aria-label={showKey ? 'Ocultar Key' : 'Mostrar Key'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 leading-relaxed"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10141D]"
            >
              <span>{loading ? 'Validando no servidor...' : 'Acessar Painel'}</span>
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-8 pt-5 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-500">
            <span>CHOSZEN™©</span>
            <span>Acesso permanente verificado</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

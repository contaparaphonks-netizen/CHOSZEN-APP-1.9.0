import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Play,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Tv,
  X,
  Youtube,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  createFreeApp,
  deleteFreeApp,
  fetchChannelLiveEmbed,
  fetchFreeApps,
} from '../../lib/api';
import type { ChannelLiveEmbedResponse, FreeAppIconType, FreeAppItem } from '../../types';
import { YouTubeOfficialPlayer } from '../YouTubeOfficialPlayer';

function extractYoutubeVideoIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  return null;
}

interface AppsGratuitosSectionProps {
  onNotify: (msg: string) => void;
  isOwner?: boolean;
}

function renderAppIcon(icon: FreeAppIconType) {
  switch (icon) {
    case 'tv':
      return <Tv className="w-5 h-5 text-sky-400" />;
    case 'youtube':
      return <Youtube className="w-5 h-5 text-sky-400" />;
    default:
      return <Globe className="w-5 h-5 text-sky-400" />;
  }
}

export function AppsGratuitosSection({ onNotify, isOwner = false }: AppsGratuitosSectionProps) {
  const [apps, setApps] = useState<FreeAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Space to add new Brazilian channels & links (Owner persistent CRUD)
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Canal Brasileiro · Ao Vivo');
  const [newIcon, setNewIcon] = useState<FreeAppIconType>('youtube');
  const [newUrl, setNewUrl] = useState('');
  const [newYoutubeChannelId, setNewYoutubeChannelId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTryInApp, setNewTryInApp] = useState(true);
  const [saving, setSaving] = useState(false);

  // In-panel live player modal
  const [viewerApp, setViewerApp] = useState<FreeAppItem | null>(null);
  const [embedInfo, setEmbedInfo] = useState<ChannelLiveEmbedResponse | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeVideoTitle, setActiveVideoTitle] = useState<string | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [iframeState, setIframeState] = useState<'attempting' | 'loaded' | 'blocked'>('attempting');

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchFreeApps();
      setApps(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar canais do Brasil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  async function handleCopyUrl(app: FreeAppItem) {
    try {
      await navigator.clipboard.writeText(app.url);
      setCopiedId(app.id);
      onNotify(`Link de "${app.name}" copiado.`);
      setTimeout(() => {
        setCopiedId((prev) => (prev === app.id ? null : prev));
      }, 2000);
    } catch {
      onNotify('Não foi possível copiar automaticamente.');
    }
  }

  async function handleCreateApp(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createFreeApp({
        name: newName,
        category: newCategory,
        icon: newIcon,
        url: newUrl,
        youtubeChannelId: newYoutubeChannelId.trim() || undefined,
        description: newDescription,
        tryInAppBrowser: newTryInApp,
        actionLabel: newTryInApp ? 'ASSISTIR AO VIVO' : 'ABRIR CANAL',
      });
      setApps(res.apps);
      setNewName('');
      setNewUrl('');
      setNewYoutubeChannelId('');
      setNewDescription('');
      setNewTryInApp(true);
      setShowAddForm(false);
      onNotify(`"${res.app.name}" adicionado aos Canais do Brasil.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao adicionar canal.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteApp(app: FreeAppItem) {
    try {
      const res = await deleteFreeApp(app.id);
      setApps(res.apps);
      onNotify(`"${app.name}" removido da lista.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao remover canal.');
    }
  }

  async function handleOpenChannelViewer(app: FreeAppItem) {
    setViewerApp(app);
    setEmbedInfo(null);
    setActiveVideoId(null);
    setActiveVideoTitle(null);
    setCheckError(null);
    setCheckLoading(true);
    setIframeState('attempting');

    try {
      const result = await fetchChannelLiveEmbed({
        url: app.url,
        name: app.name,
        youtubeChannelId: app.youtubeChannelId,
      });
      setEmbedInfo(result);
      const resolvedVideoId =
        result.videoId ||
        extractYoutubeVideoIdFromUrl(result.embedUrl) ||
        result.latestVideos[0]?.videoId ||
        null;

      if (result.embeddable && resolvedVideoId) {
        setActiveVideoId(resolvedVideoId);
        const matchingVideo = result.latestVideos.find((v) => v.videoId === resolvedVideoId);
        setActiveVideoTitle(
          matchingVideo ? matchingVideo.title : `Transmissão ao vivo — ${app.name}`
        );
        setIframeState('loaded');
      } else {
        setIframeState('blocked');
      }
    } catch (err) {
      setCheckError(
        err instanceof Error
          ? err.message
          : 'Não foi possível verificar o player oficial deste canal.'
      );
      setIframeState('blocked');
    } finally {
      setCheckLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-white/[0.08]"
      >
        <div>
          <h3 className="font-display text-xl sm:text-2xl font-bold text-white">
            CANAIS DO BRASIL · TRANSMISSÕES AO VIVO
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Apenas canais oficiais brasileiros com suporte a transmissão ao vivo dentro do painel CHOSZEN™© e fallback direto para o Chrome quando o portal externo bloquear incorporação.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadApps}
            className="h-10 px-3.5 rounded-xl bg-[#10141D] border border-white/[0.1] hover:border-white/25 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddForm ? 'Fechar Cadastro' : 'Adicionar Canal BR'}</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* Owner Add New Brazilian Channel Form */}
      {isOwner && showAddForm && (
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onSubmit={handleCreateApp}
          className="rounded-2xl bg-[#10141D] border border-blue-500/35 p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Adicionar Novo Canal Brasileiro ao Painel</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="app-name" className="text-xs font-medium text-slate-300">
                Nome do Canal
              </label>
              <input
                id="app-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: CazéTV"
                className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="app-category" className="text-xs font-medium text-slate-300">
                Categoria
              </label>
              <input
                id="app-category"
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Canal Brasileiro · Ao Vivo"
                className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="app-icon" className="text-xs font-medium text-slate-300">
                Ícone
              </label>
              <select
                id="app-icon"
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value as FreeAppIconType)}
                className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
              >
                <option value="youtube">YouTube · Live BR</option>
                <option value="tv">TV / Emissora BR</option>
                <option value="globe">Portal Esportivo BR</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="app-url" className="text-xs font-medium text-slate-300">
                Link Oficial (URL)
              </label>
              <input
                id="app-url"
                type="url"
                required
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://www.youtube.com/@..."
                className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm font-mono-num text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-4 space-y-1.5">
              <label htmlFor="app-yt-id" className="text-xs font-medium text-slate-300">
                ID Canal YouTube (opcional)
              </label>
              <input
                id="app-yt-id"
                type="text"
                value={newYoutubeChannelId}
                onChange={(e) => setNewYoutubeChannelId(e.target.value)}
                placeholder="UC..."
                className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm font-mono-num text-white"
              />
            </div>

            <div className="sm:col-span-8 space-y-1.5">
              <label htmlFor="app-description" className="text-xs font-medium text-slate-300">
                Descrição
              </label>
              <input
                id="app-description"
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descreva as transmissões brasileiras exibidas pelo canal."
                className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newTryInApp}
                onChange={(e) => setNewTryInApp(e.target.checked)}
                className="rounded border-white/20 bg-[#090B10]"
              />
              <span>Tentar reproduzir a live diretamente dentro do painel CHOSZEN</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap"
            >
              {saving ? 'Salvando...' : 'Salvar Canal Brasileiro'}
            </button>
          </div>
        </motion.form>
      )}

      {/* Brazilian Channels Grid */}
      {loading && apps.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-52 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse"
            />
          ))}
        </div>
      ) : error && apps.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#10141D] border border-rose-500/30 flex items-center justify-between gap-4">
          <p className="text-sm text-rose-300">{error}</p>
          <button
            type="button"
            onClick={loadApps}
            className="px-4 py-2 rounded-lg bg-rose-500/20 text-xs font-semibold text-rose-200"
          >
            Tentar Novamente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {apps.map((app, index) => (
            <motion.article
              key={app.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.24,
                delay: Math.min(index * 0.05, 0.3),
                ease: [0.16, 1, 0.3, 1],
              }}
              className="rounded-2xl bg-[#10141D] border border-white/[0.08] hover:border-blue-500/35 transition-colors p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
                      {renderAppIcon(app.icon)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{app.category}</span>
                        {app.youtubeChannelId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400 font-medium">Player no Painel</span>
                          </>
                        )}
                      </div>
                      <h4 className="font-display text-lg font-bold text-white truncate mt-0.5">
                        {app.name}
                      </h4>
                    </div>
                  </div>

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleDeleteApp(app)}
                      aria-label={`Remover ${app.name}`}
                      className="w-9 h-9 rounded-lg hover:bg-rose-500/15 text-slate-500 hover:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{app.description}</p>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="font-mono-num text-xs text-slate-400 truncate">{app.url}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(app)}
                    aria-label={`Copiar link de ${app.name}`}
                    className="h-8 px-2.5 rounded-lg bg-[#090B10] border border-white/[0.1] hover:border-white/25 text-xs text-slate-300 hover:text-white flex items-center gap-1 shrink-0 transition-colors"
                  >
                    {copiedId === app.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === app.id ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              <div>
                {app.tryInAppBrowser !== false ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleOpenChannelViewer(app)}
                      className="flex-1 h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>{app.actionLabel || 'ASSISTIR AO VIVO'}</span>
                    </button>
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-11 px-4 rounded-xl bg-[#090B10] border border-white/[0.12] hover:border-blue-500/40 text-slate-200 hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Chrome</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </div>
                ) : (
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <span>{app.actionLabel || 'ABRIR CANAL'}</span>
                    <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                )}
              </div>
            </motion.article>
          ))}

          {/* Reserved Extensible Slot for Adding New Brazilian Channels */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.24,
              delay: Math.min(apps.length * 0.05, 0.3),
              ease: [0.16, 1, 0.3, 1],
            }}
            className="rounded-2xl bg-[#0D111A] border border-dashed border-white/[0.14] p-6 flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
                <Plus className="w-4 h-4" />
                <span>Espaço Expansível · Brasil</span>
              </div>
              <h4 className="font-display text-lg font-semibold text-white">
                Novos Canais Brasileiros
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                Área reservada para cadastrar novos canais e transmissões brasileiras posteriormente diretamente pelo painel.
              </p>
            </div>

            {isOwner ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full h-11 px-4 rounded-xl bg-[#10141D] border border-blue-500/35 hover:border-blue-400 text-sky-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Canal Brasileiro</span>
              </button>
            ) : (
              <p className="text-xs text-slate-500">
                Gerenciado pelo proprietário do painel CHOSZEN™©.
              </p>
            )}
          </motion.div>
        </div>
      )}

      {/* CHOSZEN In-Panel Live Player Modal (Brazilian Official Channels) */}
      {viewerApp && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Player CHOSZEN — ${viewerApp.name}`}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#10141D] border border-blue-500/35 p-5 sm:p-6 space-y-4"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/[0.08]">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-sky-400 font-semibold">
                  <Radio className="w-4 h-4 shrink-0" />
                  <span>Player Interno CHOSZEN™© · Canal Brasileiro</span>
                </div>
                <h4 className="font-display text-lg sm:text-xl font-bold text-white">
                  {viewerApp.name}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setViewerApp(null)}
                aria-label="Fechar player"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Official URL Bar + YouTube / Chrome Buttons */}
            <div className="p-2.5 rounded-xl bg-[#090B10] border border-white/[0.1] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0 px-1">
                <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-mono-num text-xs text-slate-300 truncate">
                  {viewerApp.url}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {(viewerApp.url.includes('youtube.com') || Boolean(viewerApp.youtubeChannelId)) && (
                  <a
                    href={
                      activeVideoId
                        ? `https://www.youtube.com/watch?v=${activeVideoId}`
                        : viewerApp.url
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Youtube className="w-3.5 h-3.5 shrink-0" />
                    <span>ASSISTIR NO YOUTUBE</span>
                  </a>
                )}
                <a
                  href={viewerApp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-3.5 rounded-lg bg-[#10141D] border border-white/[0.12] hover:border-blue-500/40 text-slate-100 hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <span>ABRIR NO CHROME</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              </div>
            </div>

            {checkError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                {checkError}
              </div>
            )}

            {/* In-Panel Live Player OR Honest YouTube/Chrome Fallback */}
            {checkLoading ? (
              <div className="h-72 rounded-xl bg-[#090B10] border border-white/[0.08] flex flex-col items-center justify-center gap-3 p-6 text-center">
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
                <p className="text-xs text-slate-300">
                  Verificando transmissão oficial de {viewerApp.name}...
                </p>
              </div>
            ) : iframeState === 'blocked' || !embedInfo?.embeddable || !activeVideoId ? (
              <div className="rounded-xl bg-[#090B10] border border-white/[0.1] p-6 sm:p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto">
                  <ExternalLink className="w-5 h-5 text-sky-400" />
                </div>
                <div className="space-y-1.5 max-w-lg mx-auto">
                  <h5 className="font-display text-base font-bold text-white">
                    Incorporação indisponível neste canal no momento
                  </h5>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {embedInfo?.blockReason ||
                      'Este canal oficial não liberou incorporação ao vivo agora.'}{' '}
                    Abra o canal oficial no YouTube ou no Chrome para acompanhar sem players falsos.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  {(viewerApp.url.includes('youtube.com') || Boolean(viewerApp.youtubeChannelId)) && (
                    <a
                      href={viewerApp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Youtube className="w-4 h-4 shrink-0" />
                      <span>ASSISTIR NO YOUTUBE</span>
                    </a>
                  )}
                  <a
                    href={viewerApp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-11 px-6 rounded-xl bg-[#10141D] border border-white/[0.14] hover:border-blue-500/40 text-slate-100 hover:text-white text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <span>ABRIR NO CHROME</span>
                    <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Switcher between Verified Live Stream and Recent Embeddable Videos */}
                {(extractYoutubeVideoIdFromUrl(embedInfo.liveEmbedUrl) ||
                  embedInfo.latestVideos.length > 0) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-300">
                      Transmissão ativa e vídeos recentes de {viewerApp.name}:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {extractYoutubeVideoIdFromUrl(embedInfo.liveEmbedUrl) && (
                        <button
                          type="button"
                          onClick={() => {
                            const liveVid = extractYoutubeVideoIdFromUrl(embedInfo.liveEmbedUrl);
                            if (liveVid) {
                              setActiveVideoId(liveVid);
                              setActiveVideoTitle(`Live do Canal — ${viewerApp.name}`);
                            }
                          }}
                          className={`h-9 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                            activeVideoId === extractYoutubeVideoIdFromUrl(embedInfo.liveEmbedUrl)
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#090B10] border border-white/[0.1] text-slate-300 hover:text-white'
                          }`}
                        >
                          Live Principal do Canal
                        </button>
                      )}

                      {embedInfo.latestVideos.slice(0, 3).map((vid) => (
                        <button
                          key={vid.videoId}
                          type="button"
                          onClick={() => {
                            setActiveVideoId(vid.videoId);
                            setActiveVideoTitle(vid.title);
                          }}
                          className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors max-w-[260px] truncate ${
                            activeVideoId === vid.videoId
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'bg-[#090B10] border border-white/[0.1] text-slate-300 hover:text-white'
                          }`}
                          title={vid.title}
                        >
                          {vid.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">
                      {activeVideoTitle || `Player oficial do YouTube — ${viewerApp.name}`}
                    </span>
                  </span>
                </div>

                <YouTubeOfficialPlayer
                  key={activeVideoId}
                  videoId={activeVideoId}
                  title={activeVideoTitle || viewerApp.name}
                  youtubeUrl={`https://www.youtube.com/watch?v=${activeVideoId}`}
                  chromeUrl={viewerApp.url}
                />
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

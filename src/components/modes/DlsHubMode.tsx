import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  ImagePlus,
  Lock,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  confirmTikTokFollowUnlock,
  fetchDlsHub,
  updateDlsHubConfig,
} from '../../lib/api';
import type { DlsDownloadItem, DlsHubData } from '../../types';

interface DlsHubModeProps {
  onNotify: (msg: string) => void;
  isOwner?: boolean;
}

export function DlsHubMode({ onNotify, isOwner = false }: DlsHubModeProps) {
  const [data, setData] = useState<DlsHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [avatarError, setAvatarError] = useState(false);
  const [verifyingFollow, setVerifyingFollow] = useState(false);
  const [followSecondsLeft, setFollowSecondsLeft] = useState(0);

  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Owner customization drawer
  const [editingOwner, setEditingOwner] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editTiktokUrl, setEditTiktokUrl] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editDownloads, setEditDownloads] = useState<DlsDownloadItem[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  const followSectionRef = useRef<HTMLElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const syncEditorFields = useCallback((hub: DlsHubData) => {
    setEditDisplayName(hub.creator.displayName);
    setEditHandle(hub.creator.tiktokHandle);
    setEditTiktokUrl(hub.creator.tiktokUrl);
    setEditAvatarUrl(hub.creator.avatarUrl);
    setEditDownloads(hub.downloads.map((d) => ({ ...d })));
  }, []);

  const loadHub = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDlsHub();
      setData(res);
      setAvatarError(false);
      syncEditorFields(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar menu DLS.');
    } finally {
      setLoading(false);
    }
  }, [syncEditorFields]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  // Countdown verification after clicking "Seguir no TikTok"
  useEffect(() => {
    if (!verifyingFollow) return;
    if (followSecondsLeft <= 0) {
      let active = true;
      confirmTikTokFollowUnlock()
        .then((updated) => {
          if (!active) return;
          setData(updated);
          setVerifyingFollow(false);
          onNotify('Inscrição confirmada! Os botões INSTALAR do MediaFire foram liberados.');
        })
        .catch((err) => {
          if (!active) return;
          setVerifyingFollow(false);
          onNotify(err instanceof Error ? err.message : 'Falha ao liberar downloads.');
        });
      return () => {
        active = false;
      };
    }

    const t = setTimeout(() => {
      setFollowSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [verifyingFollow, followSecondsLeft, onNotify]);

  function handleTikTokFollowClick() {
    if (data?.followUnlocked || verifyingFollow) return;
    setVerifyingFollow(true);
    setFollowSecondsLeft(3);
  }

  function handleLockedInstallAttempt() {
    onNotify('Siga o perfil oficial no TikTok acima para liberar o botão INSTALAR.');
    followSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      onNotify('Escolha uma imagem de até 2,5 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditAvatarUrl(reader.result);
        setAvatarError(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSaveOwnerConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await updateDlsHubConfig({
        creator: {
          displayName: editDisplayName,
          tiktokHandle: editHandle,
          tiktokUrl: editTiktokUrl,
          avatarUrl: editAvatarUrl,
        },
        downloads: editDownloads,
      });
      setData(res.data);
      setAvatarError(false);
      syncEditorFields(res.data);
      setEditingOwner(false);
      onNotify(res.message);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  }

  function handleAddDownloadRow() {
    setEditDownloads((prev) => [
      ...prev,
      {
        id: `dls-${Date.now()}`,
        version: 'DLS 25',
        editionName: 'NOVA EDIÇÃO',
        architecture: 'ARM64 · ARMv7',
        fileName: 'DLS25_ARM64_ARMV7.zip',
        mediafireUrl: 'https://www.mediafire.com/',
      },
    ]);
  }

  const versions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.downloads.map((d) => d.version)));
  }, [data]);

  const filteredDownloads = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.downloads.filter((item) => {
      if (versionFilter !== 'all' && item.version !== versionFilter) return false;
      if (!q) return true;
      return (
        item.version.toLowerCase().includes(q) ||
        item.editionName.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q)
      );
    });
  }, [data, versionFilter, searchQuery]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-36 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-32 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse" />
          <div className="h-32 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 rounded-2xl bg-[#10141D] border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-rose-300">{error}</p>
        <button
          type="button"
          onClick={loadHub}
          className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-semibold text-rose-200 whitespace-nowrap"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { creator, followUnlocked } = data;

  return (
    <div className="space-y-7">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-white/[0.08]"
      >
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
            DLS DE BOA · Central de Downloads
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Edições oficiais do DLS 20 em diante com links diretos do MediaFire. Siga o criador no TikTok para liberar o botão INSTALAR.
          </p>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={() => setEditingOwner((prev) => !prev)}
            className="h-10 px-4 rounded-xl bg-[#10141D] border border-blue-500/35 hover:border-blue-400 text-xs font-semibold text-sky-300 flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Settings2 className="w-4 h-4" />
            <span>{editingOwner ? 'Fechar Editor' : 'Editar TikTok e Links'}</span>
          </button>
        )}
      </motion.div>

      {/* Owner Editor Drawer (TikTok Photo, TikTok Link, and DLS MediaFire Links) */}
      {isOwner && editingOwner && (
        <form
          onSubmit={handleSaveOwnerConfig}
          className="rounded-2xl bg-[#10141D] border border-sky-500/35 p-6 space-y-6"
        >
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Painel do Proprietário</span>
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Configurar Foto, Link do TikTok e Arquivos DLS
              </h3>
            </div>
          </div>

          {/* Creator TikTok Fields */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            <div className="md:col-span-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/15 bg-[#090B10] shrink-0 flex items-center justify-center">
                {editAvatarUrl && !avatarError ? (
                  <img
                    src={editAvatarUrl}
                    alt="Prévia da foto do TikTok"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserCheck className="w-6 h-6 text-slate-400" />
                )}
              </div>

              <div className="space-y-2">
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  className="h-9 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] hover:border-white/25 text-xs font-medium text-white flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Enviar Foto do TikTok</span>
                </button>
                <p className="text-[11px] text-slate-400">PNG ou JPG até 2,5 MB</p>
              </div>
            </div>

            <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="creator-name" className="text-xs font-medium text-slate-300">
                  Nome do Criador
                </label>
                <input
                  id="creator-name"
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="creator-handle" className="text-xs font-medium text-slate-300">
                  @ do TikTok
                </label>
                <input
                  id="creator-handle"
                  type="text"
                  required
                  value={editHandle}
                  onChange={(e) => setEditHandle(e.target.value)}
                  placeholder="@seuperfil"
                  className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label htmlFor="creator-tiktok-url" className="text-xs font-medium text-slate-300">
                  Link do seu TikTok
                </label>
                <input
                  id="creator-tiktok-url"
                  type="url"
                  required
                  value={editTiktokUrl}
                  onChange={(e) => setEditTiktokUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@seuperfil"
                  className="w-full h-10 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white font-mono-num"
                />
              </div>
            </div>
          </div>

          {/* DLS Links Editor */}
          <div className="space-y-3 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-slate-200">
                Links DLS ({editDownloads.length})
              </h4>
              <button
                type="button"
                onClick={handleAddDownloadRow}
                className="h-8 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] hover:border-white/25 text-xs font-medium text-slate-200 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar DLS</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {editDownloads.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[#090B10] border border-white/[0.08] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                >
                  <input
                    type="text"
                    value={item.version}
                    onChange={(e) =>
                      setEditDownloads((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, version: e.target.value } : row))
                      )
                    }
                    placeholder="DLS 20"
                    className="sm:col-span-2 h-9 px-2.5 rounded-lg bg-[#10141D] border border-white/[0.1] text-xs font-semibold text-white"
                  />
                  <input
                    type="text"
                    value={item.editionName}
                    onChange={(e) =>
                      setEditDownloads((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, editionName: e.target.value } : row))
                      )
                    }
                    placeholder="INFINITO ES"
                    className="sm:col-span-3 h-9 px-2.5 rounded-lg bg-[#10141D] border border-white/[0.1] text-xs text-white"
                  />
                  <input
                    type="url"
                    value={item.mediafireUrl}
                    onChange={(e) =>
                      setEditDownloads((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, mediafireUrl: e.target.value } : row))
                      )
                    }
                    placeholder="https://www.mediafire.com/..."
                    className="sm:col-span-6 h-9 px-2.5 rounded-lg bg-[#10141D] border border-white/[0.1] text-xs font-mono-num text-slate-200"
                  />
                  <button
                    type="button"
                    disabled={editDownloads.length <= 1}
                    onClick={() => setEditDownloads((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={`Remover ${item.version}`}
                    className="sm:col-span-1 h-9 rounded-lg hover:bg-rose-500/15 text-slate-500 hover:text-rose-400 disabled:opacity-30 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingOwner(false)}
              className="h-10 px-4 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingConfig}
              className="h-10 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold"
            >
              {savingConfig ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      )}

      {/* TikTok Creator & Follow-to-Unlock Gate */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
        ref={followSectionRef}
        aria-label="Seguir no TikTok para liberar downloads"
        className={`rounded-2xl border p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 transition-colors ${
          followUnlocked
            ? 'bg-[#10141D] border-emerald-500/35'
            : 'bg-gradient-to-br from-[#121826] via-[#10141D] to-[#0D1424] border-blue-500/35'
        }`}
      >
        <div className="flex items-center gap-4 sm:gap-5 min-w-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-white/15 bg-[#090B10] shrink-0 flex items-center justify-center">
            {creator.avatarUrl && !avatarError ? (
              <img
                src={creator.avatarUrl}
                alt={`Foto do TikTok de ${creator.displayName}`}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserCheck className="w-8 h-8 text-sky-400" />
            )}
          </div>

          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-white">{creator.displayName}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-num text-sky-300">{creator.tiktokHandle}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              {followUnlocked ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Seguidor confirmado</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Downloads bloqueados</span>
                </span>
              )}
            </div>

            <h3 className="font-display text-lg sm:text-xl font-bold text-white">
              {followUnlocked
                ? 'Downloads liberados! Escolha sua versão do DLS abaixo.'
                : 'Siga no TikTok para liberar o botão INSTALAR'}
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              {followUnlocked
                ? 'Seu perfil já está liberado. Clique em INSTALAR ao lado da versão desejada para ir direto ao link oficial no MediaFire.'
                : 'Para desbloquear os downloads do DLS 20 em diante, toque em Seguir no TikTok, siga o perfil oficial e aguarde a confirmação automática.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <a
            href={creator.tiktokUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleTikTokFollowClick}
            className={`h-12 px-5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
              followUnlocked
                ? 'bg-[#090B10] border border-white/[0.14] hover:border-white/30 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            <span>
              {verifyingFollow
                ? `Confirmando seguidor (${followSecondsLeft}s)...`
                : followUnlocked
                ? 'Ver Perfil no TikTok'
                : 'Seguir no TikTok'}
            </span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>
        </div>
      </motion.section>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setVersionFilter('all')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              versionFilter === 'all'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'bg-[#10141D] border border-white/[0.08] text-slate-300 hover:text-white'
            }`}
          >
            Todos ({data.downloads.length})
          </button>
          {versions.map((ver) => (
            <button
              key={ver}
              type="button"
              onClick={() => setVersionFilter(ver)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                versionFilter === ver
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-[#10141D] border border-white/[0.08] text-slate-300 hover:text-white'
              }`}
            >
              {ver}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar DLS ou edição..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#10141D] border border-white/[0.1] text-xs text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          />
        </div>
      </div>

      {/* DLS 20+ Downloads Menu List */}
      <section
        aria-label="Lista de downloads DLS 20 e posteriores"
        className="rounded-2xl bg-[#10141D] border border-white/[0.08] overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
          <h3 className="font-display text-base font-semibold text-white">
            Menu DLS 20 e Posteriores
          </h3>
          <span className="text-xs text-slate-400 font-mono-num">
            {filteredDownloads.length} {filteredDownloads.length === 1 ? 'arquivo' : 'arquivos'} · MediaFire
          </span>
        </div>

        {filteredDownloads.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Nenhuma edição encontrada para este filtro.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filteredDownloads.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  delay: Math.min(idx * 0.045, 0.22),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  {/* DLS Version + Edition Name right next to it */}
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-display text-lg sm:text-xl font-bold text-sky-400 whitespace-nowrap">
                      {item.version}
                    </span>
                    <span aria-hidden="true" className="text-slate-600 font-bold">
                      —
                    </span>
                    <h4 className="font-display text-lg sm:text-xl font-bold text-white">
                      {item.editionName}
                    </h4>
                  </div>

                  {/* Metadata (unboxed, zero pills) */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 font-mono-num">
                    <span>{item.architecture}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-full">{item.fileName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-300">MediaFire</span>
                  </div>
                </div>

                <div className="shrink-0">
                  {followUnlocked ? (
                    <a
                      href={item.mediafireUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-11 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap w-full sm:w-auto"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span>INSTALAR</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLockedInstallAttempt}
                      className="h-11 px-5 rounded-xl bg-[#090B10] border border-white/[0.12] hover:border-blue-500/40 text-slate-400 hover:text-slate-200 text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap w-full sm:w-auto"
                    >
                      <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>INSTALAR (SIGA NO TIKTOK)</span>
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

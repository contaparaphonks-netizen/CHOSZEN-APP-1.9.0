import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppWindow,
  BarChart3,
  CheckCircle2,
  Clock,
  ExternalLink,
  Film,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  Trophy,
  Tv,
  X,
  Youtube,
} from 'lucide-react';
import { motion } from 'motion/react';
import { YouTubeOfficialPlayer } from '../YouTubeOfficialPlayer';
import {
  deleteUserPrediction,
  fetchAllGames,
  fetchCompetitions,
  fetchMatchDetail,
  fetchMatchPrediction,
  fetchMatchStream,
  fetchStandings,
  fetchTeams,
  fetchUserPredictions,
  saveUserPrediction,
} from '../../lib/api';
import type {
  CompetitionInfo,
  FootballClub,
  FootballMatch,
  FootballSubTab,
  MatchDayBucket,
  MatchDetailData,
  MatchPredictionDetail,
  MatchStreamResponse,
  StandingEntry,
  StreamSourceOption,
  UserMatchPrediction,
} from '../../types';
import { TeamBadge } from '../TeamBadge';
import { AppsGratuitosSection } from './AppsGratuitosSection';

interface FootballHubModeProps {
  onNotify: (msg: string) => void;
  isOwner?: boolean;
}

type DayFilter = 'all' | 'today' | 'tomorrow' | 'upcoming' | 'recent';
type ScopeFilter = 'all' | 'nacional' | 'internacional';
type MatchStatusFilter = 'all' | 'in' | 'pre' | 'post';

function formatBrasiliaClockNow(now: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
}

function formatMatchTimeBrasilia(isoDate: string): string {
  if (!isoDate) return '--:--';
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

function formatMatchDateBrasilia(isoDate: string): string {
  if (!isoDate) return '';
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
}

function getBucketLabel(bucket: MatchDayBucket): string {
  switch (bucket) {
    case 'today':
      return 'Hoje';
    case 'tomorrow':
      return 'Amanhã';
    case 'upcoming':
      return 'Próximos Jogos';
    case 'recent':
      return 'Recentes';
  }
}

export function FootballHubMode({ onNotify, isOwner = false }: FootballHubModeProps) {
  const [activeTab, setActiveTab] = useState<FootballSubTab>('todos-jogos');
  const [brasiliaNow, setBrasiliaNow] = useState<Date>(() => new Date());

  // Competitions & Games
  const [competitions, setCompetitions] = useState<CompetitionInfo[]>([]);
  const [matches, setMatches] = useState<FootballMatch[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // Filters inside TODOS OS JOGOS
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>('all');
  const [matchSearch, setMatchSearch] = useState('');

  // Standings & Clubs
  const [standingsLeague, setStandingsLeague] = useState<string>('bra.1');
  const [standingsGroups, setStandingsGroups] = useState<
    Array<{ groupName: string; entries: StandingEntry[] }>
  >([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState<string | null>(null);

  const [clubs, setClubs] = useState<FootballClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [clubSearch, setClubSearch] = useState('');

  // User & Statistical Pre-Match Predictions ("Prever Placar")
  const [userPredictions, setUserPredictions] = useState<Record<string, UserMatchPrediction>>({});
  const [predictMatch, setPredictMatch] = useState<FootballMatch | null>(null);
  const [predictDetail, setPredictDetail] = useState<MatchPredictionDetail | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [palpiteHome, setPalpiteHome] = useState<number>(1);
  const [palpiteAway, setPalpiteAway] = useState<number>(1);
  const [savingPalpite, setSavingPalpite] = useState(false);

  // Match Detail Modal
  const [selectedMatch, setSelectedMatch] = useState<MatchDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Watch Broadcast & Match Highlights Modal (▶ ASSISTIR TRANSMISSÃO / DESTAQUES)
  const [streamMatch, setStreamMatch] = useState<FootballMatch | null>(null);
  const [streamData, setStreamData] = useState<MatchStreamResponse | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamViewTab, setStreamViewTab] = useState<'canais' | 'destaques'>('canais');
  const [selectedSourceByMatch, setSelectedSourceByMatch] = useState<Record<string, string>>({});
  const [selectedTabByMatch, setSelectedTabByMatch] = useState<
    Record<string, 'canais' | 'destaques'>
  >({});
  const [playerExpanded, setPlayerExpanded] = useState(false);

  // Live Brasília GMT-3 Clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setBrasiliaNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchCompetitions()
      .then((list) => setCompetitions(list))
      .catch(() => {});
    fetchUserPredictions()
      .then((preds) => setUserPredictions(preds))
      .catch(() => {});
  }, []);

  const loadAllGames = useCallback(async (forceRefresh = false) => {
    setGamesLoading(true);
    setGamesError(null);
    try {
      const res = await fetchAllGames('all', 'all', forceRefresh);
      setMatches(res.matches);
      setFetchedAt(res.fetchedAt);
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Erro ao carregar central de jogos.');
    } finally {
      setGamesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'todos-jogos') {
      loadAllGames(false);
    }
  }, [activeTab, loadAllGames]);

  // Auto-refresh matches every 45s while viewing TODOS OS JOGOS
  useEffect(() => {
    if (activeTab !== 'todos-jogos') return;
    const timer = setInterval(() => {
      loadAllGames(false);
    }, 45000);
    return () => clearInterval(timer);
  }, [activeTab, loadAllGames]);

  const loadStandings = useCallback(async (leagueSlug: string) => {
    setStandingsLoading(true);
    setStandingsError(null);
    try {
      const res = await fetchStandings(leagueSlug);
      setStandingsGroups(res.groups);
      setFetchedAt(res.fetchedAt);
    } catch (err) {
      setStandingsError(err instanceof Error ? err.message : 'Erro ao carregar classificação.');
    } finally {
      setStandingsLoading(false);
    }
  }, []);

  const loadClubs = useCallback(async (leagueSlug: string) => {
    setClubsLoading(true);
    setClubsError(null);
    try {
      const res = await fetchTeams(leagueSlug);
      setClubs(res.teams);
      setFetchedAt(res.fetchedAt);
    } catch (err) {
      setClubsError(err instanceof Error ? err.message : 'Erro ao carregar clubes.');
    } finally {
      setClubsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'classificacao') {
      loadStandings(standingsLeague);
    } else if (activeTab === 'clubes') {
      loadClubs(standingsLeague);
    }
  }, [activeTab, standingsLeague, loadStandings, loadClubs]);

  const availableLeaguesForScope = useMemo(() => {
    if (scopeFilter === 'all') return competitions;
    return competitions.filter((c) => c.scope === scopeFilter);
  }, [competitions, scopeFilter]);

  useEffect(() => {
    if (
      selectedLeague !== 'all' &&
      !availableLeaguesForScope.some((c) => c.slug === selectedLeague)
    ) {
      setSelectedLeague('all');
    }
  }, [availableLeaguesForScope, selectedLeague]);

  const dayCounts = useMemo(() => {
    let today = 0;
    let tomorrow = 0;
    let upcoming = 0;
    let recent = 0;
    for (const m of matches) {
      if (scopeFilter !== 'all' && m.scope !== scopeFilter) continue;
      if (selectedLeague !== 'all' && m.leagueSlug !== selectedLeague) continue;
      if (m.dayBucket === 'today') today++;
      else if (m.dayBucket === 'tomorrow') tomorrow++;
      else if (m.dayBucket === 'upcoming') upcoming++;
      else recent++;
    }
    return {
      all: today + tomorrow + upcoming + recent,
      today,
      tomorrow,
      upcoming,
      recent,
    };
  }, [matches, scopeFilter, selectedLeague]);

  const statusCounts = useMemo(() => {
    let live = 0;
    let pre = 0;
    let post = 0;
    for (const m of matches) {
      if (scopeFilter !== 'all' && m.scope !== scopeFilter) continue;
      if (selectedLeague !== 'all' && m.leagueSlug !== selectedLeague) continue;
      if (dayFilter !== 'all' && m.dayBucket !== dayFilter) continue;
      if (m.statusState === 'in') live++;
      else if (m.statusState === 'pre') pre++;
      else post++;
    }
    return { all: live + pre + post, in: live, pre, post };
  }, [matches, scopeFilter, selectedLeague, dayFilter]);

  const filteredMatches = useMemo(() => {
    const q = matchSearch.trim().toLowerCase();
    return matches.filter((m) => {
      if (scopeFilter !== 'all' && m.scope !== scopeFilter) return false;
      if (selectedLeague !== 'all' && m.leagueSlug !== selectedLeague) return false;
      if (dayFilter !== 'all' && m.dayBucket !== dayFilter) return false;
      if (statusFilter !== 'all' && m.statusState !== statusFilter) return false;
      if (q) {
        const hay = `${m.homeTeam.name} ${m.awayTeam.name} ${m.leagueName} ${m.broadcasts.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [matches, scopeFilter, selectedLeague, dayFilter, statusFilter, matchSearch]);

  const filteredClubs = useMemo(() => {
    const q = clubSearch.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter(
      (c) => c.name.toLowerCase().includes(q) || c.abbr.toLowerCase().includes(q)
    );
  }, [clubs, clubSearch]);

  async function openMatchDetails(match: FootballMatch) {
    setDetailLoading(true);
    setDetailError(null);
    setSelectedMatch({
      id: match.id,
      leagueSlug: match.leagueSlug,
      leagueName: match.leagueName,
      date: match.date,
      statusState: match.statusState,
      statusLabel: match.statusLabel,
      statusDetail: match.statusDetail,
      displayClock: match.displayClock,
      venue: match.venue,
      attendance: null,
      broadcasts: match.broadcasts,
      officialUrl: match.officialUrl,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      events: [],
      stats: [],
    });
    try {
      const detail = await fetchMatchDetail(match.leagueSlug, match.id);
      setSelectedMatch(detail);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Não foi possível carregar detalhes.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function openBroadcastPlayer(
    match: FootballMatch,
    preferredTab?: 'canais' | 'destaques'
  ) {
    const matchKey = `${match.leagueSlug}:${match.id}`;
    const savedTab = selectedTabByMatch[matchKey];
    const initialTab: 'canais' | 'destaques' =
      preferredTab || savedTab || (match.statusState === 'post' ? 'destaques' : 'canais');

    setStreamMatch(match);
    setStreamData(null);
    setStreamError(null);
    setStreamViewTab(initialTab);
    setPlayerExpanded(false);
    setStreamLoading(true);
    try {
      const res = await fetchMatchStream(
        match.leagueSlug,
        match.id,
        match.homeTeam.name,
        match.awayTeam.name
      );
      setStreamData(res);

      // If no preferredTab/savedTab was forced and user opened an ended game with no highlights, fallback to canais
      if (!preferredTab && !savedTab) {
        if (initialTab === 'destaques' && (!res.highlightSources || res.highlightSources.length === 0)) {
          setStreamViewTab('canais');
        }
      }

      const existingSelection = selectedSourceByMatch[matchKey];
      const allOptions = [
        ...(res.channelOptions || []),
        ...(res.embeddableSources || []),
        ...(res.highlightSources || []),
      ];
      if (!existingSelection || !allOptions.some((o) => o.id === existingSelection)) {
        const defaultSource =
          initialTab === 'destaques' && res.highlightSources?.length > 0
            ? res.highlightSources[0]
            : res.embeddableSources?.[0] ||
              res.channelOptions?.find((c) => c.embeddable) ||
              res.channelOptions?.[0] ||
              res.highlightSources?.[0] ||
              null;
        if (defaultSource) {
          setSelectedSourceByMatch((prev) => ({
            ...prev,
            [matchKey]: defaultSource.id,
          }));
        }
      }
    } catch (err) {
      setStreamError(
        err instanceof Error ? err.message : 'Não foi possível verificar os canais brasileiros.'
      );
    } finally {
      setStreamLoading(false);
    }
  }

  const activeStreamKey = streamMatch ? `${streamMatch.leagueSlug}:${streamMatch.id}` : '';

  const currentTabOptions: StreamSourceOption[] = useMemo(() => {
    if (!streamData) return [];
    if (streamViewTab === 'destaques') {
      return streamData.highlightSources || [];
    }
    if (streamData.channelOptions && streamData.channelOptions.length > 0) {
      return streamData.channelOptions;
    }
    return streamData.embeddableSources || [];
  }, [streamData, streamViewTab]);

  const activeSource: StreamSourceOption | null = useMemo(() => {
    if (!streamData || currentTabOptions.length === 0) return null;
    const savedId = activeStreamKey ? selectedSourceByMatch[activeStreamKey] : undefined;
    if (savedId) {
      const found = currentTabOptions.find((s) => s.id === savedId);
      if (found) return found;
    }
    return currentTabOptions.find((s) => s.embeddable) || currentTabOptions[0] || null;
  }, [streamData, currentTabOptions, activeStreamKey, selectedSourceByMatch]);

  function handleSelectStreamTab(tab: 'canais' | 'destaques') {
    setStreamViewTab(tab);
    if (activeStreamKey) {
      setSelectedTabByMatch((prev) => ({ ...prev, [activeStreamKey]: tab }));
    }
    if (!streamData) return;
    const targetList =
      tab === 'destaques'
        ? streamData.highlightSources || []
        : streamData.channelOptions?.length
          ? streamData.channelOptions
          : streamData.embeddableSources || [];
    if (targetList.length > 0 && activeStreamKey) {
      const currentSaved = selectedSourceByMatch[activeStreamKey];
      if (!currentSaved || !targetList.some((o) => o.id === currentSaved)) {
        const preferred = targetList.find((o) => o.embeddable) || targetList[0];
        setSelectedSourceByMatch((prev) => ({ ...prev, [activeStreamKey]: preferred.id }));
      }
    }
  }

  function handleSelectSourceOption(src: StreamSourceOption) {
    if (!activeStreamKey) return;
    setSelectedSourceByMatch((prev) => ({ ...prev, [activeStreamKey]: src.id }));
  }

  async function openPredictionModal(match: FootballMatch) {
    const key = `${match.leagueSlug}:${match.id}`;
    const existing = userPredictions[key];
    setPredictMatch(match);
    setPredictDetail(null);
    setPredictError(null);
    setPalpiteHome(existing ? existing.homeScore : (match.autoPrediction?.predictedHomeScore ?? 1));
    setPalpiteAway(existing ? existing.awayScore : (match.autoPrediction?.predictedAwayScore ?? 1));
    setPredictLoading(true);
    try {
      const detail = await fetchMatchPrediction({
        league: match.leagueSlug,
        eventId: match.id,
        homeId: match.homeTeam.id,
        awayId: match.awayTeam.id,
        homeName: match.homeTeam.name,
        awayName: match.awayTeam.name,
      });
      setPredictDetail(detail);
      if (!existing && detail.hasEnoughData) {
        setPalpiteHome(detail.predictedHomeScore);
        setPalpiteAway(detail.predictedAwayScore);
      }
    } catch (err) {
      setPredictError(err instanceof Error ? err.message : 'Erro ao calcular previsão.');
    } finally {
      setPredictLoading(false);
    }
  }

  async function handleSavePalpite() {
    if (!predictMatch) return;
    setSavingPalpite(true);
    try {
      const res = await saveUserPrediction({
        leagueSlug: predictMatch.leagueSlug,
        eventId: predictMatch.id,
        homeTeamName: predictMatch.homeTeam.name,
        awayTeamName: predictMatch.awayTeam.name,
        homeScore: palpiteHome,
        awayScore: palpiteAway,
      });
      setUserPredictions(res.predictions);
      onNotify(
        `Palpite salvo: ${predictMatch.homeTeam.shortName} ${palpiteHome} x ${palpiteAway} ${predictMatch.awayTeam.shortName}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Não foi possível salvar o palpite.');
    } finally {
      setSavingPalpite(false);
    }
  }

  async function handleDeletePalpite() {
    if (!predictMatch) return;
    setSavingPalpite(true);
    try {
      const res = await deleteUserPrediction(predictMatch.leagueSlug, predictMatch.id);
      setUserPredictions(res.predictions);
      onNotify('Palpite removido.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao remover palpite.');
    } finally {
      setSavingPalpite(false);
    }
  }

  const standingsCompetitions = useMemo(
    () => competitions.filter((c) => c.slug !== 'bra.copa_do_brazil'),
    [competitions]
  );

  const standingsSummary = useMemo(() => {
    const entries = standingsGroups.flatMap((g) => g.entries);
    if (entries.length === 0) return null;
    const leader = entries[0];
    let bestAttack = entries[0];
    let bestDefense = entries[0];
    for (const row of entries) {
      if (Number(row.goalsFor) > Number(bestAttack.goalsFor)) bestAttack = row;
      if (Number(row.goalsAgainst) < Number(bestDefense.goalsAgainst)) bestDefense = row;
    }
    const leaderGp = Math.max(1, Number(leader.gamesPlayed) || 1);
    const leaderPct = Math.round(((Number(leader.points) || 0) / (leaderGp * 3)) * 100);
    return { leader, bestAttack, bestDefense, leaderPct };
  }, [standingsGroups]);

  return (
    <div className="space-y-6">
      {/* Header with Live Brasília GMT-3 Date/Time */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-white/[0.08]"
      >
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Menu de Futebol · Canais do Brasil
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Jogos do Brasil, Sul-América e grandes ligas internacionais com transmissão em canais brasileiros (como CazéTV na Bundesliga) no horário de Brasília (GMT-3).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 shrink-0">
          <span className="inline-flex items-center gap-1.5 font-mono-num text-sky-300">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{formatBrasiliaClockNow(brasiliaNow)} (GMT-3)</span>
          </span>
          {fetchedAt && (
            <>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-400 font-mono-num">
                Atualizado {formatMatchTimeBrasilia(fetchedAt)}
              </span>
            </>
          )}
        </div>
      </motion.div>

      {/* Separated Football Sub-Tabs */}
      <div
        role="tablist"
        aria-label="Seções do Menu de Futebol"
        className="flex items-center gap-2 overflow-x-auto pb-1"
      >
        {(
          [
            { id: 'todos-jogos', label: 'TODOS OS JOGOS' },
            { id: 'classificacao', label: 'CLASSIFICAÇÃO (TABELAS)' },
            { id: 'apps-gratuitos', label: 'CANAIS DO BRASIL' },
            { id: 'clubes', label: 'CLUBES E CAMPEONATOS' },
            { id: 'apps', label: 'APPS' },
          ] as Array<{ id: FootballSubTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`h-10 px-4 rounded-xl text-xs font-semibold tracking-wide whitespace-nowrap shrink-0 transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-[#10141D] text-slate-300 border border-white/[0.08] hover:text-white hover:border-blue-500/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: TODOS OS JOGOS */}
      {activeTab === 'todos-jogos' && (
        <div className="space-y-5">
          {/* Controls Toolbar */}
          <div className="rounded-2xl bg-[#10141D] border border-white/[0.08] p-4 sm:p-5 space-y-4">
            {/* Row 1: Day Buckets (Hoje, Amanhã, Próximos Jogos) + Refresh */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#090B10] border border-white/[0.08] overflow-x-auto">
                {(
                  [
                    { id: 'all', label: `Todos (${dayCounts.all})` },
                    { id: 'today', label: `Hoje (${dayCounts.today})` },
                    { id: 'tomorrow', label: `Amanhã (${dayCounts.tomorrow})` },
                    { id: 'upcoming', label: `Próximos Jogos (${dayCounts.upcoming})` },
                    { id: 'recent', label: `Recentes (${dayCounts.recent})` },
                  ] as Array<{ id: DayFilter; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDayFilter(item.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      dayFilter === item.id
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#090B10] border border-white/[0.08]">
                  {(
                    [
                      { id: 'all', label: 'Todas as Ligas' },
                      { id: 'nacional', label: 'Brasil · Nacionais' },
                      { id: 'internacional', label: 'Internacionais · Canal BR' },
                    ] as Array<{ id: ScopeFilter; label: string }>
                  ).map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setScopeFilter(sc.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        scopeFilter === sc.id
                          ? 'bg-[#17223B] text-sky-300 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => loadAllGames(true)}
                  disabled={gamesLoading}
                  className="h-10 px-3.5 rounded-xl bg-[#090B10] border border-white/[0.12] hover:border-blue-500/40 text-xs font-medium text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${gamesLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            {/* Row 2: Intuitive Visual Selector for Match Type (Tipo de Partida) */}
            <div className="pt-2 border-t border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span className="font-medium text-slate-300">Tipo de Partida</span>
                <span className="font-mono-num">
                  {statusCounts.all} {statusCounts.all === 1 ? 'jogo disponível' : 'jogos disponíveis'}
                </span>
              </div>

              <div
                role="group"
                aria-label="Seletor visual de tipo de partida"
                className="grid grid-cols-2 lg:grid-cols-4 gap-2.5"
              >
                {(
                  [
                    {
                      id: 'all',
                      label: 'Todas',
                      hint: 'Grade completa',
                      count: statusCounts.all,
                      icon: LayoutGrid,
                      accent: 'text-sky-400',
                    },
                    {
                      id: 'in',
                      label: 'Ao Vivo',
                      hint: 'Em andamento',
                      count: statusCounts.in,
                      icon: Radio,
                      accent: 'text-emerald-400',
                    },
                    {
                      id: 'pre',
                      label: 'Em Breve',
                      hint: 'Próximos horários',
                      count: statusCounts.pre,
                      icon: Clock,
                      accent: 'text-sky-300',
                    },
                    {
                      id: 'post',
                      label: 'Encerradas',
                      hint: 'Placares finais',
                      count: statusCounts.post,
                      icon: CheckCircle2,
                      accent: 'text-slate-300',
                    },
                  ] as Array<{
                    id: MatchStatusFilter;
                    label: string;
                    hint: string;
                    count: number;
                    icon: typeof LayoutGrid;
                    accent: string;
                  }>
                ).map((st) => {
                  const Icon = st.icon;
                  const active = statusFilter === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(st.id)}
                      className={`min-h-[54px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-colors ${
                        active
                          ? 'bg-blue-600/15 border-blue-500/60 text-white'
                          : 'bg-[#090B10] border-white/[0.08] hover:border-white/20 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-300' : st.accent}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{st.label}</p>
                          <p className="text-[11px] text-slate-400 truncate">{st.hint}</p>
                        </div>
                      </div>
                      <span
                        className={`font-mono-num text-sm font-bold shrink-0 ${
                          active ? 'text-white' : 'text-slate-300'
                        }`}
                      >
                        {st.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 3: Championship Select + Search */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-2 border-t border-white/[0.06]">
              <div className="md:col-span-7">
                <select
                  aria-label="Filtrar campeonato"
                  value={selectedLeague}
                  onChange={(e) => setSelectedLeague(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#090B10] border border-white/[0.12] text-xs font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="all">Todos os Campeonatos ({availableLeaguesForScope.length})</option>
                  {availableLeaguesForScope.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name} ({c.country})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={matchSearch}
                  onChange={(e) => setMatchSearch(e.target.value)}
                  placeholder="Buscar clube, liga ou canal do Brasil (ex.: Bayern, CazéTV)..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#090B10] border border-white/[0.12] text-xs text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Match List */}
          {gamesLoading && matches.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-48 rounded-2xl bg-[#10141D] border border-white/[0.08] animate-pulse"
                />
              ))}
            </div>
          ) : gamesError && matches.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#10141D] border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-sm text-rose-300">{gamesError}</p>
              <button
                type="button"
                onClick={() => loadAllGames(true)}
                className="px-4 py-2 rounded-lg bg-rose-500/20 text-xs font-semibold text-rose-200 whitespace-nowrap"
              >
                Tentar Novamente
              </button>
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#10141D] border border-white/[0.08] text-center space-y-2.5">
              <p className="text-base font-semibold text-white">
                Nenhuma partida encontrada para este filtro
              </p>
              <p className="text-sm text-slate-400">
                Não há partidas oficiais registradas no feed para os filtros selecionados.
              </p>
              {(dayFilter !== 'all' ||
                scopeFilter !== 'all' ||
                selectedLeague !== 'all' ||
                statusFilter !== 'all' ||
                matchSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setDayFilter('all');
                    setScopeFilter('all');
                    setSelectedLeague('all');
                    setStatusFilter('all');
                    setMatchSearch('');
                  }}
                  className="mt-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Mostrar Todas as Partidas
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMatches.map((match, idx) => {
                const isLive = match.statusState === 'in';
                const isEnded = match.statusState === 'post';
                const isPre = match.statusState === 'pre';
                const matchKey = `${match.leagueSlug}:${match.id}`;
                const savedPalpite = userPredictions[matchKey];

                // Evaluate saved user palpite against finished match result
                let palpiteOutcomeLabel: string | null = null;
                let palpiteOutcomeClass = 'text-slate-400';
                if (isEnded && savedPalpite) {
                  const realHome = Number(match.homeTeam.score);
                  const realAway = Number(match.awayTeam.score);
                  if (!Number.isNaN(realHome) && !Number.isNaN(realAway)) {
                    const realDiff = Math.sign(realHome - realAway);
                    const predDiff = Math.sign(savedPalpite.homeScore - savedPalpite.awayScore);
                    if (realHome === savedPalpite.homeScore && realAway === savedPalpite.awayScore) {
                      palpiteOutcomeLabel = `Seu palpite ${savedPalpite.homeScore} x ${savedPalpite.awayScore} · Placar exato`;
                      palpiteOutcomeClass = 'text-emerald-400';
                    } else if (realDiff === predDiff) {
                      palpiteOutcomeLabel = `Seu palpite ${savedPalpite.homeScore} x ${savedPalpite.awayScore} · Acertou tendência`;
                      palpiteOutcomeClass = 'text-sky-400';
                    } else {
                      palpiteOutcomeLabel = `Seu palpite foi ${savedPalpite.homeScore} x ${savedPalpite.awayScore}`;
                      palpiteOutcomeClass = 'text-slate-400';
                    }
                  }
                }

                return (
                  <motion.article
                    key={matchKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.22,
                      delay: Math.min(idx * 0.035, 0.24),
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="rounded-2xl bg-[#10141D] border border-white/[0.08] hover:border-blue-500/35 transition-colors p-5 flex flex-col justify-between gap-4"
                  >
                    {/* Metadata line (unboxed, zero pills) */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-400 min-w-0">
                        <span className="font-semibold text-white truncate">
                          {match.leagueName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num shrink-0 text-slate-300">
                          {getBucketLabel(match.dayBucket)} · {formatMatchDateBrasilia(match.date)}{' '}
                          {formatMatchTimeBrasilia(match.date)}
                        </span>
                      </div>

                      <div className="shrink-0 font-mono-num font-semibold">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>AO VIVO {match.displayClock}</span>
                          </span>
                        ) : isEnded ? (
                          <span className="text-emerald-400">
                            PLACAR FINAL {match.homeTeam.score} x {match.awayTeam.score}
                          </span>
                        ) : (
                          <span className="text-sky-400">EM BREVE</span>
                        )}
                      </div>
                    </div>

                    {/* Teams & Scoreboard */}
                    <button
                      type="button"
                      onClick={() => openMatchDetails(match)}
                      className="w-full text-left space-y-2.5 group focus:outline-none"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TeamBadge
                            src={match.homeTeam.logo}
                            name={match.homeTeam.name}
                            abbr={match.homeTeam.abbr}
                          />
                          <span
                            className={`text-sm sm:text-base font-medium truncate group-hover:text-sky-300 transition-colors ${
                              match.homeTeam.winner ? 'text-white font-semibold' : 'text-slate-100'
                            }`}
                          >
                            {match.homeTeam.name}
                          </span>
                        </div>
                        <span
                          className={`font-mono-num text-lg font-bold shrink-0 ${
                            isEnded && match.homeTeam.winner
                              ? 'text-emerald-400'
                              : isEnded
                                ? 'text-white'
                                : 'text-slate-300'
                          }`}
                        >
                          {match.homeTeam.score}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TeamBadge
                            src={match.awayTeam.logo}
                            name={match.awayTeam.name}
                            abbr={match.awayTeam.abbr}
                          />
                          <span
                            className={`text-sm sm:text-base font-medium truncate group-hover:text-sky-300 transition-colors ${
                              match.awayTeam.winner ? 'text-white font-semibold' : 'text-slate-100'
                            }`}
                          >
                            {match.awayTeam.name}
                          </span>
                        </div>
                        <span
                          className={`font-mono-num text-lg font-bold shrink-0 ${
                            isEnded && match.awayTeam.winner
                              ? 'text-emerald-400'
                              : isEnded
                                ? 'text-white'
                                : 'text-slate-300'
                          }`}
                        >
                          {match.awayTeam.score}
                        </span>
                      </div>
                    </button>

                    {/* Pre-Match Statistical Projection OR Final Palpite Comparison (unboxed hairline strip) */}
                    {(isPre && (match.autoPrediction || savedPalpite)) && (
                      <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                        {match.autoPrediction && (
                          <span className="text-slate-300 font-mono-num">
                            Projeção Tabela:{' '}
                            <strong className="text-sky-300">
                              {match.autoPrediction.predictedHomeScore} x{' '}
                              {match.autoPrediction.predictedAwayScore}
                            </strong>{' '}
                            <span className="text-slate-500">
                              ({match.autoPrediction.homeWinPct}% / {match.autoPrediction.drawPct}% /{' '}
                              {match.autoPrediction.awayWinPct}%)
                            </span>
                          </span>
                        )}
                        {savedPalpite && (
                          <span className="text-emerald-400 font-mono-num font-semibold">
                            Seu Palpite: {savedPalpite.homeScore} x {savedPalpite.awayScore}
                          </span>
                        )}
                      </div>
                    )}

                    {isEnded && palpiteOutcomeLabel && (
                      <div className={`pt-2 border-t border-white/[0.06] text-xs font-mono-num font-medium ${palpiteOutcomeClass}`}>
                        {palpiteOutcomeLabel}
                      </div>
                    )}

                    {/* Broadcast Channels Info */}
                    <div className="text-xs text-slate-400 flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                      <Tv className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">
                        {match.broadcasts.length > 0
                          ? `Transmissão: ${match.broadcasts.join(' · ')}`
                          : 'Transmissão: Consultar guia oficial da competição'}
                      </span>
                    </div>

                    {/* Actions Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openBroadcastPlayer(match, 'canais')}
                        className="flex-1 min-w-[165px] h-10 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                        <span>ASSISTIR TRANSMISSÃO</span>
                      </button>

                      {isEnded && (
                        <button
                          type="button"
                          onClick={() => openBroadcastPlayer(match, 'destaques')}
                          className="h-10 px-3.5 rounded-xl bg-[#090B10] border border-sky-500/35 hover:border-sky-400 text-xs font-semibold text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <Film className="w-3.5 h-3.5 shrink-0" />
                          <span>Destaques (+5m)</span>
                        </button>
                      )}

                      {isPre && (
                        <button
                          type="button"
                          onClick={() => openPredictionModal(match)}
                          className="h-10 px-3.5 rounded-xl bg-[#090B10] border border-sky-500/35 hover:border-sky-400 text-xs font-semibold text-sky-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                          <span>{savedPalpite ? 'Editar Palpite' : 'Prever Placar'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openMatchDetails(match)}
                        className="h-10 px-3.5 rounded-xl bg-[#090B10] border border-white/[0.1] hover:border-white/25 text-xs font-medium text-slate-200 hover:text-white transition-colors whitespace-nowrap"
                      >
                        Detalhes
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: APPS GRATUITOS */}
      {activeTab === 'apps-gratuitos' && (
        <AppsGratuitosSection onNotify={onNotify} isOwner={isOwner} />
      )}

      {/* TAB 3: CLASSIFICAÇÃO DAS LIGAS */}
      {activeTab === 'classificacao' && (
        <div className="space-y-4">
          {/* Quick League Switcher + Actions */}
          <div className="rounded-2xl bg-[#10141D] border border-white/[0.08] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Tabela Oficial das Ligas
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Classificação atualizada com pontuação, jogos, vitórias, saldo de gols e aproveitamento.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLeague(standingsLeague);
                    setScopeFilter('all');
                    setDayFilter('all');
                    setActiveTab('todos-jogos');
                  }}
                  className="h-10 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap transition-colors"
                >
                  Ver Jogos da Liga
                </button>
                <button
                  type="button"
                  onClick={() => loadStandings(standingsLeague)}
                  className="h-10 px-3.5 rounded-xl bg-[#090B10] border border-white/[0.12] hover:border-blue-500/40 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${standingsLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar Tabela</span>
                </button>
              </div>
            </div>

            <div
              role="group"
              aria-label="Selecionar liga da tabela de classificação"
              className="flex items-center gap-1.5 overflow-x-auto pb-1"
            >
              {standingsCompetitions.map((c) => {
                const active = standingsLeague === c.slug;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setStandingsLeague(c.slug)}
                    className={`h-9 px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-[#090B10] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40'
                    }`}
                  >
                    {c.shortName}
                  </button>
                );
              })}
            </div>
          </div>

          {standingsSummary && !standingsLoading && !standingsError && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-[#10141D] border border-white/[0.08] p-4">
                <p className="text-[11px] text-slate-400">Líder Atual</p>
                <p className="text-sm font-semibold text-white truncate mt-1">
                  {standingsSummary.leader.teamName}
                </p>
                <p className="text-xs font-mono-num text-sky-400 mt-0.5">
                  {standingsSummary.leader.points} pts · {standingsSummary.leader.gamesPlayed} jogos
                </p>
              </div>
              <div className="rounded-xl bg-[#10141D] border border-white/[0.08] p-4">
                <p className="text-[11px] text-slate-400">Aproveitamento do Líder</p>
                <p className="text-lg font-mono-num font-bold text-emerald-400 mt-1">
                  {standingsSummary.leaderPct}%
                </p>
                <p className="text-xs font-mono-num text-slate-400 mt-0.5">
                  {standingsSummary.leader.wins}V · {standingsSummary.leader.ties}E · {standingsSummary.leader.losses}D
                </p>
              </div>
              <div className="rounded-xl bg-[#10141D] border border-white/[0.08] p-4">
                <p className="text-[11px] text-slate-400">Melhor Ataque</p>
                <p className="text-sm font-semibold text-white truncate mt-1">
                  {standingsSummary.bestAttack.teamName}
                </p>
                <p className="text-xs font-mono-num text-sky-300 mt-0.5">
                  {standingsSummary.bestAttack.goalsFor} gols marcados
                </p>
              </div>
              <div className="rounded-xl bg-[#10141D] border border-white/[0.08] p-4">
                <p className="text-[11px] text-slate-400">Melhor Defesa</p>
                <p className="text-sm font-semibold text-white truncate mt-1">
                  {standingsSummary.bestDefense.teamName}
                </p>
                <p className="text-xs font-mono-num text-slate-300 mt-0.5">
                  {standingsSummary.bestDefense.goalsAgainst} gols sofridos
                </p>
              </div>
            </div>
          )}

          {standingsLoading ? (
            <div className="h-72 rounded-2xl bg-[#10141D] border border-white/[0.06] animate-pulse" />
          ) : standingsError ? (
            <div className="p-6 rounded-2xl bg-[#10141D] border border-rose-500/25 text-sm text-rose-300">
              {standingsError}
            </div>
          ) : standingsGroups.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#10141D] border border-white/[0.08] text-center text-sm text-slate-400">
              Tabela de classificação oficial indisponível para esta competição no momento.
            </div>
          ) : (
            standingsGroups.map((group) => {
              const totalTeams = group.entries.length;
              return (
                <div
                  key={group.groupName}
                  className="rounded-2xl bg-[#10141D] border border-white/[0.08] overflow-hidden"
                >
                  <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-white">
                      {group.groupName}
                    </h3>
                    <span className="text-xs text-slate-400 font-mono-num">
                      {totalTeams} clubes
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-[11px] font-medium text-slate-400">
                          <th className="py-2.5 pl-5 pr-2 w-10">#</th>
                          <th className="py-2.5 px-2">Clube</th>
                          <th className="py-2.5 px-2 text-right font-mono-num">J</th>
                          <th className="py-2.5 px-2 text-right font-mono-num">V</th>
                          <th className="py-2.5 px-2 text-right font-mono-num">E</th>
                          <th className="py-2.5 px-2 text-right font-mono-num">D</th>
                          <th className="py-2.5 px-2 text-right font-mono-num hidden sm:table-cell">GP</th>
                          <th className="py-2.5 px-2 text-right font-mono-num hidden sm:table-cell">GC</th>
                          <th className="py-2.5 px-2 text-right font-mono-num">SG</th>
                          <th className="py-2.5 px-2 text-right font-mono-num hidden md:table-cell">APR</th>
                          <th className="py-2.5 pl-2 pr-5 text-right font-mono-num text-white">PTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05] text-xs">
                        {group.entries.map((row) => {
                          const gp = Math.max(0, Number(row.gamesPlayed) || 0);
                          const pts = Number(row.points) || 0;
                          const aprPct = gp > 0 ? Math.round((pts / (gp * 3)) * 100) : 0;
                          const isTopZone = row.rank <= (totalTeams <= 4 ? 2 : 4);
                          const isRelegation = totalTeams >= 16 && row.rank > totalTeams - 4;
                          const rankColor = isTopZone
                            ? 'text-emerald-400 font-bold'
                            : isRelegation
                              ? 'text-rose-400 font-semibold'
                              : 'text-slate-400';

                          return (
                            <tr key={row.teamId || row.teamName} className="hover:bg-white/[0.03] transition-colors">
                              <td className={`py-2.5 pl-5 pr-2 font-mono-num ${rankColor}`}>
                                {row.rank}
                              </td>
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-2.5 min-w-[140px]">
                                  <TeamBadge
                                    src={row.teamLogo}
                                    name={row.teamName}
                                    abbr={row.teamAbbr}
                                    size="sm"
                                  />
                                  <span className="font-medium text-slate-100 truncate">
                                    {row.teamName}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-300">
                                {row.gamesPlayed}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-300">
                                {row.wins}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-400">
                                {row.ties}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-400">
                                {row.losses}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-400 hidden sm:table-cell">
                                {row.goalsFor}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-400 hidden sm:table-cell">
                                {row.goalsAgainst}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-300">
                                {row.goalDiff}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-slate-400 hidden md:table-cell">
                                {aprPct}%
                              </td>
                              <td className="py-2.5 pl-2 pr-5 text-right font-mono-num font-bold text-sky-400">
                                {row.points}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3 border-t border-white/[0.06] flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                    <span className="text-emerald-400 font-medium">Posições em verde: Zona de classificação / G4</span>
                    {totalTeams >= 16 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-rose-400 font-medium">Posições em vermelho: Zona de rebaixamento</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: CLUBES & CAMPEONATOS */}
      {activeTab === 'clubes' && (
        <div className="space-y-6">
          {/* Competitions Directory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {competitions.map((comp, idx) => (
              <motion.div
                key={comp.slug}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  delay: Math.min(idx * 0.04, 0.22),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="p-5 rounded-2xl bg-[#10141D] border border-white/[0.08] flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>
                      {comp.country} · {comp.scope === 'nacional' ? 'Brasil' : 'Internacional · Canal BR'}
                    </span>
                    <Trophy className="w-4 h-4 text-sky-400" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-white">
                    {comp.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLeague(comp.slug);
                      setScopeFilter('all');
                      setDayFilter('all');
                      setActiveTab('todos-jogos');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Ver Jogos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStandingsLeague(comp.slug);
                      setActiveTab('classificacao');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#090B10] border border-white/[0.1] hover:border-white/25 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    Classificação
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Clubs Directory */}
          <div className="space-y-4 pt-2 border-t border-white/[0.08]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#10141D] border border-white/[0.08]">
              <div className="flex items-center gap-3">
                <label htmlFor="clubs-league" className="text-xs font-medium text-slate-300">
                  Clubes de:
                </label>
                <select
                  id="clubs-league"
                  value={standingsLeague}
                  onChange={(e) => setStandingsLeague(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-[#090B10] border border-white/[0.12] text-xs font-medium text-white"
                >
                  {competitions.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clubSearch}
                  onChange={(e) => setClubSearch(e.target.value)}
                  placeholder="Buscar clube..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#090B10] border border-white/[0.12] text-xs text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            {clubsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-20 rounded-xl bg-[#10141D] border border-white/[0.06] animate-pulse"
                  />
                ))}
              </div>
            ) : clubsError ? (
              <div className="p-6 rounded-2xl bg-[#10141D] border border-rose-500/25 text-sm text-rose-300">
                {clubsError}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredClubs.map((club, idx) => (
                  <motion.div
                    key={club.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: Math.min(idx * 0.025, 0.2),
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="p-4 rounded-xl bg-[#10141D] border border-white/[0.08] flex items-center gap-3"
                  >
                    <TeamBadge
                      src={club.logo}
                      name={club.name}
                      abbr={club.abbr}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{club.name}</p>
                      <p className="text-xs text-slate-400 font-mono-num">{club.abbr}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: APPS (Empty for now as requested) */}
      {activeTab === 'apps' && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Apps"
          className="rounded-2xl bg-[#10141D] border border-white/[0.08] p-12 text-center space-y-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#090B10] border border-white/[0.08] flex items-center justify-center mx-auto">
            <AppWindow className="w-5 h-5 text-slate-400" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-display text-lg font-semibold text-white">Apps</h3>
            <p className="text-sm text-slate-400">
              Nenhum aplicativo adicionado por enquanto. Esta aba permanece reservada para futuras integrações.
            </p>
          </div>
        </motion.section>
      )}

      {/* Official Brazilian Broadcast & Full Match Highlights Modal */}
      {streamMatch && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Transmissão Oficial Brasileira e Destaques da Partida"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`w-full ${
              playerExpanded ? 'max-w-5xl' : 'max-w-3xl'
            } max-h-[92vh] overflow-y-auto rounded-2xl bg-[#10141D] border border-blue-500/35 p-5 sm:p-6 space-y-5 transition-all`}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-semibold text-sky-400">{streamMatch.leagueName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">
                    {formatMatchDateBrasilia(streamMatch.date)} às {formatMatchTimeBrasilia(streamMatch.date)} (GMT-3)
                  </span>
                </div>
                <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                  {streamMatch.homeTeam.name} x {streamMatch.awayTeam.name}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPlayerExpanded((prev) => !prev)}
                  aria-label={playerExpanded ? 'Reduzir player' : 'Expandir player'}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06]"
                >
                  {playerExpanded ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStreamMatch(null)}
                  aria-label="Fechar transmissão"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {streamLoading ? (
              <div className="space-y-3">
                <div className="aspect-video rounded-xl bg-[#090B10] border border-white/[0.06] animate-pulse" />
                <p className="text-xs text-slate-400 text-center">
                  Verificando transmissões oficiais do Brasil e destaques completos da partida...
                </p>
              </div>
            ) : streamError ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {streamError}
              </div>
            ) : streamData ? (
              <div className="space-y-5">
                {/* Switcher between Live Broadcasts / Channels and Match Highlights (+5 min) */}
                <div
                  role="tablist"
                  aria-label="Modo de exibição da partida"
                  className="flex flex-wrap items-center gap-2 pb-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={streamViewTab === 'canais'}
                    onClick={() => handleSelectStreamTab('canais')}
                    className={`h-10 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                      streamViewTab === 'canais'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#090B10] border border-white/[0.1] text-slate-300 hover:text-white hover:border-blue-500/40'
                    }`}
                  >
                    <Tv className="w-3.5 h-3.5 shrink-0" />
                    <span>Canais e Transmissão</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={streamViewTab === 'destaques'}
                    onClick={() => handleSelectStreamTab('destaques')}
                    className={`h-10 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                      streamViewTab === 'destaques'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#090B10] border border-white/[0.1] text-slate-300 hover:text-white hover:border-blue-500/40'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Destaques da Partida (+5 min)
                      {streamData.highlightSources?.length
                        ? ` · ${streamData.highlightSources.length}`
                        : ''}
                    </span>
                  </button>
                </div>

                {/* Channel / Highlight Selector Strip (no panel reload) */}
                {currentTabOptions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-300">
                      {streamViewTab === 'destaques'
                        ? 'Escolha os melhores momentos completos do jogo (+5 min):'
                        : 'Trocar canal oficial brasileiro sem recarregar o painel:'}
                    </p>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {currentTabOptions.map((src) => {
                        const isSelected = activeSource?.id === src.id;
                        const label =
                          streamViewTab === 'destaques'
                            ? `${src.channelLabel || 'Canal BR'}${src.durationLabel ? ` · ${src.durationLabel}` : ''}`
                            : src.channelLabel || src.name;
                        const subStatus =
                          streamViewTab === 'canais'
                            ? src.embeddable
                              ? ' · Ao vivo'
                              : ' · Externo'
                            : '';

                        return (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() => handleSelectSourceOption(src)}
                            title={src.name}
                            className={`h-9 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#090B10] border border-white/[0.1] text-slate-300 hover:text-white hover:border-blue-500/40'
                            }`}
                          >
                            {label}
                            <span
                              className={
                                isSelected
                                  ? 'text-blue-100 font-normal'
                                  : src.embeddable
                                    ? 'text-emerald-400 font-normal'
                                    : 'text-slate-500 font-normal'
                              }
                            >
                              {subStatus}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Player OR Honest Friendly Fallback */}
                {activeSource ? (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 space-y-0.5">
                        <p
                          className={`font-semibold truncate ${
                            activeSource.embeddable ? 'text-emerald-400' : 'text-sky-300'
                          }`}
                        >
                          {activeSource.name}
                        </p>
                        {activeSource.durationLabel && (
                          <p className="text-[11px] font-mono-num text-slate-400">
                            Duração: {activeSource.durationLabel} · {activeSource.channelLabel || 'Canal Oficial BR'}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {(activeSource.isYoutubeExternal ||
                          Boolean(activeSource.videoId) ||
                          activeSource.externalUrl.includes('youtube.com')) && (
                          <a
                            href={
                              activeSource.videoId
                                ? `https://www.youtube.com/watch?v=${activeSource.videoId}`
                                : activeSource.externalUrl
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-8 px-3 rounded-lg bg-[#090B10] border border-blue-500/35 hover:border-blue-400 text-sky-300 hover:text-white inline-flex items-center gap-1.5 font-semibold whitespace-nowrap transition-colors"
                          >
                            <Youtube className="w-3.5 h-3.5 shrink-0" />
                            <span>ASSISTIR NO YOUTUBE</span>
                          </a>
                        )}
                        <a
                          href={activeSource.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-8 px-3 rounded-lg bg-[#090B10] border border-white/[0.12] hover:border-white/30 text-slate-200 hover:text-white inline-flex items-center gap-1.5 font-medium whitespace-nowrap transition-colors"
                        >
                          <span>ABRIR NO CHROME</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      </div>
                    </div>

                    {activeSource.embeddable && activeSource.videoId ? (
                      <YouTubeOfficialPlayer
                        key={`${activeSource.id}-${activeSource.videoId}`}
                        videoId={activeSource.videoId}
                        title={activeSource.name}
                        youtubeUrl={`https://www.youtube.com/watch?v=${activeSource.videoId}`}
                        chromeUrl={activeSource.externalUrl}
                      />
                    ) : (
                      <div className="aspect-video w-full rounded-xl bg-[#090B10] border border-white/[0.1] p-6 sm:p-8 flex flex-col items-center justify-center text-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                          <Radio className="w-5 h-5 text-sky-400" />
                        </div>
                        <div className="space-y-1.5 max-w-lg">
                          <h5 className="font-display text-base font-bold text-white">
                            {activeSource.channelLabel || activeSource.name} · Exibição externa oficial
                          </h5>
                          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                            {activeSource.statusNote || activeSource.description}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                          {(activeSource.isYoutubeExternal ||
                            Boolean(activeSource.videoId) ||
                            activeSource.externalUrl.includes('youtube.com')) && (
                            <a
                              href={
                                activeSource.videoId
                                  ? `https://www.youtube.com/watch?v=${activeSource.videoId}`
                                  : activeSource.externalUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                            >
                              <Youtube className="w-4 h-4 shrink-0" />
                              <span>ASSISTIR NO YOUTUBE</span>
                            </a>
                          )}
                          <a
                            href={activeSource.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-11 px-5 rounded-xl bg-[#10141D] border border-white/[0.14] hover:border-blue-500/40 text-slate-100 hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                          >
                            <span>ABRIR NO CHROME</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-[#090B10] border border-white/[0.08] text-center space-y-3">
                    <p className="text-sm font-semibold text-white">
                      {streamViewTab === 'destaques'
                        ? 'Destaques completos (+5 min) ainda indisponíveis para esta partida'
                        : 'Nenhuma transmissão incorporável ativa para esta partida no momento'}
                    </p>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                      {streamViewTab === 'destaques'
                        ? 'Assim que um canal oficial brasileiro publicar os melhores momentos completos do jogo (+5 min) com incorporação liberada, ele aparecerá aqui.'
                        : 'Você pode selecionar outro canal oficial do Brasil abaixo para abrir diretamente no YouTube ou no Chrome.'}
                    </p>
                  </div>
                )}

                {/* Brazilian-Only Official Links to Open in YouTube or Chrome */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-300">
                    Canais Oficiais do Brasil
                  </h4>
                  <div className="divide-y divide-white/[0.06] rounded-xl bg-[#090B10] border border-white/[0.08]">
                    {streamData.officialLinks.map((src) => {
                      const isYt =
                        src.isYoutubeExternal || src.externalUrl.includes('youtube.com');
                      return (
                        <div
                          key={src.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <p className="text-sm font-semibold text-white">{src.name}</p>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {src.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {isYt && (
                              <a
                                href={src.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                              >
                                <Youtube className="w-3.5 h-3.5 shrink-0" />
                                <span>ASSISTIR NO YOUTUBE</span>
                              </a>
                            )}
                            <a
                              href={src.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`h-10 px-4 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                                isYt
                                  ? 'bg-[#10141D] border border-white/[0.12] hover:border-blue-500/40 text-slate-200 hover:text-white'
                                  : 'bg-blue-600 hover:bg-blue-500 text-white'
                              }`}
                            >
                              <span>ABRIR NO CHROME</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        </div>
      )}

      {/* Match Detail Modal */}
      {selectedMatch && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes da Partida"
        >
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-[#10141D] border border-white/[0.12] p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div className="text-xs text-slate-400">
                <span className="text-white font-medium">{selectedMatch.leagueName}</span>
                <span aria-hidden="true"> · </span>
                <span>{selectedMatch.statusDetail || selectedMatch.statusLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMatch(null)}
                aria-label="Fechar detalhes"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 items-center gap-4 text-center py-2">
              <div className="flex flex-col items-center gap-2">
                <TeamBadge
                  src={selectedMatch.homeTeam.logo}
                  name={selectedMatch.homeTeam.name}
                  abbr={selectedMatch.homeTeam.abbr}
                  size="lg"
                />
                <p className="text-sm font-semibold text-white">{selectedMatch.homeTeam.name}</p>
              </div>

              <div className="space-y-1">
                <p className="font-mono-num text-3xl sm:text-4xl font-bold text-white">
                  {selectedMatch.homeTeam.score} : {selectedMatch.awayTeam.score}
                </p>
                <p className="text-xs font-mono-num text-sky-400">
                  {selectedMatch.statusState === 'in'
                    ? `AO VIVO ${selectedMatch.displayClock}`
                    : `${formatMatchDateBrasilia(selectedMatch.date)} · ${formatMatchTimeBrasilia(selectedMatch.date)} (GMT-3)`}
                </p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <TeamBadge
                  src={selectedMatch.awayTeam.logo}
                  name={selectedMatch.awayTeam.name}
                  abbr={selectedMatch.awayTeam.abbr}
                  size="lg"
                />
                <p className="text-sm font-semibold text-white">{selectedMatch.awayTeam.name}</p>
              </div>
            </div>

            {selectedMatch.venue && (
              <p className="text-xs text-center text-slate-400">
                Estádio: {selectedMatch.venue}
                {selectedMatch.attendance ? ` · Público: ${selectedMatch.attendance}` : ''}
              </p>
            )}

            {detailLoading ? (
              <div className="h-28 rounded-xl bg-[#090B10] animate-pulse" />
            ) : detailError ? (
              <p className="text-xs text-rose-300 text-center">{detailError}</p>
            ) : (
              <div className="space-y-5">
                {selectedMatch.events.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300">Eventos Principais</h4>
                    <div className="divide-y divide-white/[0.06] rounded-xl bg-[#090B10] border border-white/[0.06]">
                      {selectedMatch.events.map((ev, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-mono-num text-sky-400 w-10 shrink-0">{ev.minute}</span>
                            <span className="text-white font-medium truncate">{ev.playerName}</span>
                          </div>
                          <span className="text-slate-400 shrink-0">{ev.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedMatch.stats.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300">Estatísticas Oficiais</h4>
                    <div className="divide-y divide-white/[0.06] rounded-xl bg-[#090B10] border border-white/[0.06]">
                      {selectedMatch.stats.map((st, i) => (
                        <div key={i} className="px-4 py-2.5 grid grid-cols-3 text-xs items-center">
                          <span className="font-mono-num font-semibold text-white">{st.homeValue}</span>
                          <span className="text-center text-slate-400">{st.label}</span>
                          <span className="font-mono-num font-semibold text-white text-right">
                            {st.awayValue}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pre-Match Score Prediction & Palpite Modal */}
      {predictMatch && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Previsão de Placar Pré-Jogo"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#10141D] border border-blue-500/35 p-5 sm:p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-semibold text-sky-400">{predictMatch.leagueName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">
                    {formatMatchDateBrasilia(predictMatch.date)} às {formatMatchTimeBrasilia(predictMatch.date)} (GMT-3)
                  </span>
                </div>
                <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                  Previsão de Placar · Pré-Jogo
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setPredictMatch(null)}
                aria-label="Fechar previsão"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive User Palpite Section */}
            <div className="rounded-xl bg-[#090B10] border border-white/[0.08] p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">Seu Palpite Antes do Jogo</h4>
                  <p className="text-xs text-slate-400">
                    Defina quanto você acha que vai ficar o placar e salve na sua conta.
                  </p>
                </div>
                {userPredictions[`${predictMatch.leagueSlug}:${predictMatch.id}`] && (
                  <span className="text-xs font-mono-num font-semibold text-emerald-400">
                    Palpite salvo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-4 py-2">
                <div className="flex flex-col items-center gap-2.5 text-center">
                  <TeamBadge
                    src={predictMatch.homeTeam.logo}
                    name={predictMatch.homeTeam.name}
                    abbr={predictMatch.homeTeam.abbr}
                    size="md"
                  />
                  <span className="text-xs font-semibold text-white">
                    {predictMatch.homeTeam.shortName}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPalpiteHome((v) => Math.max(0, v - 1))}
                      aria-label="Diminuir gols mandante"
                      className="w-10 h-10 rounded-lg bg-[#10141D] border border-white/[0.12] hover:border-blue-500/50 text-white flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center font-mono-num text-2xl font-bold text-white">
                      {palpiteHome}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPalpiteHome((v) => Math.min(20, v + 1))}
                      aria-label="Aumentar gols mandante"
                      className="w-10 h-10 rounded-lg bg-[#10141D] border border-white/[0.12] hover:border-blue-500/50 text-white flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <p className="font-mono-num text-2xl font-bold text-sky-400">
                    {palpiteHome} x {palpiteAway}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {palpiteHome > palpiteAway
                      ? `Vitória ${predictMatch.homeTeam.shortName}`
                      : palpiteHome < palpiteAway
                        ? `Vitória ${predictMatch.awayTeam.shortName}`
                        : 'Empate'}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2.5 text-center">
                  <TeamBadge
                    src={predictMatch.awayTeam.logo}
                    name={predictMatch.awayTeam.name}
                    abbr={predictMatch.awayTeam.abbr}
                    size="md"
                  />
                  <span className="text-xs font-semibold text-white">
                    {predictMatch.awayTeam.shortName}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPalpiteAway((v) => Math.max(0, v - 1))}
                      aria-label="Diminuir gols visitante"
                      className="w-10 h-10 rounded-lg bg-[#10141D] border border-white/[0.12] hover:border-blue-500/50 text-white flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center font-mono-num text-2xl font-bold text-white">
                      {palpiteAway}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPalpiteAway((v) => Math.min(20, v + 1))}
                      aria-label="Aumentar gols visitante"
                      className="w-10 h-10 rounded-lg bg-[#10141D] border border-white/[0.12] hover:border-blue-500/50 text-white flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                {userPredictions[`${predictMatch.leagueSlug}:${predictMatch.id}`] && (
                  <button
                    type="button"
                    disabled={savingPalpite}
                    onClick={handleDeletePalpite}
                    className="h-10 px-3.5 rounded-xl bg-[#10141D] border border-rose-500/30 hover:border-rose-400 text-xs font-medium text-rose-300 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover Palpite</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingPalpite}
                  onClick={handleSavePalpite}
                  className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap transition-colors"
                >
                  {savingPalpite ? 'Salvando...' : 'Salvar Meu Palpite'}
                </button>
              </div>
            </div>

            {/* Statistical Standings-Based Forecast Section */}
            {predictLoading ? (
              <div className="h-44 rounded-xl bg-[#090B10] border border-white/[0.06] animate-pulse" />
            ) : predictError ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {predictError}
              </div>
            ) : predictDetail ? (
              predictDetail.hasEnoughData ? (
                <div className="rounded-xl bg-[#090B10] border border-white/[0.08] p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Previsão Estatística (Baseada na Tabela Real)
                      </h4>
                      <p className="text-xs text-slate-400">{predictDetail.confidenceLabel}</p>
                    </div>
                    <div className="text-right font-mono-num">
                      <p className="text-xs text-slate-400">Placar Mais Provável</p>
                      <p className="text-xl font-bold text-sky-400">
                        {predictDetail.predictedHomeScore} x {predictDetail.predictedAwayScore}
                      </p>
                    </div>
                  </div>

                  {/* Win / Draw / Away Probability Split */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono-num">
                      <span className="text-emerald-400">
                        {predictMatch.homeTeam.shortName}: {predictDetail.homeWinPct}%
                      </span>
                      <span className="text-slate-300">Empate: {predictDetail.drawPct}%</span>
                      <span className="text-sky-400">
                        {predictMatch.awayTeam.shortName}: {predictDetail.awayWinPct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full overflow-hidden bg-[#10141D] flex">
                      <div
                        style={{ width: `${predictDetail.homeWinPct}%` }}
                        className="bg-emerald-500 h-full"
                      />
                      <div
                        style={{ width: `${predictDetail.drawPct}%` }}
                        className="bg-slate-500 h-full"
                      />
                      <div
                        style={{ width: `${predictDetail.awayWinPct}%` }}
                        className="bg-blue-500 h-full"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono-num">
                      Expectativa de gols (xG): {predictDetail.expectedHomeGoals} x{' '}
                      {predictDetail.expectedAwayGoals}
                    </p>
                  </div>

                  {/* Top 4 Probable Exact Scores (click to copy into Meu Palpite) */}
                  {predictDetail.topScores.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                      <p className="text-xs text-slate-300 font-medium">
                        Placares mais prováveis (clique para aplicar no seu palpite):
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {predictDetail.topScores.map((sc, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setPalpiteHome(sc.home);
                              setPalpiteAway(sc.away);
                            }}
                            className="p-2.5 rounded-xl bg-[#10141D] border border-white/[0.08] hover:border-blue-500/50 text-center transition-colors"
                          >
                            <p className="font-mono-num text-sm font-bold text-white">
                              {sc.home} x {sc.away}
                            </p>
                            <p className="font-mono-num text-[11px] text-sky-400">
                              {sc.probabilityPct}% chance
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Real Standings Basis Comparison */}
                  {predictDetail.homeStats && predictDetail.awayStats && (
                    <div className="pt-2 border-t border-white/[0.06] space-y-2">
                      <p className="text-xs font-medium text-slate-300">
                        Números Reais na Classificação Atual
                      </p>
                      <div className="divide-y divide-white/[0.06] rounded-xl bg-[#10141D] border border-white/[0.06] text-xs">
                        <div className="px-3.5 py-2 grid grid-cols-3 items-center font-mono-num">
                          <span className="font-semibold text-white">
                            {predictDetail.homeStats.rank}º lugar
                          </span>
                          <span className="text-center text-slate-400">Posição</span>
                          <span className="font-semibold text-white text-right">
                            {predictDetail.awayStats.rank}º lugar
                          </span>
                        </div>
                        <div className="px-3.5 py-2 grid grid-cols-3 items-center font-mono-num">
                          <span className="font-semibold text-white">
                            {predictDetail.homeStats.points} pts ({predictDetail.homeStats.ppg}/j)
                          </span>
                          <span className="text-center text-slate-400">Pontos</span>
                          <span className="font-semibold text-white text-right">
                            {predictDetail.awayStats.points} pts ({predictDetail.awayStats.ppg}/j)
                          </span>
                        </div>
                        <div className="px-3.5 py-2 grid grid-cols-3 items-center font-mono-num">
                          <span className="font-semibold text-white">
                            {predictDetail.homeStats.goalsForAvg} / {predictDetail.homeStats.goalsAgainstAvg}
                          </span>
                          <span className="text-center text-slate-400">Média Gols (Pró/Contra)</span>
                          <span className="font-semibold text-white text-right">
                            {predictDetail.awayStats.goalsForAvg} / {predictDetail.awayStats.goalsAgainstAvg}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#090B10] border border-white/[0.08] text-xs text-slate-300 leading-relaxed">
                  {predictDetail.reason} Você ainda pode salvar seu palpite manual acima antes de a partida começar.
                </div>
              )
            ) : null}
          </motion.div>
        </div>
      )}
    </div>
  );
}

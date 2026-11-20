import type {
  AcquiredPremiumKey,
  AuthSession,
  ChannelLiveEmbedResponse,
  CompetitionInfo,
  DlsCreatorProfile,
  DlsDownloadItem,
  DlsHubData,
  FootballClub,
  FootballMatch,
  FreeAppIconType,
  FreeAppItem,
  MatchDetailData,
  MatchPredictionDetail,
  MatchStreamResponse,
  PremiumPlanId,
  RedeemCodesAdminSnapshot,
  SessionRole,
  StandingEntry,
  UserMatchPrediction,
  WalletConfig,
  WalletSnapshot,
} from '../types';

const TOKEN_STORAGE_KEY = 'choszen_session_token';
const WALLET_TOKEN_STORAGE_KEY = 'choszen_wallet_token';

export function getStoredWalletToken(): string | null {
  try {
    return localStorage.getItem(WALLET_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredWalletToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(WALLET_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(WALLET_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const walletToken = getStoredWalletToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (walletToken) {
    headers.set('X-Wallet-Token', walletToken);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Erro HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export interface VerifyKeyResult {
  authenticated: boolean;
  role: SessionRole;
  firstActivation?: boolean;
  keyCode?: string;
  planName?: string;
  activatedAt?: string;
  expiresAt?: string;
  token: string;
  issuedAt: number;
}

export async function verifyOfficialKey(key: string): Promise<VerifyKeyResult> {
  const result = await apiFetch<VerifyKeyResult>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
  if (result.token) {
    setStoredToken(result.token);
  }
  return result;
}

export async function checkSession(): Promise<AuthSession> {
  try {
    return await apiFetch<AuthSession>('/api/auth/session');
  } catch {
    return { authenticated: false };
  }
}

export async function logoutSession(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredToken(null);
  }
}

export async function fetchCompetitions(): Promise<CompetitionInfo[]> {
  const res = await apiFetch<{ competitions: CompetitionInfo[] }>('/api/football/competitions');
  return res.competitions;
}

export async function fetchAllGames(
  scope: 'all' | 'nacional' | 'internacional' = 'all',
  league = 'all',
  refresh = false
): Promise<{
  source: string;
  fetchedAt: string;
  todayKey: string;
  tomorrowKey: string;
  matches: FootballMatch[];
}> {
  const params = new URLSearchParams({ scope, league });
  if (refresh) params.set('refresh', '1');
  return apiFetch(`/api/football/all-games?${params.toString()}`);
}

export async function fetchScoreboard(
  league: string,
  date?: string
): Promise<{ source: string; fetchedAt: string; matches: FootballMatch[] }> {
  const params = new URLSearchParams({ league });
  if (date) params.set('date', date);
  return apiFetch(`/api/football/scoreboard?${params.toString()}`);
}

export async function fetchStandings(
  league: string
): Promise<{
  source: string;
  leagueName: string;
  fetchedAt: string;
  groups: Array<{ groupName: string; entries: StandingEntry[] }>;
}> {
  const params = new URLSearchParams({ league });
  return apiFetch(`/api/football/standings?${params.toString()}`);
}

export async function fetchTeams(
  league: string
): Promise<{ source: string; fetchedAt: string; teams: FootballClub[] }> {
  const params = new URLSearchParams({ league });
  return apiFetch(`/api/football/teams?${params.toString()}`);
}

export async function fetchMatchDetail(league: string, eventId: string): Promise<MatchDetailData> {
  return apiFetch(`/api/football/match/${encodeURIComponent(league)}/${encodeURIComponent(eventId)}`);
}

export async function fetchMatchStream(
  league: string,
  eventId: string,
  homeName: string,
  awayName: string
): Promise<MatchStreamResponse> {
  const params = new URLSearchParams({
    league,
    eventId,
    home: homeName,
    away: awayName,
  });
  return apiFetch<MatchStreamResponse>(`/api/football/match-stream?${params.toString()}`);
}

export async function fetchMatchPrediction(params: {
  league: string;
  eventId: string;
  homeId?: string;
  awayId?: string;
  homeName: string;
  awayName: string;
}): Promise<MatchPredictionDetail> {
  const qs = new URLSearchParams({
    league: params.league,
    eventId: params.eventId,
    homeName: params.homeName,
    awayName: params.awayName,
  });
  if (params.homeId) qs.set('homeId', params.homeId);
  if (params.awayId) qs.set('awayId', params.awayId);
  return apiFetch<MatchPredictionDetail>(`/api/football/match-prediction?${qs.toString()}`);
}

export async function fetchUserPredictions(): Promise<Record<string, UserMatchPrediction>> {
  const res = await apiFetch<{ predictions: Record<string, UserMatchPrediction> }>('/api/football/predictions');
  return res.predictions || {};
}

export async function saveUserPrediction(input: {
  leagueSlug: string;
  eventId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
}): Promise<{ prediction: UserMatchPrediction; predictions: Record<string, UserMatchPrediction> }> {
  return apiFetch('/api/football/predictions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteUserPrediction(
  leagueSlug: string,
  eventId: string
): Promise<{ deleted: boolean; predictions: Record<string, UserMatchPrediction> }> {
  return apiFetch(`/api/football/predictions/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

export async function fetchFreeApps(): Promise<FreeAppItem[]> {
  const res = await apiFetch<{ apps: FreeAppItem[] }>('/api/apps');
  return res.apps;
}

export async function fetchChannelLiveEmbed(params: {
  url: string;
  name: string;
  youtubeChannelId?: string;
}): Promise<ChannelLiveEmbedResponse> {
  const qs = new URLSearchParams({
    url: params.url,
    name: params.name,
  });
  if (params.youtubeChannelId) {
    qs.set('youtubeChannelId', params.youtubeChannelId);
  }
  return apiFetch<ChannelLiveEmbedResponse>(`/api/apps/live-embed?${qs.toString()}`);
}

export async function createFreeApp(input: {
  name: string;
  category: string;
  icon: FreeAppIconType;
  description: string;
  url: string;
  youtubeChannelId?: string;
  tryInAppBrowser?: boolean;
  actionLabel?: string;
}): Promise<{ app: FreeAppItem; apps: FreeAppItem[] }> {
  return apiFetch('/api/apps', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteFreeApp(id: string): Promise<{ deleted: boolean; apps: FreeAppItem[] }> {
  return apiFetch(`/api/apps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchWallet(): Promise<WalletSnapshot> {
  const snapshot = await apiFetch<WalletSnapshot>('/api/wallet');
  if (snapshot.walletToken) {
    setStoredWalletToken(snapshot.walletToken);
  }
  return snapshot;
}

export async function redeemCreditCode(code: string): Promise<{
  message: string;
  creditedAmount: number;
  redeemedAt: string;
  snapshot: WalletSnapshot;
}> {
  const res = await apiFetch<{
    message: string;
    creditedAmount: number;
    redeemedAt: string;
    snapshot: WalletSnapshot;
  }>('/api/wallet/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (res.snapshot?.walletToken) {
    setStoredWalletToken(res.snapshot.walletToken);
  }
  return res;
}

export async function buyPremiumKey(planId: PremiumPlanId): Promise<{
  message: string;
  key: AcquiredPremiumKey;
  snapshot: WalletSnapshot;
}> {
  const res = await apiFetch<{
    message: string;
    key: AcquiredPremiumKey;
    snapshot: WalletSnapshot;
  }>('/api/wallet/buy', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
  if (res.snapshot?.walletToken) {
    setStoredWalletToken(res.snapshot.walletToken);
  }
  return res;
}

export async function saveReceivedKey(code: string): Promise<{
  message: string;
  key: AcquiredPremiumKey;
  snapshot: WalletSnapshot;
}> {
  const res = await apiFetch<{
    message: string;
    key: AcquiredPremiumKey;
    snapshot: WalletSnapshot;
  }>('/api/wallet/keys/save', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (res.snapshot?.walletToken) {
    setStoredWalletToken(res.snapshot.walletToken);
  }
  return res;
}

export async function removeSavedKey(code: string): Promise<{
  message: string;
  snapshot: WalletSnapshot;
}> {
  return apiFetch(`/api/wallet/keys/saved/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}

export async function updateWalletConfig(patch: {
  creditAmount?: number;
  prices?: Partial<Record<PremiumPlanId, number>>;
}): Promise<{
  message: string;
  config: WalletConfig;
  snapshot: WalletSnapshot;
}> {
  return apiFetch('/api/wallet/config', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function fetchDlsHub(): Promise<DlsHubData> {
  return apiFetch<DlsHubData>('/api/dls');
}

export async function confirmTikTokFollowUnlock(): Promise<DlsHubData> {
  return apiFetch<DlsHubData>('/api/dls/follow-unlock', {
    method: 'POST',
  });
}

export async function updateDlsHubConfig(patch: {
  creator?: Partial<DlsCreatorProfile>;
  downloads?: DlsDownloadItem[];
}): Promise<{ message: string; data: DlsHubData }> {
  return apiFetch('/api/dls/config', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function fetchAdminRedeemCodes(): Promise<RedeemCodesAdminSnapshot> {
  return apiFetch<RedeemCodesAdminSnapshot>('/api/wallet/admin/codes');
}

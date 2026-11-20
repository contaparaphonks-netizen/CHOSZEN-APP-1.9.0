export type PanelMode =
  | 'carteira'
  | 'keys-premium'
  | 'codigos-resgate'
  | 'menu-futebol'
  | 'dls-de-boa';

export type FootballSubTab =
  | 'todos-jogos'
  | 'apps-gratuitos'
  | 'classificacao'
  | 'clubes'
  | 'apps';

export type SessionRole = 'owner' | 'premium';

export interface AuthSession {
  authenticated: boolean;
  role?: SessionRole;
  issuedAt?: number;
  activatedAt?: string | null;
  expiresAt?: string | null;
  planName?: string | null;
  keyCode?: string | null;
  firstActivation?: boolean;
}

export interface CompetitionInfo {
  slug: string;
  name: string;
  country: string;
  shortName: string;
  scope: 'nacional' | 'internacional';
}

export interface MatchTeam {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  logo: string | null;
  score: string;
  winner: boolean;
}

export type MatchDayBucket = 'today' | 'tomorrow' | 'upcoming' | 'recent';

export interface MatchAutoPrediction {
  predictedHomeScore: number;
  predictedAwayScore: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  homeRank: number | null;
  awayRank: number | null;
}

export interface MatchPredictionTeamStats {
  teamName: string;
  rank: number;
  gamesPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  ppg: number;
  goalsForAvg: number;
  goalsAgainstAvg: number;
}

export interface MatchPredictionDetail {
  leagueSlug: string;
  eventId: string;
  hasEnoughData: boolean;
  reason?: string;
  confidenceLabel: string;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  predictedHomeScore: number;
  predictedAwayScore: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  topScores: Array<{ home: number; away: number; probabilityPct: number }>;
  homeStats: MatchPredictionTeamStats | null;
  awayStats: MatchPredictionTeamStats | null;
}

export interface UserMatchPrediction {
  matchKey: string;
  leagueSlug: string;
  eventId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  updatedAt: string;
}

export interface FootballMatch {
  id: string;
  date: string;
  brasiliaDateKey: string;
  dayBucket: MatchDayBucket;
  leagueSlug: string;
  leagueName: string;
  scope: 'nacional' | 'internacional';
  statusState: 'in' | 'pre' | 'post';
  statusLabel: 'AO VIVO' | 'EM BREVE' | 'ENCERRADO';
  statusDetail: string;
  displayClock: string;
  venue: string | null;
  broadcasts: string[];
  officialUrl: string | null;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  autoPrediction?: MatchAutoPrediction | null;
}

export interface StandingEntry {
  rank: number;
  teamId: string;
  teamName: string;
  teamAbbr: string;
  teamLogo: string | null;
  gamesPlayed: string;
  wins: string;
  ties: string;
  losses: string;
  goalsFor: string;
  goalsAgainst: string;
  goalDiff: string;
  points: string;
  overall: string;
  note: string | null;
}

export interface FootballClub {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  color: string | null;
  logo: string | null;
}

export interface MatchDetailEvent {
  minute: string;
  type: string;
  teamName: string;
  playerName: string;
}

export interface MatchDetailStat {
  label: string;
  homeValue: string;
  awayValue: string;
}

export interface MatchDetailData {
  id: string;
  leagueSlug: string;
  leagueName: string;
  date: string;
  statusState: 'in' | 'pre' | 'post';
  statusLabel: string;
  statusDetail: string;
  displayClock: string;
  venue: string | null;
  attendance: string | null;
  broadcasts: string[];
  officialUrl: string | null;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  events: MatchDetailEvent[];
  stats: MatchDetailStat[];
}

export interface StreamSourceOption {
  id: string;
  name: string;
  channelLabel?: string;
  platformType: 'youtube-embed' | 'official-channel' | 'free-platform';
  embeddable: boolean;
  videoId?: string | null;
  embedUrl: string | null;
  externalUrl: string;
  description: string;
  durationLabel?: string | null;
  publishedDate?: string | null;
  statusNote?: string | null;
  isYoutubeExternal?: boolean;
  isHighlight?: boolean;
  isLiveMatch?: boolean;
  isExactMatch?: boolean;
}

export interface MatchStreamResponse {
  matchId: string;
  leagueSlug: string;
  matchDate?: string;
  matchStatusState?: 'in' | 'pre' | 'post';
  matchStatusLabel?: string;
  reportedBroadcasts: string[];
  embeddableStream: StreamSourceOption | null;
  embeddableSources: StreamSourceOption[];
  channelOptions: StreamSourceOption[];
  highlightSources: StreamSourceOption[];
  officialLinks: StreamSourceOption[];
  checkedAt: string;
}

export type FreeAppIconType = 'tv' | 'youtube' | 'telegram' | 'globe';

export interface FreeAppItem {
  id: string;
  name: string;
  category: string;
  icon: FreeAppIconType;
  description: string;
  url: string;
  youtubeChannelId?: string;
  actionLabel?: string;
  tryInAppBrowser?: boolean;
  isExternalCommunity?: boolean;
  createdAt: string;
}

export interface ChannelLiveVideoItem {
  videoId: string;
  title: string;
  publishedDate?: string | null;
  embedUrl: string;
  watchUrl: string;
}

export interface ChannelLiveEmbedResponse {
  name: string;
  url: string;
  youtubeChannelId: string | null;
  isLive?: boolean;
  embeddable: boolean;
  videoId?: string | null;
  embedUrl: string | null;
  liveEmbedUrl: string | null;
  latestVideos: ChannelLiveVideoItem[];
  blockReason: string | null;
  checkedAt: string;
}

export type PremiumPlanId = '1d' | '7d' | '1m';

export type PremiumKeyStatus = 'ON — NÃO UTILIZADA' | 'ATIVA' | 'EXPIRADA';

export type PremiumKeyOrigin = 'purchased' | 'starter' | 'received';

export interface PremiumKeyPlan {
  id: PremiumPlanId;
  name: string;
  durationLabel: string;
  durationDays: number;
  price: number;
}

export interface AcquiredPremiumKey {
  id: string;
  code: string;
  planId: PremiumPlanId;
  planName: string;
  durationLabel: string;
  pricePaid: number;
  status: PremiumKeyStatus;
  origin?: PremiumKeyOrigin;
  purchasedAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  remainingMs: number | null;
}

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'purchase';
  description: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  keyCode?: string | null;
}

export interface WalletConfig {
  creditAmount: number;
  prices: Record<PremiumPlanId, number>;
}

export interface WalletSnapshot {
  walletId: string;
  walletToken?: string;
  balance: number;
  totalCredited: number;
  totalSpent: number;
  creditRedeemedCount: number;
  maxCreditRedemptions: number;
  plans: PremiumKeyPlan[];
  keys: AcquiredPremiumKey[];
  transactions: WalletTransaction[];
  creditHistory: WalletTransaction[];
  purchaseHistory: WalletTransaction[];
  config?: WalletConfig;
}

export interface DlsCreatorProfile {
  displayName: string;
  tiktokHandle: string;
  tiktokUrl: string;
  avatarUrl: string;
}

export interface DlsDownloadItem {
  id: string;
  version: string;
  editionName: string;
  architecture: string;
  fileName: string;
  mediafireUrl: string;
}

export interface DlsHubData {
  creator: DlsCreatorProfile;
  downloads: DlsDownloadItem[];
  followUnlocked: boolean;
  unlockedAt: string | null;
}

export type RedeemCodeTier = '15' | '70' | '100' | '180' | 'especial-250' | '320' | '500';
export type RedeemCodeStatus = 'DISPONÍVEL' | 'UTILIZADO';

export interface RedeemCodeAdminItem {
  id: string;
  code: string;
  amount: number;
  tier: RedeemCodeTier;
  isSpecial: boolean;
  status: RedeemCodeStatus;
  usedAt: string | null;
  usedByWalletId: string | null;
  createdAt: string;
}

export interface RedeemCodesAdminSnapshot {
  total: number;
  availableCount: number;
  usedCount: number;
  countsByTier: Record<RedeemCodeTier, { total: number; available: number; used: number }>;
  codes: RedeemCodeAdminItem[];
}

import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, '.data');
const SECRET_FILE = path.join(DATA_DIR, 'session.secret');
const WALLET_FILE = path.join(DATA_DIR, 'wallet.json');
const REDEEM_CODES_FILE = path.join(DATA_DIR, 'redeem_codes.json');
const DLS_HUB_FILE = path.join(DATA_DIR, 'dls_hub.json');
const FREE_APPS_FILE = path.join(DATA_DIR, 'free_apps.json');
const MATCH_PREDICTIONS_FILE = path.join(DATA_DIR, 'match_predictions.json');

type RedeemCodeTier = '15' | '70' | '100' | '180' | 'especial-250' | '320' | '500';
type RedeemCodeStatus = 'DISPONÍVEL' | 'UTILIZADO';

interface RedeemCodeRecord {
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

function generateUnguessableRedeemCode(existing: Set<string>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = crypto.randomBytes(12);
    let p1 = '';
    let p2 = '';
    let p3 = '';
    for (let i = 0; i < 4; i++) {
      p1 += alphabet[bytes[i] % alphabet.length];
      p2 += alphabet[bytes[i + 4] % alphabet.length];
      p3 += alphabet[bytes[i + 8] % alphabet.length];
    }
    const candidate = `CHS-${p1}-${p2}-${p3}`;
    if (!existing.has(candidate)) {
      existing.add(candidate);
      return candidate;
    }
  }
  const fallback = `CHS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  existing.add(fallback);
  return fallback;
}

function writeRedeemCodes(records: RedeemCodeRecord[]): void {
  ensureDataDir();
  const tmpFile = `${REDEEM_CODES_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), 'utf8');
  fs.renameSync(tmpFile, REDEEM_CODES_FILE);
}

function buildRedeemCodeBatch(
  specs: Array<{ count: number; amount: number; tier: RedeemCodeTier; isSpecial: boolean }>,
  existingCodes: Set<string>,
  nowIso: string
): RedeemCodeRecord[] {
  const batch: RedeemCodeRecord[] = [];
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      batch.push({
        id: crypto.randomUUID(),
        code: generateUnguessableRedeemCode(existingCodes),
        amount: spec.amount,
        tier: spec.tier,
        isSpecial: spec.isSpecial,
        status: 'DISPONÍVEL',
        usedAt: null,
        usedByWalletId: null,
        createdAt: nowIso,
      });
    }
  }
  for (let i = batch.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [batch[i], batch[j]] = [batch[j], batch[i]];
  }
  return batch;
}

function ensureRedeemCodesSeeded(): RedeemCodeRecord[] {
  ensureDataDir();
  const nowIso = new Date().toISOString();
  const extraHighValueSpecs: Array<{
    count: number;
    amount: number;
    tier: RedeemCodeTier;
    isSpecial: boolean;
  }> = [
    { count: 40, amount: 100, tier: '100', isSpecial: false },
    { count: 35, amount: 180, tier: '180', isSpecial: false },
    { count: 20, amount: 320, tier: '320', isSpecial: false },
    { count: 5, amount: 500, tier: '500', isSpecial: false },
  ];

  if (fs.existsSync(REDEEM_CODES_FILE)) {
    try {
      const raw = fs.readFileSync(REDEEM_CODES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 200) {
        return parsed as RedeemCodeRecord[];
      }
      if (Array.isArray(parsed) && parsed.length === 100) {
        // Preserve all 100 existing codes intact and append +100 higher-value codes
        const existingSet = new Set<string>(
          (parsed as RedeemCodeRecord[]).map((c) => String(c.code).toUpperCase())
        );
        const extraBatch = buildRedeemCodeBatch(extraHighValueSpecs, existingSet, nowIso);
        const combined = [...(parsed as RedeemCodeRecord[]), ...extraBatch];
        writeRedeemCodes(combined);
        return combined;
      }
    } catch {
      // Regenerate below if corrupted
    }
  }

  const usedCodes = new Set<string>();
  const baseBatch = buildRedeemCodeBatch(
    [
      { count: 40, amount: 15, tier: '15', isSpecial: false },
      { count: 30, amount: 70, tier: '70', isSpecial: false },
      { count: 29, amount: 100, tier: '100', isSpecial: false },
      { count: 1, amount: 250, tier: 'especial-250', isSpecial: true },
    ],
    usedCodes,
    nowIso
  );
  const extraBatch = buildRedeemCodeBatch(extraHighValueSpecs, usedCodes, nowIso);
  const fullBatch = [...baseBatch, ...extraBatch];

  writeRedeemCodes(fullBatch);
  return fullBatch;
}

function readRedeemCodes(): RedeemCodeRecord[] {
  return ensureRedeemCodesSeeded();
}

interface DlsCreatorRecord {
  displayName: string;
  tiktokHandle: string;
  tiktokUrl: string;
  avatarUrl: string;
}

interface DlsDownloadRecord {
  id: string;
  version: string;
  editionName: string;
  architecture: string;
  fileName: string;
  mediafireUrl: string;
}

interface DlsHubStoreData {
  creator: DlsCreatorRecord;
  downloads: DlsDownloadRecord[];
  followUnlocks: Record<string, string>;
}

const DEFAULT_DLS_HUB_DATA: DlsHubStoreData = {
  creator: {
    displayName: 'DLS HUB™ Oficial',
    tiktokHandle: '@dlshub',
    tiktokUrl: 'https://www.tiktok.com/',
    avatarUrl: '/src/assets/images/creator_tiktok_avatar_1795181461449.jpg',
  },
  downloads: [
    {
      id: 'dls-20',
      version: 'DLS 20',
      editionName: 'INFINITO ES',
      architecture: 'ARM64 · ARMv7',
      fileName: 'DLS20_INFINITO_ES_ARM64_ARMV7.zip',
      mediafireUrl: 'https://www.mediafire.com/file/lzs1yifml2whcjz/DLS20_INFINITO_ES_ARM64_ARMV7.zip/file',
    },
    {
      id: 'dls-21',
      version: 'DLS 21',
      editionName: 'INFINITO ES',
      architecture: 'ARM64 · ARMv7',
      fileName: 'DLS21_INFINITO_ES_ARM64_ARMV7.zip',
      mediafireUrl: 'https://www.mediafire.com/file/yopf5348qn2d2j3/DLS21_INFINITO_ES_ARM64_ARMV7.zip/file',
    },
    {
      id: 'dls-22',
      version: 'DLS 22',
      editionName: 'INFINITO ES',
      architecture: 'ARM64 · ARMv7',
      fileName: 'DLS22_INFINITO_ES_ARM64_ARMV7.zip',
      mediafireUrl: 'https://www.mediafire.com/file/e59czxtxtmzbqm8/DLS22_INFINITO_ES_ARM64_ARMV7.zip/file?dkey=e59czxtxtmzbqm8',
    },
    {
      id: 'dls-24',
      version: 'DLS 24',
      editionName: '100M V2',
      architecture: 'ARM64 · ARMv7',
      fileName: 'DLS24_100M_ARM64_ARMV7_V2.zip',
      mediafireUrl: 'https://www.mediafire.com/file/d4xvmmd063qeuty/DLS24_100M_ARM64_ARMV7_V2.zip/file',
    },
  ],
  followUnlocks: {},
};

function readDlsHubStore(): DlsHubStoreData {
  ensureDataDir();
  if (!fs.existsSync(DLS_HUB_FILE)) {
    return {
      creator: { ...DEFAULT_DLS_HUB_DATA.creator },
      downloads: DEFAULT_DLS_HUB_DATA.downloads.map((d) => ({ ...d })),
      followUnlocks: {},
    };
  }
  try {
    const raw = fs.readFileSync(DLS_HUB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DlsHubStoreData>;
    return {
      creator: {
        displayName: parsed?.creator?.displayName || DEFAULT_DLS_HUB_DATA.creator.displayName,
        tiktokHandle: parsed?.creator?.tiktokHandle || DEFAULT_DLS_HUB_DATA.creator.tiktokHandle,
        tiktokUrl: parsed?.creator?.tiktokUrl || DEFAULT_DLS_HUB_DATA.creator.tiktokUrl,
        avatarUrl: parsed?.creator?.avatarUrl || DEFAULT_DLS_HUB_DATA.creator.avatarUrl,
      },
      downloads:
        Array.isArray(parsed?.downloads) && parsed.downloads.length > 0
          ? parsed.downloads
          : DEFAULT_DLS_HUB_DATA.downloads.map((d) => ({ ...d })),
      followUnlocks:
        parsed?.followUnlocks && typeof parsed.followUnlocks === 'object'
          ? parsed.followUnlocks
          : {},
    };
  } catch {
    return {
      creator: { ...DEFAULT_DLS_HUB_DATA.creator },
      downloads: DEFAULT_DLS_HUB_DATA.downloads.map((d) => ({ ...d })),
      followUnlocks: {},
    };
  }
}

function writeDlsHubStore(store: DlsHubStoreData): void {
  ensureDataDir();
  const tmpFile = `${DLS_HUB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpFile, DLS_HUB_FILE);
}

/**
 * KEY OFICIAL PERMANENTE — CHOSZEN ™
 * Regras obrigatórias:
 * - Sem data de expiração, sem contador regressivo, sem invalidação automática.
 * - Comparação exata sem modificar letras, espaços ou símbolos.
 */
const OFFICIAL_KEY = 'CHOSZEN \u2122';

/**
 * CÓDIGO OFICIAL DE CRÉDITO FICTÍCIO
 * Validado exclusivamente no servidor com timingSafeEqual.
 */
const OFFICIAL_CREDIT_CODE = 'moneyzrip';
const MAX_CREDIT_REDEMPTIONS_PER_WALLET = 1;

const PREMIUM_PLAN_DEFINITIONS = {
  '1d': {
    id: '1d' as const,
    name: 'KEY PREMIUM — 1 DIA',
    durationLabel: '1 dia (24 horas)',
    durationDays: 1,
    durationMs: 24 * 60 * 60 * 1000,
    defaultPrice: 100,
    codePrefix: 'DLS-1D',
  },
  '7d': {
    id: '7d' as const,
    name: 'KEY PREMIUM — 7 DIAS',
    durationLabel: '7 dias',
    durationDays: 7,
    durationMs: 7 * 24 * 60 * 60 * 1000,
    defaultPrice: 320,
    codePrefix: 'DLS-7D',
  },
  '1m': {
    id: '1m' as const,
    name: 'KEY PREMIUM — 1 MÊS',
    durationLabel: '1 mês (30 dias)',
    durationDays: 30,
    durationMs: 30 * 24 * 60 * 60 * 1000,
    defaultPrice: 670,
    codePrefix: 'DLS-1M',
  },
};

type PremiumPlanId = keyof typeof PREMIUM_PLAN_DEFINITIONS;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSessionSecret(): string {
  if (process.env.CHOSZEN_SESSION_SECRET && process.env.CHOSZEN_SESSION_SECRET.length >= 16) {
    return process.env.CHOSZEN_SESSION_SECRET;
  }
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = getSessionSecret();

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function verifyOfficialKey(candidate: string): boolean {
  const candidateDigest = sha256Buffer(candidate);
  const officialDigest = sha256Buffer(OFFICIAL_KEY);
  return crypto.timingSafeEqual(candidateDigest, officialDigest);
}

function verifyOfficialCreditCode(candidate: string): boolean {
  const candidateDigest = sha256Buffer(candidate);
  const officialDigest = sha256Buffer(OFFICIAL_CREDIT_CODE);
  return crypto.timingSafeEqual(candidateDigest, officialDigest);
}

/* ---------------- Persistent Wallet & Premium Keys Store ---------------- */

interface WalletConfig {
  creditAmount: number;
  prices: Record<PremiumPlanId, number>;
}

interface WalletTransactionRecord {
  id: string;
  type: 'credit' | 'purchase';
  description: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  keyCode?: string | null;
}

interface CreditRedemptionRecord {
  id: string;
  walletId: string;
  amount: number;
  redeemedAt: string;
}

interface PremiumKeyRecord {
  id: string;
  code: string;
  walletId: string;
  planId: PremiumPlanId;
  planName: string;
  durationLabel: string;
  durationMs: number;
  pricePaid: number;
  origin?: 'purchased' | 'starter' | 'received';
  purchasedAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
}

interface WalletRecord {
  id: string;
  balance: number;
  creditRedeemedCount: number;
  lastCreditAt: string | null;
  createdAt: string;
  updatedAt: string;
  transactions: WalletTransactionRecord[];
  savedKeyCodes?: string[];
  starterKeyGranted?: boolean;
}

interface WalletStoreData {
  config: WalletConfig;
  wallets: Record<string, WalletRecord>;
  keys: Record<string, PremiumKeyRecord>;
  redemptions: CreditRedemptionRecord[];
}

function defaultWalletConfig(): WalletConfig {
  return {
    creditAmount: 500,
    prices: {
      '1d': PREMIUM_PLAN_DEFINITIONS['1d'].defaultPrice,
      '7d': PREMIUM_PLAN_DEFINITIONS['7d'].defaultPrice,
      '1m': PREMIUM_PLAN_DEFINITIONS['1m'].defaultPrice,
    },
  };
}

function readWalletStore(): WalletStoreData {
  ensureDataDir();
  const fallback: WalletStoreData = {
    config: defaultWalletConfig(),
    wallets: {},
    keys: {},
    redemptions: [],
  };
  if (!fs.existsSync(WALLET_FILE)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(WALLET_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WalletStoreData>;
    const defaults = defaultWalletConfig();
    const rawPrices = parsed?.config?.prices;
    const isOldUntouchedPrices =
      rawPrices &&
      rawPrices['1d'] === 25 &&
      rawPrices['7d'] === 100 &&
      rawPrices['1m'] === 250;

    const resolvedPrices = isOldUntouchedPrices
      ? defaults.prices
      : {
          '1d':
            typeof rawPrices?.['1d'] === 'number' && rawPrices['1d'] > 0
              ? rawPrices['1d']
              : defaults.prices['1d'],
          '7d':
            typeof rawPrices?.['7d'] === 'number' && rawPrices['7d'] > 0
              ? rawPrices['7d']
              : defaults.prices['7d'],
          '1m':
            typeof rawPrices?.['1m'] === 'number' && rawPrices['1m'] > 0
              ? rawPrices['1m']
              : defaults.prices['1m'],
        };

    const store: WalletStoreData = {
      config: {
        creditAmount:
          typeof parsed?.config?.creditAmount === 'number' && parsed.config.creditAmount > 0
            ? parsed.config.creditAmount
            : defaults.creditAmount,
        prices: resolvedPrices,
      },
      wallets: parsed?.wallets && typeof parsed.wallets === 'object' ? parsed.wallets : {},
      keys: parsed?.keys && typeof parsed.keys === 'object' ? parsed.keys : {},
      redemptions: Array.isArray(parsed?.redemptions) ? parsed.redemptions : [],
    };
    if (isOldUntouchedPrices) {
      writeWalletStore(store);
    }
    return store;
  } catch {
    return fallback;
  }
}

function writeWalletStore(store: WalletStoreData): void {
  ensureDataDir();
  const tmpFile = `${WALLET_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpFile, WALLET_FILE);
}

function generatePremiumKeyCode(planId: PremiumPlanId, existingKeys: Record<string, PremiumKeyRecord>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prefix = PREMIUM_PLAN_DEFINITIONS[planId].codePrefix;
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(8);
    let seg1 = '';
    let seg2 = '';
    for (let i = 0; i < 4; i++) {
      seg1 += alphabet[bytes[i] % alphabet.length];
      seg2 += alphabet[bytes[i + 4] % alphabet.length];
    }
    const candidate = `${prefix}-${seg1}-${seg2}`;
    if (!existingKeys[candidate]) {
      return candidate;
    }
  }
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function computeKeyStatus(record: PremiumKeyRecord, nowMs = Date.now()): {
  status: 'ON — NÃO UTILIZADA' | 'ATIVA' | 'EXPIRADA';
  remainingMs: number | null;
} {
  // REGRA MAIS IMPORTANTE: Key ainda não utilizada permanece 'ON — NÃO UTILIZADA' sem expirar.
  if (!record.activatedAt || !record.expiresAt) {
    return { status: 'ON — NÃO UTILIZADA', remainingMs: null };
  }
  const expMs = new Date(record.expiresAt).getTime();
  if (Number.isNaN(expMs) || nowMs >= expMs) {
    return { status: 'EXPIRADA', remainingMs: 0 };
  }
  return { status: 'ATIVA', remainingMs: expMs - nowMs };
}

function formatKeyForClient(
  record: PremiumKeyRecord,
  nowMs = Date.now(),
  overrideOrigin?: 'purchased' | 'starter' | 'received'
) {
  const { status, remainingMs } = computeKeyStatus(record, nowMs);
  return {
    id: record.id,
    code: record.code,
    planId: record.planId,
    planName: record.planName,
    durationLabel: record.durationLabel,
    pricePaid: record.pricePaid,
    status,
    origin: overrideOrigin || record.origin || (record.pricePaid === 0 ? 'starter' : 'purchased'),
    purchasedAt: record.purchasedAt,
    activatedAt: record.activatedAt,
    expiresAt: record.expiresAt,
    remainingMs,
  };
}

function signWalletId(walletId: string): string {
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`wallet:${walletId}`)
    .digest('base64url');
  return `${walletId}.${signature}`;
}

function verifyWalletToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const idx = token.indexOf('.');
  if (idx <= 0) return null;
  const walletId = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  if (!walletId || !signature) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`wallet:${walletId}`)
    .digest('base64url');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return walletId;
}

function extractCookie(req: express.Request, cookieName: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader !== 'string') return null;
  const cookies = cookieHeader.split(';');
  for (const raw of cookies) {
    const idx = raw.indexOf('=');
    if (idx > -1) {
      const name = raw.slice(0, idx).trim();
      const val = raw.slice(idx + 1).trim();
      if (name === cookieName) {
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      }
    }
  }
  return null;
}

function resolveWalletContext(
  req: express.Request,
  res: express.Response,
  store: WalletStoreData
): { wallet: WalletRecord; walletToken: string; dirty: boolean } {
  const headerToken = typeof req.headers['x-wallet-token'] === 'string' ? req.headers['x-wallet-token'] : null;
  const cookieToken = extractCookie(req, 'choszen_wallet');
  let walletId = verifyWalletToken(headerToken) || verifyWalletToken(cookieToken);
  let dirty = false;

  if (!walletId) {
    walletId = crypto.randomUUID();
  }

  let wallet = store.wallets[walletId];
  if (!wallet) {
    const now = new Date().toISOString();
    wallet = {
      id: walletId,
      balance: 0,
      creditRedeemedCount: 0,
      lastCreditAt: null,
      createdAt: now,
      updatedAt: now,
      transactions: [],
      savedKeyCodes: [],
      starterKeyGranted: false,
    };
    store.wallets[walletId] = wallet;
    dirty = true;
  }

  // Ensure every wallet receives 1 starter saved Key ("ON — NÃO UTILIZADA") ready in the Keys tab
  if (!wallet.starterKeyGranted) {
    const nowIso = new Date().toISOString();
    const starterPlan = PREMIUM_PLAN_DEFINITIONS['1d'];
    const starterCode = generatePremiumKeyCode('1d', store.keys);
    store.keys[starterCode] = {
      id: crypto.randomUUID(),
      code: starterCode,
      walletId: wallet.id,
      planId: '1d',
      planName: starterPlan.name,
      durationLabel: starterPlan.durationLabel,
      durationMs: starterPlan.durationMs,
      pricePaid: 0,
      origin: 'starter',
      purchasedAt: nowIso,
      activatedAt: null,
      expiresAt: null,
    };
    wallet.savedKeyCodes = Array.isArray(wallet.savedKeyCodes)
      ? Array.from(new Set([starterCode, ...wallet.savedKeyCodes]))
      : [starterCode];
    wallet.starterKeyGranted = true;
    store.wallets[wallet.id] = wallet;
    dirty = true;
  }

  const walletToken = signWalletId(walletId);
  if (cookieToken !== walletToken) {
    res.setHeader(
      'Set-Cookie',
      `choszen_wallet=${encodeURIComponent(walletToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000`
    );
  }

  return { wallet, walletToken, dirty };
}

function buildWalletSnapshot(
  store: WalletStoreData,
  wallet: WalletRecord,
  walletToken: string,
  includeOwnerConfig: boolean
) {
  const nowMs = Date.now();
  const plans = (['1d', '7d', '1m'] as PremiumPlanId[]).map((id) => {
    const def = PREMIUM_PLAN_DEFINITIONS[id];
    return {
      id: def.id,
      name: def.name,
      durationLabel: def.durationLabel,
      durationDays: def.durationDays,
      price: store.config.prices[id],
    };
  });

  const savedSet = new Set(Array.isArray(wallet.savedKeyCodes) ? wallet.savedKeyCodes : []);
  const keyMap = new Map<string, ReturnType<typeof formatKeyForClient>>();

  for (const k of Object.values(store.keys)) {
    if (k.walletId === wallet.id) {
      keyMap.set(k.code, formatKeyForClient(k, nowMs));
    } else if (savedSet.has(k.code)) {
      keyMap.set(k.code, formatKeyForClient(k, nowMs, 'received'));
    }
  }

  const keys = Array.from(keyMap.values()).sort(
    (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()
  );

  const transactions = [...wallet.transactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const creditHistory = transactions.filter((t) => t.type === 'credit');
  const purchaseHistory = transactions.filter((t) => t.type === 'purchase');

  const totalCredited = creditHistory.reduce((acc, t) => acc + t.amount, 0);
  const totalSpent = purchaseHistory.reduce((acc, t) => acc + t.amount, 0);

  return {
    walletId: wallet.id,
    walletToken,
    balance: Number(wallet.balance.toFixed(2)),
    totalCredited: Number(totalCredited.toFixed(2)),
    totalSpent: Number(totalSpent.toFixed(2)),
    creditRedeemedCount: wallet.creditRedeemedCount,
    maxCreditRedemptions: MAX_CREDIT_REDEMPTIONS_PER_WALLET,
    plans,
    keys,
    transactions,
    creditHistory,
    purchaseHistory,
    ...(includeOwnerConfig ? { config: store.config } : {}),
  };
}

interface SessionPayload {
  v: number;
  scope: 'choszen-owner' | 'choszen-premium';
  iat: number;
  exp?: number;
  keyId?: string;
  keyCode?: string;
  planName?: string;
  activatedAt?: string;
  expiresAt?: string;
}

function signSessionPayload(payloadObj: SessionPayload): string {
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function createPermanentToken(): { token: string; issuedAt: number } {
  const issuedAt = Date.now();
  const payloadObj: SessionPayload = {
    v: 1,
    scope: 'choszen-owner',
    iat: issuedAt,
  };
  return { token: signSessionPayload(payloadObj), issuedAt };
}

function createPremiumToken(record: PremiumKeyRecord): { token: string; issuedAt: number } {
  const issuedAt = Date.now();
  const exp = new Date(record.expiresAt!).getTime();
  const payloadObj: SessionPayload = {
    v: 1,
    scope: 'choszen-premium',
    iat: issuedAt,
    exp,
    keyId: record.id,
    keyCode: record.code,
    planName: record.planName,
    activatedAt: record.activatedAt!,
    expiresAt: record.expiresAt!,
  };
  return { token: signSessionPayload(payloadObj), issuedAt };
}

function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
    if (parsed.v !== 1 || typeof parsed.iat !== 'number') return null;
    if (parsed.scope === 'choszen-owner') {
      return parsed;
    }
    if (parsed.scope === 'choszen-premium') {
      if (typeof parsed.exp !== 'number' || Date.now() >= parsed.exp) {
        return null;
      }
      if (parsed.keyCode) {
        const store = readWalletStore();
        const keyRecord = store.keys[parsed.keyCode];
        if (!keyRecord || !keyRecord.expiresAt || Date.now() >= new Date(keyRecord.expiresAt).getTime()) {
          return null;
        }
      }
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function extractToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return extractCookie(req, 'choszen_token');
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = extractToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Acesso não autorizado ou Key expirada. Autentique na aba CHOSZEN ™©.' });
    return;
  }
  next();
}

function requireOwnerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = extractToken(req);
  const verified = verifySessionToken(token);
  if (!verified || verified.scope !== 'choszen-owner') {
    res.status(403).json({ error: 'Acesso restrito ao proprietário.' });
    return;
  }
  next();
}

/* ---------------- Persistent Free Streaming & Community Apps Store ---------------- */

type FreeAppIconType = 'tv' | 'youtube' | 'telegram' | 'globe';

interface FreeAppRecord {
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

const DEFAULT_FREE_APPS: FreeAppRecord[] = [
  {
    id: 'app-cazetv',
    name: 'CazéTV (Brasil)',
    category: 'Transmissão Brasileira ao Vivo',
    icon: 'youtube',
    description:
      'Canal oficial brasileiro no YouTube com transmissões ao vivo gratuitas e player incorporado direto dentro do painel CHOSZEN™©.',
    url: 'https://www.youtube.com/@CazeTV/live',
    youtubeChannelId: 'UCZiYbVptd3PVPf4f6eR6UaQ',
    actionLabel: 'ASSISTIR AO VIVO',
    tryInAppBrowser: true,
    isExternalCommunity: false,
    createdAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'app-canal-goat',
    name: 'Canal GOAT (Brasil)',
    category: 'Transmissão Brasileira ao Vivo',
    icon: 'youtube',
    description:
      'Canal esportivo oficial brasileiro no YouTube com futebol nacional e sul-americano gratuito e reprodução incorporada no painel.',
    url: 'https://www.youtube.com/@canalgoatbr/live',
    youtubeChannelId: 'UC_oToDrJ6uca7d1dFVBmLtg',
    actionLabel: 'ASSISTIR AO VIVO',
    tryInAppBrowser: true,
    isExternalCommunity: false,
    createdAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'app-tv-brasil',
    name: 'TV Brasil (EBC)',
    category: 'TV Aberta Brasileira',
    icon: 'tv',
    description:
      'Emissora pública brasileira com transmissões esportivas em sinal aberto e player oficial no YouTube e portal EBC.',
    url: 'https://tvbrasil.ebc.com.br/ao-vivo',
    youtubeChannelId: 'UCSv9d0kQegylHWpP83jWSQg',
    actionLabel: 'ASSISTIR AO VIVO',
    tryInAppBrowser: true,
    isExternalCommunity: false,
    createdAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'app-tnt-sports-br',
    name: 'TNT Sports Brasil',
    category: 'Canal Esportivo Brasil',
    icon: 'youtube',
    description:
      'Canal brasileiro oficial com cobertura de jogos, pré-jogos e transmissões liberadas no YouTube Brasil dentro do painel.',
    url: 'https://www.youtube.com/@TNTSportsBR/live',
    youtubeChannelId: 'UCs-6sCz2LJm1PrWQN4ErsPw',
    actionLabel: 'ASSISTIR AO VIVO',
    tryInAppBrowser: true,
    isExternalCommunity: false,
    createdAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'app-espn-brasil',
    name: 'ESPN Brasil',
    category: 'Canal Esportivo Brasil',
    icon: 'tv',
    description:
      'Cobertura e transmissões oficiais da ESPN Brasil, com programas ao vivo no YouTube Brasil e acesso oficial Watch ESPN.',
    url: 'https://www.espn.com.br/watch/',
    youtubeChannelId: 'UCw5-xj3AKqEizC7MvHaIPqA',
    actionLabel: 'ASSISTIR AO VIVO',
    tryInAppBrowser: true,
    isExternalCommunity: false,
    createdAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'app-ge-globo',
    name: 'ge / TV Globo',
    category: 'Emissora Brasileira Oficial',
    icon: 'tv',
    description:
      'Canal oficial ge tv / TV Globo no YouTube e agenda SporTV/Premiere com transmissões e melhores momentos oficiais.',
    url: 'https://www.youtube.com/@geglobo/live',
    youtubeChannelId: 'UCgCKagVhzGnZcuP9bSMgMCg',
    actionLabel: 'ASSISTIR AO VIVO',
    tryInAppBrowser: true,
    isExternalCommunity: false,
    createdAt: '2026-11-20T00:00:00.000Z',
  },
];

const REMOVED_NON_BRAZIL_APP_IDS = new Set([
  'app-usa-network',
  'app-telegram-canal',
  'app-telegram-abmoods',
]);

function writeFreeApps(items: FreeAppRecord[]): void {
  ensureDataDir();
  const tmpFile = `${FREE_APPS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(items, null, 2), 'utf8');
  fs.renameSync(tmpFile, FREE_APPS_FILE);
}

function readFreeApps(): FreeAppRecord[] {
  ensureDataDir();
  if (!fs.existsSync(FREE_APPS_FILE)) {
    writeFreeApps(DEFAULT_FREE_APPS);
    return DEFAULT_FREE_APPS.map((a) => ({ ...a }));
  }
  try {
    const raw = fs.readFileSync(FREE_APPS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const cleaned = (parsed as FreeAppRecord[]).filter(
        (a) =>
          !REMOVED_NON_BRAZIL_APP_IDS.has(a.id) &&
          !/usanetwork\.com|t\.me\//i.test(String(a.url || ''))
      );
      const hasBrChannels = cleaned.some((a) => a.id === 'app-cazetv' || a.id === 'app-canal-goat');
      if (!hasBrChannels) {
        const customExtras = cleaned.filter((a) => !DEFAULT_FREE_APPS.some((d) => d.id === a.id));
        const migrated = [...DEFAULT_FREE_APPS.map((a) => ({ ...a })), ...customExtras];
        writeFreeApps(migrated);
        return migrated;
      }
      if (cleaned.length !== parsed.length) {
        writeFreeApps(cleaned);
      }
      return cleaned;
    }
  } catch {
    // Fallback to default seed
  }
  writeFreeApps(DEFAULT_FREE_APPS);
  return DEFAULT_FREE_APPS.map((a) => ({ ...a }));
}

/* ---------------- Real Football Data Service (Brasil + Ligas com Canal Brasileiro) ---------------- */

const COMPETITIONS: Array<{
  slug: string;
  name: string;
  shortName: string;
  country: string;
  scope: 'nacional' | 'internacional';
}> = [
  { slug: 'bra.1', name: 'Brasileirão Série A', shortName: 'Brasileirão A', country: 'Brasil', scope: 'nacional' },
  { slug: 'bra.2', name: 'Brasileirão Série B', shortName: 'Brasileirão B', country: 'Brasil', scope: 'nacional' },
  { slug: 'bra.copa_do_brazil', name: 'Copa do Brasil', shortName: 'Copa do Brasil', country: 'Brasil', scope: 'nacional' },
  { slug: 'conmebol.libertadores', name: 'CONMEBOL Libertadores', shortName: 'Libertadores', country: 'América do Sul', scope: 'internacional' },
  { slug: 'conmebol.sudamericana', name: 'CONMEBOL Sul-Americana', shortName: 'Sul-Americana', country: 'América do Sul', scope: 'internacional' },
  { slug: 'ger.1', name: 'Bundesliga', shortName: 'Bundesliga', country: 'Alemanha · Canal BR', scope: 'internacional' },
  { slug: 'uefa.champions', name: 'UEFA Champions League', shortName: 'Champions League', country: 'Europa · Canal BR', scope: 'internacional' },
  { slug: 'eng.1', name: 'Premier League', shortName: 'Premier League', country: 'Inglaterra · Canal BR', scope: 'internacional' },
  { slug: 'esp.1', name: 'LaLiga', shortName: 'LaLiga', country: 'Espanha · Canal BR', scope: 'internacional' },
  { slug: 'ita.1', name: 'Serie A Italiana', shortName: 'Serie A', country: 'Itália · Canal BR', scope: 'internacional' },
  { slug: 'fra.1', name: 'Ligue 1', shortName: 'Ligue 1', country: 'França · Canal BR', scope: 'internacional' },
];

const LEAGUE_BRAZIL_BROADCAST_GUIDE: Record<string, string[]> = {
  'bra.1': ['TV Globo', 'SporTV', 'Premiere', 'CazéTV'],
  'bra.2': ['Canal GOAT', 'TV Brasil', 'Premiere'],
  'bra.copa_do_brazil': ['TV Globo', 'SporTV', 'Premiere', 'Prime Video Brasil'],
  'conmebol.libertadores': ['TV Globo', 'ESPN Brasil', 'Disney+ Brasil', 'Paramount+ Brasil'],
  'conmebol.sudamericana': ['SBT', 'ESPN Brasil', 'Disney+ Brasil', 'Paramount+ Brasil'],
  'ger.1': ['CazéTV', 'Canal GOAT', 'SporTV'],
  'fra.1': ['CazéTV'],
  'uefa.champions': ['TNT Sports Brasil', 'Max', 'SBT'],
  'eng.1': ['ESPN Brasil', 'Disney+ Brasil'],
  'esp.1': ['ESPN Brasil', 'Disney+ Brasil'],
  'ita.1': ['ESPN Brasil', 'Disney+ Brasil'],
};

const LEAGUE_PRIORITY_YT_CHANNEL: Record<string, string[]> = {
  'ger.1': ['cazetv', 'getv', 'canalgoat', 'tntsportsbr', 'espnbrasil', 'tvbrasil'],
  'fra.1': ['cazetv', 'getv', 'canalgoat', 'tntsportsbr', 'espnbrasil', 'tvbrasil'],
  'uefa.champions': ['tntsportsbr', 'cazetv', 'getv', 'espnbrasil', 'canalgoat', 'tvbrasil'],
  'bra.1': ['getv', 'cazetv', 'tntsportsbr', 'canalgoat', 'espnbrasil', 'tvbrasil'],
  'bra.2': ['canalgoat', 'tvbrasil', 'getv', 'cazetv', 'tntsportsbr', 'espnbrasil'],
  'bra.copa_do_brazil': ['getv', 'cazetv', 'espnbrasil', 'tntsportsbr', 'canalgoat', 'tvbrasil'],
  'conmebol.libertadores': ['getv', 'espnbrasil', 'cazetv', 'tntsportsbr', 'canalgoat', 'tvbrasil'],
  'conmebol.sudamericana': ['espnbrasil', 'getv', 'cazetv', 'tntsportsbr', 'canalgoat', 'tvbrasil'],
  'eng.1': ['espnbrasil', 'getv', 'cazetv', 'tntsportsbr', 'canalgoat', 'tvbrasil'],
  'esp.1': ['espnbrasil', 'getv', 'cazetv', 'tntsportsbr', 'canalgoat', 'tvbrasil'],
  'ita.1': ['espnbrasil', 'getv', 'cazetv', 'tntsportsbr', 'canalgoat', 'tvbrasil'],
};

const COMPETITION_SLUGS = new Set(COMPETITIONS.map((c) => c.slug));

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

const apiCache = new Map<string, CacheEntry>();

function getBrasiliaDateKey(input: Date | string): string {
  const dt = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

function addDaysToDateKey(dateKey: string, offsetDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));
  return utc.toISOString().slice(0, 10);
}

function getBrasiliaDayBucket(
  brasiliaDateKey: string,
  todayKey: string,
  tomorrowKey: string
): 'today' | 'tomorrow' | 'upcoming' | 'recent' {
  if (!brasiliaDateKey) return 'upcoming';
  if (brasiliaDateKey === todayKey) return 'today';
  if (brasiliaDateKey === tomorrowKey) return 'tomorrow';
  if (brasiliaDateKey > tomorrowKey) return 'upcoming';
  return 'recent';
}

async function fetchJsonWithCache(url: string, ttlMs: number, forceRefresh = false): Promise<any> {
  const now = Date.now();
  const cached = apiCache.get(url);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.data;
  }
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CHOSZEN-Panel/1.0',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Upstream HTTP ${response.status}`);
  }
  const data = await response.json();
  apiCache.set(url, { expiresAt: now + ttlMs, data });
  return data;
}

function translateStatus(state: string): 'AO VIVO' | 'EM BREVE' | 'ENCERRADO' {
  if (state === 'in') return 'AO VIVO';
  if (state === 'post') return 'ENCERRADO';
  return 'EM BREVE';
}

const BRAZILIAN_CHANNEL_ALLOW_RE =
  /(globo|sportv|premiere|caz[eé]|goat|tv\s*brasil|espn\s*brasil|disney\+\s*brasil|disney\+|paramount\+\s*brasil|tnt\s*sports|max|record|sbt|band|prime\s*video|amazon|nsports|desimpedidos|youtube)/i;
const FOREIGN_CHANNEL_BLOCK_RE =
  /(espn\+|espn\s*app|espn2|espn3|espnews|espn\s*deportes|usa\s*net|fandango|bein|universo|telemundo|peacock|cbs|nbc|abc|tudn|univision|fox\s*deportes|fs1|fs2|fubo|golazo|vix|trutv|tnt\s*us|sky\s*sports|dazn\s*(de|uk|es|it)|movistar|canal\+)/i;

function extractBroadcastNames(comp: any, leagueSlug?: string): string[] {
  const set = new Set<string>();
  const geoBroadcasts = Array.isArray(comp?.geoBroadcasts) ? comp.geoBroadcasts : [];
  for (const gb of geoBroadcasts) {
    const region = String(gb?.region || '').toLowerCase();
    if (region !== 'br') continue;
    const name = gb?.media?.shortName || gb?.media?.name;
    if (
      typeof name === 'string' &&
      name.trim() &&
      !FOREIGN_CHANNEL_BLOCK_RE.test(name) &&
      BRAZILIAN_CHANNEL_ALLOW_RE.test(name)
    ) {
      set.add(name.trim());
    }
  }

  const broadcasts = Array.isArray(comp?.broadcasts) ? comp.broadcasts : [];
  for (const b of broadcasts) {
    const market = String(b?.market?.type || b?.type?.shortName || '').toLowerCase();
    if (market && !market.includes('br') && leagueSlug && !leagueSlug.startsWith('bra.')) {
      continue;
    }
    if (Array.isArray(b?.names)) {
      for (const n of b.names) {
        if (
          typeof n === 'string' &&
          n.trim() &&
          !FOREIGN_CHANNEL_BLOCK_RE.test(n) &&
          BRAZILIAN_CHANNEL_ALLOW_RE.test(n)
        ) {
          set.add(n.trim());
        }
      }
    }
    const shortName = b?.media?.shortName;
    if (
      typeof shortName === 'string' &&
      shortName.trim() &&
      !FOREIGN_CHANNEL_BLOCK_RE.test(shortName) &&
      BRAZILIAN_CHANNEL_ALLOW_RE.test(shortName)
    ) {
      set.add(shortName.trim());
    }
  }

  if (set.size === 0 && leagueSlug && LEAGUE_BRAZIL_BROADCAST_GUIDE[leagueSlug]) {
    for (const brChannel of LEAGUE_BRAZIL_BROADCAST_GUIDE[leagueSlug]) {
      set.add(brChannel);
    }
  }

  return Array.from(set);
}

function mapEvent(
  ev: any,
  leagueSlug: string,
  leagueName: string,
  todayKey: string,
  tomorrowKey: string
) {
  const comp = ev?.competitions?.[0];
  const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
  const home = competitors.find((c: any) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c: any) => c.homeAway === 'away') || competitors[1];

  const rawState = ev?.status?.type?.state;
  const statusState: 'in' | 'pre' | 'post' =
    rawState === 'in' || rawState === 'post' ? rawState : 'pre';

  const detail = ev?.status?.type?.detail || '';
  const shortDetail = ev?.status?.type?.shortDetail || '';
  const displayClock = ev?.status?.displayClock || '';
  const dateStr = String(ev?.date || '');
  const brasiliaDateKey = getBrasiliaDateKey(dateStr);
  const compMeta = COMPETITIONS.find((c) => c.slug === leagueSlug);
  const links = Array.isArray(ev?.links) ? ev.links : [];
  const officialUrl =
    links.find((l: any) => typeof l?.href === 'string' && /^https?:\/\//i.test(l.href))?.href ||
    null;

  return {
    id: String(ev?.id || ''),
    date: dateStr,
    brasiliaDateKey,
    dayBucket: getBrasiliaDayBucket(brasiliaDateKey, todayKey, tomorrowKey),
    leagueSlug,
    leagueName,
    scope: compMeta?.scope || 'internacional',
    statusState,
    statusLabel: translateStatus(statusState),
    statusDetail: shortDetail || detail,
    displayClock: statusState === 'in' ? displayClock || shortDetail : displayClock,
    venue: comp?.venue?.fullName || null,
    broadcasts: extractBroadcastNames(comp, leagueSlug),
    officialUrl,
    homeTeam: {
      id: String(home?.team?.id || ''),
      name: String(home?.team?.displayName || home?.team?.name || 'Mandante'),
      shortName: String(home?.team?.shortDisplayName || home?.team?.displayName || 'Mandante'),
      abbr: String(home?.team?.abbreviation || 'MAN'),
      logo: home?.team?.logo || home?.team?.logos?.[0]?.href || null,
      score: statusState === 'pre' ? '-' : String(home?.score ?? '0'),
      winner: Boolean(home?.winner),
    },
    awayTeam: {
      id: String(away?.team?.id || ''),
      name: String(away?.team?.displayName || away?.team?.name || 'Visitante'),
      shortName: String(away?.team?.shortDisplayName || away?.team?.displayName || 'Visitante'),
      abbr: String(away?.team?.abbreviation || 'VIS'),
      logo: away?.team?.logo || away?.team?.logos?.[0]?.href || null,
      score: statusState === 'pre' ? '-' : String(away?.score ?? '0'),
      winner: Boolean(away?.winner),
    },
  };
}

async function fetchLeagueScoreboard(
  leagueSlug: string,
  dateParam?: string,
  ttlMs = 25000,
  forceRefresh = false
) {
  const compInfo = COMPETITIONS.find((c) => c.slug === leagueSlug);
  const fallbackName = compInfo?.name || leagueSlug;
  const query = dateParam ? `?dates=${encodeURIComponent(dateParam)}` : '';
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard${query}`;
  const raw = await fetchJsonWithCache(url, ttlMs, forceRefresh);
  const leagueName = compInfo?.name || raw?.leagues?.[0]?.name || fallbackName;
  const events = Array.isArray(raw?.events) ? raw.events : [];
  const todayKey = getBrasiliaDateKey(new Date());
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  return events.map((ev: any) => mapEvent(ev, leagueSlug, leagueName, todayKey, tomorrowKey));
}

/* ---------------- Standings Helpers, Statistical Pre-Match Prediction & User Palpites ---------------- */

interface ParsedStandingTeam {
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

function parseStandingsGroups(raw: any): Array<{ groupName: string; entries: ParsedStandingTeam[] }> {
  const groups: Array<{ groupName: string; entries: ParsedStandingTeam[] }> = [];
  const children = Array.isArray(raw?.children) ? raw.children : [];

  for (const child of children) {
    const entries = Array.isArray(child?.standings?.entries) ? child.standings.entries : [];
    const mapped: ParsedStandingTeam[] = entries.map((entry: any, idx: number) => {
      const statMap = new Map<string, string>();
      for (const st of entry?.stats || []) {
        if (st?.name) {
          statMap.set(st.name, String(st.displayValue ?? st.value ?? '0'));
        }
      }
      return {
        rank: Number(statMap.get('rank') || idx + 1),
        teamId: String(entry?.team?.id || ''),
        teamName: String(entry?.team?.displayName || entry?.team?.name || 'Clube'),
        teamAbbr: String(entry?.team?.abbreviation || ''),
        teamLogo: entry?.team?.logos?.[0]?.href || null,
        gamesPlayed: statMap.get('gamesPlayed') || '0',
        wins: statMap.get('wins') || '0',
        ties: statMap.get('ties') || '0',
        losses: statMap.get('losses') || '0',
        goalsFor: statMap.get('pointsFor') || '0',
        goalsAgainst: statMap.get('pointsAgainst') || '0',
        goalDiff: statMap.get('pointDifferential') || '0',
        points: statMap.get('points') || '0',
        overall: statMap.get('overall') || '-',
        note: entry?.note?.description || null,
      };
    });
    mapped.sort((a, b) => a.rank - b.rank);
    groups.push({
      groupName: child?.name || raw?.name || 'Classificação',
      entries: mapped,
    });
  }
  return groups;
}

function normalizeTeamMatchKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function getLeagueStandingsEntries(leagueSlug: string): Promise<ParsedStandingTeam[]> {
  if (!COMPETITION_SLUGS.has(leagueSlug)) return [];
  try {
    const url = `https://site.api.espn.com/apis/v2/sports/soccer/${leagueSlug}/standings`;
    const raw = await fetchJsonWithCache(url, 300000);
    const groups = parseStandingsGroups(raw);
    return groups.flatMap((g) => g.entries);
  } catch {
    return [];
  }
}

function findTeamStanding(
  entries: ParsedStandingTeam[],
  teamId?: string,
  teamName?: string
): ParsedStandingTeam | null {
  if (teamId) {
    const byId = entries.find((e) => e.teamId === String(teamId));
    if (byId) return byId;
  }
  if (teamName) {
    const norm = normalizeTeamMatchKey(teamName);
    if (norm) {
      const exact = entries.find((e) => normalizeTeamMatchKey(e.teamName) === norm);
      if (exact) return exact;
      const partial = entries.find((e) => {
        const cand = normalizeTeamMatchKey(e.teamName);
        return cand.includes(norm) || norm.includes(cand);
      });
      if (partial) return partial;
    }
  }
  return null;
}

function poissonPmf(k: number, lambda: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

function toPredictionTeamStats(entry: ParsedStandingTeam) {
  const gp = Math.max(1, Number(entry.gamesPlayed) || 0);
  const gf = Number(entry.goalsFor) || 0;
  const ga = Number(entry.goalsAgainst) || 0;
  const pts = Number(entry.points) || 0;
  return {
    teamName: entry.teamName,
    rank: entry.rank,
    gamesPlayed: Number(entry.gamesPlayed) || 0,
    wins: Number(entry.wins) || 0,
    ties: Number(entry.ties) || 0,
    losses: Number(entry.losses) || 0,
    goalsFor: gf,
    goalsAgainst: ga,
    points: pts,
    ppg: Number((pts / gp).toFixed(2)),
    goalsForAvg: Number((gf / gp).toFixed(2)),
    goalsAgainstAvg: Number((ga / gp).toFixed(2)),
  };
}

function computePoissonForecastFromEntries(params: {
  leagueSlug: string;
  eventId: string;
  homeEntry: ParsedStandingTeam | null;
  awayEntry: ParsedStandingTeam | null;
}) {
  const { leagueSlug, eventId, homeEntry, awayEntry } = params;
  const homeGP = Number(homeEntry?.gamesPlayed || 0);
  const awayGP = Number(awayEntry?.gamesPlayed || 0);

  if (!homeEntry || !awayEntry || homeGP <= 0 || awayGP <= 0) {
    return {
      leagueSlug,
      eventId,
      hasEnoughData: false,
      reason:
        'Um ou ambos os clubes ainda não possuem jogos suficientes na classificação oficial desta competição para cálculo estatístico.',
      confidenceLabel: 'Indisponível',
      expectedHomeGoals: 0,
      expectedAwayGoals: 0,
      predictedHomeScore: 0,
      predictedAwayScore: 0,
      homeWinPct: 0,
      drawPct: 0,
      awayWinPct: 0,
      topScores: [],
      homeStats: homeEntry ? toPredictionTeamStats(homeEntry) : null,
      awayStats: awayEntry ? toPredictionTeamStats(awayEntry) : null,
    };
  }

  const hStats = toPredictionTeamStats(homeEntry);
  const aStats = toPredictionTeamStats(awayEntry);

  const rawLambdaHome =
    ((hStats.goalsForAvg + aStats.goalsAgainstAvg) / 2) * 1.12 +
    (hStats.ppg - aStats.ppg) * 0.14;
  const rawLambdaAway =
    ((aStats.goalsForAvg + hStats.goalsAgainstAvg) / 2) * 0.92 +
    (aStats.ppg - hStats.ppg) * 0.14;

  const expectedHomeGoals = Number(Math.max(0.45, Math.min(3.5, rawLambdaHome)).toFixed(2));
  const expectedAwayGoals = Number(Math.max(0.35, Math.min(3.2, rawLambdaAway)).toFixed(2));

  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  const scoreProbs: Array<{ home: number; away: number; prob: number }> = [];

  for (let i = 0; i <= 6; i++) {
    const pHome = poissonPmf(i, expectedHomeGoals);
    for (let j = 0; j <= 6; j++) {
      const pAway = poissonPmf(j, expectedAwayGoals);
      const p = pHome * pAway;
      scoreProbs.push({ home: i, away: j, prob: p });
      if (i > j) homeWinProb += p;
      else if (i === j) drawProb += p;
      else awayWinProb += p;
    }
  }

  const totalMass = homeWinProb + drawProb + awayWinProb || 1;
  const homeWinPct = Math.round((homeWinProb / totalMass) * 100);
  const drawPct = Math.round((drawProb / totalMass) * 100);
  const awayWinPct = Math.max(0, 100 - homeWinPct - drawPct);

  scoreProbs.sort((a, b) => b.prob - a.prob);
  const topScores = scoreProbs.slice(0, 4).map((s) => ({
    home: s.home,
    away: s.away,
    probabilityPct: Math.max(1, Math.round((s.prob / totalMass) * 100)),
  }));

  const bestScore = topScores[0] || {
    home: Math.round(expectedHomeGoals),
    away: Math.round(expectedAwayGoals),
  };

  const minGP = Math.min(homeGP, awayGP);
  const confidenceLabel =
    minGP >= 10
      ? 'Alta · Base consolidada na tabela'
      : minGP >= 4
        ? 'Moderada · Tabela em andamento'
        : 'Inicial · Poucos jogos na temporada';

  return {
    leagueSlug,
    eventId,
    hasEnoughData: true,
    confidenceLabel,
    expectedHomeGoals,
    expectedAwayGoals,
    predictedHomeScore: bestScore.home,
    predictedAwayScore: bestScore.away,
    homeWinPct,
    drawPct,
    awayWinPct,
    topScores,
    homeStats: hStats,
    awayStats: aStats,
  };
}

interface StoredUserPrediction {
  matchKey: string;
  leagueSlug: string;
  eventId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  updatedAt: string;
}

type PredictionsStoreData = Record<string, Record<string, StoredUserPrediction>>;

function readPredictionsStore(): PredictionsStoreData {
  ensureDataDir();
  if (!fs.existsSync(MATCH_PREDICTIONS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(MATCH_PREDICTIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PredictionsStoreData) : {};
  } catch {
    return {};
  }
}

function writePredictionsStore(data: PredictionsStoreData): void {
  ensureDataDir();
  const tmpFile = `${MATCH_PREDICTIONS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, MATCH_PREDICTIONS_FILE);
}

function resolvePredictionWalletBucket(req: express.Request): string {
  const headerToken = typeof req.headers['x-wallet-token'] === 'string' ? req.headers['x-wallet-token'] : null;
  const cookieToken = extractCookie(req, 'choszen_wallet');
  return verifyWalletToken(headerToken) || verifyWalletToken(cookieToken) || 'choszen-global-palpites';
}

/* ---------------- Official Stream Verification Helpers (YouTube RSS + Official Channels) ---------------- */

const OFFICIAL_YOUTUBE_CHANNELS = [
  {
    id: 'cazetv',
    name: 'CazéTV (YouTube Brasil)',
    shortName: 'CazéTV',
    channelId: 'UCZiYbVptd3PVPf4f6eR6UaQ',
    livePageUrl: 'https://www.youtube.com/@CazeTV/live',
    channelUrl: 'https://www.youtube.com/@CazeTV',
  },
  {
    id: 'getv',
    name: 'ge / TV Globo (YouTube Brasil)',
    shortName: 'TV Globo / ge',
    channelId: 'UCgCKagVhzGnZcuP9bSMgMCg',
    livePageUrl: 'https://www.youtube.com/@geglobo/live',
    channelUrl: 'https://www.youtube.com/@geglobo',
  },
  {
    id: 'espnbrasil',
    name: 'ESPN Brasil (YouTube)',
    shortName: 'ESPN Brasil',
    channelId: 'UCw5-xj3AKqEizC7MvHaIPqA',
    livePageUrl: 'https://www.youtube.com/@espnbrasil/live',
    channelUrl: 'https://www.youtube.com/@espnbrasil',
  },
  {
    id: 'tvbrasil',
    name: 'TV Brasil (YouTube Brasil)',
    shortName: 'TV Brasil',
    channelId: 'UCSv9d0kQegylHWpP83jWSQg',
    livePageUrl: 'https://www.youtube.com/@tvbrasil/live',
    channelUrl: 'https://www.youtube.com/@tvbrasil',
  },
  {
    id: 'tntsportsbr',
    name: 'TNT Sports Brasil (YouTube)',
    shortName: 'TNT Sports Brasil',
    channelId: 'UCs-6sCz2LJm1PrWQN4ErsPw',
    livePageUrl: 'https://www.youtube.com/@TNTSportsBR/live',
    channelUrl: 'https://www.youtube.com/@TNTSportsBR',
  },
  {
    id: 'canalgoat',
    name: 'Canal GOAT (YouTube Brasil)',
    shortName: 'Canal GOAT',
    channelId: 'UC_oToDrJ6uca7d1dFVBmLtg',
    livePageUrl: 'https://www.youtube.com/@canalgoatbr/live',
    channelUrl: 'https://www.youtube.com/@canalgoatbr',
  },
];

function decodeHtmlEntities(raw: string): string {
  if (!raw) return '';
  const named: Record<string, string> = {
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
  };
  let decoded = raw
    .replace(/&(amp|quot|apos|lt|gt|nbsp);|&#39;/gi, (m) => named[m.toLowerCase()] || m)
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
  // Strip any stray HTML tags so raw markup is never rendered as text
  decoded = decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return decoded;
}

function extractJsonObjectAfter(html: string, marker: string): any {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const braceStart = html.indexOf('{', start + marker.length);
  if (braceStart === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
    } else {
      if (ch === '"') {
        inStr = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(braceStart, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

async function isYoutubeVideoEmbeddable(videoId: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return false;
  const cacheKey = `yt:oembed:${videoId}`;
  const now = Date.now();
  const cached = apiCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return Boolean(cached.data);
  }
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    const ok = res.ok;
    apiCache.set(cacheKey, { expiresAt: now + 300000, data: ok });
    return ok;
  } catch {
    return false;
  }
}

interface YoutubeVideoMeta {
  videoId: string;
  title: string | null;
  channelName: string | null;
  isLive: boolean;
  isUpcoming: boolean;
  status: string;
  playableInEmbed: boolean;
  publishDateIso: string | null;
  startTimestampIso: string | null;
}

async function fetchYoutubeVideoMeta(videoId: string): Promise<YoutubeVideoMeta | null> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  const cacheKey = `yt:meta:${videoId}`;
  const now = Date.now();
  const cached = apiCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as YoutubeVideoMeta | null;
  }

  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(5500),
    });
    const html = await r.text();
    const pr = extractJsonObjectAfter(html, 'var ytInitialPlayerResponse =');
    if (!pr) {
      apiCache.set(cacheKey, { expiresAt: now + 120000, data: null });
      return null;
    }
    const vd = pr.videoDetails || {};
    const ps = pr.playabilityStatus || {};
    const mf = pr.microformat?.playerMicroformatRenderer || {};
    const publishDateIso =
      typeof mf.publishDate === 'string' && mf.publishDate
        ? mf.publishDate
        : typeof mf.uploadDate === 'string' && mf.uploadDate
          ? mf.uploadDate
          : null;
    const startTimestampIso =
      typeof mf.liveBroadcastDetails?.startTimestamp === 'string'
        ? mf.liveBroadcastDetails.startTimestamp
        : null;

    const meta: YoutubeVideoMeta = {
      videoId,
      title: vd.title ? decodeHtmlEntities(String(vd.title)) : null,
      channelName: vd.author ? decodeHtmlEntities(String(vd.author)) : null,
      isLive: Boolean(vd.isLive),
      isUpcoming: Boolean(vd.isUpcoming),
      status: String(ps.status || ''),
      playableInEmbed: ps.playableInEmbed !== false,
      publishDateIso,
      startTimestampIso,
    };

    apiCache.set(cacheKey, {
      expiresAt: now + (meta.isLive || meta.isUpcoming ? 60000 : 300000),
      data: meta,
    });
    return meta;
  } catch {
    return null;
  }
}

interface ChannelLiveResolution {
  isLive: boolean;
  isUpcoming?: boolean;
  videoId: string | null;
  title: string | null;
  startTimestampIso: string | null;
  embeddable: boolean;
  statusNote: string;
}

async function resolveYoutubeChannelLiveState(
  channelId: string,
  shortName: string
): Promise<ChannelLiveResolution> {
  const cacheKey = `yt:live-state:v2:${channelId}`;
  const now = Date.now();
  const cached = apiCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as ChannelLiveResolution;
  }

  let resolution: ChannelLiveResolution = {
    isLive: false,
    isUpcoming: false,
    videoId: null,
    title: null,
    startTimestampIso: null,
    embeddable: false,
    statusNote: `${shortName} não está com transmissão ao vivo ativa no YouTube agora.`,
  };

  try {
    const r = await fetch(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(6500),
    });
    const html = await r.text();
    const pr = extractJsonObjectAfter(html, 'var ytInitialPlayerResponse =');
    if (pr) {
      const vd = pr.videoDetails || {};
      const ps = pr.playabilityStatus || {};
      const mf = pr.microformat?.playerMicroformatRenderer || {};
      const videoId =
        typeof vd.videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(vd.videoId)
          ? vd.videoId
          : null;
      const cleanTitle = vd.title ? decodeHtmlEntities(String(vd.title)) : null;
      const isLive = Boolean(vd.isLive);
      const isUpcoming = Boolean(vd.isUpcoming);
      const status = String(ps.status || '');
      const playableInEmbed = ps.playableInEmbed !== false;
      const startTimestampIso =
        typeof mf.liveBroadcastDetails?.startTimestamp === 'string'
          ? mf.liveBroadcastDetails.startTimestamp
          : typeof mf.publishDate === 'string'
            ? mf.publishDate
            : null;

      if (isLive && status === 'OK' && videoId) {
        const oembedOk = playableInEmbed ? await isYoutubeVideoEmbeddable(videoId) : false;
        resolution = {
          isLive: true,
          isUpcoming: false,
          videoId,
          title: cleanTitle,
          startTimestampIso,
          embeddable: oembedOk,
          statusNote: oembedOk
            ? `Transmissão ao vivo ativa no player oficial.`
            : `${shortName} está ao vivo agora, mas restringiu a reprodução incorporada fora do YouTube.`,
        };
      } else if ((status === 'LIVE_STREAM_OFFLINE' || isUpcoming) && videoId) {
        resolution = {
          isLive: false,
          isUpcoming: true,
          videoId,
          title: cleanTitle,
          startTimestampIso,
          embeddable: false,
          statusNote: `Transmissão agendada em ${shortName}. Abra no YouTube ou no Chrome quando iniciar.`,
        };
      } else if (status === 'LOGIN_REQUIRED' || status === 'UNPLAYABLE') {
        resolution = {
          isLive: false,
          isUpcoming: false,
          videoId,
          title: cleanTitle,
          startTimestampIso,
          embeddable: false,
          statusNote: `${shortName} exige reprodução direta no YouTube ou no Chrome.`,
        };
      }
    }
  } catch {
    // Keep safe offline fallback
  }

  apiCache.set(cacheKey, { expiresAt: now + 60000, data: resolution });
  return resolution;
}

interface YtRssEntry {
  videoId: string;
  title: string;
  publishedIso: string;
  publishedAtMs: number;
  channelId: string;
  channelName: string;
  channelUrl: string;
}

async function fetchYoutubeChannelRss(
  channelId: string,
  channelName = 'Canal Oficial',
  channelUrl = 'https://www.youtube.com/'
): Promise<YtRssEntry[]> {
  const cacheKey = `yt:rss:v3:${channelId}`;
  const now = Date.now();
  const cached = apiCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as YtRssEntry[];
  }
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    {
      headers: { 'User-Agent': 'CHOSZEN-Panel/1.0' },
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!res.ok) return [];
  const xml = await res.text();
  const entries: YtRssEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = entryRegex.exec(xml)) !== null && entries.length < 12) {
    const block = blockMatch[1];
    const idMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = block.match(/<title>([^<]+)<\/title>/);
    const pubMatch = block.match(/<published>([^<]+)<\/published>/);
    if (idMatch && titleMatch) {
      const videoId = idMatch[1].trim();
      const title = decodeHtmlEntities(titleMatch[1]);
      const publishedIso = pubMatch ? pubMatch[1].trim() : '';
      const publishedAtMs = publishedIso ? Date.parse(publishedIso) : 0;
      if (/^[a-zA-Z0-9_-]{11}$/.test(videoId) && title) {
        entries.push({
          videoId,
          title,
          publishedIso,
          publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : 0,
          channelId,
          channelName,
          channelUrl,
        });
      }
    }
  }
  apiCache.set(cacheKey, { expiresAt: now + 90000, data: entries });
  return entries;
}

async function fetchOfficialYoutubeEntries(): Promise<YtRssEntry[]> {
  const results = await Promise.allSettled(
    OFFICIAL_YOUTUBE_CHANNELS.map((ch) =>
      fetchYoutubeChannelRss(ch.channelId, ch.name, ch.channelUrl)
    )
  );
  return results
    .filter((r): r is PromiseFulfilledResult<YtRssEntry[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
}

function normalizeTeamTokens(name: string): string[] {
  const stopWords = new Set(['fc', 'ec', 'sc', 'ac', 'cf', 'de', 'do', 'da', 'club', 'atletico', 'sport', 'real']);
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stopWords.has(t));
}

function parseYoutubeDurationSeconds(durText: string): number {
  const parts = durText.trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

interface MatchHighlightCandidate {
  id: string;
  videoId: string;
  title: string;
  channelName: string;
  durationLabel: string;
  durationSeconds: number;
  publishedDate: string | null;
  embeddable: boolean;
  embedUrl: string | null;
  externalUrl: string;
  description: string;
}

const HIGHLIGHT_SPAM_RE =
  /\b(react|reage|reacts|cortes|resenha|podcast|coletiva|entrevista|palpite|dicas|aposta|p[oó]s[- ]jogo|pr[eé][- ]jogo|ao vivo|narra[cç][aã]o|shorts|fifa|eafc|fc\s*2[456]|pes\s*2|opini[aã]o|analise|an[aá]lise|debate|decretou|vergonha|humilha[cç][aã]o|demiss[aã]o|protesto|repercuss[aã]o|mesa redonda|bastidores|vlog|barolo)\b/i;
const PLAYER_SPOTLIGHT_RE =
  /\b(atua[cç][aã]o de|lances de|jogadas de|skills|melhores momentos de\s+[a-z\u00C0-\u017F]+|compilado|individual)\b/i;
const OFFICIAL_HIGHLIGHT_CHANNEL_RE =
  /(ge\s*tv|globo|caz[eé]|tnt\s*sports|espn|goat|tv\s*brasil|paramount|fanatiz|uol|itatiaia|o\s*tempo|bundesliga|laliga|uefa|premier|desimpedidos|band|sbt|record|xsports|start\s*sports)/i;

function isPublishedTextTooOld(publishedText: string, maxDaysOld: number): boolean {
  if (!publishedText) return false;
  const txt = publishedText.toLowerCase();
  if (maxDaysOld <= 10 && /(semana|week|m[eê]s|meses|month|ano|year)/i.test(txt)) {
    return true;
  }
  const dayMatch = txt.match(/(\d+)\s*(dia|day)/i);
  if (dayMatch && Number(dayMatch[1]) > maxDaysOld) {
    return true;
  }
  return false;
}

function titleMatchesScoreIfPresent(
  title: string,
  homeScore?: string,
  awayScore?: string
): boolean {
  if (
    homeScore === undefined ||
    awayScore === undefined ||
    !/^\d+$/.test(homeScore) ||
    !/^\d+$/.test(awayScore)
  ) {
    return true;
  }
  const scoreMatches = title.match(/\b(\d{1,2})\s*[xX\-]\s*(\d{1,2})\b/g);
  if (!scoreMatches || scoreMatches.length === 0) return true;
  const h = Number(homeScore);
  const a = Number(awayScore);
  for (const m of scoreMatches) {
    const parts = m.match(/(\d{1,2})\s*[xX\-]\s*(\d{1,2})/);
    if (!parts) continue;
    const s1 = Number(parts[1]);
    const s2 = Number(parts[2]);
    // Ignore year-like ranges or high false matches? Scores in football are typically 0-9
    if (s1 > 12 || s2 > 12) continue;
    if ((s1 === h && s2 === a) || (s1 === a && s2 === h)) {
      return true;
    }
    return false;
  }
  return true;
}

function formatDateKeyBr(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateKey;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

async function fetchMatchHighlights(
  homeName: string,
  awayName: string,
  leagueSlug: string,
  opts?: { matchDateIso?: string; homeScore?: string; awayScore?: string }
): Promise<MatchHighlightCandidate[]> {
  const homeTokens = normalizeTeamTokens(homeName);
  const awayTokens = normalizeTeamTokens(awayName);
  if (homeTokens.length === 0 || awayTokens.length === 0) return [];

  const matchDateIso = opts?.matchDateIso || '';
  const matchDateMs = matchDateIso ? Date.parse(matchDateIso) : NaN;
  const matchBrtKey = matchDateIso ? getBrasiliaDateKey(matchDateIso) : '';
  const matchUtcKey = Number.isFinite(matchDateMs)
    ? new Date(matchDateMs).toISOString().slice(0, 10)
    : '';
  const minAllowedDateKey =
    matchBrtKey && matchUtcKey
      ? matchBrtKey < matchUtcKey
        ? matchBrtKey
        : matchUtcKey
      : matchBrtKey || matchUtcKey || '';
  const maxAllowedDateKey = minAllowedDateKey
    ? addDaysToDateKey(matchBrtKey > matchUtcKey ? matchBrtKey : matchUtcKey, 7)
    : '';

  const daysSinceMatch = Number.isFinite(matchDateMs)
    ? Math.max(1, Math.ceil((Date.now() - matchDateMs) / 86400000) + 2)
    : 10;

  const cacheKey = `yt:highlights:v4:${leagueSlug}:${homeTokens[0]}:${awayTokens[0]}:${minAllowedDateKey}:${opts?.homeScore ?? ''}-${opts?.awayScore ?? ''}`;
  const now = Date.now();
  const cached = apiCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as MatchHighlightCandidate[];
  }

  const yearTag = minAllowedDateKey ? minAllowedDateKey.slice(0, 4) : '';
  const query = `${homeName} x ${awayName} melhores momentos ${yearTag}`.trim();
  try {
    const r = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: AbortSignal.timeout(7000),
      }
    );
    const html = await r.text();
    const ytData = extractJsonObjectAfter(html, 'var ytInitialData =');
    const sections =
      ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];
    const rawItems: any[] = [];
    for (const sec of sections) {
      const items = sec?.itemSectionRenderer?.contents;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item?.videoRenderer) rawItems.push(item.videoRenderer);
        }
      }
    }

    const candidates: Array<{
      videoId: string;
      title: string;
      channelName: string;
      durationLabel: string;
      durationSeconds: number;
      score: number;
    }> = [];
    const seenIds = new Set<string>();

    for (const v of rawItems) {
      const videoId = String(v?.videoId || '').trim();
      if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || seenIds.has(videoId)) continue;
      seenIds.add(videoId);

      const rawTitle = Array.isArray(v?.title?.runs)
        ? v.title.runs.map((x: any) => x?.text || '').join('')
        : String(v?.title?.simpleText || '');
      const title = decodeHtmlEntities(rawTitle);
      const channelName = decodeHtmlEntities(String(v?.ownerText?.runs?.[0]?.text || 'YouTube'));
      const durationLabel = String(v?.lengthText?.simpleText || '').trim();
      const durationSeconds = parseYoutubeDurationSeconds(durationLabel);
      const publishedText = String(v?.publishedTimeText?.simpleText || '');

      // Require full match highlights (~5+ min: minimum 4m35s = 275s, max 25m = 1500s)
      if (!durationLabel || durationSeconds < 275 || durationSeconds > 1500) continue;
      if (isPublishedTextTooOld(publishedText, daysSinceMatch)) continue;

      const combinedText = `${title} ${channelName}`;
      if (HIGHLIGHT_SPAM_RE.test(combinedText)) continue;
      if (PLAYER_SPOTLIGHT_RE.test(title)) continue;

      const normTitle = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const hasHome = homeTokens.some((t) => normTitle.includes(t));
      const hasAway = awayTokens.some((t) => normTitle.includes(t));
      if (!hasHome || !hasAway) continue;

      const isHighlightTitle =
        /(melhores momentos|highlights|gols|resumo|compacto)/i.test(normTitle);
      if (!isHighlightTitle) continue;

      if (!titleMatchesScoreIfPresent(title, opts?.homeScore, opts?.awayScore)) continue;

      let score = 10;
      if (durationSeconds >= 300 && durationSeconds <= 900) score += 8;
      if (OFFICIAL_HIGHLIGHT_CHANNEL_RE.test(channelName)) score += 6;
      if (/ge\s*tv|globo|caz[eé]|tnt|espn|goat/i.test(channelName)) score += 5;
      candidates.push({
        videoId,
        title,
        channelName,
        durationLabel,
        durationSeconds,
        score,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 6);

    // Strictly verify exact YouTube publishDate against match date + embeddability
    const metaChecks = await Promise.all(top.map((c) => fetchYoutubeVideoMeta(c.videoId)));
    const embedChecks = await Promise.all(top.map((c) => isYoutubeVideoEmbeddable(c.videoId)));

    const verified: MatchHighlightCandidate[] = [];
    for (let idx = 0; idx < top.length; idx++) {
      const c = top[idx];
      const meta = metaChecks[idx];
      const oembedOk = embedChecks[idx];

      // Exclude active unfinished lives from highlights tab
      if (meta?.isLive) continue;

      // Strict date verification: video MUST have been published on or after match date (within 7 days)
      let pubDateKey: string | null = null;
      if (meta?.publishDateIso) {
        pubDateKey = meta.publishDateIso.slice(0, 10);
        if (minAllowedDateKey && pubDateKey < minAllowedDateKey) {
          continue;
        }
        if (maxAllowedDateKey && pubDateKey > maxAllowedDateKey) {
          continue;
        }
      } else if (minAllowedDateKey) {
        // Without verified publishDate when matchDate is known, do not risk serving an old video
        continue;
      }

      const embeddable = oembedOk && (meta ? meta.status === 'OK' && meta.playableInEmbed : true);
      const dateSuffix = pubDateKey ? ` · Publicado em ${formatDateKeyBr(pubDateKey)}` : '';

      verified.push({
        id: `hl-${c.videoId}`,
        videoId: c.videoId,
        title: c.title,
        channelName: c.channelName,
        durationLabel: c.durationLabel,
        durationSeconds: c.durationSeconds,
        publishedDate: pubDateKey,
        embeddable,
        embedUrl: embeddable
          ? `https://www.youtube.com/embed/${c.videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`
          : null,
        externalUrl: `https://www.youtube.com/watch?v=${c.videoId}`,
        description: `Melhores momentos completos da partida (${c.durationLabel}) · ${c.channelName}${dateSuffix}`,
      });
    }

    verified.sort((a, b) => Number(b.embeddable) - Number(a.embeddable));
    apiCache.set(cacheKey, { expiresAt: now + 300000, data: verified });
    return verified;
  } catch {
    return [];
  }
}

const KNOWN_BROADCASTER_URLS: Array<{ match: RegExp; url: string; label: string }> = [
  { match: /caz[eé]\s*tv/i, url: 'https://www.youtube.com/@CazeTV/live', label: 'CazéTV (Brasil)' },
  { match: /goat/i, url: 'https://www.youtube.com/@canalgoatbr/live', label: 'Canal GOAT (Brasil)' },
  { match: /tv\s*brasil/i, url: 'https://tvbrasil.ebc.com.br/ao-vivo', label: 'TV Brasil Ao Vivo' },
  { match: /espn/i, url: 'https://www.espn.com.br/watch/', label: 'ESPN Brasil' },
  { match: /paramount/i, url: 'https://www.paramountplus.com/br/', label: 'Paramount+ Brasil' },
  { match: /disney/i, url: 'https://www.disneyplus.com/pt-br', label: 'Disney+ Brasil' },
  { match: /globoplay|globo/i, url: 'https://www.youtube.com/@geglobo/live', label: 'TV Globo / ge tv' },
  { match: /sportv|premiere/i, url: 'https://ge.globo.com/agenda/', label: 'ge.globo / SporTV / Premiere' },
  { match: /prime\s*video|amazon/i, url: 'https://www.primevideo.com/', label: 'Amazon Prime Video Brasil' },
  { match: /max|tnt/i, url: 'https://www.youtube.com/@TNTSportsBR/live', label: 'TNT Sports Brasil / Max' },
  { match: /record/i, url: 'https://www.playplus.com/', label: 'Record / PlayPlus' },
  { match: /sbt/i, url: 'https://www.sbt.com.br/ao-vivo', label: 'SBT Sports Brasil' },
  { match: /band/i, url: 'https://www.band.uol.com.br/ao-vivo', label: 'Band Ao Vivo' },
];

/* ---------------- Express App Setup ---------------- */

async function startServer() {
  ensureRedeemCodesSeeded();
  readFreeApps();
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Auth routes (public)
  app.post('/api/auth/verify', (req, res) => {
    const key = req.body?.key;
    if (typeof key !== 'string' || key.length === 0) {
      res.status(400).json({ authenticated: false, error: 'Informe a Key de acesso.' });
      return;
    }

    // 1. Check permanent owner Key (exact comparison)
    if (verifyOfficialKey(key)) {
      const { token, issuedAt } = createPermanentToken();
      res.setHeader(
        'Set-Cookie',
        `choszen_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000`
      );
      res.json({
        authenticated: true,
        role: 'owner',
        firstActivation: false,
        token,
        issuedAt,
      });
      return;
    }

    // 2. Check purchased DLS HUB™ Premium Key
    const candidateCode = key.trim();
    const store = readWalletStore();
    const keyRecord = store.keys[candidateCode];
    if (!keyRecord) {
      res.status(401).json({
        authenticated: false,
        error: 'Key inválida. Verifique os caracteres exatamente como gerados ou use a Key oficial.',
      });
      return;
    }

    const nowMs = Date.now();
    let firstActivation = false;

    if (!keyRecord.activatedAt || !keyRecord.expiresAt) {
      // Primeira ativação confirmada: somente agora o prazo de validade começa a correr!
      firstActivation = true;
      keyRecord.activatedAt = new Date(nowMs).toISOString();
      keyRecord.expiresAt = new Date(nowMs + keyRecord.durationMs).toISOString();
      store.keys[candidateCode] = keyRecord;
      writeWalletStore(store);
    } else {
      const expMs = new Date(keyRecord.expiresAt).getTime();
      if (Number.isNaN(expMs) || nowMs >= expMs) {
        res.status(401).json({
          authenticated: false,
          error: `Esta Key Premium expirou em ${new Date(expMs).toLocaleString('pt-BR')}. Adquira uma nova Key na aba MINHA CARTEIRA.`,
        });
        return;
      }
    }

    const { token, issuedAt } = createPremiumToken(keyRecord);
    res.setHeader(
      'Set-Cookie',
      `choszen_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
    );
    res.json({
      authenticated: true,
      role: 'premium',
      firstActivation,
      keyCode: keyRecord.code,
      planName: keyRecord.planName,
      activatedAt: keyRecord.activatedAt,
      expiresAt: keyRecord.expiresAt,
      token,
      issuedAt,
    });
  });

  app.get('/api/auth/session', (req, res) => {
    const token = extractToken(req);
    const verified = verifySessionToken(token);
    if (!verified) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      role: verified.scope === 'choszen-owner' ? 'owner' : 'premium',
      issuedAt: verified.iat,
      activatedAt: verified.activatedAt ?? null,
      expiresAt: verified.expiresAt ?? null,
      planName: verified.planName ?? null,
      keyCode: verified.keyCode ?? null,
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      'choszen_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );
    res.json({ ok: true });
  });

  // Virtual Wallet & Premium Keys Store Routes (Fictional Currency Only)
  app.get('/api/wallet', (req, res) => {
    const store = readWalletStore();
    const { wallet, walletToken, dirty } = resolveWalletContext(req, res, store);
    if (dirty) {
      writeWalletStore(store);
    }
    const verified = verifySessionToken(extractToken(req));
    const isOwner = verified?.scope === 'choszen-owner';
    res.json(buildWalletSnapshot(store, wallet, walletToken, isOwner));
  });

  app.post('/api/wallet/redeem', (req, res) => {
    const rawCode = req.body?.code;
    if (typeof rawCode !== 'string' || !rawCode.trim()) {
      res.status(400).json({ error: 'Informe um código de resgate válido.' });
      return;
    }

    const trimmed = rawCode.trim();
    const normalizedUpper = trimmed.toUpperCase();
    const store = readWalletStore();
    const { wallet, walletToken } = resolveWalletContext(req, res, store);
    const verified = verifySessionToken(extractToken(req));
    const isOwner = verified?.scope === 'choszen-owner';

    // 1. Check the 100 persistent single-use redeem codes
    const redeemCodes = readRedeemCodes();
    const codeIndex = redeemCodes.findIndex((c) => c.code === normalizedUpper);
    if (codeIndex !== -1) {
      const codeRecord = redeemCodes[codeIndex];
      if (codeRecord.status === 'UTILIZADO') {
        res.status(409).json({
          error: 'Este código já foi utilizado e não pode ser resgatado novamente.',
        });
        return;
      }

      const nowIso = new Date().toISOString();
      codeRecord.status = 'UTILIZADO';
      codeRecord.usedAt = nowIso;
      codeRecord.usedByWalletId = wallet.id;
      redeemCodes[codeIndex] = codeRecord;
      writeRedeemCodes(redeemCodes);

      const amount = codeRecord.amount;
      wallet.balance = Number((wallet.balance + amount).toFixed(2));
      wallet.lastCreditAt = nowIso;
      wallet.updatedAt = nowIso;

      wallet.transactions.unshift({
        id: crypto.randomUUID(),
        type: 'credit',
        description: codeRecord.isSpecial
          ? `Resgate de código ESPECIAL (${amount} moedas)`
          : `Resgate de código (${amount} moedas)`,
        amount,
        balanceAfter: wallet.balance,
        createdAt: nowIso,
      });

      store.redemptions.unshift({
        id: crypto.randomUUID(),
        walletId: wallet.id,
        amount,
        redeemedAt: nowIso,
      });

      store.wallets[wallet.id] = wallet;
      writeWalletStore(store);

      res.json({
        message: codeRecord.isSpecial
          ? `Código ESPECIAL resgatado! +${amount} moedas (DLS$ ${amount.toFixed(2).replace('.', ',')}) creditadas na sua carteira.`
          : `Código resgatado! +${amount} moedas (DLS$ ${amount.toFixed(2).replace('.', ',')}) creditadas na sua carteira.`,
        creditedAmount: amount,
        redeemedAt: nowIso,
        isSpecial: codeRecord.isSpecial,
        snapshot: buildWalletSnapshot(store, wallet, walletToken, isOwner),
      });
      return;
    }

    // 2. Check legacy official credit code (limited to 1 redemption per wallet)
    if (!verifyOfficialCreditCode(trimmed)) {
      res.status(400).json({ error: 'Código de resgate inválido, inexistente ou não reconhecido.' });
      return;
    }

    if (wallet.creditRedeemedCount >= MAX_CREDIT_REDEMPTIONS_PER_WALLET) {
      res.status(409).json({
        error: 'Este código de crédito já foi utilizado nesta carteira. Reutilização ilimitada bloqueada.',
      });
      return;
    }

    const amount = store.config.creditAmount;
    const nowIso = new Date().toISOString();
    wallet.balance = Number((wallet.balance + amount).toFixed(2));
    wallet.creditRedeemedCount += 1;
    wallet.lastCreditAt = nowIso;
    wallet.updatedAt = nowIso;

    wallet.transactions.unshift({
      id: crypto.randomUUID(),
      type: 'credit',
      description: 'Crédito fictício registrado via código oficial',
      amount,
      balanceAfter: wallet.balance,
      createdAt: nowIso,
    });

    store.redemptions.unshift({
      id: crypto.randomUUID(),
      walletId: wallet.id,
      amount,
      redeemedAt: nowIso,
    });

    store.wallets[wallet.id] = wallet;
    writeWalletStore(store);

    res.json({
      message: `Crédito de DLS$ ${amount.toFixed(2).replace('.', ',')} registrado com sucesso na sua carteira!`,
      creditedAmount: amount,
      redeemedAt: nowIso,
      snapshot: buildWalletSnapshot(store, wallet, walletToken, isOwner),
    });
  });

  app.get('/api/wallet/admin/codes', requireOwnerAuth, (_req, res) => {
    const codes = readRedeemCodes();
    const countsByTier: Record<RedeemCodeTier, { total: number; available: number; used: number }> = {
      '15': { total: 0, available: 0, used: 0 },
      '70': { total: 0, available: 0, used: 0 },
      '100': { total: 0, available: 0, used: 0 },
      '180': { total: 0, available: 0, used: 0 },
      'especial-250': { total: 0, available: 0, used: 0 },
      '320': { total: 0, available: 0, used: 0 },
      '500': { total: 0, available: 0, used: 0 },
    };

    let availableCount = 0;
    let usedCount = 0;

    for (const item of codes) {
      if (!countsByTier[item.tier]) {
        countsByTier[item.tier] = { total: 0, available: 0, used: 0 };
      }
      countsByTier[item.tier].total += 1;
      if (item.status === 'DISPONÍVEL') {
        availableCount += 1;
        countsByTier[item.tier].available += 1;
      } else {
        usedCount += 1;
        countsByTier[item.tier].used += 1;
      }
    }

    res.json({
      total: codes.length,
      availableCount,
      usedCount,
      countsByTier,
      codes,
    });
  });

  app.post('/api/wallet/keys/save', (req, res) => {
    const rawCode = req.body?.code;
    if (typeof rawCode !== 'string' || !rawCode.trim()) {
      res.status(400).json({ error: 'Informe o código da Key recebida para salvar.' });
      return;
    }

    const normalized = rawCode.trim().toUpperCase();
    const store = readWalletStore();
    const { wallet, walletToken } = resolveWalletContext(req, res, store);
    const keyRecord = store.keys[normalized];

    if (!keyRecord) {
      res.status(404).json({
        error: 'Key não encontrada no sistema CHOSZEN™©. Confira se digitou o código completo.',
      });
      return;
    }

    wallet.savedKeyCodes = Array.isArray(wallet.savedKeyCodes) ? wallet.savedKeyCodes : [];
    if (keyRecord.walletId === wallet.id || wallet.savedKeyCodes.includes(normalized)) {
      res.status(409).json({ error: 'Esta Key já está salva na sua aba de Keys.' });
      return;
    }

    wallet.savedKeyCodes.unshift(normalized);
    wallet.updatedAt = new Date().toISOString();
    store.wallets[wallet.id] = wallet;
    writeWalletStore(store);

    const verified = verifySessionToken(extractToken(req));
    const isOwner = verified?.scope === 'choszen-owner';

    res.json({
      message: `Key ${normalized} salva com sucesso na sua aba de Keys!`,
      key: formatKeyForClient(keyRecord, Date.now(), 'received'),
      snapshot: buildWalletSnapshot(store, wallet, walletToken, isOwner),
    });
  });

  app.delete('/api/wallet/keys/saved/:code', (req, res) => {
    const normalized = String(req.params.code || '').trim().toUpperCase();
    const store = readWalletStore();
    const { wallet, walletToken } = resolveWalletContext(req, res, store);
    const list = Array.isArray(wallet.savedKeyCodes) ? wallet.savedKeyCodes : [];
    const nextList = list.filter((c) => c !== normalized);
    wallet.savedKeyCodes = nextList;
    wallet.updatedAt = new Date().toISOString();
    store.wallets[wallet.id] = wallet;
    writeWalletStore(store);

    const verified = verifySessionToken(extractToken(req));
    const isOwner = verified?.scope === 'choszen-owner';

    res.json({
      message: `Key ${normalized} removida da lista de recebidas.`,
      snapshot: buildWalletSnapshot(store, wallet, walletToken, isOwner),
    });
  });

  app.post('/api/wallet/buy', (req, res) => {
    const planId = req.body?.planId as PremiumPlanId | undefined;
    if (!planId || !(planId in PREMIUM_PLAN_DEFINITIONS)) {
      res.status(400).json({ error: 'Plano de Key Premium inválido.' });
      return;
    }

    const store = readWalletStore();
    const { wallet, walletToken } = resolveWalletContext(req, res, store);
    const planDef = PREMIUM_PLAN_DEFINITIONS[planId];
    const price = store.config.prices[planId];

    if (wallet.balance < price) {
      res.status(400).json({
        error: `Saldo fictício insuficiente para ${planDef.name}. Disponível: DLS$ ${wallet.balance
          .toFixed(2)
          .replace('.', ',')}, necessário: DLS$ ${price.toFixed(2).replace('.', ',')}.`,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const code = generatePremiumKeyCode(planId, store.keys);

    wallet.balance = Number((wallet.balance - price).toFixed(2));
    wallet.updatedAt = nowIso;
    wallet.transactions.unshift({
      id: crypto.randomUUID(),
      type: 'purchase',
      description: `Compra: ${planDef.name}`,
      amount: price,
      balanceAfter: wallet.balance,
      createdAt: nowIso,
      keyCode: code,
    });

    const keyRecord: PremiumKeyRecord = {
      id: crypto.randomUUID(),
      code,
      walletId: wallet.id,
      planId,
      planName: planDef.name,
      durationLabel: planDef.durationLabel,
      durationMs: planDef.durationMs,
      pricePaid: price,
      origin: 'purchased',
      purchasedAt: nowIso,
      activatedAt: null,
      expiresAt: null,
    };

    store.keys[code] = keyRecord;
    store.wallets[wallet.id] = wallet;
    writeWalletStore(store);

    const verified = verifySessionToken(extractToken(req));
    const isOwner = verified?.scope === 'choszen-owner';

    res.status(201).json({
      message: `${planDef.name} adquirida! Status atual: ON — NÃO UTILIZADA.`,
      key: formatKeyForClient(keyRecord),
      snapshot: buildWalletSnapshot(store, wallet, walletToken, isOwner),
    });
  });

  app.patch('/api/wallet/config', requireOwnerAuth, (req, res) => {
    const store = readWalletStore();
    const { wallet, walletToken } = resolveWalletContext(req, res, store);
    const { creditAmount, prices } = req.body || {};

    if (creditAmount !== undefined) {
      const parsed = Number(creditAmount);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000000) {
        res.status(400).json({ error: 'Valor do crédito deve ser maior que zero e até 1.000.000.' });
        return;
      }
      store.config.creditAmount = Number(parsed.toFixed(2));
    }

    if (prices && typeof prices === 'object') {
      for (const id of ['1d', '7d', '1m'] as PremiumPlanId[]) {
        if (prices[id] !== undefined) {
          const parsedPrice = Number(prices[id]);
          if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 1000000) {
            res.status(400).json({
              error: `Preço inválido para ${PREMIUM_PLAN_DEFINITIONS[id].name}.`,
            });
            return;
          }
          store.config.prices[id] = Number(parsedPrice.toFixed(2));
        }
      }
    }

    writeWalletStore(store);
    res.json({
      message: 'Valores da loja e código de crédito atualizados pelo proprietário.',
      config: store.config,
      snapshot: buildWalletSnapshot(store, wallet, walletToken, true),
    });
  });

  // Protected DLS 20+ MediaFire Downloads & TikTok Follow-Gate Routes
  app.get('/api/dls', requireAuth, (req, res) => {
    const walletStore = readWalletStore();
    const { wallet, dirty } = resolveWalletContext(req, res, walletStore);
    if (dirty) {
      writeWalletStore(walletStore);
    }
    const dlsStore = readDlsHubStore();
    const unlockedAt = dlsStore.followUnlocks[wallet.id] || null;
    res.json({
      creator: dlsStore.creator,
      downloads: dlsStore.downloads,
      followUnlocked: Boolean(unlockedAt),
      unlockedAt,
    });
  });

  app.post('/api/dls/follow-unlock', requireAuth, (req, res) => {
    const walletStore = readWalletStore();
    const { wallet, dirty } = resolveWalletContext(req, res, walletStore);
    if (dirty) {
      writeWalletStore(walletStore);
    }
    const dlsStore = readDlsHubStore();
    const nowIso = dlsStore.followUnlocks[wallet.id] || new Date().toISOString();
    dlsStore.followUnlocks[wallet.id] = nowIso;
    writeDlsHubStore(dlsStore);
    res.json({
      creator: dlsStore.creator,
      downloads: dlsStore.downloads,
      followUnlocked: true,
      unlockedAt: nowIso,
    });
  });

  app.patch('/api/dls/config', requireOwnerAuth, (req, res) => {
    const walletStore = readWalletStore();
    const { wallet, dirty } = resolveWalletContext(req, res, walletStore);
    if (dirty) {
      writeWalletStore(walletStore);
    }
    const dlsStore = readDlsHubStore();
    const { creator, downloads } = req.body || {};

    if (creator && typeof creator === 'object') {
      if (typeof creator.displayName === 'string' && creator.displayName.trim()) {
        dlsStore.creator.displayName = creator.displayName.trim().slice(0, 80);
      }
      if (typeof creator.tiktokHandle === 'string' && creator.tiktokHandle.trim()) {
        const handle = creator.tiktokHandle.trim().slice(0, 60);
        dlsStore.creator.tiktokHandle = handle.startsWith('@') ? handle : `@${handle}`;
      }
      if (typeof creator.tiktokUrl === 'string' && creator.tiktokUrl.trim()) {
        const url = creator.tiktokUrl.trim();
        if (/^https?:\/\//i.test(url)) {
          dlsStore.creator.tiktokUrl = url.slice(0, 500);
        }
      }
      if (typeof creator.avatarUrl === 'string' && creator.avatarUrl.trim()) {
        const av = creator.avatarUrl.trim();
        if (av.startsWith('data:image/') || av.startsWith('/src/') || /^https?:\/\//i.test(av)) {
          dlsStore.creator.avatarUrl = av;
        }
      }
    }

    if (Array.isArray(downloads) && downloads.length > 0) {
      const cleaned: DlsDownloadRecord[] = [];
      for (const item of downloads.slice(0, 30)) {
        if (!item || typeof item.version !== 'string' || typeof item.mediafireUrl !== 'string') continue;
        const url = item.mediafireUrl.trim();
        if (!/^https?:\/\//i.test(url)) continue;
        cleaned.push({
          id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
          version: item.version.trim().slice(0, 40),
          editionName: typeof item.editionName === 'string' ? item.editionName.trim().slice(0, 80) : 'EDICAO',
          architecture: typeof item.architecture === 'string' ? item.architecture.trim().slice(0, 40) : 'ARM64 · ARMv7',
          fileName: typeof item.fileName === 'string' ? item.fileName.trim().slice(0, 120) : 'DLS.zip',
          mediafireUrl: url,
        });
      }
      if (cleaned.length > 0) {
        dlsStore.downloads = cleaned;
      }
    }

    writeDlsHubStore(dlsStore);
    const unlockedAt = dlsStore.followUnlocks[wallet.id] || null;
    res.json({
      message: 'Perfil do TikTok e links DLS atualizados com sucesso.',
      data: {
        creator: dlsStore.creator,
        downloads: dlsStore.downloads,
        followUnlocked: Boolean(unlockedAt),
        unlockedAt,
      },
    });
  });

  // Protected Football Routes (Real Data Only)
  app.get('/api/football/competitions', requireAuth, (_req, res) => {
    res.json({ competitions: COMPETITIONS });
  });

  app.get('/api/football/scoreboard', requireAuth, async (req, res) => {
    const league = typeof req.query.league === 'string' ? req.query.league : 'all';
    const rawDate = typeof req.query.date === 'string' ? req.query.date : '';
    const dateParam = /^\d{8}$/.test(rawDate) ? rawDate : undefined;

    try {
      if (league === 'all') {
        const results = await Promise.allSettled(
          COMPETITIONS.map((c) => fetchLeagueScoreboard(c.slug, dateParam))
        );
        const matches = results
          .filter(
            (r): r is PromiseFulfilledResult<Array<ReturnType<typeof mapEvent>>> =>
              r.status === 'fulfilled'
          )
          .flatMap((r) => r.value);

        const order: Record<'in' | 'pre' | 'post', number> = { in: 0, pre: 1, post: 2 };
        matches.sort((a, b) => {
          if (order[a.statusState] !== order[b.statusState]) {
            return order[a.statusState] - order[b.statusState];
          }
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        res.json({
          source: 'ESPN Official Soccer Feed',
          fetchedAt: new Date().toISOString(),
          matches,
        });
        return;
      }

      if (!COMPETITION_SLUGS.has(league)) {
        res.status(400).json({ error: 'Competição não suportada.' });
        return;
      }

      const matches = await fetchLeagueScoreboard(league, dateParam);
      res.json({
        source: 'ESPN Official Soccer Feed',
        fetchedAt: new Date().toISOString(),
        matches,
      });
    } catch (err) {
      res.status(502).json({
        error: 'Não foi possível obter os dados reais de partidas no momento.',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  });

  app.get('/api/football/standings', requireAuth, async (req, res) => {
    const league = typeof req.query.league === 'string' ? req.query.league : 'bra.1';
    if (!COMPETITION_SLUGS.has(league)) {
      res.status(400).json({ error: 'Competição não suportada.' });
      return;
    }

    try {
      const url = `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings`;
      const raw = await fetchJsonWithCache(url, 180000);
      const groups = parseStandingsGroups(raw);

      res.json({
        source: 'ESPN Official Soccer Feed',
        leagueName: raw?.name || COMPETITIONS.find((c) => c.slug === league)?.name || league,
        fetchedAt: new Date().toISOString(),
        groups,
      });
    } catch (err) {
      res.status(502).json({
        error: 'Classificação oficial indisponível no momento para esta competição.',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  });

  app.get('/api/football/teams', requireAuth, async (req, res) => {
    const league = typeof req.query.league === 'string' ? req.query.league : 'bra.1';
    if (!COMPETITION_SLUGS.has(league)) {
      res.status(400).json({ error: 'Competição não suportada.' });
      return;
    }

    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams`;
      const raw = await fetchJsonWithCache(url, 300000);
      const rawTeams = raw?.sports?.[0]?.leagues?.[0]?.teams || [];
      const teams = rawTeams.map((item: any) => ({
        id: String(item?.team?.id || ''),
        name: String(item?.team?.displayName || item?.team?.name || 'Clube'),
        shortName: String(item?.team?.shortDisplayName || item?.team?.displayName || 'Clube'),
        abbr: String(item?.team?.abbreviation || ''),
        color: item?.team?.color ? `#${item.team.color}` : null,
        logo: item?.team?.logos?.[0]?.href || null,
      }));
      teams.sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'));

      res.json({
        source: 'ESPN Official Soccer Feed',
        fetchedAt: new Date().toISOString(),
        teams,
      });
    } catch (err) {
      res.status(502).json({
        error: 'Não foi possível carregar os clubes oficiais.',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  });

  app.get('/api/football/match/:league/:eventId', requireAuth, async (req, res) => {
    const { league, eventId } = req.params;
    if (!COMPETITION_SLUGS.has(league) || !/^\d+$/.test(eventId)) {
      res.status(400).json({ error: 'Parâmetros de partida inválidos.' });
      return;
    }

    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`;
      const raw = await fetchJsonWithCache(url, 25000);

      const comp = raw?.header?.competitions?.[0];
      const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
      const home = competitors.find((c: any) => c.homeAway === 'home') || competitors[0];
      const away = competitors.find((c: any) => c.homeAway === 'away') || competitors[1];

      const rawState = comp?.status?.type?.state;
      const statusState: 'in' | 'pre' | 'post' =
        rawState === 'in' || rawState === 'post' ? rawState : 'pre';

      const keyEventsRaw = Array.isArray(raw?.keyEvents) ? raw.keyEvents : [];
      const events = keyEventsRaw.map((ke: any) => ({
        minute: String(ke?.clock?.displayValue || '-'),
        type: String(ke?.type?.text || 'Evento'),
        teamName: String(ke?.team?.displayName || ''),
        playerName: String(ke?.participants?.[0]?.athlete?.displayName || ke?.text || ''),
      }));

      const homeStats = raw?.boxscore?.teams?.find((t: any) => t.team?.id === home?.id)?.statistics || [];
      const awayStats = raw?.boxscore?.teams?.find((t: any) => t.team?.id === away?.id)?.statistics || [];
      const statsMap = new Map<string, { label: string; homeValue: string; awayValue: string }>();

      for (const st of homeStats) {
        if (st?.name) {
          statsMap.set(st.name, {
            label: st.label || st.name,
            homeValue: String(st.displayValue ?? '0'),
            awayValue: '0',
          });
        }
      }
      for (const st of awayStats) {
        if (st?.name) {
          const existing = statsMap.get(st.name);
          if (existing) {
            existing.awayValue = String(st.displayValue ?? '0');
          }
        }
      }

      const officialLinks = Array.isArray(raw?.header?.links) ? raw.header.links : [];
      const officialUrl =
        officialLinks.find((l: any) => typeof l?.href === 'string' && /^https?:\/\//i.test(l.href))?.href ||
        null;

      res.json({
        id: eventId,
        leagueSlug: league,
        leagueName: COMPETITIONS.find((c) => c.slug === league)?.name || raw?.header?.league?.name || league,
        date: comp?.date || '',
        statusState,
        statusLabel: translateStatus(statusState),
        statusDetail: comp?.status?.type?.shortDetail || comp?.status?.type?.detail || '',
        displayClock: comp?.status?.displayClock || '',
        venue: raw?.gameInfo?.venue?.fullName || null,
        attendance: raw?.gameInfo?.attendance ? String(raw.gameInfo.attendance) : null,
        broadcasts: extractBroadcastNames(comp, league),
        officialUrl,
        homeTeam: {
          id: String(home?.id || ''),
          name: String(home?.team?.displayName || 'Mandante'),
          shortName: String(home?.team?.shortDisplayName || 'Mandante'),
          abbr: String(home?.team?.abbreviation || 'MAN'),
          logo: home?.team?.logos?.[0]?.href || null,
          score: statusState === 'pre' ? '-' : String(home?.score ?? '0'),
          winner: Boolean(home?.winner),
        },
        awayTeam: {
          id: String(away?.id || ''),
          name: String(away?.team?.displayName || 'Visitante'),
          shortName: String(away?.team?.shortDisplayName || 'Visitante'),
          abbr: String(away?.team?.abbreviation || 'VIS'),
          logo: away?.team?.logos?.[0]?.href || null,
          score: statusState === 'pre' ? '-' : String(away?.score ?? '0'),
          winner: Boolean(away?.winner),
        },
        events,
        stats: Array.from(statsMap.values()).slice(0, 8),
      });
    } catch (err) {
      res.status(502).json({
        error: 'Detalhes da partida indisponíveis no momento.',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  });

  // Aggregated All Games Route (Recentes/Placares Finais, Hoje, Amanhã, Próximos Jogos in Brasília GMT-3)
  app.get('/api/football/all-games', requireAuth, async (req, res) => {
    const scopeFilter = typeof req.query.scope === 'string' ? req.query.scope : 'all';
    const leagueFilter = typeof req.query.league === 'string' ? req.query.league : 'all';
    const forceRefresh = req.query.refresh === '1';

    async function runWithConcurrency<T, R>(
      items: T[],
      limit: number,
      worker: (item: T) => Promise<R>
    ): Promise<Array<PromiseSettledResult<R>>> {
      const results: Array<PromiseSettledResult<R>> = new Array(items.length);
      let cursor = 0;
      const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
          const idx = cursor++;
          try {
            const value = await worker(items[idx]);
            results[idx] = { status: 'fulfilled', value };
          } catch (reason) {
            results[idx] = { status: 'rejected', reason };
          }
        }
      });
      await Promise.all(runners);
      return results;
    }

    try {
      const todayKey = getBrasiliaDateKey(new Date());
      const tomorrowKey = addDaysToDateKey(todayKey, 1);
      const minRecentDateKey = addDaysToDateKey(todayKey, -5);
      const recentCompactDates = [-3, -2, -1].map((offset) =>
        addDaysToDateKey(todayKey, offset).replace(/-/g, '')
      );
      const todayCompact = todayKey.replace(/-/g, '');
      const tomorrowCompact = tomorrowKey.replace(/-/g, '');
      const futureCompactDates = [2, 3, 4].map((offset) =>
        addDaysToDateKey(todayKey, offset).replace(/-/g, '')
      );

      const cacheKey = `all-games:v4:${todayKey}`;
      let allMatches =
        !forceRefresh &&
        apiCache.get(cacheKey)?.expiresAt &&
        apiCache.get(cacheKey)!.expiresAt > Date.now()
          ? (apiCache.get(cacheKey)!.data as Array<
              ReturnType<typeof mapEvent> & {
                autoPrediction?: {
                  predictedHomeScore: number;
                  predictedAwayScore: number;
                  homeWinPct: number;
                  drawPct: number;
                  awayWinPct: number;
                  homeRank: number | null;
                  awayRank: number | null;
                } | null;
              }
            >)
          : null;

      if (!allMatches) {
        const scoreboardJobs: Array<{
          slug: string;
          dateParam?: string;
          ttlMs: number;
          refresh: boolean;
        }> = [];

        for (const comp of COMPETITIONS) {
          scoreboardJobs.push({ slug: comp.slug, dateParam: undefined, ttlMs: 25000, refresh: forceRefresh });
          scoreboardJobs.push({ slug: comp.slug, dateParam: todayCompact, ttlMs: 25000, refresh: forceRefresh });
          scoreboardJobs.push({ slug: comp.slug, dateParam: tomorrowCompact, ttlMs: 25000, refresh: forceRefresh });
          recentCompactDates.forEach((pastDate, idx) => {
            // Keep yesterday (-1) fresh (60s) so late-night matches in Brasília always stay up-to-date
            scoreboardJobs.push({
              slug: comp.slug,
              dateParam: pastDate,
              ttlMs: idx === recentCompactDates.length - 1 ? 60000 : 300000,
              refresh: forceRefresh && idx === recentCompactDates.length - 1,
            });
          });
          for (const futDate of futureCompactDates) {
            scoreboardJobs.push({ slug: comp.slug, dateParam: futDate, ttlMs: 120000, refresh: false });
          }
        }

        const standingsLeagues = COMPETITIONS.map((c) => c.slug).filter(
          (s) => s !== 'bra.copa_do_brazil'
        );

        const [settled, standingsResults] = await Promise.all([
          runWithConcurrency(scoreboardJobs, 10, (job) =>
            fetchLeagueScoreboard(job.slug, job.dateParam, job.ttlMs, job.refresh)
          ),
          runWithConcurrency(standingsLeagues, 5, async (slug) => ({
            slug,
            entries: await getLeagueStandingsEntries(slug),
          })),
        ]);

        const standingsMap = new Map<string, ParsedStandingTeam[]>();
        for (const sr of standingsResults) {
          if (sr.status === 'fulfilled' && sr.value.entries.length > 0) {
            standingsMap.set(sr.value.slug, sr.value.entries);
          }
        }
        const combinedBraStandings = [
          ...(standingsMap.get('bra.1') || []),
          ...(standingsMap.get('bra.2') || []),
        ];

        const deduped = new Map<string, ReturnType<typeof mapEvent>>();
        for (const r of settled) {
          if (r.status !== 'fulfilled') continue;
          for (const m of r.value) {
            // Exclude stale default cup/round fixtures older than 5 days
            if (m.brasiliaDateKey && m.brasiliaDateKey < minRecentDateKey) continue;
            const key = `${m.leagueSlug}:${m.id}`;
            const existing = deduped.get(key);
            if (
              !existing ||
              (existing.statusState !== 'post' && m.statusState === 'post') ||
              m.broadcasts.length > existing.broadcasts.length
            ) {
              deduped.set(key, m);
            }
          }
        }

        allMatches = Array.from(deduped.values()).map((m) => {
          if (m.statusState !== 'pre') {
            return { ...m, autoPrediction: null };
          }
          const tableEntries =
            m.leagueSlug === 'bra.copa_do_brazil'
              ? combinedBraStandings
              : standingsMap.get(m.leagueSlug) || [];
          const homeEntry = findTeamStanding(tableEntries, m.homeTeam.id, m.homeTeam.name);
          const awayEntry = findTeamStanding(tableEntries, m.awayTeam.id, m.awayTeam.name);
          const forecast = computePoissonForecastFromEntries({
            leagueSlug: m.leagueSlug,
            eventId: m.id,
            homeEntry,
            awayEntry,
          });
          return {
            ...m,
            autoPrediction: forecast.hasEnoughData
              ? {
                  predictedHomeScore: forecast.predictedHomeScore,
                  predictedAwayScore: forecast.predictedAwayScore,
                  homeWinPct: forecast.homeWinPct,
                  drawPct: forecast.drawPct,
                  awayWinPct: forecast.awayWinPct,
                  homeRank: forecast.homeStats?.rank ?? null,
                  awayRank: forecast.awayStats?.rank ?? null,
                }
              : null,
          };
        });

        const statusOrder: Record<'in' | 'pre' | 'post', number> = { in: 0, pre: 1, post: 2 };
        allMatches.sort((a, b) => {
          if (statusOrder[a.statusState] !== statusOrder[b.statusState]) {
            return statusOrder[a.statusState] - statusOrder[b.statusState];
          }
          const ta = new Date(a.date).getTime();
          const tb = new Date(b.date).getTime();
          // Finished matches: newest final scores first; live/upcoming: soonest kickoff first
          return a.statusState === 'post' ? tb - ta : ta - tb;
        });

        apiCache.set(cacheKey, { expiresAt: Date.now() + 30000, data: allMatches });
      }

      const filtered = allMatches.filter((m) => {
        if (scopeFilter !== 'all' && m.scope !== scopeFilter) return false;
        if (leagueFilter !== 'all' && m.leagueSlug !== leagueFilter) return false;
        return true;
      });

      res.json({
        source: 'ESPN Official Soccer Feed',
        fetchedAt: new Date().toISOString(),
        todayKey,
        tomorrowKey,
        matches: filtered,
      });
    } catch (err) {
      res.status(502).json({
        error: 'Não foi possível atualizar a central de jogos no momento.',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  });

  // Pre-match Statistical Prediction Endpoint (based on real league table)
  app.get('/api/football/match-prediction', requireAuth, async (req, res) => {
    const league = typeof req.query.league === 'string' ? req.query.league : '';
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : '';
    const homeId = typeof req.query.homeId === 'string' ? req.query.homeId : '';
    const awayId = typeof req.query.awayId === 'string' ? req.query.awayId : '';
    const homeName = typeof req.query.homeName === 'string' ? req.query.homeName : '';
    const awayName = typeof req.query.awayName === 'string' ? req.query.awayName : '';

    if (!COMPETITION_SLUGS.has(league) || !eventId) {
      res.status(400).json({ error: 'Parâmetros de previsão inválidos.' });
      return;
    }

    try {
      let entries = await getLeagueStandingsEntries(league);
      if (entries.length === 0 && league === 'bra.copa_do_brazil') {
        const [bra1, bra2] = await Promise.all([
          getLeagueStandingsEntries('bra.1'),
          getLeagueStandingsEntries('bra.2'),
        ]);
        entries = [...bra1, ...bra2];
      }
      const homeEntry = findTeamStanding(entries, homeId, homeName);
      const awayEntry = findTeamStanding(entries, awayId, awayName);
      const prediction = computePoissonForecastFromEntries({
        leagueSlug: league,
        eventId,
        homeEntry,
        awayEntry,
      });
      res.json(prediction);
    } catch (err) {
      res.status(502).json({
        error: 'Não foi possível calcular a previsão estatística desta partida.',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  });

  // Persistent User Pre-Match Score Predictions ("Meu Palpite")
  app.get('/api/football/predictions', requireAuth, (req, res) => {
    const bucketId = resolvePredictionWalletBucket(req);
    const store = readPredictionsStore();
    res.json({ predictions: store[bucketId] || {} });
  });

  app.post('/api/football/predictions', requireAuth, (req, res) => {
    const { leagueSlug, eventId, homeTeamName, awayTeamName, homeScore, awayScore } = req.body || {};
    if (
      typeof leagueSlug !== 'string' ||
      !COMPETITION_SLUGS.has(leagueSlug) ||
      typeof eventId !== 'string' ||
      !eventId.trim()
    ) {
      res.status(400).json({ error: 'Partida inválida para previsão.' });
      return;
    }

    const parsedHome = Number(homeScore);
    const parsedAway = Number(awayScore);
    if (
      !Number.isInteger(parsedHome) ||
      !Number.isInteger(parsedAway) ||
      parsedHome < 0 ||
      parsedHome > 20 ||
      parsedAway < 0 ||
      parsedAway > 20
    ) {
      res.status(400).json({ error: 'Informe um placar válido entre 0 e 20 gols.' });
      return;
    }

    const bucketId = resolvePredictionWalletBucket(req);
    const store = readPredictionsStore();
    if (!store[bucketId]) {
      store[bucketId] = {};
    }
    const matchKey = `${leagueSlug}:${eventId.trim()}`;
    const record: StoredUserPrediction = {
      matchKey,
      leagueSlug,
      eventId: eventId.trim(),
      homeTeamName: String(homeTeamName || 'Mandante').slice(0, 80),
      awayTeamName: String(awayTeamName || 'Visitante').slice(0, 80),
      homeScore: parsedHome,
      awayScore: parsedAway,
      updatedAt: new Date().toISOString(),
    };
    store[bucketId][matchKey] = record;
    writePredictionsStore(store);
    res.json({ prediction: record, predictions: store[bucketId] });
  });

  app.delete('/api/football/predictions/:leagueSlug/:eventId', requireAuth, (req, res) => {
    const { leagueSlug, eventId } = req.params;
    const bucketId = resolvePredictionWalletBucket(req);
    const store = readPredictionsStore();
    const matchKey = `${leagueSlug}:${eventId}`;
    let deleted = false;
    if (store[bucketId] && store[bucketId][matchKey]) {
      delete store[bucketId][matchKey];
      writePredictionsStore(store);
      deleted = true;
    }
    res.json({ deleted, predictions: store[bucketId] || {} });
  });

  // Official Brazilian Match Stream & Highlights Resolver (Verified real video IDs + oEmbed check)
  app.get('/api/football/match-stream', requireAuth, async (req, res) => {
    const league = typeof req.query.league === 'string' ? req.query.league : '';
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : '';
    if (!COMPETITION_SLUGS.has(league) || !/^\d+$/.test(eventId)) {
      res.status(400).json({ error: 'Parâmetros de partida inválidos.' });
      return;
    }

    try {
      const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`;
      const rawSummary = await fetchJsonWithCache(summaryUrl, 25000).catch(() => null);

      const comp = rawSummary?.header?.competitions?.[0];
      const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
      const homeName = decodeHtmlEntities(
        String(
          competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName ||
            req.query.home ||
            ''
        )
      );
      const awayName = decodeHtmlEntities(
        String(
          competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName ||
            req.query.away ||
            ''
        )
      );

      const reportedBroadcasts = extractBroadcastNames(comp, league);
      const priorityIds =
        LEAGUE_PRIORITY_YT_CHANNEL[league] ||
        ['cazetv', 'getv', 'espnbrasil', 'tvbrasil', 'tntsportsbr', 'canalgoat'];

      const orderedChannels = [
        ...priorityIds
          .map((id) => OFFICIAL_YOUTUBE_CHANNELS.find((c) => c.id === id))
          .filter((c): c is (typeof OFFICIAL_YOUTUBE_CHANNELS)[number] => Boolean(c)),
        ...OFFICIAL_YOUTUBE_CHANNELS.filter((c) => !priorityIds.includes(c.id)),
      ];

      // Resolve real live state of all Brazilian YouTube channels + RSS + +5min highlights in parallel
      const [ytEntries, liveStates, rawHighlights] = await Promise.all([
        fetchOfficialYoutubeEntries().catch(() => [] as YtRssEntry[]),
        Promise.all(
          orderedChannels.map((ch) =>
            resolveYoutubeChannelLiveState(ch.channelId, ch.shortName)
          )
        ),
        fetchMatchHighlights(homeName, awayName, league).catch(
          () => [] as MatchHighlightCandidate[]
        ),
      ]);

      const homeTokens = normalizeTeamTokens(homeName);
      const awayTokens = normalizeTeamTokens(awayName);

      interface ResolvedStreamItem {
        id: string;
        name: string;
        channelLabel: string;
        platformType: 'youtube-embed' | 'official-channel' | 'free-platform';
        embeddable: boolean;
        videoId: string | null;
        embedUrl: string | null;
        externalUrl: string;
        description: string;
        durationLabel?: string | null;
        statusNote?: string | null;
        isYoutubeExternal?: boolean;
        isHighlight?: boolean;
        isLiveMatch?: boolean;
        isExactMatch?: boolean;
      }

      const embeddableSources: ResolvedStreamItem[] = [];
      const channelOptions: ResolvedStreamItem[] = [];
      const seenVideoIds = new Set<string>();

      // 1. Verified RSS match-specific live/video entries (at most 1 per channel, must pass oEmbed)
      const seenExactChannelIds = new Set<string>();
      const exactRssMatches = ytEntries
        .map((entry) => {
          const normTitle = entry.title
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
          const hasHome = homeTokens.some((t) => normTitle.includes(t));
          const hasAway = awayTokens.some((t) => normTitle.includes(t));
          return { entry, hasBoth: hasHome && hasAway };
        })
        .filter((x) => {
          if (!x.hasBoth || seenExactChannelIds.has(x.entry.channelId)) return false;
          seenExactChannelIds.add(x.entry.channelId);
          return true;
        });

      const rssEmbedChecks = await Promise.all(
        exactRssMatches.slice(0, 3).map((x) => isYoutubeVideoEmbeddable(x.entry.videoId))
      );

      const resolvedMatchChannelIds = new Set<string>();
      for (let i = 0; i < Math.min(3, exactRssMatches.length); i++) {
        const { entry } = exactRssMatches[i];
        const canEmbed = rssEmbedChecks[i];
        seenVideoIds.add(entry.videoId);
        resolvedMatchChannelIds.add(entry.channelId);
        const item: ResolvedStreamItem = {
          id: `yt-video-${entry.videoId}`,
          name: `${entry.channelName} — ${entry.title}`,
          channelLabel: `${entry.channelName.split(' (')[0]} · Jogo`,
          platformType: 'youtube-embed',
          embeddable: canEmbed,
          videoId: entry.videoId,
          embedUrl: canEmbed
            ? `https://www.youtube.com/embed/${entry.videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`
            : null,
          externalUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
          description: canEmbed
            ? 'Cobertura oficial brasileira encontrada no YouTube com incorporação liberada.'
            : 'Vídeo oficial encontrado no YouTube, porém o canal restringiu a incorporação externa.',
          statusNote: canEmbed
            ? 'Disponível no player oficial dentro do painel.'
            : 'Incorporação bloqueada pelo canal — assista no YouTube ou no Chrome.',
          isYoutubeExternal: true,
          isLiveMatch: true,
          isExactMatch: true,
        };
        if (canEmbed) {
          embeddableSources.push(item);
        }
        channelOptions.push(item);
      }

      // 2. All Official Brazilian YouTube Channels (ONLY marked embeddable if live + oEmbed OK)
      for (let i = 0; i < orderedChannels.length; i++) {
        const ch = orderedChannels[i];
        const state = liveStates[i];
        const canEmbed = Boolean(state.isLive && state.embeddable && state.videoId);
        // Skip offline channel fallback if we already added a verified match video from this exact channel
        if (!canEmbed && resolvedMatchChannelIds.has(ch.channelId)) continue;
        const watchUrl = state.videoId
          ? `https://www.youtube.com/watch?v=${state.videoId}`
          : ch.livePageUrl;

        const option: ResolvedStreamItem = {
          id: `yt-channel-${ch.id}`,
          name: state.title ? `${ch.shortName} — ${state.title}` : ch.name,
          channelLabel: state.isLive ? `${ch.shortName} · Ao Vivo` : ch.shortName,
          platformType: 'youtube-embed',
          embeddable: canEmbed,
          videoId: state.videoId,
          embedUrl:
            canEmbed && state.videoId
              ? `https://www.youtube.com/embed/${state.videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`
              : null,
          externalUrl: watchUrl,
          description: state.statusNote,
          statusNote: state.statusNote,
          isYoutubeExternal: true,
          isLiveMatch: state.isLive,
          isExactMatch: false,
        };

        if (canEmbed && state.videoId && !seenVideoIds.has(state.videoId)) {
          seenVideoIds.add(state.videoId);
          embeddableSources.push(option);
        }
        channelOptions.push(option);
      }

      // 3. Verified +5 min Full Match Highlights
      const highlightSources: ResolvedStreamItem[] = rawHighlights.map((hl) => ({
        id: hl.id,
        name: hl.title,
        channelLabel: hl.channelName,
        platformType: 'youtube-embed',
        embeddable: hl.embeddable,
        videoId: hl.videoId,
        embedUrl: hl.embedUrl,
        externalUrl: hl.externalUrl,
        description: hl.description,
        durationLabel: hl.durationLabel,
        statusNote: hl.embeddable
          ? `Melhores momentos completos da partida (${hl.durationLabel}).`
          : 'Este vídeo de melhores momentos bloqueou incorporação externa — assista no YouTube.',
        isYoutubeExternal: true,
        isHighlight: true,
        isLiveMatch: false,
        isExactMatch: true,
      }));

      // Add non-YouTube official Brazilian channels (TV Globo / SporTV / Premiere / ESPN Watch / Paramount / Disney+)
      const officialLinks: Array<{
        id: string;
        name: string;
        platformType: 'official-channel' | 'free-platform';
        embeddable: boolean;
        embedUrl: null;
        externalUrl: string;
        description: string;
        isYoutubeExternal?: boolean;
      }> = [];

      const seenUrls = new Set<string>();
      for (const bName of reportedBroadcasts) {
        const known = KNOWN_BROADCASTER_URLS.find((k) => k.match.test(bName));
        if (!known || seenUrls.has(known.url)) continue;
        seenUrls.add(known.url);
        const isYt = /youtube\.com/i.test(known.url);
        officialLinks.push({
          id: `bc-${bName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: bName,
          platformType: 'official-channel',
          embeddable: false,
          embedUrl: null,
          externalUrl: known.url,
          description: `Emissora oficial da competição no Brasil (${known.label}).`,
          isYoutubeExternal: isYt,
        });
      }

      const freeBrazilianPlatforms = [
        {
          id: 'cazetv-yt',
          name: 'CazéTV (YouTube Brasil)',
          url: 'https://www.youtube.com/@CazeTV/live',
          description: 'Canal oficial brasileiro gratuito no YouTube com transmissões nacionais e internacionais.',
          isYt: true,
        },
        {
          id: 'getv-yt',
          name: 'ge / TV Globo (YouTube Brasil)',
          url: 'https://www.youtube.com/@geglobo/live',
          description: 'Canal oficial ge tv / TV Globo com transmissões, programas esportivos e melhores momentos.',
          isYt: true,
        },
        {
          id: 'espnbrasil-yt',
          name: 'ESPN Brasil',
          url: 'https://www.youtube.com/@espnbrasil/live',
          description: 'Canal oficial da ESPN Brasil no YouTube com cobertura dos principais campeonatos.',
          isYt: true,
        },
        {
          id: 'tvbrasil-live',
          name: 'TV Brasil Ao Vivo (EBC)',
          url: 'https://tvbrasil.ebc.com.br/ao-vivo',
          description: 'Sinal aberto oficial brasileiro da EBC para transmissões esportivas gratuitas.',
          isYt: false,
        },
        {
          id: 'tntsports-br-yt',
          name: 'TNT Sports Brasil (YouTube)',
          url: 'https://www.youtube.com/@TNTSportsBR/live',
          description: 'Canal oficial brasileiro da TNT Sports com cobertura ao vivo e melhores momentos.',
          isYt: true,
        },
        {
          id: 'canalgoat-yt',
          name: 'Canal GOAT (YouTube Brasil)',
          url: 'https://www.youtube.com/@canalgoatbr/live',
          description: 'Canal esportivo oficial brasileiro no YouTube com transmissões licenciadas.',
          isYt: true,
        },
        {
          id: 'ge-globo-agenda',
          name: 'ge / SporTV / Premiere (Agenda Oficial)',
          url: 'https://ge.globo.com/agenda/',
          description: 'Agenda oficial de jogos transmitidos pela TV Globo, SporTV e Premiere no Brasil.',
          isYt: false,
        },
      ];

      for (const fp of freeBrazilianPlatforms) {
        if (!seenUrls.has(fp.url)) {
          seenUrls.add(fp.url);
          officialLinks.push({
            id: fp.id,
            name: fp.name,
            platformType: 'free-platform',
            embeddable: false,
            embedUrl: null,
            externalUrl: fp.url,
            description: fp.description,
            isYoutubeExternal: fp.isYt,
          });
        }
      }

      const embeddableStream =
        embeddableSources[0] ||
        highlightSources.find((h) => h.embeddable) ||
        null;

      res.json({
        matchId: eventId,
        leagueSlug: league,
        reportedBroadcasts,
        embeddableStream,
        embeddableSources,
        channelOptions,
        highlightSources,
        officialLinks,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({
        error: 'Não foi possível verificar os canais brasileiros de transmissão.',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  });

  // Protected Brazilian Channels & Live Embed Routes ("CANAIS DO BRASIL")
  app.get('/api/apps', requireAuth, (_req, res) => {
    const apps = readFreeApps();
    res.json({ apps });
  });

  app.get('/api/apps/live-embed', requireAuth, async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const name = decodeHtmlEntities(
      typeof req.query.name === 'string' ? req.query.name.trim() : 'Canal Oficial'
    );
    const youtubeChannelId =
      typeof req.query.youtubeChannelId === 'string' ? req.query.youtubeChannelId.trim() : '';

    if (!/^https?:\/\//i.test(rawUrl)) {
      res.status(400).json({ error: 'Link do canal brasileiro inválido.' });
      return;
    }

    if (youtubeChannelId && /^UC[a-zA-Z0-9_-]{18,}$/.test(youtubeChannelId)) {
      const [liveState, entries] = await Promise.all([
        resolveYoutubeChannelLiveState(youtubeChannelId, name),
        fetchYoutubeChannelRss(youtubeChannelId, name, rawUrl).catch(() => [] as YtRssEntry[]),
      ]);

      const rssSlice = entries.slice(0, 6);
      const embedFlags = await Promise.all(
        rssSlice.map((e) => isYoutubeVideoEmbeddable(e.videoId))
      );

      const latestVideos = rssSlice
        .filter((_e, idx) => embedFlags[idx])
        .map((e) => ({
          videoId: e.videoId,
          title: e.title,
          embedUrl: `https://www.youtube.com/embed/${e.videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`,
          watchUrl: `https://www.youtube.com/watch?v=${e.videoId}`,
        }));

      const liveEmbedUrl =
        liveState.isLive && liveState.embeddable && liveState.videoId
          ? `https://www.youtube.com/embed/${liveState.videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`
          : null;
      const primaryVideoId =
        liveState.isLive && liveState.embeddable && liveState.videoId
          ? liveState.videoId
          : latestVideos[0]?.videoId || null;
      const primaryEmbed = liveEmbedUrl || latestVideos[0]?.embedUrl || null;
      const embeddable = Boolean(primaryEmbed);

      res.json({
        name,
        url: rawUrl,
        youtubeChannelId,
        embeddable,
        videoId: primaryVideoId,
        embedUrl: primaryEmbed,
        liveEmbedUrl,
        latestVideos,
        blockReason: embeddable ? null : liveState.statusNote,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    let embeddable = false;
    let blockReason: string | null = null;
    try {
      const probe = await fetch(rawUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        },
        signal: AbortSignal.timeout(7000),
      });
      const xfo = (probe.headers.get('x-frame-options') || '').trim().toUpperCase();
      const csp = (probe.headers.get('content-security-policy') || '').trim();
      const frameAncestorsMatch = csp.match(/frame-ancestors\s+([^;]+)/i);

      if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
        blockReason = `A emissora ${name} permite reprodução apenas no portal oficial ou aplicativo externo.`;
      } else if (frameAncestorsMatch) {
        const ancestors = frameAncestorsMatch[1].trim().toLowerCase();
        if (ancestors === "'none'" || ancestors === "'self'" || !ancestors.includes('*')) {
          blockReason = `A emissora ${name} exige abertura direta no navegador Chrome para exibir a programação.`;
        } else {
          embeddable = probe.status >= 200 && probe.status < 400;
        }
      } else {
        embeddable = probe.status >= 200 && probe.status < 400;
      }
    } catch {
      blockReason = `Não foi possível incorporar ${name} dentro do painel. Abra o canal oficial diretamente no Chrome.`;
    }

    res.json({
      name,
      url: rawUrl,
      youtubeChannelId: null,
      embeddable,
      embedUrl: embeddable ? rawUrl : null,
      liveEmbedUrl: null,
      latestVideos: [],
      blockReason,
      checkedAt: new Date().toISOString(),
    });
  });

  app.post('/api/apps', requireOwnerAuth, (req, res) => {
    const {
      name,
      category,
      icon,
      description,
      url,
      youtubeChannelId,
      actionLabel,
      tryInAppBrowser,
    } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
      res.status(400).json({ error: 'Informe um nome e um link HTTP/HTTPS válido.' });
      return;
    }
    const validIcons: FreeAppIconType[] = ['tv', 'youtube', 'telegram', 'globe'];
    const safeIcon: FreeAppIconType = validIcons.includes(icon) ? icon : 'tv';

    const record: FreeAppRecord = {
      id: `app-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim().slice(0, 80),
      category: typeof category === 'string' && category.trim() ? category.trim().slice(0, 60) : 'Canal Brasileiro',
      icon: safeIcon,
      description: typeof description === 'string' ? description.trim().slice(0, 280) : '',
      url: url.trim().slice(0, 500),
      ...(typeof youtubeChannelId === 'string' && /^UC[a-zA-Z0-9_-]{18,}$/.test(youtubeChannelId.trim())
        ? { youtubeChannelId: youtubeChannelId.trim() }
        : {}),
      ...(typeof actionLabel === 'string' && actionLabel.trim() ? { actionLabel: actionLabel.trim().slice(0, 30) } : {}),
      ...(tryInAppBrowser !== false ? { tryInAppBrowser: true } : {}),
      isExternalCommunity: false,
      createdAt: new Date().toISOString(),
    };

    const apps = readFreeApps();
    apps.push(record);
    writeFreeApps(apps);
    res.status(201).json({ app: record, apps });
  });

  app.delete('/api/apps/:id', requireOwnerAuth, (req, res) => {
    const { id } = req.params;
    const apps = readFreeApps();
    const filtered = apps.filter((a) => a.id !== id);
    if (filtered.length === apps.length) {
      res.status(404).json({ error: 'Canal não encontrado.' });
      return;
    }
    writeFreeApps(filtered);
    res.json({ deleted: true, apps: filtered });
  });

  // Unknown API routes return JSON 404 instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  // Frontend serving (Vite dev middleware or production static files)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CHOSZEN™© server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CHOSZEN™© server:', err);
  process.exit(1);
});

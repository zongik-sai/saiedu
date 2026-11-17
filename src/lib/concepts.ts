/**
 * 개념 맞추기·중간점검 공통 규칙(6과목 공통, 순수 함수 — 2026-11-17 선생님 요청).
 * - 카드마다 개념 맞추기: 뜻 5개 ↔ 용어 5개 + 난이도별 함정(쉬움 1 · 보통 3 · 어려움 5 → 보기 6·8·10개).
 *   예전 형식(뜻 3개 + 함정 distractor 1개)도 그대로 읽는다(쓰는 중인 단원·데이터베이스 실습 맞추기).
 * - 카드 3장마다 중간점검: 묶음 문제은행에서 10문항을 새로 뽑아 한 문제씩, 틀린 문항은 정답·해설을 보여 주고
 *   뒤로 다시 보낸다(보기 순서 다시 섞음). 10문항을 모두 맞히면 끝(그 묶음 마침).
 * 원본 규칙(검사)은 tests/unit/conceptRules.ts와 같다(midGroupSizes는 tests/unit/concepts.test.ts가 둘을 비교).
 */

export type MatchLevel = 'easy' | 'mid' | 'hard';
export const MATCH_LEVELS: readonly MatchLevel[] = ['easy', 'mid', 'hard'];
export const MATCH_LEVEL_LABEL: Record<MatchLevel, string> = { easy: '쉬움', mid: '보통', hard: '어려움' };
/** 난이도별 함정 수(보기 = 뜻 5 + 함정) */
export const MATCH_DISTRACTORS: Record<MatchLevel, number> = { easy: 1, mid: 3, hard: 5 };

export interface MatchPair { term: string; desc: string }

/** 앱 안 표준 형태: 난이도(예전 형식은 없음) · 뜻↔용어 · 함정 용어들 */
export interface CardMatchData {
  level?: MatchLevel;
  pairs: MatchPair[];
  distractors: string[];
}

/** 예전 형식(뜻 3개 + 함정 1개). 데이터베이스 3단계 실습 맞추기는 계속 이 형식 */
export interface LegacyMatch { pairs: MatchPair[]; distractor: string }
export type MatchInput = CardMatchData | LegacyMatch;

const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

/**
 * 원본 개념 맞추기 → 표준 형태. 새 형식 { level, pairs, distractors } · 예전 형식 { pairs, distractor } 둘 다.
 * 짝이 하나도 없거나 형식이 깨졌으면 undefined(그 카드는 '다 읽었어요'만). 같은 용어·뜻이 겹치면 처음 것만,
 * 정답 용어와 같은 함정은 뺀다(화면에서 같은 이름 칩이 둘 생기지 않게).
 */
export function normalizeMatch(raw: unknown): CardMatchData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { level?: unknown; pairs?: unknown; distractors?: unknown; distractor?: unknown };
  if (!Array.isArray(r.pairs)) return undefined;
  const terms = new Set<string>();
  const descs = new Set<string>();
  const pairs: MatchPair[] = [];
  for (const p of r.pairs) {
    if (!p || typeof p !== 'object') continue;
    const { term, desc } = p as { term?: unknown; desc?: unknown };
    if (!isStr(term) || !isStr(desc) || terms.has(term) || descs.has(desc)) continue;
    terms.add(term);
    descs.add(desc);
    pairs.push({ term, desc });
  }
  if (!pairs.length) return undefined;
  const rawDis = Array.isArray(r.distractors) ? r.distractors : r.distractor !== undefined ? [r.distractor] : [];
  const distractors: string[] = [];
  for (const d of rawDis) if (isStr(d) && !terms.has(d) && !distractors.includes(d)) distractors.push(d);
  const level = typeof r.level === 'string' && (MATCH_LEVELS as readonly string[]).includes(r.level) ? (r.level as MatchLevel) : undefined;
  return { ...(level ? { level } : {}), pairs, distractors };
}

/* ---------------- 중간점검 묶음 ---------------- */

/** 중간점검 한 번에 내는 문항 수 */
export const MID_DRAW = 10;

/** 카드 n장을 앞에서부터 3장씩 묶는다. 1장이 남으면 마지막 묶음이 4장, 2장이 남으면 2장짜리 묶음 하나 더(conceptRules.ts와 같은 규칙) */
export function midGroupSizes(n: number): number[] {
  const count = Math.max(0, Math.floor(n));
  const sizes = Array<number>(Math.floor(count / 3)).fill(3);
  const r = count % 3;
  if (r === 1) {
    if (sizes.length) sizes[sizes.length - 1] = 4;
    else sizes.push(1);
  } else if (r === 2) sizes.push(2);
  return sizes;
}

/** 카드 ID 목록 → 묶음 ID('U3-m1' …)와 그 카드들(원본이 아직 없는 단원의 기록 병합 등, 규칙으로 계산) */
export function midGroupsOf(unitPrefix: string, cardIds: readonly string[]): { id: string; cards: string[] }[] {
  let k = 0;
  return midGroupSizes(cardIds.length).map((n, i) => {
    const cards = cardIds.slice(k, k + n);
    k += n;
    return { id: `${unitPrefix}m${i + 1}`, cards };
  });
}

/** 원본 중간점검 문항(묶음 문제은행 하나) */
export interface RawMidQ { id: string; card: string; q: string; code?: string; o: string[]; a: number; exp: string }
export interface RawMidGroup { id: string; cards: string[]; bank: RawMidQ[] }

/** 앱 안 묶음: ID는 단원을 붙인 전체 ID('U3-m1'), cards도 전체 카드 ID */
export interface MidGroup<Q> { id: string; cards: string[]; bank: Q[] }

/** 화면이 쓰는 중간점검 문항 정보(객관식 공통 모양) */
export interface MidItem { id: string; question: string; code?: string; options: string[]; answer: number; explanation: string }

const GROUP_RE = /^m\d{1,2}$/;
const Q_RE = /^m\d{1,2}-q\d{1,3}$/;

/** 단원 앞부분을 붙인다: 짧은 ID('m1', 't1')는 'U3-m1', 이미 붙어 있으면('U01-m1') 그대로 */
const withPrefix = (prefix: string, id: string) => (prefix && id.startsWith(prefix) ? id : `${prefix}${id}`);

/**
 * 원본 mid → 앱 묶음. unitPrefix: 'U3-'(짧은 ID 원본)·'U01-'(이미 전체 ID인 데이터베이스 원본도 그대로 됨).
 * cardIds: 이 단원의 전체 카드 ID. 쓰는 중인 원본을 견디도록: ID 형식이 틀린 묶음·문항, 이 단원에 없는 카드,
 * 보기·정답이 깨진 문항은 뺀다(배열 위치로 ID를 만들지 않음). 카드나 문항이 하나도 남지 않은 묶음도 뺀다.
 */
export function adaptMids<Q>(raw: unknown, unitPrefix: string, cardIds: readonly string[], make: (q: RawMidQ, id: string, card: string | undefined) => Q): MidGroup<Q>[] {
  if (!Array.isArray(raw)) return [];
  const cardSet = new Set(cardIds);
  const seen = new Set<string>();
  const out: MidGroup<Q>[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const rg = g as Partial<RawMidGroup>;
    if (typeof rg.id !== 'string') continue;
    const id = withPrefix(unitPrefix, rg.id);
    if (!GROUP_RE.test(id.slice(unitPrefix.length)) || seen.has(id)) continue;
    const cards = (Array.isArray(rg.cards) ? rg.cards : []).filter(isStr).map((c) => withPrefix(unitPrefix, c)).filter((c, i, a) => cardSet.has(c) && a.indexOf(c) === i);
    const qids = new Set<string>();
    const bank: Q[] = [];
    for (const q of Array.isArray(rg.bank) ? rg.bank : []) {
      if (!q || typeof q !== 'object') continue;
      const rq = q as Partial<RawMidQ>;
      if (typeof rq.id !== 'string') continue;
      const qid = withPrefix(unitPrefix, rq.id);
      const local = qid.slice(unitPrefix.length);
      if (!Q_RE.test(local) || !local.startsWith(`${id.slice(unitPrefix.length)}-`) || qids.has(qid)) continue;
      const o = Array.isArray(rq.o) ? rq.o : [];
      if (!isStr(rq.q) || o.length < 2 || !o.every(isStr) || !Number.isInteger(rq.a) || rq.a! < 0 || rq.a! >= o.length) continue;
      const card = typeof rq.card === 'string' ? withPrefix(unitPrefix, rq.card) : undefined;
      qids.add(qid);
      bank.push(make({ id: rq.id, card: rq.card ?? '', q: rq.q, ...(isStr(rq.code) ? { code: rq.code } : {}), o: o as string[], a: rq.a!, exp: typeof rq.exp === 'string' ? rq.exp : '' }, qid, card && cardSet.has(card) ? card : undefined));
    }
    if (!cards.length || !bank.length) continue;
    seen.add(id);
    out.push({ id, cards, bank });
  }
  return out;
}

/* ---------------- 진행 판정(카드 + 중간점검 묶음) ---------------- */

/** 묶음 상태: locked(카드를 아직 다 못 마침) · due(풀 차례) · done(마침) · practice(1단계를 예전 규칙으로 이미 통과: 연습으로 풀 수 있음) */
export type MidStatus = 'locked' | 'due' | 'done' | 'practice';

export function midStatus(g: { id: string; cards: readonly string[] }, isDone: (id: string) => boolean, passed: boolean): MidStatus {
  if (isDone(g.id)) return 'done';
  if (!g.cards.every(isDone)) return 'locked';
  return passed ? 'practice' : 'due';
}

/** 1단계에서 지금 볼 것: 카드(번호) 또는 중간점검(묶음 번호) */
export type ConceptView = { kind: 'card'; idx: number } | { kind: 'mid'; gi: number };

/**
 * 순서대로 다음에 할 것: 묶음마다 그 묶음의 안 끝난 카드 → 풀 차례인 중간점검. 1단계를 통과했으면 중간점검은 건너뛴다(연습).
 * 묶음 밖 카드(묶음 원본이 없는 단원)는 카드 순서대로. 다 했으면 null.
 * from: 이 위치 다음부터 찾고, 없으면 처음부터 다시(돌아서) 찾는다.
 */
export function nextConceptTodo(cardIds: readonly string[], groups: readonly { id: string; cards: readonly string[] }[], isDone: (id: string) => boolean, passed: boolean, from?: ConceptView): ConceptView | null {
  const seq = conceptSequence(cardIds, groups);
  const todo = (v: ConceptView) => (v.kind === 'card' ? !isDone(cardIds[v.idx]) : midStatus(groups[v.gi], isDone, passed) === 'due');
  const start = from ? seq.findIndex((v) => sameView(v, from)) + 1 : 0;
  const order = [...seq.slice(start), ...seq.slice(0, start)];
  return order.find(todo) ?? null;
}

export const sameView = (a: ConceptView, b: ConceptView) => (a.kind === 'card' ? b.kind === 'card' && a.idx === b.idx : b.kind === 'mid' && a.gi === b.gi);

/** 1단계 순서: 카드들 사이사이, 묶음의 마지막 카드 바로 뒤에 그 묶음의 중간점검(카드 번호 버튼 줄과 같은 순서) */
export function conceptSequence(cardIds: readonly string[], groups: readonly { cards: readonly string[] }[]): ConceptView[] {
  const after = new Map<string, number>();
  groups.forEach((g, gi) => {
    const last = g.cards[g.cards.length - 1];
    if (last) after.set(last, gi);
  });
  const seq: ConceptView[] = [];
  cardIds.forEach((id, idx) => {
    seq.push({ kind: 'card', idx });
    const gi = after.get(id);
    if (gi !== undefined) seq.push({ kind: 'mid', gi });
  });
  // 묶음의 마지막 카드가 목록에 없으면(원본이 어긋남) 그 묶음은 끝에
  groups.forEach((_, gi) => {
    if (!seq.some((v) => v.kind === 'mid' && v.gi === gi)) seq.push({ kind: 'mid', gi });
  });
  return seq;
}

/** 이 카드가 속한 묶음 번호(없으면 -1) */
export const groupIndexOf = (groups: readonly { cards: readonly string[] }[], cardId: string) => groups.findIndex((g) => g.cards.includes(cardId));

/** 1단계 통과 조건: 카드 전부 + 중간점검 묶음 전부(묶음이 없는 단원은 카드만 — 예전 규칙) */
export const level1Complete = (cardIds: readonly string[], midIds: readonly string[], isDone: (id: string) => boolean) =>
  cardIds.length > 0 && cardIds.every(isDone) && midIds.every(isDone);

/* ---------------- 중간점검 한 번(뽑기·다시 묻기) ---------------- */

/** 배열 섞기(rng는 0 이상 1 미만) */
export function shuffleWith<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const orderOf = (n: number, rng: () => number) => shuffleWith(Array.from({ length: n }, (_, i) => i), rng);

/**
 * 진행 중인 중간점검 한 번(이 기기 초안으로 저장). ids: 뽑은 문항(MID_DRAW개, 문제은행이 적으면 전부),
 * queue: 남은 문항(맨 앞이 지금 문항), solved: 맞힌 문항, orders: 문항별 지금 보기 순서(원래 보기 번호),
 * misses: 문항별 틀린 횟수, practice: 이미 마친 묶음을 연습으로 다시 푸는 중(진도에 영향 없음).
 */
export interface MidRun {
  v: 1;
  group: string;
  ids: string[];
  queue: string[];
  solved: string[];
  orders: Record<string, number[]>;
  misses: Record<string, number>;
  practice: boolean;
}

/** 새로 뽑기: 문제은행에서 n개(문항 순서·보기 순서 모두 섞음). 시도할 때마다 새로 부른다 */
export function startMidRun(group: string, bank: readonly { id: string; options: readonly unknown[] }[], opts: { n?: number; rng?: () => number; practice?: boolean } = {}): MidRun {
  const rng = opts.rng ?? Math.random;
  const picked = shuffleWith(bank, rng).slice(0, Math.max(0, Math.min(opts.n ?? MID_DRAW, bank.length)));
  const ids = picked.map((q) => q.id);
  return { v: 1, group, ids, queue: [...ids], solved: [], orders: Object.fromEntries(picked.map((q) => [q.id, orderOf(q.options.length, rng)])), misses: {}, practice: !!opts.practice };
}

/**
 * 지금 문항(queue 맨 앞)에 답함. 맞히면 solved로, 틀리면 맨 뒤로 보내고 보기 순서를 다시 섞는다.
 * 다른 문항 ID거나 이미 끝났으면 그대로 돌려준다(두 번 누름 방지).
 */
export function answerMidRun(run: MidRun, qid: string, correct: boolean, nOptions: number, rng: () => number = Math.random): MidRun {
  if (run.queue[0] !== qid) return run;
  const rest = run.queue.slice(1);
  if (correct) return { ...run, queue: rest, solved: [...run.solved, qid] };
  return { ...run, queue: [...rest, qid], orders: { ...run.orders, [qid]: orderOf(nOptions, rng) }, misses: { ...run.misses, [qid]: (run.misses[qid] ?? 0) + 1 } };
}

export const midRunDone = (run: MidRun) => run.ids.length > 0 && run.queue.length === 0 && run.solved.length === run.ids.length;

/**
 * 저장된 초안을 이어 풀 수 있는지: 같은 묶음, 문제은행에 있는 문항만, 뽑은 수가 맞고, queue·solved가 뽑은 문항을
 * 겹치지 않게 나눠 가지며, 보기 순서가 그 문항 보기 수의 순열이어야 한다. 아니면 null(새로 뽑기).
 */
export function resumeMidRun(saved: unknown, group: string, bank: readonly { id: string; options: readonly unknown[] }[], n = MID_DRAW): MidRun | null {
  if (!saved || typeof saved !== 'object') return null;
  const s = saved as Partial<MidRun>;
  if (s.v !== 1 || s.group !== group) return null;
  const byId = new Map(bank.map((q) => [q.id, q]));
  const strs = (x: unknown): string[] | null => (Array.isArray(x) && x.every((y) => typeof y === 'string') ? x : null);
  const ids = strs(s.ids), queue = strs(s.queue), solved = strs(s.solved);
  if (!ids || !queue || !solved) return null;
  if (ids.length !== Math.min(n, bank.length) || new Set(ids).size !== ids.length || !ids.every((id) => byId.has(id))) return null;
  const all = [...queue, ...solved];
  if (all.length !== ids.length || new Set(all).size !== all.length || !all.every((id) => ids.includes(id))) return null;
  if (!s.orders || typeof s.orders !== 'object') return null;
  const orders: Record<string, number[]> = {};
  for (const id of ids) {
    const o = (s.orders as Record<string, unknown>)[id];
    const len = byId.get(id)!.options.length;
    if (!Array.isArray(o) || o.length !== len || [...o].sort((a, b) => a - b).some((x, i) => x !== i)) return null;
    orders[id] = o as number[];
  }
  const misses: Record<string, number> = {};
  if (s.misses && typeof s.misses === 'object') for (const id of ids) {
    const m = (s.misses as Record<string, unknown>)[id];
    if (typeof m === 'number' && Number.isInteger(m) && m > 0) misses[id] = m;
  }
  return { v: 1, group, ids, queue, solved, orders, misses, practice: s.practice === true };
}

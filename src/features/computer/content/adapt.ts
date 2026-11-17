import { adaptMids, normalizeMatch, type RawMidGroup } from '../../../lib/concepts';
import type { CgArea, CgCard, CgCardMatch, CgMcq, CgTable, CgUnit, CgUnitId } from '../types';

/**
 * 단원 원본(JSON) → 앱 표준 형태(CgUnit). 컴퓨터 일반(pc_bank.json)과 새 과목(courses/<과목>/U1~U8.json)이 함께 쓴다.
 * 새 과목 원본은 컴퓨터 일반 단원과 같은 형식에 이론 카드의 개념 맞추기(match)·선택 code, 문항의 선택 code가 더 있다.
 * 문항 ID는 단원 안에서만 고유하므로 'U1-b1'처럼 단원을 붙인다(카드 'U1-t1', 빈칸 'U1-f1', 실력점검 'U1-a1',
 * 중간점검 묶음 'U1-m1'·문항 'U1-m1-q1').
 * 개념 맞추기는 새 형식(뜻 5개 + 난이도별 함정)·예전 형식(뜻 3개 + 함정 1개)을 모두 읽어 표준 형태로 바꾼다(normalizeMatch).
 * 중간점검(mid)은 단원 원본 맨 위(새 과목) 또는 컴퓨터 일반 content/cg/U<n>.json에 있고, 없으면 그 단원은 중간점검 없음.
 * 다른 에이전트가 쓰는 중인 빈 단원(배열이 비었거나 빠진 원본)에서도 멈추지 않게 모든 배열을 기본값으로 읽는다.
 * 이 파일은 원본 JSON을 직접 가져오지 않는다(과목마다 자기 단원 파일만 내려받도록).
 */
export interface RawTable { head: string[]; rows: string[][] }
export interface RawQ { id: string; q: string; code?: string; o: string[]; a: number; exp: string; area: string; type?: string }
/** 원본 개념 맞추기: 새 형식 { level, pairs(5), distractors } 또는 예전 형식 { pairs(3), distractor } */
export interface RawMatch { level?: string; pairs: { term: string; desc: string }[]; distractors?: string[]; distractor?: string }
export interface RawTheory { id: string; title: string; points: string[]; table?: RawTable; tip?: string; code?: string; ext: boolean; match?: RawMatch }
export interface RawUnit {
  unit: number;
  title: string;
  intro: string;
  theory: RawTheory[];
  bank: string[];
  fill: { id: string; text: string; answer: string; exp: string }[];
  basic: RawQ[];
  summary: { keys: { k: string; v: string }[]; compare: (RawTable & { title: string })[]; traps: string[] };
  advanced: RawQ[];
  /** 카드 3장마다 중간점검 묶음(짧은 ID: 'm1', 'm1-q1', 카드 't1'). 아직 안 쓴 단원은 없음 */
  mid?: RawMidGroup[];
}

export interface AdaptOptions {
  /** 이 과목의 영역 ID(순서대로) */
  areas: readonly string[];
  /** 모르는 영역일 때 쓸 영역(기본: 첫 영역) */
  fallbackArea?: string;
  /** 카드 원본에 match가 없을 때 쓸 개념 맞추기(카드 ID 'U1-t1' 기준, 컴퓨터 일반 content/cg/U<n>.json의 match, 원본 형식 그대로) */
  matches?: Record<string, unknown>;
  /** 단원 원본에 mid가 없을 때 쓸 중간점검(단원 ID 'U1' 기준, 컴퓨터 일반 content/cg/U<n>.json의 mid) */
  mids?: Record<string, unknown>;
}

const arr = <T,>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : []);

const table = (t: RawTable | undefined, caption?: string): CgTable | undefined =>
  t ? { ...(caption ? { caption } : {}), header: arr(t.head), rows: arr(t.rows) } : undefined;

/** 원본 ID가 형식('t3', 'b12')에 맞으면 그대로, 아니면 위치로 만든다(빈 원본 방어) */
const localId = (raw: unknown, letter: string, i: number) => (typeof raw === 'string' && new RegExp(`^${letter}\\d{1,3}$`).test(raw) ? raw : `${letter}${i + 1}`);

export function adaptUnits(units: RawUnit[], opts: AdaptOptions): CgUnit[] {
  const areaSet = new Set(opts.areas);
  const fallback: CgArea = opts.fallbackArea ?? opts.areas[0] ?? 'GEN';
  const area = (a: unknown): CgArea => (typeof a === 'string' && areaSet.has(a) ? a : fallback);
  const matches = opts.matches ?? {};
  const midsBy = opts.mids ?? {};
  const mcq = (unitId: CgUnitId, set: 'basic' | 'check', letter: 'b' | 'a', q: RawQ, i: number): CgMcq => ({
    id: `${unitId}-${localId(q.id, letter, i)}`, unitId, set, question: q.q,
    ...(typeof q.code === 'string' && q.code ? { code: q.code } : {}),
    options: arr(q.o), answer: q.a, explanation: q.exp, area: area(q.area), ...(q.type ? { tag: q.type } : {}),
  });
  return arr(units).map((u) => {
    const id = `U${u.unit}` as CgUnitId;
    const summary = u.summary ?? { keys: [], compare: [], traps: [] };
    const cards = arr(u.theory).map((t, i): CgCard => {
      const cid = `${id}-${localId(t.id, 't', i)}`;
      const m: CgCardMatch | undefined = normalizeMatch(t.match) ?? (Object.hasOwn(matches, cid) ? normalizeMatch(matches[cid]) : undefined);
      return {
        id: cid, title: (t.title ?? '').replace(/^\[확장\]\s*/, ''), points: arr(t.points),
        ...(t.table ? { table: table(t.table) } : {}), ...(t.tip ? { tip: t.tip } : {}), ext: !!t.ext,
        ...(m ? { match: m } : {}), ...(typeof t.code === 'string' && t.code ? { code: t.code } : {}),
      };
    });
    const rawMid = u.mid !== undefined ? u.mid : Object.hasOwn(midsBy, id) ? midsBy[id] : undefined;
    const mids = adaptMids(rawMid, `${id}-`, cards.map((c) => c.id), (q, qid, card): CgMcq => ({
      id: qid, unitId: id, set: 'mid', question: q.q, ...(q.code ? { code: q.code } : {}), options: q.o, answer: q.a, explanation: q.exp,
      // 중간점검 문항은 영역이 없다(모의고사·영역 통계에 들어가지 않음)
      area: '', ...(card ? { card } : {}),
    }));
    return {
      id, num: u.unit, title: u.title ?? '', intro: u.intro ?? '',
      cards,
      wordBox: arr(u.bank),
      blanks: arr(u.fill).map((f, i) => ({ id: `${id}-${localId(f.id, 'f', i)}`, text: f.text, answer: f.answer, explanation: f.exp })),
      basic: arr(u.basic).map((q, i) => mcq(id, 'basic', 'b', q, i)),
      summary: { keys: arr(summary.keys), tables: arr(summary.compare).map((c) => table(c, c.title)!), traps: arr(summary.traps) },
      check: arr(u.advanced).map((q, i) => mcq(id, 'check', 'a', q, i)),
      mids,
    };
  });
}

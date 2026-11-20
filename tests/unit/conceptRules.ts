import { expect } from 'vitest';

/**
 * 개념 맞추기·중간점검 원본 규칙(6과목 공통, 2026-11-17 선생님 요청: 카드마다 맞추기 5개, 난이도별 보기 6·8·10개,
 * 카드 3장마다 중간점검 10문항을 문제은행에서 무작위로, 다 맞힐 때까지).
 * 쓰는 곳: courseBanks.test.ts(네트워크·프로그래밍·Data·기초 다듬기), cgConcepts.test.ts(컴퓨터 일반), dbStages.test.ts(데이터베이스).
 */

export type MatchLevel = 'easy' | 'mid' | 'hard';
export interface RawMatch5 {
  /** 개념 난이도: 쉬움(보기 6개) · 보통(8개) · 어려움(10개) */
  level: MatchLevel;
  /** 뜻 5개 ↔ 용어 5개 */
  pairs: { term: string; desc: string }[];
  /** 헷갈리게 넣는 용어: 쉬움 1 · 보통 3 · 어려움 5개 */
  distractors: string[];
}
export interface RawMidQ { id: string; card: string; q: string; code?: string; o: string[]; a: number; exp: string }
export interface RawMidGroup { id: string; cards: string[]; bank: RawMidQ[] }

export const PAIRS = 5;
export const DISTRACTORS: Record<MatchLevel, number> = { easy: 1, mid: 3, hard: 5 };
/** 중간점검 한 번에 내는 문항 수 */
export const MID_DRAW = 10;

/** 카드 n장을 앞에서부터 3장씩 묶는다. 1장이 남으면 마지막 묶음이 4장, 2장이 남으면 2장짜리 묶음 하나 더. */
export function midGroupSizes(n: number): number[] {
  const sizes = Array<number>(Math.floor(n / 3)).fill(3);
  const r = n % 3;
  if (r === 1) {
    if (sizes.length) sizes[sizes.length - 1] = 4;
    else sizes.push(1);
  } else if (r === 2) sizes.push(2);
  return sizes;
}
/** 묶음의 문제은행 크기: 카드마다 5문항, 적어도 12문항(2장 묶음) */
export const midBankSize = (cards: number) => Math.max(12, 5 * cards);

const BAD_NUM = /[①②③④]/;
const POS_REF = /(첫|둘|셋|넷|마지막)\s*(째|번째)\s*(는|가|와|도|보기|선택지|것)|(첫|두|세|네)\s*번째\s*(보기|는|가|것)|[1-4]번\s*보기|보기\s*[1-4]/;
const PREV_REF = /(앞|위|이전|다음)\s*(문제|문항)/;

/** 카드 한 장의 개념 맞추기(5개 + 난이도별 함정). text = 카드 본문(제목·문장·팁·표·코드) */
export function checkMatch5(m: RawMatch5, text: string, where: string, descMax = 70) {
  expect(Object.keys(m).sort(), `${where} match 필드(level·pairs·distractors만, 예전 distractor 없음)`).toEqual(['distractors', 'level', 'pairs']);
  expect(['easy', 'mid', 'hard'], `${where} 난이도`).toContain(m.level);
  expect(m.pairs, `${where} 뜻 ${PAIRS}개`).toHaveLength(PAIRS);
  expect(m.distractors, `${where} 함정 수(${m.level})`).toHaveLength(DISTRACTORS[m.level]);
  const terms = m.pairs.map((p) => p.term);
  expect(new Set(terms).size, `${where} 용어 중복`).toBe(PAIRS);
  expect(new Set(m.pairs.map((p) => p.desc)).size, `${where} 뜻 중복`).toBe(PAIRS);
  expect(new Set(m.distractors).size, `${where} 함정 중복`).toBe(m.distractors.length);
  for (const d of m.distractors) {
    expect(terms, `${where} 함정이 정답 용어와 같음: ${d}`).not.toContain(d);
    expect(d.trim().length, `${where} 함정 길이: ${d}`).toBeGreaterThan(0);
    expect(d.length, `${where} 함정 길이: ${d}`).toBeLessThanOrEqual(30);
  }
  for (const p of m.pairs) {
    expect(p.term.length, `${where} 용어 길이: ${p.term}`).toBeLessThanOrEqual(30);
    expect(text.includes(p.term), `${where} 용어가 카드 본문에 없음: ${p.term}`).toBe(true);
    expect(p.desc.length, `${where} 뜻 길이(8~${descMax}): ${p.desc}`).toBeGreaterThanOrEqual(8);
    expect(p.desc.length, `${where} 뜻 길이(8~${descMax}): ${p.desc}`).toBeLessThanOrEqual(descMax);
    for (const t of [...terms, ...m.distractors]) expect(p.desc.includes(t), `${where} 뜻에 용어·함정이 드러남: "${p.desc}" ⊃ "${t}"`).toBe(false);
  }
}

/**
 * 단원의 중간점검 묶음. cardIds = 단원 카드 ID 순서(원본 그대로: 't1'… 또는 'U01-t1'…), idPrefix = 묶음 ID 앞부분('' 또는 'U01-').
 */
export function checkMid(groups: RawMidGroup[] | undefined, cardIds: string[], where: string, idPrefix = '') {
  expect(Array.isArray(groups), `${where} 중간점검(mid) 없음`).toBe(true);
  const sizes = midGroupSizes(cardIds.length);
  expect(groups!.map((g) => g.cards.length), `${where} 묶음 크기(카드 ${cardIds.length}장 → ${sizes})`).toEqual(sizes);
  let k = 0;
  groups!.forEach((g, gi) => {
    const gw = `${where}-m${gi + 1}`;
    expect(g.id, gw).toBe(`${idPrefix}m${gi + 1}`);
    expect(g.cards, `${gw} 카드 순서`).toEqual(cardIds.slice(k, k + sizes[gi]));
    k += sizes[gi];
    const n = midBankSize(g.cards.length);
    expect(g.bank, `${gw} 문제은행 ${n}문항`).toHaveLength(n);
    const per = Object.fromEntries(g.cards.map((c) => [c, 0]));
    const cnt = [0, 0, 0, 0];
    const stems = new Set<string>();
    g.bank.forEach((q, qi) => {
      const qw = `${gw}-q${qi + 1}`;
      expect(q.id, qw).toBe(`${g.id}-q${qi + 1}`);
      expect(g.cards, `${qw} 카드`).toContain(q.card);
      per[q.card]++;
      expect(q.q.length, `${qw} 질문 길이`).toBeLessThanOrEqual(200);
      expect(q.q.length, `${qw} 질문 길이`).toBeGreaterThanOrEqual(8);
      expect(stems.has(q.q), `${qw} 같은 질문이 묶음에 또 있음`).toBe(false);
      stems.add(q.q);
      if (q.code !== undefined) {
        expect(q.code.split('\n').length, `${qw} 코드 줄 수`).toBeLessThanOrEqual(12);
        expect(q.code.length, `${qw} 코드 길이`).toBeLessThanOrEqual(500);
      }
      expect(q.o, qw).toHaveLength(4);
      expect(new Set(q.o).size, `${qw} 보기 중복`).toBe(4);
      for (const o of q.o) {
        expect(o.trim().length, `${qw} 빈 보기`).toBeGreaterThan(0);
        expect(o.length, `${qw} 보기 길이: ${o}`).toBeLessThanOrEqual(100);
      }
      expect(Number.isInteger(q.a) && q.a >= 0 && q.a <= 3, `${qw} 정답 번호`).toBe(true);
      cnt[q.a]++;
      expect(q.exp.length, `${qw} 해설 길이(15~300)`).toBeGreaterThanOrEqual(15);
      expect(q.exp.length, `${qw} 해설 길이(15~300)`).toBeLessThanOrEqual(300);
      for (const t of [q.q, q.exp, ...q.o]) expect(BAD_NUM.test(t), `${qw} ①~④는 보기 표시와 헷갈림(㉠㉡㉢ 사용): ${t}`).toBe(false);
      expect(POS_REF.test(q.exp), `${qw} 해설이 보기 순서를 가리킴(보기는 섞임): ${q.exp}`).toBe(false);
      expect(PREV_REF.test(q.q), `${qw} 문항은 무작위로 뽑혀 혼자 서야 함(앞·다음 문제 언급 금지): ${q.q}`).toBe(false);
    });
    for (const c of g.cards) expect(per[c], `${gw} 카드 ${c} 문항 수(4개 이상)`).toBeGreaterThanOrEqual(4);
    const lo = Math.floor(n / 4) - 1;
    const hi = Math.ceil(n / 4) + 1;
    for (const x of cnt) {
      expect(x, `${gw} 정답 번호 분포 ${cnt} (각 ${lo}~${hi}개)`).toBeGreaterThanOrEqual(lo);
      expect(x, `${gw} 정답 번호 분포 ${cnt} (각 ${lo}~${hi}개)`).toBeLessThanOrEqual(hi);
    }
  });
  expect(k, `${where} 모든 카드가 묶음에 들어감`).toBe(cardIds.length);
}

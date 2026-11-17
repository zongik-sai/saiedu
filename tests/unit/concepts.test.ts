import { describe, expect, it } from 'vitest';
import {
  adaptMids, answerMidRun, conceptSequence, level1Complete, MATCH_DISTRACTORS, MID_DRAW, midGroupSizes, midGroupsOf, midRunDone, midStatus, nextConceptTodo,
  normalizeMatch, resumeMidRun, startMidRun, type MidRun,
} from '../../src/lib/concepts';
import { midGroupSizes as ruleSizes, MID_DRAW as RULE_DRAW, DISTRACTORS as RULE_DISTRACTORS, midBankSize } from './conceptRules';
import { seededRandom } from '../../src/features/computer/mock';
import { adaptUnits, type RawUnit } from '../../src/features/computer/content/adapt';
import { makeCourse } from '../../src/features/computer/course';
import { buildMock, drawSelfCheck, fixedSetCount, mockOptionsOf } from '../../src/features/computer/mock';
import {
  addLock, emptyCgState, isMidQid, isPassed, itemDone, level1Progress, LOCK_LIMIT, markCard, markDone, markMid, mergeCgStates, mockWrongIds, normalizeCgState, noteAnswer,
  passedCount, resetUnit, type CgState,
} from '../../src/features/computer/model';
import { studentDetail, toStudents, unitClassStats } from '../../src/features/computer/teacher';
import {
  addUnitLock, emptyLearnerState, markStageItem, markStageMid, mergeLearnerStates, midQuestionUnit, recordStageMiss, resetUnitProgress, sanitizeStageItems,
  stage1Progress, stageItemIds, stageMidIds, stagePassed, UNIT_LOCK_LIMIT, type LearnerState,
} from '../../src/features/progress/model';
import { buildLiveState } from '../../src/features/monitor/liveState';
import type { CgUnitId } from '../../src/features/computer/types';

/**
 * 개념 맞추기 5쌍·난이도별 보기, 카드 3장마다 중간점검(2026-11-17 선생님 요청) — 공통 규칙·두 엔진의 기록·통과 규칙.
 */
const T = (n: number) => `2026-11-17T00:00:${String(n).padStart(2, '0')}.000Z`;

describe('개념 맞추기 원본 읽기(새 형식·예전 형식)', () => {
  it('새 형식: 난이도·뜻 5개·함정 여러 개 그대로', () => {
    const raw = { level: 'hard', pairs: Array.from({ length: 5 }, (_, i) => ({ term: `t${i}`, desc: `뜻 ${i}` })), distractors: ['a', 'b', 'c', 'd', 'e'] };
    expect(normalizeMatch(raw)).toEqual(raw);
  });
  it('예전 형식(뜻 3개 + distractor 하나): 난이도 없이 distractors: [함정]', () => {
    expect(normalizeMatch({ pairs: [{ term: 'A', desc: '가' }, { term: 'B', desc: '나' }, { term: 'C', desc: '다' }], distractor: 'D' }))
      .toEqual({ pairs: [{ term: 'A', desc: '가' }, { term: 'B', desc: '나' }, { term: 'C', desc: '다' }], distractors: ['D'] });
  });
  it('깨진 원본: 짝이 없으면 없음, 겹치는 용어·뜻·정답과 같은 함정·모르는 난이도는 버린다', () => {
    expect(normalizeMatch(undefined)).toBeUndefined();
    expect(normalizeMatch({ pairs: [] })).toBeUndefined();
    expect(normalizeMatch({ pairs: 'x' })).toBeUndefined();
    expect(normalizeMatch({ level: 'super', pairs: [{ term: 'A', desc: '가' }, { term: 'A', desc: '나' }, { term: 'B', desc: '가' }, { term: 'C', desc: '' }, 3], distractors: ['A', 'Z', 'Z', 7] }))
      .toEqual({ pairs: [{ term: 'A', desc: '가' }], distractors: ['Z'] });
  });
  it('난이도별 함정 수는 원본 규칙(conceptRules)과 같다: 쉬움 1 · 보통 3 · 어려움 5 → 보기 6·8·10개', () => {
    expect(MATCH_DISTRACTORS).toEqual(RULE_DISTRACTORS);
    expect(MID_DRAW).toBe(RULE_DRAW);
  });
});

describe('중간점검 묶음 나누기(카드 3장마다)', () => {
  it('앱의 midGroupSizes는 원본 규칙(conceptRules.ts)과 같다', () => {
    for (let n = 0; n <= 40; n++) expect(midGroupSizes(n), `${n}장`).toEqual(ruleSizes(n));
    expect(midGroupSizes(14)).toEqual([3, 3, 3, 3, 2]);
    expect(midGroupSizes(13)).toEqual([3, 3, 3, 4]);
    expect(midGroupSizes(10)).toEqual([3, 3, 4]);
    expect(midGroupSizes(6)).toEqual([3, 3]);
    expect(midGroupSizes(7)).toEqual([3, 4]);
    expect(midBankSize(2)).toBe(12);
  });
  it('카드 ID → 묶음 ID·카드', () => {
    expect(midGroupsOf('U01-', ['U01-t1', 'U01-t2', 'U01-t3', 'U01-t4', 'U01-t5', 'U01-t6', 'U01-t7'])).toEqual([
      { id: 'U01-m1', cards: ['U01-t1', 'U01-t2', 'U01-t3'] }, { id: 'U01-m2', cards: ['U01-t4', 'U01-t5', 'U01-t6', 'U01-t7'] },
    ]);
  });
  it('원본 mid 읽기: 짧은 ID에는 단원을 붙이고 전체 ID는 그대로, 깨진 묶음·문항·카드는 뺀다', () => {
    const q = (id: string, card: string, extra = {}) => ({ id, card, q: `질문 ${id}`, o: ['a', 'b', 'c', 'd'], a: 1, exp: '해설입니다', ...extra });
    const cards = ['U3-t1', 'U3-t2', 'U3-t3'];
    const make = (r: { q: string }, id: string, card: string | undefined) => ({ id, card, q: r.q });
    const out = adaptMids([
      { id: 'm1', cards: ['t1', 't2', 't3', 't9'], bank: [q('m1-q1', 't1'), q('m1-q2', 't9'), q('m2-q1', 't1'), q('x', 't1'), q('m1-q3', 't2', { a: 7 }), q('m1-q4', 't3', { o: ['a'] }), q('m1-q1', 't1')] },
      { id: 'm1', cards: ['t1'], bank: [q('m1-q9', 't1')] }, // 같은 ID 두 번
      { id: 'zz', cards: ['t1'], bank: [q('zz-q1', 't1')] },
      { id: 'm2', cards: ['t8'], bank: [q('m2-q1', 't8')] }, // 이 단원에 없는 카드뿐
      { id: 'm3', cards: ['t3'], bank: [] },
      null,
    ], 'U3-', cards, make);
    expect(out).toEqual([{ id: 'U3-m1', cards: ['U3-t1', 'U3-t2', 'U3-t3'], bank: [{ id: 'U3-m1-q1', card: 'U3-t1', q: '질문 m1-q1' }, { id: 'U3-m1-q2', card: undefined, q: '질문 m1-q2' }] }]);
    // 데이터베이스 원본은 이미 전체 ID
    const db = adaptMids([{ id: 'U01-m1', cards: ['U01-t1'], bank: [q('U01-m1-q1', 'U01-t1')] }], 'U01-', ['U01-t1'], make);
    expect(db).toEqual([{ id: 'U01-m1', cards: ['U01-t1'], bank: [{ id: 'U01-m1-q1', card: 'U01-t1', q: '질문 U01-m1-q1' }] }]);
    expect(adaptMids(undefined, 'U1-', cards, make)).toEqual([]);
  });
});

const bankOf = (n: number, g = 'U1-m1') => Array.from({ length: n }, (_, i) => ({ id: `${g}-q${i + 1}`, options: ['a', 'b', 'c', 'd'] }));

describe('중간점검 한 번: 10문항 뽑기', () => {
  const bank = bankOf(15);
  it('문제은행 15문항 중 10문항(겹치지 않게), 보기 순서도 문항마다', () => {
    const r = startMidRun('U1-m1', bank, { rng: seededRandom('a') });
    expect(r.ids).toHaveLength(MID_DRAW);
    expect(new Set(r.ids).size).toBe(MID_DRAW);
    expect(r.ids.every((id) => bank.some((q) => q.id === id))).toBe(true);
    expect(r.queue).toEqual(r.ids);
    expect(r.solved).toEqual([]);
    for (const id of r.ids) expect([...r.orders[id]].sort()).toEqual([0, 1, 2, 3]);
  });
  it('같은 난수(주입)면 같은 뽑기, 시도마다 새로 뽑는다', () => {
    expect(startMidRun('U1-m1', bank, { rng: seededRandom('x') })).toEqual(startMidRun('U1-m1', bank, { rng: seededRandom('x') }));
    const draws = new Set(Array.from({ length: 6 }, (_, i) => startMidRun('U1-m1', bank, { rng: seededRandom(`try-${i}`) }).ids.join()));
    expect(draws.size).toBeGreaterThan(1);
  });
  it('문제은행이 10문항보다 적으면 전부', () => {
    expect(startMidRun('U1-m1', bankOf(7), { rng: seededRandom('s') }).ids).toHaveLength(7);
  });
});

describe('중간점검 한 번: 틀리면 뒤로 보내 다 맞힐 때까지', () => {
  const bank = bankOf(12);
  it('맞히면 solved, 틀리면 맨 뒤로(보기 다시 섞음, 틀린 횟수), 모두 맞혀야 끝', () => {
    const rng = seededRandom('requeue');
    let r = startMidRun('U1-m1', bank, { rng });
    const first = r.queue[0];
    const before = r.orders[first];
    let changed = false;
    // 같은 문항을 여러 번 틀려도 보기 순서가 한 번은 바뀐다(섞기)
    for (let k = 0; k < 4 && !changed; k++) {
      const head = r.queue[0];
      r = answerMidRun(r, head, false, 4, rng);
      expect(r.queue.at(-1)).toBe(head);
      // 다시 맨 앞으로 오게 나머지를 맞힌 것처럼 돌리지 않고 순서만 확인
      changed = r.orders[first].join() !== before.join();
      r = { ...r, queue: [first, ...r.queue.filter((x) => x !== first)] };
    }
    expect(changed).toBe(true);
    expect(r.misses[first]).toBeGreaterThanOrEqual(1);
    expect(midRunDone(r)).toBe(false);
    // 나머지를 차례로: 맞힘 → 끝
    let guard = 0;
    while (!midRunDone(r) && guard++ < 50) r = answerMidRun(r, r.queue[0], true, 4, rng);
    expect(midRunDone(r)).toBe(true);
    expect(new Set(r.solved)).toEqual(new Set(r.ids));
    expect(r.queue).toEqual([]);
  });
  it('지금 문항이 아닌 ID·끝난 회차에 답해도 그대로(두 번 누름 방지)', () => {
    const r = startMidRun('U1-m1', bank, { rng: seededRandom('x') });
    expect(answerMidRun(r, r.queue[1], true)).toBe(r);
    const done: MidRun = { ...r, queue: [], solved: [...r.ids] };
    expect(answerMidRun(done, r.ids[0], false)).toBe(done);
  });
  it('하나 틀린 문항은 마지막에 다시 나오고, 틀린 문항이 하나 남으면 바로 다시 나온다', () => {
    let r = startMidRun('U1-m1', bank, { rng: seededRandom('y') });
    const q0 = r.queue[0];
    r = answerMidRun(r, q0, false, 4, seededRandom('z'));
    expect(r.queue.indexOf(q0)).toBe(r.queue.length - 1);
    for (let i = 0; i < 9; i++) r = answerMidRun(r, r.queue[0], true);
    expect(r.queue).toEqual([q0]);
    r = answerMidRun(r, q0, false, 4, seededRandom('w'));
    expect(r.queue).toEqual([q0]);
    expect(r.misses[q0]).toBe(2);
    r = answerMidRun(r, q0, true);
    expect(midRunDone(r)).toBe(true);
    expect(r.solved).toHaveLength(10);
  });
  it('이어 풀기 초안 검사: 같은 묶음·문제은행 문항·뽑은 수·queue와 solved가 나눠 가짐·보기 순서가 순열', () => {
    const r = answerMidRun(startMidRun('U1-m1', bank, { rng: seededRandom('q') }), '', true);
    const s = answerMidRun(r, r.queue[0], true);
    const json = JSON.parse(JSON.stringify(s));
    expect(resumeMidRun(json, 'U1-m1', bank)).toEqual(s);
    expect(resumeMidRun(json, 'U1-m2', bank)).toBeNull();
    expect(resumeMidRun({ ...json, v: 2 }, 'U1-m1', bank)).toBeNull();
    expect(resumeMidRun({ ...json, ids: json.ids.slice(1) }, 'U1-m1', bank)).toBeNull();
    expect(resumeMidRun({ ...json, queue: [...json.queue, json.solved[0]] }, 'U1-m1', bank)).toBeNull();
    expect(resumeMidRun({ ...json, orders: { ...json.orders, [json.ids[0]]: [0, 0, 1, 2] } }, 'U1-m1', bank)).toBeNull();
    expect(resumeMidRun(json, 'U1-m1', bank.slice(0, 5))).toBeNull(); // 문제은행이 바뀌어 없는 문항
    expect(resumeMidRun(null, 'U1-m1', bank)).toBeNull();
    expect(resumeMidRun({ ...json, misses: { [json.ids[0]]: 2, x: 3, [json.ids[1]]: -1 } }, 'U1-m1', bank)?.misses).toEqual({ [json.ids[0]]: 2 });
  });
});

describe('1단계 순서: 카드 → 묶음의 카드를 다 마치면 중간점검', () => {
  const cards = ['U1-t1', 'U1-t2', 'U1-t3', 'U1-t4', 'U1-t5'];
  const groups = [{ id: 'U1-m1', cards: cards.slice(0, 3) }, { id: 'U1-m2', cards: cards.slice(3) }];
  const done = (ids: string[]) => (id: string) => ids.includes(id);
  it('카드 번호 줄: 묶음의 마지막 카드 뒤에 중간점검', () => {
    expect(conceptSequence(cards, groups)).toEqual([
      { kind: 'card', idx: 0 }, { kind: 'card', idx: 1 }, { kind: 'card', idx: 2 }, { kind: 'mid', gi: 0 }, { kind: 'card', idx: 3 }, { kind: 'card', idx: 4 }, { kind: 'mid', gi: 1 },
    ]);
  });
  it('묶음 상태: 카드를 다 못 마침 → 잠김, 다 마침 → 풀 차례(1단계를 예전 규칙으로 통과했으면 연습), 마침 → 완료', () => {
    expect(midStatus(groups[0], done(['U1-t1', 'U1-t2']), false)).toBe('locked');
    expect(midStatus(groups[0], done(cards.slice(0, 3)), false)).toBe('due');
    expect(midStatus(groups[0], done(cards.slice(0, 3)), true)).toBe('practice');
    expect(midStatus(groups[0], done(['U1-m1']), false)).toBe('done');
  });
  it('다음 할 것: 묶음의 카드를 다 마치면 다음 카드가 아니라 중간점검', () => {
    expect(nextConceptTodo(cards, groups, done([]), false)).toEqual({ kind: 'card', idx: 0 });
    expect(nextConceptTodo(cards, groups, done(cards.slice(0, 3)), false, { kind: 'card', idx: 2 })).toEqual({ kind: 'mid', gi: 0 });
    // 카드를 건너뛰며 했어도 묶음이 차례가 되면 그 중간점검
    expect(nextConceptTodo(cards, groups, done(['U1-t1', 'U1-t2', 'U1-t3', 'U1-t4']), false, { kind: 'card', idx: 3 })).toEqual({ kind: 'card', idx: 4 });
    expect(nextConceptTodo(cards, groups, done([...cards, 'U1-m2']), false, { kind: 'mid', gi: 1 })).toEqual({ kind: 'mid', gi: 0 });
    // 1단계를 예전 규칙으로 통과했으면 중간점검은 건너뜀(연습)
    expect(nextConceptTodo(cards, groups, done(cards), true)).toBeNull();
    expect(nextConceptTodo(cards, groups, done([...cards, 'U1-m1', 'U1-m2']), false)).toBeNull();
  });
  it('1단계 통과 조건: 카드 전부 + 묶음 전부(묶음이 없으면 카드만)', () => {
    expect(level1Complete(cards, ['U1-m1', 'U1-m2'], done(cards))).toBe(false);
    expect(level1Complete(cards, ['U1-m1', 'U1-m2'], done([...cards, 'U1-m1', 'U1-m2']))).toBe(true);
    expect(level1Complete(cards, [], done(cards))).toBe(true);
    expect(level1Complete([], [], done([]))).toBe(false);
  });
});

/* ---------------- 단원 × 5단계 과목(컴퓨터 일반·네트워크·프로그래밍·Data·기초 다듬기) ---------------- */

const AREAS = [{ id: 'A', label: '가' }, { id: 'B', label: '나' }];
function raw(n: number, withMid: boolean): RawUnit {
  const q = (id: string, area: string) => ({ id, q: `질문 ${n}-${id}`, o: ['가', '나', '다', '라'], a: 1, exp: `해설 ${id} 입니다`, area });
  const theory = Array.from({ length: 6 }, (_, i) => ({ id: `t${i + 1}`, title: `카드 ${i + 1}`, points: ['p'], ext: false, match: { pairs: [{ term: `a${i}`, desc: `뜻 ${i}` }], distractor: 'z' } }));
  return {
    unit: n, title: `단원 ${n}`, intro: '', theory, bank: [], fill: [], summary: { keys: [], compare: [], traps: [] },
    basic: Array.from({ length: 10 }, (_, i) => q(`b${i + 1}`, i % 2 ? 'A' : 'B')),
    advanced: Array.from({ length: 12 }, (_, i) => q(`a${i + 1}`, i % 2 ? 'B' : 'A')),
    ...(withMid ? {
      mid: [1, 2].map((g) => ({
        id: `m${g}`, cards: theory.slice((g - 1) * 3, g * 3).map((t) => t.id),
        bank: Array.from({ length: 15 }, (_, k) => ({ id: `m${g}-q${k + 1}`, card: theory[(g - 1) * 3 + (k % 3)].id, q: `중간 ${g}-${k}`, o: ['가', '나', '다', '라'], a: k % 4, exp: '중간점검 해설입니다' })),
      })),
    } : {}),
  };
}
const courseOf = (withMid: boolean) => makeCourse({ id: 'basic', name: '시험', basePath: '/t', units: adaptUnits([raw(1, withMid), raw(2, withMid), raw(3, false)], { areas: AREAS.map((a) => a.id) }), areas: AREAS, remote: { kind: 'course', course: 'basic' } });
const WITH = courseOf(true);
const WITHOUT = courseOf(false);
const U1 = WITH.units[0];
const cardIds = U1.cards.map((c) => c.id);
const midIds = U1.mids.map((g) => g.id);

describe('단원 × 5단계 과목: 1단계 통과 = 카드 전부 + 중간점검 전부', () => {
  it('카드를 다 마쳐도 중간점검이 남으면 통과 아님 → 묶음을 다 마치면 통과(처음 한 번만 firstPass)', () => {
    let s = emptyCgState();
    for (const c of cardIds) s = markCard(s, 'U1', c, cardIds, T(1), midIds).state;
    expect(isPassed(s, 'U1', 1)).toBe(false);
    expect(level1Progress(s, U1)).toEqual({ cards: 6, cardsTotal: 6, mids: 0, midsTotal: 2 });
    let r = markMid(s, 'U1', 'U1-m1', cardIds, midIds, T(2));
    expect(r).toMatchObject({ unitDone: false, firstPass: false });
    r = markMid(r.state, 'U1', 'U1-m2', cardIds, midIds, T(3));
    expect(r).toMatchObject({ unitDone: true, firstPass: true });
    // 통과 기록의 점수 칸은 예전처럼 카드 수
    expect(r.state.units.U1?.lv1).toMatchObject({ best: 6, total: 6, passedAt: T(3) });
    expect(markMid(r.state, 'U1', 'U1-m2', cardIds, midIds, T(4)).firstPass).toBe(false);
    expect(passedCount(r.state, WITH)).toBe(1);
  });
  it('묶음이 없는 단원은 예전 규칙(카드만)', () => {
    const ids3 = WITH.units[2].cards.map((c) => c.id);
    let s = emptyCgState();
    for (const c of ids3) s = markCard(s, 'U3', c, ids3, T(1), WITH.units[2].mids.map((g) => g.id)).state;
    expect(isPassed(s, 'U3', 1)).toBe(true);
  });
  it('이미 통과한 1단계는 되돌리지 않는다(새 중간점검이 생겨도), 중간점검은 연습으로', () => {
    // 예전 규칙으로 통과(중간점검 콘텐츠가 오기 전)
    let s = emptyCgState();
    for (const c of cardIds) s = markCard(s, 'U1', c, cardIds, T(1)).state;
    expect(isPassed(s, 'U1', 1)).toBe(true);
    // 다시 카드를 풀어도·중간점검을 풀어도 통과 그대로
    s = markCard(s, 'U1', cardIds[0], cardIds, T(5), midIds).state;
    expect(isPassed(s, 'U1', 1)).toBe(true);
    expect(s.units.U1?.lv1?.passedAt).toBe(T(1));
    expect(midStatus(U1.mids[0], (id) => itemDone(s, id), true)).toBe('practice');
    // 저장·불러오기·병합해도 통과는 남는다
    expect(isPassed(mergeCgStates(normalizeCgState(JSON.parse(JSON.stringify(s)), WITH), emptyCgState(), WITH), 'U1', 1)).toBe(true);
  });
  it('하다가 멈춘 학생: 마친 카드는 그대로, 카드를 다 마친 묶음은 풀 차례', () => {
    let s = emptyCgState();
    for (const c of cardIds.slice(0, 4)) s = markCard(s, 'U1', c, cardIds, T(1), midIds).state;
    const isDone = (id: string) => itemDone(s, id);
    expect(midStatus(U1.mids[0], isDone, false)).toBe('due');
    expect(midStatus(U1.mids[1], isDone, false)).toBe('locked');
    expect(nextConceptTodo(cardIds, U1.mids, isDone, false)).toEqual({ kind: 'mid', gi: 0 });
  });
});

describe('단원 × 5단계 과목 기록: 중간점검 ID 읽기·병합·초기화', () => {
  it("읽기: 'U1-m1'은 cards 기록에, 콘텐츠의 묶음만(묶음을 모르는 단원은 형식만), 다른 과목 단원·이상한 키는 버림", () => {
    const s = normalizeCgState({ cards: { 'U1-t1': T(1), 'U1-m1': T(2), 'U1-m9': T(2), 'U3-m1': T(3), 'U9-m1': T(1), 'U1-m1x': T(1), 'U1-m100': T(1), constructor: T(1) } }, WITH);
    expect(s.cards).toEqual({ 'U1-t1': T(1), 'U1-m1': T(2), 'U3-m1': T(3) });
    // 콘텐츠를 모르는 모양(CG_SHAPE 등)은 형식만
    expect(Object.keys(normalizeCgState({ cards: { 'U1-m9': T(1) } }).cards)).toEqual(['U1-m9']);
  });
  it('오답노트: 중간점검 문항 ID도 받고, 오답 모의고사에는 넣지 않는다', () => {
    let s = noteAnswer(emptyCgState(), 'U1-m1-q3', false, T(1));
    s = noteAnswer(s, 'U1-b2', false, T(2));
    expect(Object.keys(normalizeCgState(JSON.parse(JSON.stringify(s)), WITH).wrong).sort()).toEqual(['U1-b2', 'U1-m1-q3']);
    expect(isMidQid('U1-m1-q3')).toBe(true);
    expect(isMidQid('U1-b2')).toBe(false);
    expect(mockWrongIds(s)).toEqual(['U1-b2']);
    expect(WITH.mcqById('U1-m1-q3')).toMatchObject({ set: 'mid', unitId: 'U1' });
  });
  it('병합: 묶음 마침은 합집합(이른 시각), 초기화를 모르는 쪽의 묶음은 버림', () => {
    const a = markMid(emptyCgState(), 'U1', 'U1-m1', cardIds, midIds, T(5)).state;
    const b = markMid(markMid(emptyCgState(), 'U1', 'U1-m1', cardIds, midIds, T(2)).state, 'U1', 'U1-m2', cardIds, midIds, T(3)).state;
    expect(mergeCgStates(a, b, WITH).cards).toEqual({ 'U1-m1': T(2), 'U1-m2': T(3) });
    const reset = resetUnit(emptyCgState(), 'U1', T(9));
    expect(mergeCgStates(b, reset, WITH).cards).toEqual({});
  });
  it('5번 잠김 단원 초기화: 그 단원 카드·묶음만 지우고(U1 초기화가 U10을 지우지 않음) 오답노트는 그대로', () => {
    let s: CgState = { ...emptyCgState(), cards: { 'U1-t1': T(1), 'U1-m1': T(1), 'U10-m1': T(1), 'U10-t1': T(1), 'U2-m1': T(1) } };
    s = noteAnswer(s, 'U1-m1-q2', false, T(2));
    for (let i = 0; i < LOCK_LIMIT; i++) s = addLock(s, 'U1', T(10 + i)).state;
    expect(s.cards).toEqual({ 'U10-m1': T(1), 'U10-t1': T(1), 'U2-m1': T(1) });
    expect(Object.keys(s.wrong)).toEqual(['U1-m1-q2']);
  });
});

describe('중간점검 문항은 모의고사·실력점검·단계 문항 수에 들어가지 않는다', () => {
  it('고정·랜덤 모의고사, 고정 회차 수, 실력점검 뽑기가 중간점검이 있어도 똑같다', () => {
    const opts = mockOptionsOf(WITH);
    for (const k of ['set1', 'set2', 'set3'] as const) expect(buildMock(WITH.units, k, opts)).toEqual(buildMock(WITHOUT.units, k, mockOptionsOf(WITHOUT)));
    expect(buildMock(WITH.units, 'random', { ...opts, seed: 'r1' })).toEqual(buildMock(WITHOUT.units, 'random', { ...mockOptionsOf(WITHOUT), seed: 'r1' }));
    expect(fixedSetCount(WITH.units, opts)).toBe(fixedSetCount(WITHOUT.units, mockOptionsOf(WITHOUT)));
    expect(drawSelfCheck(WITH.units[0].check, 10, seededRandom('s'))).toEqual(drawSelfCheck(WITHOUT.units[0].check, 10, seededRandom('s')));
    for (const k of ['set1', 'random'] as const) expect(buildMock(WITH.units, k, { ...opts, seed: 'r2' }).items.some((q) => q.set === 'mid')).toBe(false);
  });
  it('오답 모의고사: 오답노트의 중간점검 문항은 빼고 낸다', () => {
    const p = buildMock(WITH.units, 'wrong', { ...mockOptionsOf(WITH), wrongIds: ['U1-m1-q1', 'U1-b1', 'U1-m2-q4'], seed: 'w' });
    expect(p.items.map((q) => q.id)).toEqual(['U1-b1']);
  });
  it('단원의 기초·실력점검 문항 수는 그대로(중간점검은 u.mids에 따로)', () => {
    expect(WITH.units.map((u) => [u.basic.length, u.check.length])).toEqual(WITHOUT.units.map((u) => [u.basic.length, u.check.length]));
  });
});

describe('선생님 화면: 단원별 중간점검 마친 수', () => {
  const s1 = markMid(markMid(emptyCgState(), 'U1', 'U1-m1', cardIds, midIds, T(1)).state, 'U2', 'U2-m2', [], ['U2-m1', 'U2-m2'], T(2)).state;
  const s2: CgState = { ...emptyCgState(), cards: { 'U1-m1': T(1), 'U1-m2': T(1) } };
  const students = toStudents([
    { user_id: '1', name: '가', email: 'a@x.example', state: s1, updated_at: T(3) },
    { user_id: '2', name: '나', email: 'b@x.example', state: s2, updated_at: T(3) },
  ], WITH);
  it('학생별·단원별 마친 묶음 수, 반 평균 / 묶음 수', () => {
    expect(students.map((s) => [s.mids.U1, s.mids.U2, s.mids.U3])).toEqual([[1, 1, 0], [2, 0, 0]]);
    const u = unitClassStats(students, WITH);
    expect(u.map((x) => [x.midTotal, x.midAvg])).toEqual([[2, 1.5], [2, 0.5], [0, 0]]);
    const d = studentDetail(students[0], WITH);
    expect(d.units.map((x) => [x.mids, x.midsTotal])).toEqual([[1, 2], [1, 2], [0, 0]]);
  });
});

/* ---------------- 데이터베이스 ---------------- */

const preState = (): LearnerState => ({ ...emptyLearnerState('t'), pre: { status: 'skipped', answers: {}, score: 0 } });

describe('데이터베이스 1단계: 카드 + 중간점검', () => {
  const cards = stageItemIds('U04', 1);
  const mids = stageMidIds('U04');
  it('카드 수로 계산한 묶음 ID(콘텐츠 규칙과 같음)', () => {
    expect(cards).toHaveLength(7);
    expect(mids).toEqual(['U04-m1', 'U04-m2']);
  });
  it('카드를 다 마쳐도 중간점검이 남으면 통과 아님, 묶음을 마치면 통과(되돌리지 않음)', () => {
    let s = preState();
    for (const c of cards) s = markStageItem(s, 'U04', 1, c, T(1), mids).state;
    expect(stagePassed(s, 'U04', 1)).toBe(false);
    expect(s.stages?.U04?.s1).toMatchObject({ best: 7, total: 7 });
    expect(stage1Progress(s, 'U04', mids)).toEqual({ cards: 7, cardsTotal: 7, mids: 0, midsTotal: 2 });
    s = markStageMid(s, 'U04', 'U04-m1', mids, T(2)).state;
    const r = markStageMid(s, 'U04', 'U04-m2', mids, T(3));
    expect(r).toMatchObject({ stageDone: true, firstPass: true });
    expect(r.state.stages?.U04?.s1?.passedAt).toBe(T(3));
    expect(markStageMid(r.state, 'U04', 'U04-m2', mids, T(4)).firstPass).toBe(false);
  });
  it('예전 규칙으로 통과한 학생: 통과 그대로(중간점검은 연습)', () => {
    let s = preState();
    for (const c of cards) s = markStageItem(s, 'U04', 1, c, T(1)).state; // 중간점검 콘텐츠가 오기 전
    expect(stagePassed(s, 'U04', 1)).toBe(true);
    s = markStageItem(s, 'U04', 1, cards[0], T(5), mids).state;
    expect(stagePassed(s, 'U04', 1)).toBe(true);
    expect(stagePassed(mergeLearnerStates(s, preState()), 'U04', 1)).toBe(true);
  });
  it('기록 읽기: 마친 항목은 이 과정 단원의 카드·예제·묶음 ID만', () => {
    expect(sanitizeStageItems({ 'U04-t1': T(1), 'U04-m2': T(2), 'U04-p3': T(3), 'U13-m1': T(1), 'U04-x1': T(1), 'U04-m1': 5, constructor: T(1) }))
      .toEqual({ 'U04-t1': T(1), 'U04-m2': T(2), 'U04-p3': T(3) });
    expect(sanitizeStageItems(null)).toEqual({});
    const m = mergeLearnerStates({ ...preState(), stageItems: { 'U04-m1': T(5), junk: T(1) } }, { ...preState(), stageItems: { 'U04-m1': T(2) } });
    expect(m.stageItems).toEqual({ 'U04-m1': T(2) });
  });
  it('5번 잠김 단원 초기화는 그 단원의 묶음 마침도 지운다(다른 단원 그대로)', () => {
    let s: LearnerState = { ...preState(), stageItems: { 'U04-t1': T(1), 'U04-m1': T(1), 'U05-m1': T(1) } };
    for (let i = 0; i < UNIT_LOCK_LIMIT; i++) s = addUnitLock(s, 'U04', T(10 + i)).state;
    expect(s.stageItems).toEqual({ 'U05-m1': T(1) });
    expect(mergeLearnerStates({ ...preState(), stageItems: { 'U04-m1': T(1) } }, resetUnitProgress(preState(), 'U04', T(30))).stageItems).toEqual({});
  });
  it('중간점검에서 틀린 문항은 오답 복습(wrongLog)에 카드 제목으로, 1단계로 이어지는 링크', () => {
    const s = recordStageMiss(preState(), 'U04-m1-q3', ['비교 연산'], T(1));
    expect(s.wrongLog).toEqual([{ itemId: 'U04-m1-q3', conceptTags: ['비교 연산'], at: T(1) }]);
    expect(recordStageMiss(preState(), 'U04-m1-q3', [], T(1)).wrongLog[0].conceptTags).toEqual(['중간점검']);
    expect(midQuestionUnit('U04-m1-q3')).toBe('U04');
    expect(midQuestionUnit('U13-m1-q3')).toBeNull();
    expect(midQuestionUnit('U04-Q01')).toBeNull();
  });
});

describe('선생님 실시간 위치: N단원 · 중간점검 k/10', () => {
  const on = { visible: true, hasFocus: true, idle: false, fs: true, sharing: false, dev: 'd', session: null };
  it('단원 × 5단계 과목 1단계와 데이터베이스 1단계', () => {
    expect(buildLiveState({ path: '/computer/unit/U3/1', detail: '중간점검 4/10', ...on })).toMatchObject({ label: '3단원 · 중간점검 4/10', detail: null, step: '1' });
    expect(buildLiveState({ path: '/network/unit/U12/1', detail: '중간점검 0/10', ...on })).toMatchObject({ label: '12단원 · 중간점검 0/10', detail: null });
    expect(buildLiveState({ path: '/learn/U04/stage/1', detail: '중간점검 10/10', ...on })).toMatchObject({ label: '4단원 · 중간점검 10/10', detail: null, step: 'stage:1' });
    // 다른 단계·다른 위치 글은 그대로
    expect(buildLiveState({ path: '/computer/unit/U3/1', detail: '카드 2/14', ...on })).toMatchObject({ label: '3단원 · 1단계 이론·개념 맞추기', detail: '카드 2/14' });
    expect(buildLiveState({ path: '/computer/unit/U3/3', detail: '중간점검 4/10', ...on })).toMatchObject({ label: '3단원 · 3단계 기초 객관식', detail: '중간점검 4/10' });
  });
});

describe('예전 형식 카드(뜻 3개)·묶음 없는 단원도 그대로', () => {
  it('통과 단계 수·1단계 진행', () => {
    const s = markDone(emptyCgState(), 'U3', 1, T(1));
    expect(passedCount(s, WITH)).toBe(1);
    expect(level1Progress(s, WITH.units[2])).toEqual({ cards: 0, cardsTotal: 6, mids: 0, midsTotal: 0 });
    expect(WITH.unitIds).toEqual(['U1', 'U2', 'U3'] satisfies CgUnitId[]);
  });
});

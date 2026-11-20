// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MidCheck } from '../../src/components/MidCheck';
import { normalizeMatch, startMidRun, type MidItem } from '../../src/lib/concepts';
import { CG_COURSE } from '../../src/features/computer/content';
import { emptyCgState, isPassed, itemDone, markCard, markMid, mergeCgStates } from '../../src/features/computer/model';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const bank: MidItem[] = Array.from({ length: 12 }, (_, i) => ({ id: `U3-m1-q${i + 1}`, question: `질문 ${i + 1}`, options: ['가', '나', '다', '라'], answer: 0, explanation: '해설입니다.' }));

describe('중간점검 화면: 잠긴 묶음', () => {
  it('카드를 다 마치지 않은(잠긴) 묶음은 남은 풀이가 있어도 열지 않고 그 풀이를 지운다(다른 기기에서 단원 초기화 뒤)', () => {
    const key = 'sqlforest:v1:guest:net:run:U3:mid:U3-m1';
    localStorage.setItem(key, JSON.stringify(startMidRun('U3-m1', bank)));
    const onComplete = vi.fn();
    render(<MidCheck groupId="U3-m1" bank={bank} title="중간점검 1" cardTitles={['가', '나', '다']} status="locked" storageKey={key} onAnswer={() => {}} onComplete={onComplete} />);
    expect(screen.getByText(/모두 마치면 열려요/)).toBeTruthy();
    expect(document.querySelector('h3.cg-q')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('개념 맞추기 원본: 화면에서 똑같아 보이는 용어는 하나로', () => {
  it('앞뒤·연속 공백만 다른 용어·함정은 겹친 것으로 보고, 보여 줄 때는 다듬은 글자를 쓴다', () => {
    const m = normalizeMatch({ level: 'mid', pairs: [{ term: 'T0', desc: '뜻 하나' }, { term: 'T0 ', desc: '뜻 둘' }, { term: ' 키  값 ', desc: '뜻 셋' }], distractors: ['T0', '키 값', ' D1 '] })!;
    expect(m.pairs.map((p) => p.term)).toEqual(['T0', '키  값']);
    expect(m.distractors).toEqual(['D1']);
  });
});

describe('두 기기에서 나눠 마친 1단계', () => {
  it('합친 뒤 카드·중간점검이 다 끝났으면 마친 묶음을 다시 표시하는 것(markMid)만으로 1단계가 통과로 남는다', () => {
    const u = CG_COURSE.unitById('U1')!;
    const ids = u.cards.map((c) => c.id);
    const mids = u.mids.map((g) => g.id);
    let a = emptyCgState();
    for (const id of ids) a = markCard(a, 'U1', id, ids, '2026-11-17T00:00:01.000Z', mids).state;
    for (const g of mids.slice(0, -1)) a = markMid(a, 'U1', g, ids, mids, '2026-11-17T00:00:02.000Z').state;
    let b = emptyCgState();
    const last = u.mids[u.mids.length - 1];
    for (const id of last.cards) b = markCard(b, 'U1', id, ids, '2026-11-17T00:00:03.000Z', mids).state;
    b = markMid(b, 'U1', last.id, ids, mids, '2026-11-17T00:00:04.000Z').state;
    const m = mergeCgStates(a, b, CG_COURSE);
    expect([...ids, ...mids].every((id) => itemDone(m, id))).toBe(true);
    expect(isPassed(m, 'U1', 1)).toBe(false);
    const fixed = markMid(m, 'U1', last.id, ids, mids, '2026-11-20T00:00:00.000Z').state;
    expect(isPassed(fixed, 'U1', 1)).toBe(true);
    expect(itemDone(fixed, last.id)).toBe(true);
  });
});

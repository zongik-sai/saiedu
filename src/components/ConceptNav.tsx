import { conceptSequence, midStatus, sameView, type ConceptView, type MidStatus } from '../lib/concepts';

const MID_STATUS_TEXT: Record<MidStatus, string> = { locked: '카드를 다 마치면 열려요', due: '풀 차례', done: '완료', practice: '연습 가능' };

/** 'N번째 중간점검 · 카드 a~b'(카드 번호는 1부터) */
export function midTitle(gi: number, cardIds: readonly string[], g: { cards: readonly string[] }) {
  const nums = g.cards.map((c) => cardIds.indexOf(c) + 1).filter((n) => n > 0);
  const range = nums.length ? (nums.length > 1 ? `카드 ${Math.min(...nums)}~${Math.max(...nums)}` : `카드 ${nums[0]}`) : '';
  return `중간점검 ${gi + 1}${range ? ` · ${range}` : ''}`;
}

/**
 * 1단계 카드 고르기 줄(두 엔진 공통): 카드 번호 버튼 사이사이, 묶음의 마지막 카드 뒤에 중간점검 표시('점검').
 * 중간점검은 그 묶음의 카드를 모두 마치면 누를 수 있다(풀 차례·완료·연습 가능).
 */
export function ConceptNav({ cardIds, groups, view, isDone, passed, go }: {
  cardIds: readonly string[];
  groups: readonly { id: string; cards: readonly string[] }[];
  view: ConceptView;
  isDone: (id: string) => boolean;
  passed: boolean;
  go: (v: ConceptView) => void;
}) {
  const seq = conceptSequence(cardIds, groups);
  const cardsN = cardIds.filter(isDone).length;
  const midsN = groups.filter((g) => isDone(g.id)).length;
  return (
    <div className="cg-card-nav" role="group" aria-label={groups.length ? '카드·중간점검 고르기' : '카드 고르기'}>
      {seq.map((v) => {
        const cur = sameView(v, view);
        if (v.kind === 'card') {
          const id = cardIds[v.idx];
          return (
            <button key={id} type="button" className={`cg-card-dot${cur ? ' cur' : ''}${isDone(id) ? ' done' : ''}`} aria-current={cur ? 'step' : undefined} aria-label={`${v.idx + 1}번 카드${isDone(id) ? ' (맞추기 완료)' : ''}`} onClick={() => go(v)}>
              {isDone(id) ? '✓' : v.idx + 1}
            </button>
          );
        }
        const g = groups[v.gi];
        const st = midStatus(g, isDone, passed);
        return (
          <button key={g.id} type="button" className={`cg-mid-dot ${st}${cur ? ' cur' : ''}`} aria-current={cur ? 'step' : undefined} disabled={st === 'locked'}
            aria-label={`${midTitle(v.gi, cardIds, g)}: ${MID_STATUS_TEXT[st]}`} title={`${midTitle(v.gi, cardIds, g)}: ${MID_STATUS_TEXT[st]}`} onClick={() => go(v)}>
            {st === 'done' ? '점검 ✓' : '점검'}
          </button>
        );
      })}
      <span className="small muted">맞춘 카드 {cardsN}/{cardIds.length}{groups.length ? ` · 중간점검 ${midsN}/${groups.length}` : ''}</span>
    </div>
  );
}

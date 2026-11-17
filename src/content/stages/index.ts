import U01 from './U01.json' with { type: 'json' };
import U02 from './U02.json' with { type: 'json' };
import U03 from './U03.json' with { type: 'json' };
import U04 from './U04.json' with { type: 'json' };
import U05 from './U05.json' with { type: 'json' };
import U06 from './U06.json' with { type: 'json' };
import U07 from './U07.json' with { type: 'json' };
import U08 from './U08.json' with { type: 'json' };
import U09 from './U09.json' with { type: 'json' };
import U10 from './U10.json' with { type: 'json' };
import U11 from './U11.json' with { type: 'json' };
import U12 from './U12.json' with { type: 'json' };
import { adaptMids, normalizeMatch } from '../../lib/concepts';
import type { UnitId } from '../types';
import type { PracticeItem, StageCard, StageMidQuiz, StageQuiz, UnitStages } from './types';

export type { PracticeItem, StageCard, StageCardMatch, StageMatch, StageMidGroup, StageMidQuiz, StageQuiz, StageTable, UnitStages } from './types';

/** 원본 단원(JSON 그대로: 카드 match는 새 형식·예전 형식, mid는 있을 수도 없을 수도) */
interface RawStages {
  unit: UnitId;
  cards?: (Omit<StageCard, 'match'> & { match?: unknown })[];
  quiz?: StageQuiz[];
  practice?: PracticeItem[];
  mid?: unknown;
}

const arr = <T,>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : []);

/** 원본 → 앱 형태. 다른 작업이 쓰는 중인 단원도 멈추지 않게 빠진 배열은 비운다 */
export function adaptStages(raw: RawStages): UnitStages {
  const cards = arr(raw.cards).map((c): StageCard => {
    const m = normalizeMatch(c.match);
    return { id: c.id, title: c.title ?? '', points: arr(c.points), ...(c.table ? { table: c.table } : {}), ...(c.tip ? { tip: c.tip } : {}), ...(m ? { match: m } : {}) };
  });
  const mids = adaptMids(raw.mid, `${raw.unit}-`, cards.map((c) => c.id), (q, id, card): StageMidQuiz => ({
    id, question: q.q, ...(q.code ? { code: q.code } : {}), options: q.o, answer: q.a, explanation: q.exp, ...(card ? { card } : {}),
  }));
  return { unit: raw.unit, cards, quiz: arr(raw.quiz), practice: arr(raw.practice), mids };
}

const RAW = { U01, U02, U03, U04, U05, U06, U07, U08, U09, U10, U11, U12 } as unknown as Record<UnitId, RawStages>;

export const UNIT_STAGES: Record<UnitId, UnitStages> = Object.fromEntries(
  (Object.keys(RAW) as UnitId[]).map((u) => [u, adaptStages(RAW[u])]),
) as Record<UnitId, UnitStages>;

export { quizNeed, STAGE_COUNTS } from './meta';

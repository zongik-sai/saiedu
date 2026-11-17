import { useLearner } from '../../app/LearnerContext';
import type { UnitId } from '../../content/types';
import { stage1Progress, stageOpen, stagePassed, type StageNo } from '../progress/model';

/** 단원 단계 상태 표시(통과·잠김·최고 점수·열림). midIds: 1단계 중간점검 묶음(콘텐츠를 알 때만, 진행 표시에 '점검 a/b') */
export function StageStatus({ unitId, n, midIds }: { unitId: UnitId; n: StageNo; midIds?: readonly string[] | null }) {
  const { state } = useLearner();
  if (stagePassed(state, unitId, n)) {
    const r = n === 4 ? undefined : state.stages?.[unitId]?.[`s${n}` as 's1'];
    return <span className="badge badge-exec">통과{r?.best !== undefined && n === 2 ? ` ${r.best}/${r.total}` : ''}</span>;
  }
  if (!stageOpen(state, unitId, n)) return <span className="badge badge-plain">잠김</span>;
  if (n === 1 && midIds?.length) {
    const p = stage1Progress(state, unitId, midIds);
    if (p.cards > 0 || p.mids > 0) return <span className="badge badge-sim">카드 {p.cards}/{p.cardsTotal} · 점검 {p.mids}/{p.midsTotal}</span>;
  }
  const r = n === 4 ? undefined : state.stages?.[unitId]?.[`s${n}` as 's1'];
  if (r?.best !== undefined) return <span className="badge badge-sim">{n === 2 ? `최고 ${r.best}/${r.total}` : `${r.best}/${r.total}`}</span>;
  return <span className="badge badge-dialect">열림</span>;
}


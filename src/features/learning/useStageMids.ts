import { useEffect, useState } from 'react';
import type { UnitId } from '../../content/types';

/**
 * 단원의 1단계 중간점검 묶음 ID(콘텐츠에서). 단원 화면은 단계 콘텐츠(JSON)를 처음부터 내려받지 않으므로
 * 단계 화면과 같은 묶음 파일을 나중에 불러와 알려 준다(불러오기 전에는 null). 중간점검이 아직 없는 단원은 [].
 */
export function useStageMidIds(u: UnitId): string[] | null {
  const [ids, setIds] = useState<{ u: UnitId; ids: string[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void import('../../content/stages').then((m) => {
      if (alive) setIds({ u, ids: m.UNIT_STAGES[u]?.mids.map((g) => g.id) ?? [] });
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [u]);
  return ids && ids.u === u ? ids.ids : null;
}

import { useMemo, useState } from 'react';
import { MATCH_LEVEL_LABEL, normalizeMatch, shuffleWith, type MatchInput } from '../lib/concepts';

/** 개념 맞추기 원본: 새 형식(뜻 5개 + 난이도별 함정)·예전 형식(뜻 3개 + 함정 1개) 모두 */
export type MatchData = MatchInput;

/**
 * 카드 한 장의 개념 맞추기(두 엔진 공통, 데이터베이스 3단계 실습 맞추기도 같은 화면).
 * 용어 칸 하나(정답 용어 + 함정, 섞음)와 뜻 줄(빈칸)들: 뜻을 누르면(처음엔 첫 빈 줄이 골라져 있음) 그 줄이 골라지고,
 * 용어를 누르면 그 줄에 들어간 뒤 다음 빈 줄로 넘어간다. 용어는 한 줄에만(다른 줄에 있던 것은 옮김), 넣은 용어를 누르면 빠진다.
 * 확인: 맞힌 줄은 잠기고 틀린 줄만 다시 고른다. 모두 맞히면 끝(onDone).
 */
export function CardMatch({ id, match, onDone, title = '개념 맞추기', help }: { id: string; match: MatchInput; onDone: () => void; title?: string; help?: string }) {
  const m = useMemo(() => normalizeMatch(match) ?? { pairs: [], distractors: [] }, [match]);
  const rows = useMemo(() => shuffleWith(m.pairs), [m]);
  const terms = useMemo(() => shuffleWith([...m.pairs.map((p) => p.term), ...m.distractors]), [m]);
  /** 줄 번호 → 넣은 용어 */
  const [pick, setPick] = useState<Record<number, string>>({});
  /** 확인 결과(줄 번호 → 맞음). 바꾼 줄은 결과를 지운다 */
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [sel, setSel] = useState<number | null>(0);
  const [say, setSay] = useState('');
  const locked = (i: number) => checked[i] === true;
  const allOk = rows.length > 0 && rows.every((_, i) => checked[i] === true);
  const rowOf = (t: string) => {
    const k = Object.entries(pick).find(([, v]) => v === t)?.[0];
    return k === undefined ? -1 : Number(k);
  };
  /** from 다음부터(돌아서) 비어 있고 잠기지 않은 줄 */
  const nextEmpty = (p: Record<number, string>, from: number) => {
    for (let d = 1; d <= rows.length; d++) {
      const i = (from + d) % rows.length;
      if (!p[i] && !locked(i)) return i;
    }
    return null;
  };
  const unmark = (ck: Record<number, boolean>, ...is: number[]) => {
    const out = { ...ck };
    for (const i of is) if (out[i] === false) delete out[i];
    return out;
  };

  const choose = (i: number) => {
    if (allOk || locked(i)) return;
    setSel(i);
  };
  const place = (t: string) => {
    if (allOk) return;
    const target = sel !== null && !locked(sel) ? sel : nextEmpty(pick, -1);
    if (target === null) return setSay('빈 줄이 없어요. 바꿀 뜻을 먼저 누르세요.');
    const from = rowOf(t);
    if (from >= 0 && locked(from)) return;
    const p = { ...pick };
    if (from >= 0) delete p[from];
    p[target] = t;
    setPick(p);
    setChecked((ck) => unmark(ck, target, ...(from >= 0 ? [from] : [])));
    const nx = nextEmpty(p, target);
    setSel(nx);
    setSay(`${target + 1}번 뜻에 '${t}'를 넣었어요.${nx !== null ? ` 다음은 ${nx + 1}번 뜻이에요.` : ' 모두 채웠으면 확인을 누르세요.'}`);
  };
  const clear = (i: number) => {
    if (allOk || locked(i)) return;
    if (!pick[i]) return choose(i);
    const p = { ...pick };
    const t = p[i];
    delete p[i];
    setPick(p);
    setChecked((ck) => unmark(ck, i));
    setSel(i);
    setSay(`${i + 1}번 뜻에서 '${t}'를 뺐어요.`);
  };
  const check = () => {
    const res = Object.fromEntries(rows.map((r, i) => [i, pick[i] === r.term])) as Record<number, boolean>;
    setChecked(res);
    const wrong = rows.map((_, i) => i).filter((i) => !res[i]);
    if (!wrong.length) {
      setSay('모두 맞았어요!');
      onDone();
      return;
    }
    setSel(wrong[0]);
    // 틀린 수는 확인 버튼 옆 글(aria-live)이 알린다
    setSay('');
  };

  const wrongN = rows.filter((_, i) => checked[i] === false).length;
  const filled = rows.every((_, i) => !!pick[i]);
  const k = m.distractors.length;
  const helpText = help ?? `뜻 ${rows.length}개에 맞는 용어를 고르세요. 용어 ${terms.length}개 중 ${k ? `${k}개는 헷갈리게 넣은 함정이에요.` : '함정은 없어요.'}`;
  return (
    <section className="panel stack cg-match" aria-labelledby={`match-${id}`}>
      <div className="cg-match-head">
        <h3 id={`match-${id}`} style={{ margin: 0 }}>{title}</h3>
        {m.level && <span className={`badge cg-level cg-level-${m.level}`}><span className="sr-only">난이도 </span>{MATCH_LEVEL_LABEL[m.level]}</span>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{helpText}</p>
      <p className="small muted" style={{ margin: 0 }}>뜻을 누르고 아래 용어를 고르면 그 줄에 들어가요. 넣은 용어를 다시 누르면 빠져요.</p>
      <ol className="cg-match-rows">
        {rows.map((r, i) => {
          const st = checked[i];
          const t = pick[i];
          return (
            <li key={i} className={`${st === true ? 'ok' : st === false ? 'bad' : ''}${sel === i && !allOk ? ' sel' : ''}`}>
              <button type="button" className="cg-match-desc" aria-pressed={sel === i && !allOk} disabled={locked(i) || allOk} onClick={() => choose(i)}>
                <span className="cg-match-no" aria-hidden="true">{i + 1}</span>
                <span><span className="sr-only">{i + 1}번 뜻: </span>{r.desc}</span>
              </button>
              <button
                type="button"
                className={`cg-slot${t ? ' filled' : ''}`}
                disabled={locked(i) || allOk}
                aria-label={t ? `${i + 1}번 뜻에 넣은 용어: ${t}${st === true ? ' (맞음)' : st === false ? ' (틀림, 누르면 빼요)' : ' (누르면 빼요)'}` : `${i + 1}번 뜻의 용어 칸: 비어 있음`}
                onClick={() => clear(i)}
              >{t ?? '용어 고르기'}</button>
              {st === true && <span className="small cg-match-mark">✓ 맞았어요</span>}
              {st === false && <span className="small cg-match-mark">다시 골라 보세요. 카드에서 찾아봐도 돼요.</span>}
            </li>
          );
        })}
      </ol>
      {!allOk && (
        <div className="cg-match-bank" role="group" aria-label={`용어 ${terms.length}개`}>
          {terms.map((t, j) => {
            const at = rowOf(t);
            return (
              <button
                key={t}
                type="button"
                className={`cg-chip${at >= 0 ? ' used' : ''}`}
                aria-label={t}
                aria-describedby={at >= 0 ? `${id}-at-${j}` : undefined}
                disabled={at >= 0 && locked(at)}
                onClick={() => place(t)}
              >
                {at >= 0 && <span className="cg-chip-at" aria-hidden="true">{at + 1}</span>}
                {t}
                {at >= 0 && <span id={`${id}-at-${j}`} className="sr-only">{at + 1}번 뜻에 넣었어요</span>}
              </button>
            );
          })}
        </div>
      )}
      {!allOk && (
        <div className="row">
          <button className="btn btn-primary" disabled={!filled} onClick={check}>확인</button>
          <span className="small muted" aria-live="polite">{wrongN > 0 ? `${wrongN}개가 틀렸어요. 틀린 줄만 다시 고르고 확인을 누르세요.` : ''}</span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{say}</p>
    </section>
  );
}

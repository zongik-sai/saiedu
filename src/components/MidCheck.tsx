import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { answerMidRun, MID_DRAW, midRunDone, resumeMidRun, startMidRun, type MidItem, type MidRun, type MidStatus } from '../lib/concepts';
import { readJson, removeRaw, writeJson } from '../lib/storage';
import { CodeBlock, MARK } from '../features/computer/McqRunner';
import { useLiveDetail } from '../features/monitor/liveStore';

/**
 * 중간점검(두 엔진 공통): 카드 3장 묶음의 문제은행에서 10문항을 새로 뽑아 한 문제씩 풀고 바로 채점한다.
 * 틀리면 정답·해설을 보여 주고 그 문항을 맨 뒤로 보낸다(보기 순서를 다시 섞어 나중에 다시). 10문항을 모두 맞히면 끝.
 * 풀던 회차(뽑은 문항·남은 순서·맞힌 문항·보기 순서)는 storageKey에 저장해 새로고침해도 이어 푼다(마치면 지움).
 * 이미 마친 묶음(또는 1단계를 예전 규칙으로 통과해 연습으로 남은 묶음)은 '연습으로 다시 풀기': 새로 뽑고, 진도에는 영향 없음.
 */
export interface MidCheckProps<Q extends MidItem = MidItem> {
  groupId: string;
  bank: Q[];
  /** 'N번째 중간점검 · 카드 1~3' 같은 제목 */
  title: string;
  /** 이 묶음이 다루는 카드 제목(안내용) */
  cardTitles: string[];
  status: MidStatus;
  storageKey: string;
  /** 한 문항 채점(오답노트 기록용). 같은 문항을 다시 풀어 맞혀도 다시 부른다 */
  onAnswer: (q: Q, correct: boolean) => void;
  /** 뽑은 문항을 모두 맞힘. practice면 이미 마친 묶음의 연습(진도에 영향 없음) */
  onComplete: (practice: boolean) => void;
  /** 마친 뒤 보일 다음 할 일(버튼 등) */
  after?: ReactNode;
}

interface Feedback { qid: string; picked: number; order: number[]; correct: boolean }

export function MidCheck<Q extends MidItem>(p: MidCheckProps<Q>) {
  const total = Math.min(MID_DRAW, p.bank.length);
  const saved = useMemo(() => resumeMidRun(readJson<unknown>(p.storageKey, null), p.groupId, p.bank), [p.storageKey, p.groupId, p.bank]);
  // 풀 차례인 묶음은 바로 시작(새로 뽑거나 이어 풀기). 마친·연습 묶음은 안내 후 '연습으로 다시 풀기'(풀던 연습이 있으면 이어서)
  const [run, setRun] = useState<MidRun | null>(() => saved ?? (p.status === 'due' ? startMidRun(p.groupId, p.bank) : null));
  const [done, setDone] = useState<{ practice: boolean; missed: number } | null>(null);
  if (p.status === 'locked' && !run) {
    return (
      <section className="panel stack cg-mid" aria-labelledby={`mid-${p.groupId}`}>
        <h2 id={`mid-${p.groupId}`} style={{ margin: 0 }}>{p.title}</h2>
        <p style={{ margin: 0 }}>이 묶음의 카드({p.cardTitles.join(' · ')})를 모두 마치면 열려요.</p>
      </section>
    );
  }
  if (done) {
    return (
      <section className="notice notice-good stack cg-mid-done" aria-live="polite" style={{ margin: 0 }} data-testid="mid-done">
        <b>{p.title} 완료! {total}문항을 모두 맞혔어요.</b>
        <span>{done.missed > 0 ? `틀렸던 ${done.missed}문항도 해설을 읽고 다시 풀어 맞혔어요. 끝까지 해낸 거예요!` : '한 번도 틀리지 않고 다 맞혔어요. 정말 잘했어요!'}</span>
        {done.practice && <span className="small">연습으로 다시 푼 거라 진도에는 영향이 없어요.</span>}
        {p.after}
      </section>
    );
  }
  if (!run) {
    // 마친 묶음: 연습(진도에 영향 없음). 1단계를 예전 규칙으로 통과한 학생의 안 푼 묶음: 복습으로 풀면 '마침'으로만 남는다(통과는 그대로)
    const doneAlready = p.status === 'done';
    return (
      <section className="panel stack cg-mid" aria-labelledby={`mid-${p.groupId}`}>
        <h2 id={`mid-${p.groupId}`} style={{ margin: 0 }}>{p.title} <span className={`badge ${doneAlready ? 'badge-exec' : 'badge-dialect'}`}>{doneAlready ? '완료' : '연습 가능'}</span></h2>
        <p style={{ margin: 0 }}>
          {doneAlready ? `이미 마친 중간점검이에요. 다시 풀면 문제은행 ${p.bank.length}문항 중 ${total}문항을 새로 뽑아요(연습이라 진도에는 영향 없음).`
            : `1단계는 이미 통과했어요. 카드 ${p.cardTitles.length}장을 ${total}문항으로 복습해 볼 수 있어요(1단계 통과는 그대로예요).`}
        </p>
        <div className="row"><button className="btn btn-primary" onClick={() => setRun(startMidRun(p.groupId, p.bank, { practice: doneAlready }))}>{doneAlready ? '연습으로 다시 풀기' : '중간점검 풀기'}</button></div>
      </section>
    );
  }
  return <MidRunView {...p} run={run} setRun={setRun} total={total} onFinished={(practice, missed) => setDone({ practice, missed })} />;
}

function MidRunView<Q extends MidItem>(p: MidCheckProps<Q> & { run: MidRun; setRun: (r: MidRun) => void; total: number; onFinished: (practice: boolean, missed: number) => void }) {
  const { run } = p;
  const byId = useMemo(() => new Map(p.bank.map((q) => [q.id, q])), [p.bank]);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const finished = midRunDone(run);
  const qid = fb?.qid ?? run.queue[0];
  const q = qid ? byId.get(qid) : undefined;
  const order = fb?.order ?? (q ? run.orders[q.id] ?? q.options.map((_, i) => i) : []);
  const solved = run.solved.length;
  const missedN = Object.keys(run.misses).length;
  const again = q ? (run.misses[q.id] ?? 0) > 0 && !fb : false;
  useLiveDetail(`중간점검 ${solved}/${p.total}`);

  useEffect(() => {
    // 진행 상태 저장(마친 회차는 지움: 다시 들어오면 새로 뽑기)
    if (finished) removeRaw(p.storageKey);
    else writeJson(p.storageKey, run);
  }, [run, finished, p.storageKey]);
  // 새 문항이면 문항 제목으로, 채점 뒤에는 '다음 문제' 버튼으로 포커스(키보드·화면 읽기)
  const step = `${qid}:${fb ? 'fb' : 'q'}`;
  useEffect(() => {
    if (step.endsWith(':fb')) nextRef.current?.focus();
    else {
      setPick(null);
      headRef.current?.focus();
    }
  }, [step]);

  // 다른 초안(예: 모두 맞혔는데 저장만 남은 경우)
  if (!q) {
    return (
      <div className="stack">
        <p className="notice" style={{ margin: 0 }}>이 중간점검은 다 풀었어요.</p>
        <div className="row"><button className="btn btn-primary" onClick={() => p.onFinished(run.practice, missedN)}>결과 보기</button></div>
      </div>
    );
  }
  const pos = (orig: number) => order.indexOf(orig);
  const grade = () => {
    if (pick === null || fb) return;
    const correct = pick === q.answer;
    const next = answerMidRun(run, q.id, correct, q.options.length);
    setFb({ qid: q.id, picked: pick, order, correct });
    p.setRun(next);
    p.onAnswer(q, correct);
    // 마지막 문항을 맞힌 순간 마친 것으로 기록(결과 보기 전에 나가도 남게)
    if (midRunDone(next)) p.onComplete(next.practice);
  };
  const nextQ = () => {
    if (midRunDone(run)) return p.onFinished(run.practice, missedN);
    setFb(null);
  };
  return (
    <div className="stack cg-mid">
      <div className="cg-mid-head">
        <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{p.title}{run.practice && <span className="badge badge-plain" style={{ marginLeft: '0.4rem' }}>연습</span>}</h2>
        <p className="small muted" style={{ margin: 0 }}>카드 {p.cardTitles.length}장({p.cardTitles.join(' · ')})을 문제은행 {p.bank.length}문항 중 {p.total}문항으로 점검해요. 틀린 문항은 해설을 보고 뒤에서 다시 풀어요. {p.total}문항을 모두 맞히면 끝나요.</p>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="cg-mid-count"><b>맞힌 문항 {solved}/{p.total}</b>{run.queue.length > 0 && missedN > 0 ? <span className="small muted"> · 다시 풀 문항 {run.queue.filter((x) => run.misses[x]).length}</span> : null}</span>
        <div className="cg-progress" role="progressbar" aria-label="맞힌 문항" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={solved}><span style={{ width: `${(solved / p.total) * 100}%` }} /></div>
      </div>
      <div className="panel stack">
        {again && <span className="badge badge-sim" style={{ alignSelf: 'flex-start' }}>다시 나온 문항 · 보기 순서가 바뀌었어요</span>}
        <h3 ref={headRef} tabIndex={-1} className="cg-q" style={{ margin: 0 }}>{q.question}</h3>
        {q.code && <CodeBlock code={q.code} label="문제 코드" />}
        <fieldset disabled={!!fb}>
          <legend className="sr-only">보기</legend>
          <div className="options">
            {order.map((oi, k) => {
              const cls = !fb ? '' : oi === q.answer ? ' correct' : oi === fb.picked ? ' tried-wrong' : '';
              return (
                <label key={oi} className={`option${cls}`}>
                  <input type="radio" name={`mid-${q.id}`} checked={(fb ? fb.picked : pick) === oi} onChange={() => setPick(oi)} />
                  <span>{MARK[k]} {q.options[oi]}</span>
                  {fb && oi === q.answer && <span className="option-tag option-tag-good">정답</span>}
                  {fb && oi === fb.picked && oi !== q.answer && <span className="option-tag">고른 답</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        {!fb ? (
          <div className="row"><button className="btn btn-primary" disabled={pick === null} onClick={grade}>채점</button></div>
        ) : (
          <div className="stack" aria-live="polite">
            <p className={`notice ${fb.correct ? 'notice-good' : 'notice-warn'}`} style={{ margin: 0 }}>
              <b>{fb.correct ? '맞았어요.' : `틀렸어요. 정답은 ${MARK[pos(q.answer)]} ${q.options[q.answer]}이에요.`}</b> {q.explanation}
              {!fb.correct && <><br /><span className="small">이 문항은 뒤에서 보기 순서를 바꿔 다시 나와요.</span></>}
            </p>
            <div className="row">
              <button ref={nextRef} className="btn btn-primary" onClick={nextQ}>{midRunDone(run) ? '중간점검 마치기' : '다음 문제'}</button>
            </div>
          </div>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>풀던 중간점검은 이 기기에 저장돼요. 나갔다 와도 이어서 풀 수 있어요.</p>
    </div>
  );
}

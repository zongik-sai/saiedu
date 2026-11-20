import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { checkMatch5, checkMid, type RawMatch5, type RawMidGroup } from './conceptRules';

/**
 * 컴퓨터 일반 개념 맞추기·중간점검 원본 검사: content/cg/U<n>.json = { match: { 'U1-t1': … }, mid: [묶음…] }.
 * 단원 하나만: npx vitest run tests/unit/cgConcepts.test.ts -t "cg-U3 "
 */
interface RawCard { id: string; title: string; points: string[]; table?: { head: string[]; rows: string[][] }; tip?: string; code?: string }
const DIR = 'src/features/computer/content';
const units = JSON.parse(readFileSync(`${DIR}/pc_bank.json`, 'utf8')) as { unit: number; title: string; theory: RawCard[] }[];
const conceptOf = (n: number) => JSON.parse(readFileSync(`${DIR}/cg/U${n}.json`, 'utf8')) as { match: Record<string, RawMatch5>; mid: RawMidGroup[] };

for (const u of units) {
  const w = `cg-U${u.unit}`;
  describe(`${w} ${u.title}`, () => {
    const cc = conceptOf(u.unit);
    it(`${w} 개념 맞추기: 카드마다 뜻 5개 + 난이도별 함정`, () => {
      for (const t of u.theory) {
        const text = [t.title, ...t.points, t.tip ?? '', t.code ?? '', ...(t.table ? [...t.table.head, ...t.table.rows.flat()] : [])].join('\n');
        checkMatch5(cc.match[`U${u.unit}-${t.id}`], text, `${w}-${t.id}`);
      }
    });
    it(`${w} 중간점검: 카드 3장마다 문제은행`, () => {
      checkMid(cc.mid, u.theory.map((t) => t.id), w);
    });
  });
}

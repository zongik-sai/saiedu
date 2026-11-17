import c1 from './cg/U1.json' with { type: 'json' };
import c2 from './cg/U2.json' with { type: 'json' };
import c3 from './cg/U3.json' with { type: 'json' };
import c4 from './cg/U4.json' with { type: 'json' };
import c5 from './cg/U5.json' with { type: 'json' };
import c6 from './cg/U6.json' with { type: 'json' };
import c7 from './cg/U7.json' with { type: 'json' };
import c8 from './cg/U8.json' with { type: 'json' };
import raw from './pc_bank.json' with { type: 'json' };
import { makeCourse, type CourseConfig } from '../course';
import { CG_AREA_LABEL, CG_AREAS, type CgMcq, type CgUnit, type CgUnitId } from '../types';
import { adaptUnits, type RawUnit } from './adapt';

/**
 * 컴퓨터 일반 8단원 문제은행.
 * 원본: 선생님의 'PC정비사 자기학습' 페이지에 들어 있던 데이터(pc_bank.json, 형식 그대로 보관)를
 * 앱 표준 형태로 바꾼다. 문항 ID는 단원 안에서만 고유하므로 'U1-b1'처럼 단원을 붙인다.
 * 카드별 개념 맞추기·중간점검은 원본과 따로 단원별로 보관한다(cg/U<n>.json: match는 카드 ID 'U1-t1' 기준, mid는 카드 3장마다 문제은행).
 */
export function adaptBank(units: RawUnit[], matches: Record<string, unknown> = {}, mids: Record<string, unknown> = {}): CgUnit[] {
  // 모르는 영역은 예전처럼 '컴퓨터 일반(GEN)'으로
  return adaptUnits(units, { areas: CG_AREAS, fallbackArea: 'GEN', matches, mids });
}

/** 단원별 개념 원본(cg/U<n>.json, 순서 = 단원 1~8). match·mid는 다른 작업이 쓰는 중일 수 있어 형식 그대로 받는다 */
export const CG_CONCEPTS = [c1, c2, c3, c4, c5, c6, c7, c8] as unknown as { match?: Record<string, unknown>; mid?: unknown }[];
const matchRaw: Record<string, unknown> = Object.assign({}, ...CG_CONCEPTS.map((c) => (c && typeof c.match === 'object' ? c.match : {})));
/** 단원 ID → 그 단원 중간점검 원본(cg/U<n>.json의 mid, 짧은 ID) */
const midRaw: Record<string, unknown> = Object.fromEntries(CG_CONCEPTS.map((c, i) => [`U${i + 1}`, c?.mid]));

export const CG_UNITS: CgUnit[] = adaptBank(raw as unknown as RawUnit[], matchRaw, midRaw);

/** 컴퓨터 일반 과목 정의: 저장 키 'cg:'·cg_progress·모의고사 시드 'cg-mock-…'는 예전 그대로 */
export const CG_COURSE: CourseConfig = makeCourse({
  id: 'cg', name: '컴퓨터 일반', basePath: '/computer', units: CG_UNITS,
  areas: CG_AREAS.map((id) => ({ id, label: CG_AREA_LABEL[id] })),
  remote: { kind: 'cg' }, storage: 'cg', mockSeed: 'cg',
});

export const CG_UNIT_BY_ID: Partial<Record<CgUnitId, CgUnit>> = Object.fromEntries(CG_UNITS.map((u) => [u.id, u]));
/** 문항 찾기(없는 ID·'constructor' 같은 키는 undefined) */
export const mcqById = (id: string): CgMcq | undefined => CG_COURSE.mcqById(id);

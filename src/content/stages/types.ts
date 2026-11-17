import type { CardMatchData, LegacyMatch, MidGroup } from '../../lib/concepts';
import type { DatasetId, UnitId } from '../types';

/**
 * 데이터베이스 단원 단계 콘텐츠(2026-10-15 구조 개편).
 * 1단계 이론·개념 맞추기(cards, 카드 3장마다 중간점검 mids) · 2단계 개념 점검 문제(quiz) · 3단계 실습 설명·실습 맞추기(practice) · 4단계 실습 점검(기존 활동·체크포인트)
 * 단원별 JSON(src/content/stages/Uxx.json)에 보관하며 ID는 'U01-t1'·'U01-c1'·'U01-p1'·'U01-m1'(-q1)처럼 안정적으로 둔다.
 * 원본 JSON은 index.ts가 앱 형태로 바꾼다(개념 맞추기 새·예전 형식 → CardMatchData, mid → mids).
 */

/** 3단계 실습 맞추기: SQL 조각 3개 ↔ 역할 + 함정 1개(예전 형식 그대로) */
export type StageMatch = LegacyMatch;

/** 1단계 카드의 개념 맞추기(앱 형태): 새 형식 뜻 5개 + 난이도별 함정, 예전 형식 뜻 3개 + 함정 1개(level 없음) */
export type StageCardMatch = CardMatchData;

export interface StageTable {
  header: string[];
  rows: string[][];
}

export interface StageCard {
  id: string;
  title: string;
  points: string[];
  table?: StageTable;
  tip?: string;
  /** 원본이 깨졌거나 쓰는 중이면 없음('다 읽었어요'만) */
  match?: StageCardMatch;
}

export interface StageQuiz {
  id: string;
  question: string;
  options: string[];
  /** 정답 번호(0부터) */
  answer: number;
  explanation: string;
  /** 개념 이름(오답 복습 묶음용) */
  tag: string;
}

/** 중간점검 문항(1단계, 묶음 문제은행). 객관식 공통 모양 + 다루는 카드 */
export interface StageMidQuiz {
  id: string;
  question: string;
  code?: string;
  options: string[];
  answer: number;
  explanation: string;
  /** 다루는 카드 ID('U01-t2') */
  card?: string;
}

/** 중간점검 묶음: 'U01-m1', 카드 3장(남으면 2·4장), 문제은행 */
export type StageMidGroup = MidGroup<StageMidQuiz>;

export interface PracticeItem {
  id: string;
  title: string;
  /** 이 예제로 익힐 것(한 문장) */
  goal: string;
  dataset: DatasetId;
  sql: string;
  /** false면 SQLite에서 실행하지 않는 문법 비교 예제 */
  run: boolean;
  /** 실행 결과를 읽는 순서대로 설명 */
  steps: string[];
  /** SQL 조각 ↔ 역할 맞추기(용어는 sql 안의 조각 그대로) */
  match: StageMatch;
}

export interface UnitStages {
  unit: UnitId;
  cards: StageCard[];
  quiz: StageQuiz[];
  practice: PracticeItem[];
  /** 카드 3장마다 중간점검(원본에 mid가 아직 없는 단원은 빈 배열 → 예전처럼 카드만으로 1단계 통과) */
  mids: StageMidGroup[];
}

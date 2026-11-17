import { expect, type Page } from '@playwright/test';

/**
 * 개념 맞추기·중간점검을 화면 조작으로 푸는 공통 도우미(정답은 콘텐츠 데이터에서 읽는다).
 * 개념 맞추기는 예전 형식(뜻 3개 + 함정 1개)·새 형식(뜻 5개 + 난이도별 함정) 모두 같은 화면(용어 칸 하나 + 뜻 줄)이고,
 * 중간점검은 콘텐츠에 mid가 있는 단원에만 있다. 그래서 단원 콘텐츠가 어느 형식이든 그대로 쓸 수 있다.
 */
export interface MatchLike { pairs: { term: string; desc: string }[]; distractors?: string[] }
export interface MidQLike { id: string; question: string; options: string[]; answer: number }
export interface MidGroupLike { id: string; cards: string[]; bank: MidQLike[] }

/** 뜻 줄(설명 글자로 찾음) */
export const matchRow = (page: Page, desc: string) => page.locator('.cg-match-rows li').filter({ has: page.locator('.cg-match-desc', { hasText: desc }) });
/** 용어 칸의 용어 */
export const bankChip = (page: Page, term: string) => page.locator('.cg-match-bank').getByRole('button', { name: term, exact: true });

/** 한 줄: 뜻을 누르고 용어를 고른다 */
export async function placeTerm(page: Page, desc: string, term: string) {
  await matchRow(page, desc).locator('.cg-match-desc').click();
  await bankChip(page, term).click();
}

/** 개념 맞추기를 모두 맞히고 확인(용어 수 = 뜻 + 함정인지도 확인) */
export async function solveMatch(page: Page, m: MatchLike, opts: { check?: boolean } = {}) {
  await expect(page.locator('.cg-match-rows li')).toHaveCount(m.pairs.length);
  if (m.distractors) await expect(page.locator('.cg-match-bank button')).toHaveCount(m.pairs.length + m.distractors.length);
  for (const p of m.pairs) await placeTerm(page, p.desc, p.term);
  if (opts.check !== false) await page.getByRole('button', { name: '확인', exact: true }).click();
}

/** 보기 글자로 고른다(보기 순서는 섞임) */
async function pickOption(page: Page, text: string) {
  const opts = page.locator('.cg-mid .options .option');
  const idx = await page.locator('.cg-mid .options .option > span:not(.option-tag)').evaluateAll(
    (els, t) => els.findIndex((e) => (e.textContent ?? '').replace(/^[①②③④⑤]\s/, '') === t), text);
  expect(idx, text).toBeGreaterThanOrEqual(0);
  await opts.nth(idx).click();
}

/** 지금 문항(제목 글자로 문제은행에서 찾음) */
const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
export async function currentMidQ(page: Page, bank: MidQLike[]): Promise<MidQLike> {
  const text = squash(await page.locator('.cg-mid h3.cg-q').innerText());
  const q = bank.find((x) => squash(x.question) === text);
  expect(q, `문제은행에 없는 문항: ${text}`).toBeTruthy();
  return q!;
}

/** 지금 문항에 답한다(right=false면 일부러 틀림). 채점 후 '다음 문제'·'중간점검 마치기'는 누르지 않는다 */
export async function answerMid(page: Page, bank: MidQLike[], right: boolean): Promise<MidQLike> {
  const q = await currentMidQ(page, bank);
  await pickOption(page, q.options[right ? q.answer : (q.answer + 1) % q.options.length]);
  await page.getByRole('button', { name: '채점' }).click();
  return q;
}

/**
 * 중간점검을 끝까지 푼다. wrongFirst: 첫 문항은 일부러 틀리고(정답·해설·'다시 나와요' 확인) 그 문항이 뒤에서 다시 나오는지 확인.
 * 반환: 틀렸던 문항 ID(없으면 null)
 */
export async function solveMid(page: Page, bank: MidQLike[], opts: { wrongFirst?: boolean; total?: number } = {}): Promise<string | null> {
  const total = opts.total ?? Math.min(10, bank.length);
  let missed: string | null = null;
  let seenAgain = false;
  for (let guard = 0; guard < total * 3; guard++) {
    if (await page.getByTestId('mid-done').count()) break;
    const wrong = !!opts.wrongFirst && missed === null;
    const q = await answerMid(page, bank, !wrong);
    if (wrong) {
      missed = q.id;
      await expect(page.locator('.cg-mid .notice-warn')).toContainText('틀렸어요. 정답은');
      await expect(page.locator('.cg-mid .notice-warn')).toContainText('뒤에서 보기 순서를 바꿔 다시 나와요');
    } else if (q.id === missed) seenAgain = true;
    await page.getByRole('button', { name: /^(다음 문제|중간점검 마치기)$/ }).click();
  }
  await expect(page.getByTestId('mid-done')).toBeVisible();
  if (missed) expect(seenAgain, '틀린 문항이 뒤에서 다시 나와야 함').toBe(true);
  return missed;
}

export interface Level1Like { cards: { id: string; title: string; match?: MatchLike }[]; mids: MidGroupLike[] }

/** 카드 번호 줄에서 카드로 간다 */
export const goCard = (page: Page, i: number) => page.locator('.cg-card-nav').getByRole('button', { name: new RegExp(`^${i + 1}번 카드`) }).click();

/**
 * 1단계를 카드 순서대로 푼다: 카드마다 개념 맞추기(없으면 '다 읽었어요'), 묶음의 마지막 카드를 마치면
 * 알림의 '중간점검 시작'으로 중간점검을 끝까지. from: 이 카드부터(앞 카드는 이미 마침), to: 이 카드 앞까지
 */
export async function solveLevel1(page: Page, u: Level1Like, opts: { from?: number; to?: number } = {}) {
  const from = opts.from ?? 0;
  const to = opts.to ?? u.cards.length;
  for (let i = from; i < to; i++) {
    const c = u.cards[i];
    await goCard(page, i);
    await expect(page.locator('.cg-card h2')).toContainText(c.title);
    if (c.match) {
      await page.getByRole('button', { name: /^(다 읽었어요 → 개념 맞추기|개념 맞추기 다시 하기)$/ }).click();
      await solveMatch(page, c.match);
    } else await page.getByRole('button', { name: '다 읽었어요', exact: true }).click();
    const g = u.mids.find((x) => x.cards[x.cards.length - 1] === c.id);
    if (g) {
      await page.getByRole('button', { name: /^중간점검 시작/ }).click();
      await solveMid(page, g.bank);
    }
  }
}

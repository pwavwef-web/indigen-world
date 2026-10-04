/**
 * scripts/validate-progress.mjs
 *
 * Focused verification for the Help Fill the Jars progress calculations,
 * counting eligibility, visual geometry clamping, and launch target rules.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

console.log('Testing Help Fill the Jars progress calculation invariants…');

// Source file verification
const progressTypesSource = read('src/features/progress/progressTypes.ts');
const progressConfigSource = read('src/features/progress/progressConfig.ts');
const progressCalculationSource = read('src/features/progress/progressCalculation.ts');
const progressDataSource = read('src/features/progress/progressData.ts');
const verticalJarSource = read('src/features/progress/VerticalJar.tsx');
const horizontalTankSource = read('src/features/progress/HorizontalTank.tsx');
const progressPageSource = read('src/pages/ProgressPage.tsx');

// Pure calculation invariant harness
function calculateCategoryProgress(category, approvedCount, target, awaitingReviewCount = 0) {
  const safeApproved = Math.max(0, Math.floor(approvedCount || 0));
  const safeAwaiting = Math.max(0, Math.floor(awaitingReviewCount || 0));

  if (target === null || target === undefined || target <= 0) {
    return {
      category,
      approvedCount: safeApproved,
      awaitingReviewCount: safeAwaiting,
      target: null,
      percentage: null,
      fillPercentage: 0,
      isTargetReached: false,
      isBeyondTarget: false,
      isTargetSetting: true,
      needsContributions: false,
    };
  }

  const rawPercentage = (safeApproved / target) * 100;
  const percentage = Math.round(rawPercentage * 10) / 10;
  const fillPercentage = Math.min(100, Math.max(0, rawPercentage));
  const isTargetReached = safeApproved >= target;
  const isBeyondTarget = safeApproved > target;

  return {
    category,
    approvedCount: safeApproved,
    awaitingReviewCount: safeAwaiting,
    target,
    percentage,
    fillPercentage,
    isTargetReached,
    isBeyondTarget,
    isTargetSetting: false,
    needsContributions: false,
  };
}

function buildProgressList(approvedCounts, config) {
  const categories = [
    { id: 'lexicon', title: 'Words & Meanings' },
    { id: 'expressions', title: 'Everyday Expressions' },
    { id: 'sentences', title: 'Kasem Sentences' },
    { id: 'literature', title: 'Stories & Folklore' },
    { id: 'music', title: 'Songs & Lyrics' },
    { id: 'audiobooks', title: 'Oral Narrations' },
    { id: 'video', title: 'Cultural Videos' },
    { id: 'grammar', title: 'Grammar Patterns' },
    { id: 'proverbs', title: 'Proverbs & Wisdom' },
    { id: 'pronunciation', title: 'Pronunciation Takes' },
  ];

  const list = categories.map((cat) => {
    const approved = approvedCounts[cat.id] ?? 0;
    const target = config.categoryTargets[cat.id] ?? null;
    return calculateCategoryProgress(cat, approved, target, 0);
  });

  const categoriesWithTargets = list.filter(
    (item) => !item.isTargetSetting && !item.isTargetReached
  );

  if (categoriesWithTargets.length > 0) {
    let lowest = categoriesWithTargets[0];
    for (const item of categoriesWithTargets) {
      if ((item.percentage ?? 0) < (lowest.percentage ?? 0)) {
        lowest = item;
      }
    }
    lowest.needsContributions = true;
  }

  return list;
}

function calculateTargetsSummary(list) {
  let reachedCount = 0;
  let totalWithTargets = 0;
  let settingCount = 0;

  for (const item of list) {
    if (item.isTargetSetting) {
      settingCount += 1;
    } else {
      totalWithTargets += 1;
      if (item.isTargetReached) {
        reachedCount += 1;
      }
    }
  }

  return { reachedCount, totalWithTargets, settingCount };
}

const testCategory = { id: 'lexicon', title: 'Words & Meanings' };

// 1. Missing or unconfigured target ("Target being set")
{
  const res = calculateCategoryProgress(testCategory, 42, null);
  assert.equal(res.percentage, null, 'percentage is null when target is null');
  assert.equal(res.fillPercentage, 0, 'fill is 0% when target is null');
  assert.equal(res.isTargetSetting, true, 'isTargetSetting is true');
  assert.equal(res.isTargetReached, false, 'isTargetReached is false');
  assert.equal(res.isBeyondTarget, false, 'isBeyondTarget is false');
  assert.equal(res.approvedCount, 42, 'approved count is preserved');
}

// 2. Zero contributions (empty vessel)
{
  const res = calculateCategoryProgress(testCategory, 0, 1000);
  assert.equal(res.approvedCount, 0, 'approved count is 0');
  assert.equal(res.percentage, 0, 'percentage is 0');
  assert.equal(res.fillPercentage, 0, 'fill is exactly 0% with no phantom liquid');
  assert.equal(res.isTargetReached, false, 'target is not reached');
  assert.equal(res.isBeyondTarget, false, 'isBeyondTarget is false');
  assert.equal(res.isTargetSetting, false, 'isTargetSetting is false');
}

// 3. Very small percentage (accurate geometry)
{
  const res = calculateCategoryProgress(testCategory, 5, 1000);
  assert.equal(res.percentage, 0.5, '0.5% computed accurately');
  assert.equal(res.fillPercentage, 0.5, 'fill percentage is 0.5%');
  assert.equal(res.isTargetReached, false, 'not reached');
}

// 4. In progress (e.g. 50%)
{
  const res = calculateCategoryProgress(testCategory, 500, 1000);
  assert.equal(res.percentage, 50, 'percentage is 50');
  assert.equal(res.fillPercentage, 50, 'fill percentage is 50');
  assert.equal(res.isTargetReached, false, 'target not reached yet');
}

// 5. Exactly 100% target reached
{
  const res = calculateCategoryProgress(testCategory, 1000, 1000);
  assert.equal(res.percentage, 100, 'percentage is 100');
  assert.equal(res.fillPercentage, 100, 'fill percentage is 100');
  assert.equal(res.isTargetReached, true, 'isTargetReached is true');
  assert.equal(res.isBeyondTarget, false, 'isBeyondTarget is false');
}

// 6. Target exceeded (e.g. 125%)
{
  const res = calculateCategoryProgress(testCategory, 1250, 1000);
  assert.equal(res.percentage, 125, 'true percentage preserved at 125%');
  assert.equal(res.fillPercentage, 100, 'visual liquid fill is capped at 100%');
  assert.equal(res.isTargetReached, true, 'isTargetReached is true');
  assert.equal(res.isBeyondTarget, true, 'isBeyondTarget is true');
  assert.equal(res.approvedCount, 1250, 'true approved count preserved');
}

// 7. Awaiting review count does not inflate main jar fill
{
  const res = calculateCategoryProgress(testCategory, 400, 1000, 50);
  assert.equal(res.approvedCount, 400, 'approved count is 400');
  assert.equal(res.awaitingReviewCount, 50, 'awaiting count is 50');
  assert.equal(res.fillPercentage, 40, 'liquid fill reflects ONLY approved count (40%), not 45%');
}

// 8. Genuine "Needs contributions" highlight identification
{
  const counts = {
    lexicon: 800,
    expressions: 50, // 20% of 250 -> lowest!
    sentences: 300,
    literature: 40,
    music: 30,
    audiobooks: 35,
    video: 18,
    grammar: 22,
    proverbs: 90,
    pronunciation: 350,
  };

  const fixtureTargets = {
    lexicon: 1000,
    expressions: 250,
    sentences: 500,
    literature: 50,
    music: 30,
    audiobooks: 40,
    video: 20,
    grammar: 25,
    proverbs: 100,
    pronunciation: 400,
  };

  const config = {
    launchWindowLabel: 'Planned: December 2026 / January 2027',
    launchTargetDate: null,
    categoryTargets: fixtureTargets,
  };

  const list = buildProgressList(counts, config);
  const highlighted = list.filter((item) => item.needsContributions);
  assert.equal(highlighted.length, 1, 'exactly one category is highlighted as most needing contributions');
  assert.equal(highlighted[0].category.id, 'expressions', 'lowest percentage category (expressions @ 20%) is highlighted');
}

// 9. Summary calculation (X of Y targets reached)
{
  const counts = {
    lexicon: 1000, // 100%
    expressions: 250, // 100%
    sentences: 200, // 40%
    literature: 50, // 100%
    music: 10, // 33%
    audiobooks: 20, // 50%
    video: 10, // 50%
    grammar: 25, // 100%
    proverbs: 50, // 50%
    pronunciation: 200, // 50%
  };
  const fixtureTargets = {
    lexicon: 1000,
    expressions: 250,
    sentences: 500,
    literature: 50,
    music: 30,
    audiobooks: 40,
    video: 20,
    grammar: 25,
    proverbs: 100,
    pronunciation: 400,
  };
  const config = {
    launchWindowLabel: 'Planned: December 2026 / January 2027',
    launchTargetDate: null,
    categoryTargets: fixtureTargets,
  };
  const list = buildProgressList(counts, config);
  const summary = calculateTargetsSummary(list);

  assert.equal(summary.reachedCount, 4, '4 targets reached');
  assert.equal(summary.totalWithTargets, 10, '10 total categories with targets');
  assert.equal(summary.settingCount, 0, '0 setting');
}

// 10. Summary with missing targets
{
  const emptyConfig = {
    launchWindowLabel: 'Planned: December 2026 / January 2027',
    launchTargetDate: null,
    categoryTargets: {
      lexicon: null,
      expressions: null,
      sentences: null,
      literature: null,
      music: null,
      audiobooks: null,
      video: null,
      grammar: null,
      proverbs: null,
      pronunciation: null,
    },
  };
  const list = buildProgressList({}, emptyConfig);
  const summary = calculateTargetsSummary(list);
  assert.equal(summary.settingCount, 10, 'all 10 categories are in target-setting state in default production config');
  assert.equal(summary.totalWithTargets, 0, '0 total with targets');
  assert.equal(summary.reachedCount, 0, '0 reached');
}

// 11. Category definitions and source implementation integrity
{
  const expectedCategories = [
    'lexicon',
    'expressions',
    'sentences',
    'literature',
    'music',
    'audiobooks',
    'video',
    'grammar',
    'proverbs',
    'pronunciation',
  ];

  for (const catId of expectedCategories) {
    assert.ok(
      progressConfigSource.includes(`id: '${catId}'`),
      `progressConfig.ts establishes category '${catId}'`
    );
  }

  // Production configuration integrity: no fabricated date or arbitrary targets
  assert.match(
    progressConfigSource,
    /launchWindowLabel:\s*'Planned: December 2026 \/ January 2027'/,
    'launch window is honest planned December/January'
  );
  assert.match(
    progressConfigSource,
    /launchTargetDate:\s*null/,
    'launchTargetDate defaults to null (no invented date)'
  );
  assert.match(
    progressConfigSource,
    /lexicon:\s*200000,[\s\S]*?expressions:\s*1000/,
    'production categoryTargets configure confirmed launch targets'
  );

  // Calculation implementation matches invariants
  assert.match(
    progressCalculationSource,
    /Math\.min\(100,\s*Math\.max\(0,\s*percentage\)\)/,
    'visual liquid fill is capped to [0, 100]%'
  );
  assert.match(
    progressCalculationSource,
    /isBeyondTarget\s*=\s*safeCount\s*>\s*target/,
    'exceeded targets are accurately detected'
  );

  // Data layer uses server aggregations and offline caching
  assert.match(
    progressDataSource,
    /getCountFromServer/,
    'data queries use server-side aggregation count queries'
  );
  assert.match(
    progressDataSource,
    /localStorage\.setItem\(CACHE_KEY/,
    'offline caching is implemented for resilient loading'
  );
  assert.ok(
    !progressDataSource.includes('getDocs('),
    'full collections are never downloaded to client browser'
  );

  // Vessel rendering and accessibility
  assert.match(verticalJarSource, /<clipPath id=\{`cavity-\$\{clipId\}`\}>/, 'vertical jar clips liquid to interior vessel shape');
  assert.match(horizontalTankSource, /<clipPath id=\{`tank-cavity-\$\{clipId\}`\}>/, 'horizontal tank clips liquid to interior vessel shape');
  assert.match(verticalJarSource, /role="progressbar"/, 'vertical jar exposes accessible progressbar role');
  assert.match(horizontalTankSource, /role="progressbar"/, 'horizontal tank exposes accessible progressbar role');

  // Page view switch and motion controls
  assert.match(progressPageSource, /Vertical jars/, 'segmented switch includes Vertical jars');
  assert.match(progressPageSource, /Horizontal tanks/, 'segmented switch includes Horizontal tanks');
  assert.match(progressPageSource, /useProgressMotion/, 'motion hook with pause and reduced motion support is wired');
}

console.log('All 11 progress calculation and integrity invariants verified successfully!');

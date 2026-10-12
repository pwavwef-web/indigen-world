/* Progressive enhancement: the full reference remains readable without JavaScript. */
(() => {
  const rules = [...document.querySelectorAll('#rules > details')];
  const search = document.getElementById('rule-filter');
  const chapter = document.getElementById('chapter-filter');
  const normalize = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const records = rules.map(node => ({ node, text: normalize(node.textContent), chapter: node.querySelector('.meta')?.textContent.match(/Chapter (\d+)/)?.[1] }));
  const filter = () => {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const record of records) {
      record.node.hidden = !terms.every(term => record.text.includes(term)) || !!chapter.value && record.chapter !== chapter.value;
      if (!record.node.hidden) count++;
    }
    document.getElementById('rule-count').textContent = `${count} of ${rules.length} rules`;
    document.getElementById('rule-empty').hidden = count !== 0;
    document.getElementById('rules-expand').disabled = count === 0;
    document.getElementById('rules-collapse').disabled = count === 0;
  };
  search.addEventListener('input', filter);
  chapter.addEventListener('change', filter);
  document.getElementById('rules-reset').addEventListener('click', () => { search.value = ''; chapter.value = ''; filter(); search.focus(); });
  for (const [id, open] of [['rules-expand', true], ['rules-collapse', false]]) {
    document.getElementById(id).addEventListener('click', () => rules.filter(rule => !rule.hidden).forEach(rule => { rule.open = open; }));
  }
  document.querySelector('.reader-tools').hidden = false;
  filter();

  // Citations can point inside a collapsed chapter. Reveal every ancestor first.
  const revealCitation = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    if (target.matches('#rules > details')) { search.value = ''; chapter.value = ''; filter(); }
    for (let node = target; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };
  window.addEventListener('hashchange', revealCitation);
  if (location.hash) revealCitation();
  for (const scroll of document.querySelectorAll('.scroll')) {
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Source table; scroll horizontally for more columns');
  }
  for (const kind of ['word', 'example']) {
    const input = document.getElementById(`${kind}-filter`);
    const rows = [...document.querySelectorAll(`#${kind}-table tbody tr`)];
    const records = rows.map(node => ({ node, text: normalize(node.textContent) }));
    let limit = 25;
    const message = document.createElement('p');
    message.className = 'reader-empty'; message.hidden = true;
    message.textContent = 'No source records match. Try another word or clear the search.';
    document.getElementById(`${kind}-table`).before(message);
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'reader-more'; more.textContent = 'Show 25 more records';
    more.setAttribute('aria-controls', `${kind}-table`);
    document.getElementById(`${kind}-table`).after(more);
    const render = () => {
      const terms = normalize(input.value).split(/\s+/).filter(Boolean);
      const matching = records.filter(record => terms.every(term => record.text.includes(term)));
      records.forEach(record => { record.node.hidden = true; });
      matching.slice(0, limit).forEach(record => { record.node.hidden = false; });
      message.hidden = matching.length !== 0;
      more.hidden = matching.length <= limit;
      document.getElementById(`${kind}-count`).textContent = `Showing ${Math.min(limit, matching.length)} of ${matching.length} ${input.value.trim() ? 'matching ' : ''}source records`;
    };
    input.addEventListener('input', () => { limit = 25; render(); });
    more.addEventListener('click', () => {
      const previousLimit = limit;
      limit += 25; render();
      const firstNew = rows.filter(row => !row.hidden)[previousLimit];
      if (firstNew) { firstNew.tabIndex = -1; firstNew.focus({ preventScroll: true }); firstNew.scrollIntoView({ block: 'center' }); }
    });
    render();
  }
})();

/** 数据加载层：fetch + 内存缓存 + 懒加载 */
window.Data = (function () {
  const cache = {};

  function fileFor(symbol) {
    return CONFIG.files[symbol] || symbol.toLowerCase().replace(/[^a-z0-9]/gi, "");
  }

  /** 加载单个标的：{symbol, name, dates[], close[]} */
  async function loadSymbol(symbol) {
    if (cache[symbol]) return cache[symbol];
    const file = fileFor(symbol);
    const resp = await fetch(`data/${file}.json`);
    if (!resp.ok) throw new Error(`加载 ${symbol} 失败: HTTP ${resp.status}`);
    const json = await resp.json();
    cache[symbol] = json;
    return json;
  }

  async function loadMany(symbols) {
    return Promise.all(symbols.map((s) => loadSymbol(s)));
  }

  /** 加载 V2 前10轮动名单：[{date, symbols[]}] */
  async function loadSchedule() {
    if (cache.__schedule) return cache.__schedule;
    const resp = await fetch("data/top10-schedule.json");
    if (!resp.ok) return null;
    const json = await resp.json();
    cache.__schedule = json;
    return json;
  }

  return { loadSymbol, loadMany, loadSchedule };
})();

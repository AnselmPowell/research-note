// Copied from frontend pattern (services/geminiService.ts lines 37-59)
async function asyncPool(concurrency, items, worker) {
  const results = new Array(items.length);
  let i = 0;

  async function runNext() {
    const index = i++;
    if (index >= items.length) return;

    try {
      results[index] = await worker(items[index]);
    } catch (err) {
      console.warn(`Pool worker failed at index ${index}:`, err.message);
      results[index] = null;
    }

    return runNext();
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext()
  );

  await Promise.all(workers);
  return results;
}

module.exports = { asyncPool };

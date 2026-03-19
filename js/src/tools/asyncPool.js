export async function asyncPool(limit, items, worker) {
  const executing = new Set();
  const results = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => worker(item));
    results.push(p);
    executing.add(p);

    const cleanup = () => executing.delete(p);
    p.then(cleanup).catch(cleanup);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}
// 속도를 증가시키기 위해 비동기 방식으로 작업을 처리
export async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429) {
        const wait = parseInt(err.response.headers['retry-after'] || '1') * 1000;
        console.warn(`429 ${wait}ms 대기 (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
  return null;
}
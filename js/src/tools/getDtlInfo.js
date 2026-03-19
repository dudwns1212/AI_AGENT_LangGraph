import { asyncPool } from './asyncPool.js';
import { withRetry } from './retryAfter.js';
import axios from 'axios';

const API_KEY = process.env.PUBLIC_DATA_SERVICE_KEY;
const BASEURL = 'https://apis.data.go.kr/B551182/MadmDtlInfoService2.7';

export async function getDtlInfo(ykihoList ) {
  console.log(`getDtlInfo ${ykihoList.length}개 조회 시작`);
  let noDataCount = 0;
  let errorCount = 0;

  /* 기존의 반복문 형태로, 1 to 1로 진행되어 속도가 매우매우매우 느림(약 290개의 데이터를 2번 반복하는데 3~4분 소요)
  for (const ykiho of ykihoList) {
    try {
      const rawItem = await withRetry(async () => {
        const res = await axios.get(`${BASEURL}/getDtlInfo2.7`, {
          params: { serviceKey: API_KEY, ykiho, pageNo: 1, numOfRows: 1, _type: 'json' }
        });
        return res.data.response.body.items?.item || null;
      });

      if (!rawItem) {
        noDataCount++;
        continue;
      }
    
      const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;
      results.push({
        ykiho,
        trmtMonStart: item.trmtMonStart,
        trmtMonEnd:   item.trmtMonEnd,
        trmtSatStart: item.trmtSatStart,
        trmtSatEnd:   item.trmtSatEnd,
        trmtSunStart: item.trmtSunStart,
        trmtSunEnd:   item.trmtSunEnd,
        emyDayYn:     item.emyDayYn,
        emyNgtYn:     item.emyNgtYn,
        parkQty:      item.parkQty,
        noTrmtSun:    item.noTrmtSun,
        noTrmtHoli:   item.noTrmtHoli,
        lunchWeek:    item.lunchWeek
      });
    } catch (err) {
      errorCount++;
      console.error(`getDtlInfo ${ykiho} 실패: ${err.message}`);
    }
  }
  */

  const concurrency = 5;

  const out = await asyncPool(concurrency, ykihoList, async (ykiho) => {
    try {
      const rawItem = await withRetry(async () => {
        const res = await axios.get(`${BASEURL}/getDtlInfo2.7`, {
          params: { serviceKey: API_KEY, ykiho, pageNo: 1, numOfRows: 1, _type: 'json' }
        });
        return res.data.response.body.items?.item || null;
      });

      if (!rawItem) {
        return { type: 'nodata' };
      }

      const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;

      return {
        type: 'ok',
        data: {
          ykiho,
          trmtMonStart: item.trmtMonStart,
          trmtMonEnd:   item.trmtMonEnd,
          trmtSatStart: item.trmtSatStart,
          trmtSatEnd:   item.trmtSatEnd,
          trmtSunStart: item.trmtSunStart,
          trmtSunEnd:   item.trmtSunEnd,
          emyDayYn:     item.emyDayYn,
          emyNgtYn:     item.emyNgtYn,
          parkQty:      item.parkQty,
          noTrmtSun:    item.noTrmtSun,
          noTrmtHoli:   item.noTrmtHoli,
          lunchWeek:    item.lunchWeek
        }
      }
    } catch (err) {
      console.error(`getDtlInfo ${ykiho} 실패: ${err.message}`);
      return { type: `error`};
    }
  });

  const results = out.filter(x => x?.type === 'ok').map(x => x.data);
  noDataCount = out.filter(x => x?.type === 'nodata').length;
  errorCount = out.filter(x => x?.type === 'error').length;

  console.log(`getDtlInfo 완료 - 성공: ${results.length}개 / 데이터없음: ${noDataCount}개 / 에러: ${errorCount}`);
  return results;
}

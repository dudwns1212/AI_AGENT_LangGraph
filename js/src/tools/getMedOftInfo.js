import { asyncPool } from './asyncPool.js'
import { withRetry } from './retryAfter.js'
import axios from 'axios';

const API_KEY = process.env.PUBLIC_DATA_SERVICE_KEY;
const BASEURL = 'https://apis.data.go.kr/B551182/MadmDtlInfoService2.7';

const MRI_KEYWORDS = ['MRI', '자기공명'];
const CT_KEYWORDS  = ['CT', '전산화단층'];

export async function getMedOftInfo(ykihoList) {
  console.log(`getMedOftInfo ${ykihoList.length}개 조회 시작`);
  let noDataCount = 0;
  let errorCount = 0;

  /* 얘도 마찬가지로 1 TO 1에서 병렬 요청으로 변경
  for (const ykiho of ykihoList) {
    try {
      const rawItems = await withRetry(async () => {
        const res = await axios.get(`${BASEURL}/getMedOftInfo2.7`, {
          params: { serviceKey: API_KEY, ykiho, pageNo: 1, numOfRows: 100, _type: 'json' }
        });
        return res.data.response.body.items?.item || null;
      });

      if (!rawItems) continue;

      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      const names = items.map(i => i.oftCdNm || '').join(',');

      results.push({
        ykiho,
        hasMri: MRI_KEYWORDS.some(k => names.includes(k)),
        hasCt:  CT_KEYWORDS.some(k => names.includes(k)),
        equipment: items
      });
    } catch (err) {
      console.error(`getMedOftInfo ${ykiho} 실패: ${err.message}`);
    }
  }
  */

  const concurrency = 5;

  const out = await asyncPool(concurrency, ykihoList, async (ykiho) => {
    try {
      const rawItems = await withRetry(async () => {
        const res = await axios.get(`${BASEURL}/getMedOftInfo2.7`, {
          params: { serviceKey: API_KEY, ykiho, pageNo: 1, numOfRows: 100, _type: 'json' }
        });
        return res.data.response.body.items?.item || null;
      });

      if (!rawItems) {
        return { type: 'nodata' };
      }

      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      const names = items.map(i => i.oftCdNm || '').join(',');

      return {
        type: 'ok',
        data: {
          ykiho,
          hasMri: MRI_KEYWORDS.some(k => names.includes(k)),
          hasCt:  CT_KEYWORDS.some(k => names.includes(k)),
          equipment: items
        }
      }
    } catch (err) {
      console.error(`getMedOftInfo ${ykiho} 실패: ${err.message}`)
      return { type: 'error' };
    }
  });

  const results = out.filter(x => x?.type === 'ok').map(x => x.data);
  noDataCount = out.filter(x => x?.type === 'nodata').length;
  errorCount = out.filter(x => x?.type === 'error').length;

  console.log(`getMedOftInfo ${results.length}개 완료`);
  return results;
}

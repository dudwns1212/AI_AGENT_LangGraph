import axios from 'axios';

const API_KEY = process.env.PUBLIC_DATA_SERVICE_KEY || '';
const BASEURL = 'https://apis.data.go.kr/B551182/hospInfoServicev2';

export async function search1API({ symptoms, div, distance, geoInfo }) {
  console.log(`search1API symptoms=${symptoms}, div=${div}, distance=${distance}`);

  const param = {
    serviceKey: API_KEY,
    pageNo: 1,
    numOfRows: 10000,
    xPos: geoInfo.longitude,
    yPos: geoInfo.latitude,
    _type: 'json'
  };

  if (symptoms) {
    param.dgsbjtCd = symptoms;
  }
  if (div) {
    param.clCd = div;
  }
  if (distance && distance > 0) {
    param.radius = distance;
  }

  try {
    const response = await axios.get(`${BASEURL}/getHospBasisList`, { params: param });
    const data = response.data;

    if (data.response.header.resultCode !== '00') {
      console.warn(`search1API 에러: ${data.response.header.resultMsg}`);
      return [];
    }

    const rawItems = data.response.body.items?.item;
    if (!rawItems) return [];

    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    console.log(`search1API ${items.length}개 조회 완료`);
    return items;

  } catch (error) {
    console.error(`search1API 실패: ${error.message}`);
    return [];
  }
}

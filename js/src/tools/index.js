import { getDtlInfo }    from './getDtlInfo.js';
import { getMedOftInfo } from './getMedOftInfo.js';

export const TOOL_REGISTRY = {
  getDtlInfo: {
    description: '진료시간(주말포함), 응급실 운영여부, 주차 정보 조회',
    suitableFor: '주말진료, 응급실 여부 확인이 필요할 때',
    run: getDtlInfo
  },
  getMedOftInfo: {
    description: 'MRI, CT 등 의료장비 보유 여부 조회',
    suitableFor: 'MRI, CT 촬영 가능한 병원을 찾을 때',
    run: getMedOftInfo
  }
};

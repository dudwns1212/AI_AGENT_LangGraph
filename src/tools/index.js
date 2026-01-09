///
/// 도구 등록 정보 : 사용 가능한 도구들의 메타데이터 및 실행 함수 정의
///
import { searchHospitalTool } from "./searchHospitalTool.js";
import { searchDoctorTool } from "./searchDoctorTool.js";
import { searchPharmacyTool } from "./searchPharmacyTool.js";

export const TOOL_REGISTRY = {
    searchHospitalTool: {
        description: "병원 목록을 위치/진료과/비용/거리 기준으로 검색합니다.",
        suitableFor: "증상 기반 병원 추천이 필요한 경우",
        inputSchema: `{
      "location": "string",
      "symptoms": "string",
      "constraints": { ... }
    }`,
        run: searchHospitalTool
    },

    searchDoctorTool: {
        description: "특정 전문의(내과/심장내과 등) 의사 정보를 검색합니다.",
        suitableFor: "특정 진료과 또는 전문의를 직접 찾고자 할 때",
        inputSchema: `{
      "specialty": "string",
      "location": "string"
    }`,
        run: searchDoctorTool
    },

    searchPharmacyTool: {
        description: "현재 영업 중인 근처 약국을 찾습니다.",
        suitableFor: "증상 완화 또는 약 처방 후 접근성 확인이 필요할 때",
        inputSchema: `{
      "location": "string",
      "openNow": true
    }`,
        run: searchPharmacyTool
    }
};

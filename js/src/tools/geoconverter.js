import axios from 'axios';

const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY

export async function geocodeAddress(address) {
    if(!address || address == 'null') {
        console.warn("주소 빔")
        return null
    }

    try {
        const url = 'https://dapi.kakao.com/v2/local/search/address.json';
        const response = await axios.get(url, {
            headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
            params: { query: address }
        })

        if (response.data.documents && response.data.documents.length > 0) {
            console.log(response.data.documents)
            const lng = response.data.documents[0].x
            const lat = response.data.documents[0].y
            return {
                latitude: parseFloat(lat),
                longitude: parseFloat(lng)
            }
        }

        console.warn("주소를 찾을 수 없습니다 -> " + address)
        return null
    } catch(error) {
        console.error("카카오 주소변환 api 요청 실패: " + error.message)
        return null
    }
}
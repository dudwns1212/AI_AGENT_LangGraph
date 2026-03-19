<template>
    <div class="container">
        <h1>AI 병원추천</h1>
    </div>
    <div class="inputgroup">
        <input v-model="symptoms" type="text" placeholder="ex) 복통, 다리가 아파요" required>
        <input v-model="location" type="text" placeholder="ex) 서울특별시 관악구 봉천동 (지번)" required>
        <input v-model="radius" type="text" placeholder="ex) 5000 / m단위로 원하는 반경을 입력">
        <input v-model="must" type="text" placeholder="그 밖에 반드시 있어야 하는 조건을 자유롭게 입력하세요">
        <input v-model="prefer" type="text" placeholder="선호하는 조건을 입력하세요. 없을수도 있음">
        <button :disabled="lodding" @click="send">추천받기</button>
    </div>
    <p v-if="lodding" class="lodding">
        AI가 병원을 분석 중..
    </p>
    <pre v-if="answer" class="result">
        {{ answer }}
    </pre>
</template>

<script setup>
import {ref} from "vue";

const symptoms = ref("")
const location = ref("")
const radius = ref(0)
const must = ref("")
const prefer = ref("")
const answer = ref("")
const lodding = ref(false)

const message = ""

const send = async() => {
    if (symptoms.value )

    if(!message) {
        alert("내용을 입력하세요")
        return;
    }

    lodding.value = true
    answer.value = "";

    try{
    const res = await fetch("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message })
    })

    const data = await res.json();
    answer.value = data.answer || "응답이 없습니다.";
    }catch(err){
    console.log(`백엔드 연결 중 오류 발생 -> ${err}`)
    }finally{
    lodding.value = false
    }
}
</script>

<style scoped>
.container{
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
.inputgroup{
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
input{
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ccc;
}
button{
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  background: rgb(69, 103, 229);
  color: white;
  font-weight: 600;
  cursor: pointer;
}
button:disabled{
  background-color: gray;
  cursor: not-allowed;
}
.lodding{
  color: gray;
}
.result{
  white-space: pre-wrap;
  background: #f8f9fa;
  font-size: 20px;
  font-weight: 600;
  padding: 16px;
  border-radius: 6px;
}
</style>
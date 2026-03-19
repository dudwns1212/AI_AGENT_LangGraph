<template>
  <div class="container">
    <h1>AI 병원추천</h1>
  </div>
  <div class="inputgroup">
    <input v-model="message" type="text" placeholder="원하시는 조건을 상세히 적어주세요" @keyup.enter="send">
    <button :disabled="loading" @click="send">추천받기</button>
    <button class="reset-btn" @click="reset">초기화</button>
  </div>
  <p v-if="loading" class="loading">
    AI가 병원을 분석 중..
  </p>

  <pre v-if="answer" class="result">{{ answer }}</pre>
</template>

<script setup>
import { ref } from "vue";

const message = ref("");
const answer  = ref("");
const loading = ref(false);

// sessionId: localStorage에서 불러오거나 새로 생성
const sessionId = ref(localStorage.getItem("sessionId") || crypto.randomUUID());
localStorage.setItem("sessionId", sessionId.value);

const send = async () => {
  if (!message.value.trim()) {
    alert("내용을 입력하세요");
    return;
  }

  loading.value = true;
  answer.value  = "";

  try {
    const res = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:   message.value,
        sessionId: sessionId.value,   // ← 추가
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      answer.value = `오류: ${err.error}`;
      return;
    }

    const data = await res.json();
    answer.value = data.answer || "응답이 없습니다.";
    message.value = "";              // 전송 후 입력창 초기화
  } catch (err) {
    console.error(`백엔드 연결 오류: ${err}`);
    answer.value = "서버 연결에 실패했습니다.";
  } finally {
    loading.value = false;
  }
};

// 대화 초기화
const reset = async () => {
  try {
    await fetch(`http://localhost:3000/api/session/${sessionId.value}`, {
      method: "DELETE",
    });
  } catch (err) {
    console.error("세션 초기화 오류:", err);
  }

  // 새 sessionId 발급
  sessionId.value = crypto.randomUUID();
  localStorage.setItem("sessionId", sessionId.value);
  answer.value  = "";
  message.value = "";
};
</script>

<style>
html, body {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
  display: none;
}
</style>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
.inputgroup {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
input {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ccc;
}
button {
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  background: rgb(69, 103, 229);
  color: white;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  background-color: gray;
  cursor: not-allowed;
}
.reset-btn {
  background: #dc3545;
}
.loading {
  color: gray;
}
.result {
  white-space: pre-wrap;
  background: #f8f9fa;
  font-size: 20px;
  font-weight: 600;
  padding: 16px;
  border-radius: 6px;
}
</style>

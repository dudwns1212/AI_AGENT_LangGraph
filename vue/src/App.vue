<template>
  <div>
    <button @click="router.push('/AI1')">1</button>
    <button @click="router.push('/AI2')">2</button>
  </div>
  <div>
    <RouterView />
  </div>
</template>

<script setup>
import router from './router';
</script>
<style>
/* 전역 스크롤바 숨기기 */
html, body {
  -ms-overflow-style: none; /* IE, Edge */
  scrollbar-width: none; /* Firefox */
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}
</style>
<style scoped>

</style>

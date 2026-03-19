import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/AI2',
      name: 'ai-hospital2',
      component: () => import('@/views/AIHospital2.vue')
    },
    {
      path: '/AI1',
      name: 'ai-hospital1',
      component: () => import('@/views/AIHospital1.vue')
    }
  ],
})

export default router

import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AddMedicine from '@/views/AddMedicine.vue'
import { getCurrentUser } from 'vuefire'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },    
    {
      path: '/add_medicine',
      name: 'AddMedicine',
      component: AddMedicine,
    },
    {
       path: "/edit-medicine/:id",
       name: "EditMedicine",
       component: () => import("@/views/EditMedicine.vue"),
       props: true
    },
    {
      path: "/view-meds",
      name: "ViewMedications",
      component: () => import("../views/ViewMedications.vue"),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return {
        path: '/not_found',
        component: () => import("@/views/NotFoundView.vue"),
      }
    }
  }
})

export default router

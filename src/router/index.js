import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AddMedicine from '@/views/AddMedicine.vue'
import StocksView from '@/views/StocksView.vue'
import { getAuth } from "firebase/auth";
import { needsNotificationPrompt } from "@/composables/useNotifications";
import { useNotifications } from "@/composables/useNotifications";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView }, 
    { path: '/add_medicine', name: 'AddMedicine', component: AddMedicine },
    {
      path: '/edit-medicine/:id',
      name: 'EditMedicine',
      component: () => import('@/views/EditMedicine.vue'),
      props: true,
    },
    {
      path: '/view-meds',
      name: 'ViewMedications',
      component: () => import('../views/ViewMedications.vue'),
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('../views/SettingsView.vue'),
    },  
    {
      path: "/stocks",
      name: "StocksView",
      component: StocksView,
    }, 
  ],
})

router.beforeEach((to, from, next) => {
  const user = getAuth().currentUser;

  if (user) {
    const { shouldAskPermission } = useNotifications();

    if (shouldAskPermission()) {
      needsNotificationPrompt.value = true;
    }
  }

  next();
});

export default router

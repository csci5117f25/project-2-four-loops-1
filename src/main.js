import "./assets/style/base.css";


import { createApp } from 'vue'
import { VueFire, VueFireAuth } from 'vuefire'
import App from './App.vue'
import router from './router'
import { firebaseApp } from './firebase_conf'
// import "leaflet/dist/leaflet.css";
import PrimeVue from 'primevue/config';


const app = createApp(App)
app.use(VueFire, {
  // imported above but could also just be created here
  firebaseApp,
  modules: [
    // we will see other modules later on
    VueFireAuth(),
  ],
})
app.use(router)
app.use(PrimeVue)

app.mount('#app')

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/firebase-messaging-sw.js")
    .then(() => console.log("Service Worker registered"))
    .catch(err => console.error("Service Worker failed", err));
}
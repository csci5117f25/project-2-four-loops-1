<script>
const provider = new GoogleAuthProvider()
</script>
<script setup>
import { ref, onMounted } from 'vue'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { firebaseApp } from '@/firebase_conf'

const auth = getAuth(firebaseApp)

// reactive user
const user = ref(null)

// listen to auth state changes
onMounted(() => {
  onAuthStateChanged(auth, (firebaseUser) => {
    user.value = firebaseUser
    // console.log('Auth state changed:', firebaseUser)
  })
})

async function login() {
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    console.error('Login error:', e)
  }
}

async function logout() {
  try {
    await signOut(auth)
  } catch (e) {
    console.error('Logout error:', e)
  }
}
</script>

<template>
  <div class="auth-bar">
    <button v-if="!user" @click="login">Log In</button>
    <button v-else @click="logout">👤 {{ user.displayName}} | Log Out</button>
  </div>
</template>


<style scoped>
button {
  background-color: var(--color-bg);
  list-style: none;
  display: flex;
  gap: 20px;
  cursor: pointer;
  font-size: 16px;
  color: var(--color-text);
  border-radius: 2rem;
  padding: .5rem;
}
button:hover {
  color: var(--color-primary);
}

</style>
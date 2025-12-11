import { onMounted, ref } from "vue";

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }  from "firebase/auth";

import { firebaseApp } from "@/firebase_conf";

const auth = getAuth(firebaseApp)

// reactive user
const user = ref(null)


const provider = new GoogleAuthProvider()


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


export function useAuth() {return {user, login, logout}}
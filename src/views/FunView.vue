<script>
    const provider = new GoogleAuthProvider();
</script>


<script setup>
// eslint-disable-next-line no-unused-vars
import { ref } from 'vue'
import { useCollection, useCurrentUser, useFirebaseAuth } from 'vuefire'
import { collection } from 'firebase/firestore'
import {db} from '../firebase_conf'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

const tests = useCollection(collection(db, 'Medications'))
const user = useCurrentUser()
const auth = useFirebaseAuth()

async function login() {
    try {
        await signInWithPopup(auth, provider)
    } catch {
        alert("oh no");
    }
}async function logout() {
    try {
        await signOut(auth)
    } catch {
        alert("oh no");
    }
}

</script>

<template>
    <div> user: {{user}}</div>
    <button @click="login()" v-if="!user">log in</button>
    <button @click="logout()" v-else>log out</button>
    <div v-for="test in tests" :key="test.id">
        <RouterLink :to="{ name: 'test_w_id', params: { id: test.id } }">{{test.name}}</RouterLink>

    </div>
</template>

<style scoped></style>

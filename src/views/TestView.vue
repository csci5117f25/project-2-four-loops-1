<script setup>
import { computed, ref, watch } from 'vue'
import { useCollection, useDocument } from 'vuefire'
import { collection, doc } from 'firebase/firestore'
import {db} from '../firebase_conf'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()

const test_source = computed(() =>
  doc(db, 'tests', route.params.id)
)

const test = useDocument(test_source)

watch(test, (new_data, old_data)=>{
  if (! new_data) {
    router.push("/")
  }
})
</script>

<template>
      <RouterLink :to="{ name: 'test_w_id', params: { id: 'b3LKbwD0rv65G8EnvYoY' } }">test</RouterLink>
      <RouterLink :to="{ name: 'test_w_id', params: { id: '78bhKDifBy1sbZodcdZp' } }">other test</RouterLink>
      <RouterLink :to="{ name: 'test_w_id', params: { id: '12' } }">third test</RouterLink>

    {{test}}
</template>

<style scoped></style>

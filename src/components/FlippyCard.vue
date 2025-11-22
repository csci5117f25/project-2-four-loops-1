<script setup>
import { ref } from 'vue'
const props = defineProps({ isFlipped: Boolean })
const emit = defineEmits(['flip', 'unflip'])
</script>

<template>
  <div v-if="isFlipped" @click="$emit('unflip')">front</div>
  <div v-else @click="$emit('flip')">back</div>
</template>

<style scoped>
div {
  width: 10rem;
  height: 14rem;
  border-radius: 1rem;
  background-color: bisque;
}
</style>

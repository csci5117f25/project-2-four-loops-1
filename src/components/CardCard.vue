<script setup>
const props = defineProps({
  flipped: Boolean,
  front: String,
})
const emit = defineEmits(['face_up', 'face_down'])
</script>

<template>
  <div v-if="flipped" @click="$emit('face_down')"><slot></slot></div>
  <div v-else @click="$emit('face_up')">{{ front }}</div>
</template>

<style scoped>
div {
  width: 10em;
  height: 10em;
  background-color: beige;
  border-radius: 1em;
  box-shadow: 1em;
}
</style>

<script setup>
import { ref } from 'vue'
import CardCard from '../components/CardCard.vue'

const card_num = ref(-1)
</script>

<template>
  <div class="about">
    <CardCard
      front="bob"
      :flipped="card_num == 0"
      @face_up="card_num = 0"
      @face_down="card_num = -1"
      >Tony</CardCard
    ><CardCard
      front="bob"
      :flipped="card_num == 1"
      @face_up="card_num = 1"
      @face_down="card_num = -1"
      >Tony</CardCard
    ><CardCard
      front="bob"
      :flipped="card_num == 2"
      @face_up="card_num = 2"
      @face_down="card_num = -1"
      >Tony</CardCard
    ><CardCard
      front="bob"
      :flipped="card_num == 3"
      @face_up="card_num = 3"
      @face_down="card_num = -1"
      >Tony</CardCard
    >
  </div>
</template>

<style>
@media (min-width: 1024px) {
  .about {
    min-height: 100vh;
    display: flex;
    align-items: center;
  }
}
</style>

<script setup>
    import { ref } from 'vue';
    const mes = ref("hello there, welcome to your leetcode tracker")
</script>

<template>
    <h1>{{ mes }}</h1>
</template>

<style>
    h1 {
        color: red;
    }
</style>
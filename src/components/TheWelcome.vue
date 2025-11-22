<script setup>
import WelcomeItem from './WelcomeItem.vue'
import DocumentationIcon from './icons/IconDocumentation.vue'
import ToolingIcon from './icons/IconTooling.vue'
import EcosystemIcon from './icons/IconEcosystem.vue'
import CommunityIcon from './icons/IconCommunity.vue'
import SupportIcon from './icons/IconSupport.vue'
import FlippyCard from './FlippyCard.vue'
import { ref } from 'vue'

const openReadmeInEditor = () => fetch('/__open-in-editor?file=README.md')

const whichFlipped = ref(-1)
</script>

<template>
  <FlippyCard
    :isFlipped="whichFlipped == 0"
    @flip="whichFlipped = 0"
    @unflip="whichFlipped = -1"
  ></FlippyCard>
  <FlippyCard
    :isFlipped="whichFlipped == 1"
    @flip="whichFlipped = 1"
    @unflip="whichFlipped = -1"
  ></FlippyCard>
  <FlippyCard
    :isFlipped="whichFlipped == 2"
    @flip="whichFlipped = 2"
    @unflip="whichFlipped = -1"
  ></FlippyCard>
  <FlippyCard
    :isFlipped="whichFlipped == 3"
    @flip="whichFlipped = 3"
    @unflip="whichFlipped = -1"
  ></FlippyCard>
</template>

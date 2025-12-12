<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const isOpen = ref(false);
const menuRef = ref(null);

const toggleMenu = () => {
  isOpen.value = !isOpen.value;
};

const closeOnClickOutside = (e) => {
  if (!menuRef.value) return;
  if (!menuRef.value.contains(e.target)) {
    isOpen.value = false;
  }
};

const goTo = (path) => {
  isOpen.value = false;
  router.push(path);
};

onMounted(() => document.addEventListener("click", closeOnClickOutside));
onBeforeUnmount(() =>
  document.removeEventListener("click", closeOnClickOutside)
);
</script>

<template>
  <!-- Wrap this in your header (top-right) -->
  <div class="user-menu" ref="menuRef">
    <button class="avatar-btn" @click.stop="toggleMenu">
      <!-- Replace with an <img> if you have avatar -->
      <span class="avatar-icon">👤</span>
    </button>

    <transition name="fade">
      <div v-if="isOpen" class="user-menu-dropdown">
        <button class="menu-item" @click="goTo('/saved-pharmacy')">
          Saved Pharmacy Info
        </button>
        <button class="menu-item" @click="goTo('/stocks')">
          View Stocks
        </button>
        <button class="menu-item" @click="goTo('/settings')">
          Settings
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
  display: inline-block;
}

/* Avatar button */
.avatar-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: none;
  background: var(--color-card, #ffffff);
  box-shadow: var(--shadow-soft, 0 2px 6px rgba(0, 0, 0, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.avatar-btn:hover {
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
}

.avatar-icon {
  font-size: 18px;
}

/* Dropdown card */
.user-menu-dropdown {
  position: absolute;
  top: 110%;
  right: 0;
  min-width: 190px;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  z-index: 20;
}

/* Items */
.menu-item {
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
  cursor: pointer;
  white-space: nowrap;
}

.menu-item + .menu-item {
  border-top: 1px solid #e5e7eb;
}

.menu-item:hover {
  background: #f3f4f6;
}

/* Simple fade animation */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 120ms ease-out, transform 120ms ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

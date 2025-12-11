<template>
  <div class="nf-wrapper">
    <h1>404</h1>
    <p>Looks like this card wandered off into the void.</p>
    <RouterLink to="/" class="back-btn">Go Back Home</RouterLink>
  </div>
</template>

<style scoped>
.nf-wrapper {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: radial-gradient(circle at top, #dbeafe, #bfdbfe);
  color: #1e3a8a;
  text-align: center;
  font-family: system-ui, sans-serif;
}

.nf-wrapper h1 {
  font-size: 6rem;
  margin: 0;
  font-weight: 800;
  letter-spacing: -2px;
}

.nf-wrapper p {
  font-size: 1.3rem;
  margin: 1rem 0 2rem;
}

.back-btn {
  background: #1d4ed8;
  color: white;
  padding: 0.8rem 1.5rem;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
  transition: background 0.2s ease;
}

.back-btn:hover {
  background: #1e40af;
}
</style>

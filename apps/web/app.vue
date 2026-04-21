<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <UApp :locale="locale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

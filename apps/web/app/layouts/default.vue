<script setup lang="ts">
const session = useSessionStore()
const { t } = useI18n()

const nav = computed(() => [
  { label: t('employees.title'), to: '/employees', icon: 'i-lucide-users' },
])
</script>

<template>
  <div class="min-h-dvh bg-default text-default">
    <header class="border-b border-muted bg-elevated">
      <div class="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <NuxtLink to="/" class="font-semibold">
          HR SaaS
        </NuxtLink>
        <UNavigationMenu :items="nav" />
        <div class="ml-auto flex items-center gap-3">
          <UAvatar
            v-if="session.user"
            :alt="`${session.user.firstName} ${session.user.lastName}`"
            size="sm"
          />
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-6 py-6">
      <slot></slot>
    </main>
  </div>
</template>

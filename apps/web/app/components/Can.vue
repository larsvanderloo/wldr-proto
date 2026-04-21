<script setup lang="ts">
/**
 * <Can action="update" subject="employee"> — rendert children alleen als
 * de huidige user de actie mag uitvoeren. UI-gating, niet autoritatief.
 */
type Action = 'read' | 'create' | 'update' | 'delete' | 'reveal'
type Subject = 'employee' | 'employee.pii' | 'time_off' | 'review'

const props = defineProps<{
  action: Action
  subject: Subject
}>()

const can = useCan()
const allowed = computed(() => can(props.action, props.subject))
</script>

<template>
  <template v-if="allowed">
    <slot></slot>
  </template>
  <template v-else>
    <slot name="fallback"></slot>
  </template>
</template>

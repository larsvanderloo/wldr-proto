<script setup lang="ts">
/**
 * <MaskedField> — toont een gemaskeerde PII-waarde met reveal-actie.
 * Reveal roept de audit-logged endpoint aan via useRevealField.
 */
import { useRevealField } from '~/composables/mutations/employees'

const props = defineProps<{
  employeeId: string
  field: 'bsn' | 'iban'
  masked: string | null
  label: string
}>()

const { t } = useI18n()
const reveal = useRevealField(() => props.employeeId)

const revealed = ref<string | null>(null)
const showDialog = ref(false)
const reason = ref('')

async function doReveal() {
  if (reason.value.trim().length < 3) return
  const res = await reveal.mutateAsync({ field: props.field, reason: reason.value.trim() })
  revealed.value = res.value
  showDialog.value = false
  reason.value = ''

  // Na 30s automatisch weer maskeren — gewoonte die gebruikers beschermt.
  setTimeout(() => {
    revealed.value = null
  }, 30_000)
}

const display = computed(() => revealed.value ?? props.masked ?? '—')
</script>

<template>
  <UFormField :label="label">
    <div class="flex items-center gap-2">
      <span
        class="font-mono text-default tabular-nums rounded-md bg-elevated px-3 py-1.5"
        :data-revealed="revealed !== null"
      >
        {{ display }}
      </span>
      <Can action="reveal" subject="employee.pii">
        <UButton
          v-if="revealed === null && masked"
          variant="ghost"
          size="xs"
          icon="i-lucide-eye"
          :label="t('common.reveal')"
          @click="showDialog = true"
        />
        <UButton
          v-else-if="revealed"
          variant="ghost"
          size="xs"
          icon="i-lucide-eye-off"
          @click="revealed = null"
        />
      </Can>
    </div>
  </UFormField>

  <UModal v-model:open="showDialog" :title="t('employees.reveal.title')">
    <template #body>
      <UFormField :label="t('employees.reveal.reasonLabel')" required>
        <UTextarea v-model="reason" :rows="3" autofocus />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" :label="t('common.cancel')" @click="showDialog = false" />
        <UButton
          color="primary"
          :loading="reveal.isLoading.value"
          :disabled="reason.trim().length < 3"
          :label="t('employees.reveal.confirm')"
          @click="doReveal"
        />
      </div>
    </template>
  </UModal>
</template>

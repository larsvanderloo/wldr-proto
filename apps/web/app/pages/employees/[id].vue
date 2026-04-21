<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  updateEmployeeInputSchema,
  type EmployeeDetailResponse,
  type UpdateEmployeeInput,
} from '@hr-saas/contracts/employees'
import { useEmployee } from '~/composables/queries/employees'
import { useUpdateEmployee, useDeleteEmployee } from '~/composables/mutations/employees'

definePageMeta({ layout: 'default' })
const { t } = useI18n()
const route = useRoute()
const id = computed(() => route.params.id as string)

const { data: employee, status } = useEmployee(id)
const update = useUpdateEmployee()
const remove = useDeleteEmployee()

// Null-vrij UI-form-type: UInput/USelectMenu v-model accepteert geen null.
// Null-waarden uit de API worden omgezet naar undefined bij het inladen.
type EmployeeFormState = {
  [K in keyof UpdateEmployeeInput]: NonNullable<UpdateEmployeeInput[K]> | undefined
}

// UForm werkt met een reactive state-object. We syncen 'm met de geladen
// data via watchEffect — niet hergebruiken als server-state-cache, dat blijft
// bij Colada.
const form = reactive<Partial<EmployeeFormState>>({ id: id.value })

watchEffect(() => {
  if (!employee.value) return
  const e = employee.value as EmployeeDetailResponse
  Object.assign(form, {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    jobTitle: e.jobTitle,
    department: e.department ?? undefined,
    managerId: e.managerId || undefined,
    employmentType: e.employmentType,
    employmentStatus: e.employmentStatus,
    role: e.role,
    startDate: e.startDate,
    endDate: e.endDate ?? undefined,
    phoneNumber: e.phoneNumber ?? undefined,
    address: e.address ?? undefined,
  } satisfies Partial<EmployeeFormState>)
})

useHead(() => ({
  title: employee.value
    ? `${employee.value.firstName} ${employee.value.lastName}`
    : t('employees.title'),
}))

async function onSubmit(ev: FormSubmitEvent<UpdateEmployeeInput>) {
  await update.mutateAsync(ev.data)
}

async function onDelete() {
  const ok = window.confirm(`${t('common.delete')}?`)
  if (!ok) return
  await remove.mutateAsync(id.value)
  await navigateTo('/employees')
}

const typeOptions = computed(() =>
  (['permanent', 'fixed_term', 'freelance', 'intern'] as const).map((v) => ({
    label: t(`employees.employmentType.${v}`),
    value: v,
  })),
)
const statusOptions = computed(() =>
  (['active', 'on_leave', 'pending_start', 'terminated'] as const).map((v) => ({
    label: t(`employees.employmentStatus.${v}`),
    value: v,
  })),
)
const roleOptions = computed(() =>
  (['admin', 'manager', 'employee'] as const).map((v) => ({
    label: t(`employees.role.${v}`),
    value: v,
  })),
)
</script>

<template>
  <div class="space-y-6">
    <div v-if="status === 'pending'" class="text-toned">
      {{ t('common.loading') }}
    </div>

    <template v-else-if="employee">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">
          {{ employee.firstName }} {{ employee.lastName }}
        </h1>
        <Can action="delete" subject="employee">
          <UButton
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :loading="remove.isLoading.value"
            @click="onDelete"
          />
        </Can>
      </div>

      <UForm
        :schema="updateEmployeeInputSchema"
        :state="form"
        class="grid gap-4 md:grid-cols-2"
        @submit="onSubmit"
      >
        <UFormField :label="t('employees.fields.firstName')" name="firstName" required>
          <UInput v-model="form.firstName" />
        </UFormField>
        <UFormField :label="t('employees.fields.lastName')" name="lastName" required>
          <UInput v-model="form.lastName" />
        </UFormField>
        <UFormField :label="t('employees.fields.email')" name="email" required>
          <UInput v-model="form.email" type="email" />
        </UFormField>
        <UFormField :label="t('employees.fields.phoneNumber')" name="phoneNumber">
          <UInput v-model="form.phoneNumber" />
        </UFormField>
        <UFormField :label="t('employees.fields.jobTitle')" name="jobTitle" required>
          <UInput v-model="form.jobTitle" />
        </UFormField>
        <UFormField :label="t('employees.fields.department')" name="department">
          <UInput v-model="form.department" />
        </UFormField>
        <UFormField :label="t('employees.fields.employmentType')" name="employmentType" required>
          <USelectMenu v-model="form.employmentType" :items="typeOptions" value-key="value" />
        </UFormField>
        <UFormField :label="t('employees.fields.employmentStatus')" name="employmentStatus">
          <Can action="update" subject="employee">
            <USelectMenu
              v-model="form.employmentStatus"
              :items="statusOptions"
              value-key="value"
            />
          </Can>
        </UFormField>
        <UFormField :label="t('employees.fields.role')" name="role">
          <Can action="update" subject="employee">
            <USelectMenu v-model="form.role" :items="roleOptions" value-key="value" />
          </Can>
        </UFormField>
        <UFormField :label="t('employees.fields.startDate')" name="startDate" required>
          <UInput v-model="form.startDate" type="date" />
        </UFormField>
        <UFormField :label="t('employees.fields.endDate')" name="endDate">
          <UInput v-model="form.endDate" type="date" />
        </UFormField>

        <div class="md:col-span-2 mt-2 border-t border-muted pt-4 space-y-3">
          <h2 class="font-medium text-default">
            Gevoelige gegevens
          </h2>
          <div class="grid gap-4 md:grid-cols-2">
            <MaskedField
              :employee-id="employee.id"
              field="bsn"
              :masked="employee.bsnMasked"
              :label="t('employees.fields.bsn')"
            />
            <MaskedField
              :employee-id="employee.id"
              field="iban"
              :masked="employee.ibanMasked"
              :label="t('employees.fields.iban')"
            />
          </div>
        </div>

        <div class="md:col-span-2 flex justify-end gap-2">
          <UButton variant="ghost" :label="t('common.cancel')" to="/employees" />
          <UButton
            type="submit"
            color="primary"
            :label="t('common.save')"
            :loading="update.isLoading.value"
          />
        </div>
      </UForm>
    </template>
  </div>
</template>

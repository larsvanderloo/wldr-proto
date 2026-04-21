<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  createEmployeeInputSchema,
  type CreateEmployeeInput,
} from '@hr-saas/contracts/employees'
import { useCreateEmployee } from '~/composables/mutations/employees'

definePageMeta({ layout: 'default', middleware: ['require-role'] })
const { t } = useI18n()
useHead({ title: t('employees.new') })

const create = useCreateEmployee()

const form = reactive<Partial<CreateEmployeeInput>>({
  employmentType: 'permanent',
  role: 'employee',
})

async function onSubmit(ev: FormSubmitEvent<CreateEmployeeInput>) {
  const { id } = await create.mutateAsync(ev.data)
  await navigateTo(`/employees/${id}`)
}

const typeOptions = (['permanent', 'fixed_term', 'freelance', 'intern'] as const).map((v) => ({
  label: t(`employees.employmentType.${v}`),
  value: v,
}))
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <h1 class="text-2xl font-semibold">{{ t('employees.new') }}</h1>

    <UForm
      :schema="createEmployeeInputSchema"
      :state="form"
      class="grid gap-4 md:grid-cols-2"
      @submit="onSubmit"
    >
      <UFormField :label="t('employees.fields.firstName')" name="firstName" required>
        <UInput v-model="form.firstName" autofocus />
      </UFormField>
      <UFormField :label="t('employees.fields.lastName')" name="lastName" required>
        <UInput v-model="form.lastName" />
      </UFormField>
      <UFormField :label="t('employees.fields.email')" name="email" required>
        <UInput v-model="form.email" type="email" />
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
      <UFormField :label="t('employees.fields.startDate')" name="startDate" required>
        <UInput v-model="form.startDate" type="date" />
      </UFormField>
      <UFormField :label="t('employees.fields.bsn')" name="bsn">
        <UInput v-model="form.bsn" />
      </UFormField>
      <UFormField :label="t('employees.fields.iban')" name="iban">
        <UInput v-model="form.iban" />
      </UFormField>

      <div class="md:col-span-2 flex justify-end gap-2">
        <UButton variant="ghost" :label="t('common.cancel')" to="/employees" />
        <UButton
          type="submit"
          color="primary"
          :label="t('common.create')"
          :loading="create.isLoading.value"
        />
      </div>
    </UForm>
  </div>
</template>

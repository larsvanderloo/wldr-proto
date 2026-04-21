<script setup lang="ts">
import type { EmployeeListItem, EmployeeListQuery } from '@hr-saas/contracts/employees'
import { useEmployees } from '~/composables/queries/employees'

definePageMeta({ layout: 'default' })
const { t } = useI18n()

useHead({ title: t('employees.title') })

// Filter-state in een ref — Colada's key leest via toValue(), dus refetch
// gebeurt automatisch bij wijziging.
const query = ref<EmployeeListQuery>({
  limit: 25,
  sortBy: 'lastName',
  sortDir: 'asc',
})

const { data, state, refresh } = useEmployees(query)

const statusOptions = computed(() => [
  { label: 'Alle', value: undefined },
  { label: t('employees.employmentStatus.active'), value: 'active' },
  { label: t('employees.employmentStatus.on_leave'), value: 'on_leave' },
  { label: t('employees.employmentStatus.pending_start'), value: 'pending_start' },
  { label: t('employees.employmentStatus.terminated'), value: 'terminated' },
])

const columns = computed(() => [
  { accessorKey: 'lastName', header: t('employees.fields.lastName'), enableSorting: true },
  { accessorKey: 'firstName', header: t('employees.fields.firstName') },
  { accessorKey: 'jobTitle', header: t('employees.fields.jobTitle') },
  { accessorKey: 'department', header: t('employees.fields.department'), enableSorting: true },
  {
    accessorKey: 'employmentStatus',
    header: t('employees.fields.employmentStatus'),
    cell: ({ row }: { row: { original: EmployeeListItem } }) =>
      t(`employees.employmentStatus.${row.original.employmentStatus}`),
  },
  { accessorKey: 'startDate', header: t('employees.fields.startDate'), enableSorting: true },
  { id: 'actions', header: '' },
])

function onRowClick(row: { original: EmployeeListItem }) {
  return navigateTo(`/employees/${row.original.id}`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t('employees.title') }}</h1>
      <Can action="create" subject="employee">
        <UButton
          icon="i-lucide-plus"
          :label="t('employees.new')"
          to="/employees/new"
          color="primary"
        />
      </Can>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="query.search"
        icon="i-lucide-search"
        :placeholder="t('employees.list.searchPlaceholder')"
        class="w-80"
      />
      <USelectMenu
        v-model="query.status"
        :items="statusOptions"
        value-key="value"
        :placeholder="t('employees.list.filterStatus')"
        class="w-52"
      />
      <UButton
        variant="ghost"
        icon="i-lucide-refresh-cw"
        :loading="state === 'pending'"
        @click="refresh()"
      />
    </div>

    <UTable
      :data="data?.items ?? []"
      :columns="columns"
      :loading="state === 'pending'"
      :empty-state="{ icon: 'i-lucide-users', label: t('common.empty') }"
      class="rounded-lg border border-muted"
      @select="onRowClick"
    />

    <div class="flex items-center justify-end gap-2" v-if="data?.nextCursor">
      <UButton
        variant="ghost"
        :label="t('common.loading')"
        icon="i-lucide-chevron-right"
        @click="query.cursor = data?.nextCursor ?? undefined"
      />
    </div>
  </div>
</template>

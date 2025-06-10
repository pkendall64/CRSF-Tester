<script setup>
import { computed } from 'vue'

const model = defineModel({
  type: Object,
  default: () => ({ options: [], value: -1 })
})

const emits = defineEmits(['update:modelValue'])

const selectedItem = computed(() => {
  if (model.value && model.value.value !== -1 && model.value.options && model.value.options.length > model.value.value) {
    return model.value.options[model.value.value]
  }
  return null
})

const handleUpdate = (newSelectedItem) => {
  model.value.value = model.value.options.indexOf(newSelectedItem)
  emits('update:modelValue', model.value)
}

</script>

<template>
  <v-select 
    :items="model.options"
    :model-value="selectedItem" 
    @update:model-value="handleUpdate"
    density="compact"
    hide-details
    v-bind="$attrs"
  >
    <template v-if="model.unit" #append-inner>
      <v-chip
        size="small"
        variant="outlined"
        class="ml-2"
        density="compact"
        color="success"
      >
        {{ model.unit }}
      </v-chip>
    </template>
  </v-select>
</template>

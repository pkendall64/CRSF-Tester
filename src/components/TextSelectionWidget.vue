<script setup>
import {computed} from 'vue'

const model = defineModel({
  type: Object,
  default: () => ({ options: [], value: -1 })
})

const selectedItem = computed(() => {
  if (model.value && model.value.value !== -1 && model.value.options && model.value.options.length > model.value.value) {
    return model.value.options[model.value.value]
  }
  return null
})

const handleUpdate = (newSelectedItem) => {
  model.value.value = model.value.options.indexOf(newSelectedItem);
}
</script>

<template>
  <v-select
      :items="model.options"
      :model-value="selectedItem"
      @update:model-value="handleUpdate"
      v-bind="$attrs"
  ></v-select>
</template>

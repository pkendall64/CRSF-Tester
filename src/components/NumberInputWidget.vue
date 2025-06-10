<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Number,
    required: true
  },
  min: {
    type: Number,
    required: true
  },
  max: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const handleUpdate = (value) => {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="d-flex align-center">
    <VNumberInput
      :min="min"
      :max="max"
      :model-value="modelValue"
      @update:model-value="handleUpdate"
      density="compact"
      hide-details
      v-bind="$attrs"
    />
    <v-chip
      v-if="unit"
      size="small"
      variant="outlined"
      class="ml-2"
      density="compact"
      color="success"
    >
      {{ unit }}
    </v-chip>
  </div>
</template> 
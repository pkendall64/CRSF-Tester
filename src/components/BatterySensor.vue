<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'

const { registerFrameHandler, unregisterFrameHandler } = useSerialPort()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show'])

const CRSF_FRAMETYPE_BATTERY_SENSOR = 0x08

const batteryData = ref({
  voltage: 0,      // Voltage in 10µV
  current: 0,      // Current in 10µA
  capacity: 0,     // Capacity in mAh
  remaining: 0     // Remaining capacity in %
})

// Format voltage for display
const formatVoltage = (voltage) => {
  return (voltage * 0.00001).toFixed(2)  // Convert from 10µV to V
}

// Format current for display
const formatCurrent = (current) => {
  return (current * 0.00001).toFixed(2)  // Convert from 10µA to A
}

// Format capacity for display
const formatCapacity = (capacity) => {
  return capacity.toFixed(0)
}

// Get color based on remaining percentage
const getRemainingColor = (remaining) => {
  if (remaining < 20) return 'error'
  if (remaining < 40) return 'warning'
  return 'success'
}

const handleBatteryFrame = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_BATTERY_SENSOR) {
    const view = new DataView(frame.payload.buffer)
    
    // Parse battery data according to CRSF spec
    batteryData.value = {
      voltage: view.getUint16(0, false),    // Voltage in 10µV
      current: view.getUint16(2, false),    // Current in 10µA
      capacity: view.getUint16(4, false),   // Capacity in mAh
      remaining: view.getUint8(6)           // Remaining capacity in %
    }
    emit('update:show', true)
  }
}

onMounted(() => {
  registerFrameHandler(handleBatteryFrame)
})

onUnmounted(() => {
  unregisterFrameHandler(handleBatteryFrame)
})
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Battery Sensor
    </v-card-title>
    <v-card-text>
      <v-list>
        <v-list-item>
          <template v-slot:prepend>
            <v-icon>mdi-battery</v-icon>
          </template>
          <v-list-item-title>
            Voltage
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ formatVoltage(batteryData.voltage) }}V
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item>
          <template v-slot:prepend>
            <v-icon>mdi-lightning-bolt</v-icon>
          </template>
          <v-list-item-title>
            Current
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ formatCurrent(batteryData.current) }}A
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item>
          <template v-slot:prepend>
            <v-icon>mdi-battery-charging</v-icon>
          </template>
          <v-list-item-title>
            Capacity
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ formatCapacity(batteryData.capacity) }} mAh
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item>
          <template v-slot:prepend>
            <v-icon :color="getRemainingColor(batteryData.remaining)">
              mdi-battery-percent
            </v-icon>
          </template>
          <v-list-item-title>
            Remaining
          </v-list-item-title>
          <v-list-item-subtitle>
            <v-chip :color="getRemainingColor(batteryData.remaining)" size="small">
              {{ batteryData.remaining }}%
            </v-chip>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.v-list-item {
  min-height: 48px;
}
</style> 
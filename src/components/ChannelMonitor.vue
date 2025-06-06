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

const CRSF_FRAMETYPE_RC_CHANNELS_PACKED = 0x16

const channelData = ref(Array(16).fill(0))
let failsafeTimer = null

// Compute percentage for v-progress-linear
const getPercentage = (value) => {
  return (value / 2047) * 100
}

// Format the display value
const formatValue = (value) => {
  return value.toFixed(0)
}

// Generate channel labels
const channelLabels = Array.from({ length: 16 }, (_, i) => `CH${i + 1}`)

// Color computation based on value
const getColor = (value) => {
  // if (value < 682) return 'red' // First third
  // if (value < 1365) return 'orange' // Second third
  return 'green' // Last third
}

const resetFailsafeTimer = () => {
  if (failsafeTimer) {
    clearTimeout(failsafeTimer)
  }
  emit('update:show', true)
  failsafeTimer = setTimeout(() => {
    emit('update:show', false)
  }, 1000)
}

const handleRCFrame = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_RC_CHANNELS_PACKED) {
    // CRSF RC channels are 11 bits each, packed
    const channels = new Array(16).fill(0)
    const view = new DataView(frame.payload.buffer)
    let byteIndex = 0
    let bitIndex = 0

    for (let channelIndex = 0; channelIndex < 16; channelIndex++) {
      let value = 0

      // Read up to 3 bytes to get our 11 bits
      value = view.getUint8(byteIndex) // First byte
      value |= (view.getUint8(byteIndex + 1) << 8) // Second byte
      if (bitIndex > 5) { // Only need third byte if we're more than 5 bits into the second byte
        value |= (view.getUint8(byteIndex + 2) << 16) // Third byte if needed
      }

      // Extract 11 bits starting from current bit position
      value = (value >> bitIndex) & 0x07FF

      channels[channelIndex] = value

      // Move to next channel position
      bitIndex += 11
      byteIndex += Math.floor(bitIndex / 8)
      bitIndex %= 8
    }

    // Update channel values
    channelData.value = channels
    resetFailsafeTimer()
  }
}

// Register and unregister frame handler
onMounted(() => {
  registerFrameHandler(handleRCFrame)
  resetFailsafeTimer()
})

onUnmounted(() => {
  unregisterFrameHandler(handleRCFrame)
  if (failsafeTimer) {
    clearTimeout(failsafeTimer)
  }
})
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Channel Monitor
    </v-card-title>
    <v-card-text class="channels-container pa-2">
      <div
        v-for="(value, index) in channelData"
        :key="index"
        class="channel-row"
      >
        <div class="channel-label">
          {{ channelLabels[index] }}
        </div>
        <v-progress-linear
          :model-value="getPercentage(value)"
          :color="getColor(value)"
          height="16"
          rounded
        >
          <span class="channel-value">
            {{ formatValue(value) }}
          </span>
        </v-progress-linear>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.channels-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.channel-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.channel-label {
  min-width: 48px;
  font-size: 0.875rem;
}

.channel-value {
  color: white;
  font-size: 0.75rem;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
}

:deep(.v-progress-linear) {
  flex-grow: 1;
  transition: all 0.2s ease-out;
}
</style>

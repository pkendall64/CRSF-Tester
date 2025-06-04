<script setup>
import {ref, onMounted, onUnmounted} from 'vue'
import { useSerialPort } from '../composables/useSerialPort'
const { registerFrameHandler, unregisterFrameHandler } = useSerialPort()

const CRSF_FRAMETYPE_RC_CHANNELS_PACKED = 0x16

let channelData = ref(Array(16).fill(0))

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

const handleRCFrame = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_RC_CHANNELS_PACKED) {
    // CRSF RC channels are 11 bits each, packed
    const channels = new Array(16).fill(0)
    let byteIndex = 0
    let bitIndex = 0

    for (let channelIndex = 0; channelIndex < 16; channelIndex++) {
      let value = 0

      // Read up to 3 bytes to get our 11 bits
      value = frame.payload[byteIndex]                         // First byte
      value |= (frame.payload[byteIndex + 1] << 8)            // Second byte
      value |= (frame.payload[byteIndex + 2] << 16)           // Third byte if needed

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
  }
}

// Register and unregister frame handler
onMounted(() => {
  registerFrameHandler(handleRCFrame)
})

onUnmounted(() => {
  unregisterFrameHandler(handleRCFrame)
})
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Channel Monitor
      <v-spacer></v-spacer>
      <v-chip
          size="small"
          color="primary"
      >
        16 Channels
      </v-chip>
    </v-card-title>

    <v-card-text>
      <v-container>
        <v-row dense>
          <v-col
              v-for="(value, index) in channelData"
              :key="index"
              cols="12"
              sm="6"
              md="4"
              lg="3"
          >
            <v-card variant="outlined" class="pa-2">
              <div class="d-flex align-center mb-1">
                <span class="text-subtitle-2">{{ channelLabels[index] }}</span>
                <v-spacer></v-spacer>
                <span class="text-caption">{{ formatValue(value) }}</span>
              </div>
              <v-progress-linear
                  :model-value="getPercentage(value)"
                  :color="getColor(value)"
                  height="20"
                  rounded
              >
                <template v-slot:default="{ value }">
                  <span class="text-caption white--text">{{ formatValue(value * 20.47) }}</span>
                </template>
              </v-progress-linear>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.v-progress-linear {
  transition: all 0.2s ease-out;
}
</style>
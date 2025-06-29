<script setup>
import { ref, watch } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'

const props = defineProps({
  selectedDeviceId: {
    type: String,
    required: true
  },
  initialBaudRate: {
    type: Number,
    default: 115200
  }
})

const emit = defineEmits(['connected', 'disconnected', 'error', 'status-change', 'update:selectedDeviceId'])

const baudRates = [9600, 19200, 38400, 57600, 115200, 420000, 460800, 921600]
const deviceIds = [
  { title: 'Flight Controller (0xC8)', value: '0xC8', defaultBaudRate: 420000 },
  { title: 'Radio Transmitter (0xEA)', value: '0xEA', defaultBaudRate: 400000 },
  { title: 'USB Device (0x10)', value: '0x10', defaultBaudRate: 460800 },
  { title: 'Broadcast (0x00)', value: '0x00', defaultBaudRate: 420000 }
]

const isDialogOpen = ref(false)

const {
  isConnected,
  statusMessage,
  hasError,
  selectedBaudRate,
  connect,
  disconnect,
  setBaudRate
} = useSerialPort()

// Watch for device ID changes to update baud rate
watch(() => props.selectedDeviceId, (newDeviceId) => {
  const device = deviceIds.find(d => d.value === newDeviceId)
  if (device && !isConnected.value) {
    setBaudRate(device.defaultBaudRate)
  }
})

const onBaudRateChange = (newRate) => {
  setBaudRate(newRate)
}

async function connectToSerial() {
  try {
    isDialogOpen.value = true
    const result = await connect(selectedBaudRate.value)
    emit('connected', result)
  } catch (error) {
    emit('error', { error, message: error.message })
  } finally {
    isDialogOpen.value = false
  }
}

async function disconnectFromSerial() {
  try {
    await disconnect()
    emit('disconnected')
  } catch (error) {
    emit('error', { error, message: error.message })
  }
}

// Watch for status changes to emit events
watch([statusMessage, hasError], ([message, isError]) => {
  emit('status-change', { message, isError })
})

// Set initial baud rate based on selected device
const device = deviceIds.find(d => d.value === props.selectedDeviceId)
if (device) {
  setBaudRate(device.defaultBaudRate)
}
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Port Connection
    </v-card-title>

    <v-card-text>
      <!-- Status Alert -->
      <v-alert
          :type="hasError ? 'error' : isConnected ? 'success' : 'info'"
          :title="statusMessage"
          variant="tonal"
          class="mb-4"
      >
        <template v-if="isConnected">
          {{ selectedBaudRate }} baud
        </template>
      </v-alert>

      <!-- Controls -->
      <v-row>
        <v-col cols="12">
          <v-select
              :model-value="selectedDeviceId"
              @update:model-value="(val) => emit('update:selectedDeviceId', val)"
              :items="deviceIds"
              label="Device ID"
              density="comfortable"
              hide-details
              variant="outlined"
              class="mb-4"
          />
        </v-col>
        <v-col cols="12">
          <v-select
              v-model="selectedBaudRate"
              @update:model-value="onBaudRateChange"
              :items="baudRates"
              label="Baud Rate"
              :disabled="isConnected || isDialogOpen"
              density="comfortable"
              hide-details
              variant="outlined"
              class="mb-4"
          />
        </v-col>
        <v-col cols="12" class="text-center">
          <v-btn
              :color="isConnected ? 'error' : 'primary'"
              :disabled="isDialogOpen"
              :prepend-icon="isConnected ? 'mdi-lan-disconnect' : 'mdi-lan-connect'"
              @click="isConnected ? disconnectFromSerial() : connectToSerial()"
              size="large"
          >
            {{ isConnected ? 'Disconnect' : 'Connect' }}
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Overlay -->
    <v-overlay
        v-model="isDialogOpen"
        class="align-center justify-center"
        scrim="black"
        persistent
    >
      <v-card class="pa-4 text-center" width="300">
        <v-progress-circular
            indeterminate
            color="primary"
            class="mb-3"
        ></v-progress-circular>
        <v-card-text>
          Select a serial port...
        </v-card-text>
      </v-card>
    </v-overlay>
  </v-card>
</template>
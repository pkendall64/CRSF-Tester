<script setup>
import { ref, watch } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'

const emit = defineEmits(['connected', 'disconnected', 'error', 'status-change'])

const baudRates = [9600, 19200, 38400, 57600, 115200, 420000]
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
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Port Connection
      <v-spacer></v-spacer>
      <v-chip
          :color="isConnected ? 'success' : 'error'"
          :text="isConnected ? 'Connected' : 'Disconnected'"
          size="small"
      ></v-chip>
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
      <v-row align="center">
        <v-col cols="12" sm="6">
          <v-select
              v-model="selectedBaudRate"
              @update:model-value="onBaudRateChange"
              :items="baudRates"
              label="Baud Rate"
              :disabled="isConnected || isDialogOpen"
              density="comfortable"
              hide-details
              variant="outlined"
          />
        </v-col>
        <v-col cols="12" sm="6" class="text-sm-right">
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
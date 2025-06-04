<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'

const deviceList = ref([])
const scanning = ref(false)
const { sendFrame, registerFrameHandler, unregisterFrameHandler } = useSerialPort()

// CRSF frame types
const CRSF_FRAMETYPE_DEVICE_PING = 0x28
const CRSF_FRAMETYPE_DEVICE_INFO = 0x29

// Handler for DEVICE_INFO responses
const handleDeviceInfo = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_DEVICE_INFO) {
    const deviceInfo = {
      name: new TextDecoder().decode(frame.payload.slice(0, -1)), // Remove null terminator
      address: frame.origin,
      timestamp: new Date()
    }

    // Update device list, replacing existing device if found
    const existingIndex = deviceList.value.findIndex(d => d.address === deviceInfo.address)
    if (existingIndex >= 0) {
      deviceList.value[existingIndex] = deviceInfo
    } else {
      deviceList.value.push(deviceInfo)
    }
  }
}

const startScan = () => {
  scanning.value = true
  deviceList.value = [] // Clear previous results

  // Send DEVICE_PING frame
  const pingFrame = {
    type: CRSF_FRAMETYPE_DEVICE_PING,
    destination: 0x00, // Broadcast
    origin: 0xC8,     // Our address (Flight Controller)
    payload: new Uint8Array([]) // Empty payload
  }

  sendFrame(pingFrame)

  // Stop scanning after 2 seconds
  setTimeout(() => {
    scanning.value = false
  }, 2000)
}

// Register and unregister frame handler
onMounted(() => {
  registerFrameHandler(handleDeviceInfo)
})

onUnmounted(() => {
  unregisterFrameHandler(handleDeviceInfo)
})
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      Device Discovery
      <v-spacer></v-spacer>
      <v-btn
          :loading="scanning"
          :disabled="scanning"
          color="primary"
          @click="startScan"
      >
        <v-icon start>mdi-radar</v-icon>
        Scan for Devices
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-list v-if="deviceList.length > 0">
        <v-list-item
            v-for="device in deviceList"
            :key="device.address"
            :title="device.name"
            :subtitle="`Address: 0x${device.address.toString(16).padStart(2, '0')}`"
        >
          <template v-slot:prepend>
            <v-icon>mdi-radio-tower</v-icon>
          </template>
          <template v-slot:append>
            <v-chip
                size="small"
                color="success"
            >
              Online
            </v-chip>
          </template>
        </v-list-item>
      </v-list>

      <v-alert
          v-else
          type="info"
          text="No devices found. Click 'Scan for Devices' to search for CRSF devices."
      ></v-alert>
    </v-card-text>
  </v-card>
</template>
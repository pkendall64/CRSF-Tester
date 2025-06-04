<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'
import { useDeviceId } from '../composables/useDeviceId'
import DeviceParameters from "@/components/DeviceParameters.vue";

const deviceList = ref([])
const scanning = ref(false)
const { sendFrame, registerFrameHandler, unregisterFrameHandler } = useSerialPort()
const { getDeviceIdNumber } = useDeviceId()
const selectedDevice = ref(null)

// CRSF frame types
const CRSF_FRAMETYPE_DEVICE_PING = 0x28
const CRSF_FRAMETYPE_DEVICE_INFO = 0x29

// Helper function to parse null-terminated string from Uint8Array
const parseNullTerminatedString = (array) => {
  const nullIndex = array.findIndex(byte => byte === 0)
  return new TextDecoder().decode(array.slice(0, nullIndex >= 0 ? nullIndex : undefined))
}

// Helper function to parse 32-bit number from Uint8Array in big-endian order
const parseUint32 = (array, offset) => {
  return (array[offset] << 24) |
      (array[offset + 1] << 16) |
      (array[offset + 2] << 8) |
      (array[offset + 3])
}

// Handler for DEVICE_INFO responses
const handleDeviceInfo = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_DEVICE_INFO) {
    const payload = frame.payload

    // Find the end of the device name
    const nameEndIndex = payload.findIndex(byte => byte === 0)
    const nameLength = nameEndIndex >= 0 ? nameEndIndex : payload.length

    const deviceInfo = {
      name: parseNullTerminatedString(payload),
      address: frame.origin,
      serialNumber: parseUint32(payload, nameLength + 1),
      hardwareId: parseUint32(payload, nameLength + 5),
      firmwareId: parseUint32(payload, nameLength + 9),
      parametersTotal: payload[nameLength + 13],
      parameterVersion: payload[nameLength + 14],
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
    origin: getDeviceIdNumber(), // Use selected device ID
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
  <div>
    <v-card>
      <v-card-title class="d-flex align-center">
        Device Discovery
        <v-spacer></v-spacer>
        <v-btn
            :loading="scanning"
            :disabled="scanning"
            color="primary"
            size="small"
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
              :subtitle="`ID: 0x${device.address.toString(16).padStart(2, '0')} | S/N: ${device.serialNumber} | HW: ${device.hardwareId} | FW: ${device.firmwareId} | Params: ${device.parametersTotal}`"
              @click="selectedDevice = device"
          >
            <template v-slot:prepend>
              <v-icon>mdi-radio-tower</v-icon>
            </template>
            <template v-slot:append>
              <v-chip
                  size="small"
                  :color="selectedDevice?.address === device.address ? 'primary' : 'success'"
              >
                {{ selectedDevice?.address === device.address ? 'Selected' : 'Online' }}
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
    <!-- Device Parameters Component -->
    <DeviceParameters
        v-if="selectedDevice"
        :device-id="selectedDevice.address"
        :device-name="selectedDevice.name"
        :parameter-count="selectedDevice.parametersTotal"
    />
  </div>
</template>
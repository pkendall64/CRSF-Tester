<script setup>
import { ref, computed } from 'vue'
import { useSerialPort } from './composables/useSerialPort'
import { useDeviceId } from './composables/useDeviceId'
import SerialPortConnection from '@/components/SerialPortConnection.vue'
import ChannelMonitor from "@/components/ChannelMonitor.vue";
import DeviceDiscovery from "@/components/DeviceDiscovery.vue"
import LinkStats from "@/components/LinkStats.vue";

const connectionDialog = ref(true)
const { isConnected } = useSerialPort()
const { selectedDeviceId } = useDeviceId()

// Device ID options
const deviceIds = [
  { title: 'Flight Controller (0xC8)', value: '0xC8' },
  { title: 'Radio Transmitter (0xEA)', value: '0xEA' },
  { title: 'USB Device (0x10)', value: '0x10' },
  { title: 'Broadcast (0x00)', value: '0x00' }
]

const onConnected = (connectionInfo) => {
  console.log('Connected to port:', connectionInfo)
  connectionDialog.value = false
}

const onDisconnected = () => {
  console.log('Disconnected from port')
  connectionDialog.value = true
}

const onError = ({ error, message }) => {
  console.error('Serial port error:', message, error)
}

const onStatusChange = ({ message, isError }) => {
  console.log('Status changed:', message, isError)
}

const showConnectionDialog = () => {
  connectionDialog.value = true
}

// Add status indicator to the app bar
const getConnectionStatus = computed(() => {
  return isConnected.value ? 'Connected' : 'Disconnected'
})

const getStatusColor = computed(() => {
  return isConnected.value ? 'success' : 'error'
})

</script>

<template>
  <v-app>
    <!-- App Bar -->
    <v-app-bar>
      <v-app-bar-title>CRSF Tester</v-app-bar-title>
      <template v-slot:append>
        <span class="text-subtitle-2 mr-2">My Device ID:</span>
        <v-select
            v-model="selectedDeviceId"
            :items="deviceIds"
            density="compact"
            hide-details
            class="device-select mr-4"
            variant="outlined"
        />
        <v-chip
            :color="getStatusColor"
            size="small"
            class="mr-2"
        >
          {{ getConnectionStatus }}
        </v-chip>
        <v-tooltip activator="parent" location="bottom">
          <template #activator="{ props }">
            <v-btn
                icon="mdi-usb-port"
                @click="showConnectionDialog"
                v-bind="props"
            />
          </template>
          <span>Manage Connection</span>
        </v-tooltip>
      </template>
    </v-app-bar>

    <!-- Main Content -->
    <v-main bg-color="#f5f5f5" class="fill-width">
      <v-container class="pa-2 main-container" fluid>
        <v-row>
          <!-- Left Column -->
          <v-col cols="12" md="6" lg="4" class="left-column">
            <!-- Link Stats Card -->
            <v-card class="mb-4">
              <LinkStats />
            </v-card>

            <!-- Channel Monitor Card -->
            <v-card>
              <ChannelMonitor />
            </v-card>
          </v-col>

          <!-- Right Column -->
          <v-col cols="12" md="6" lg="8" class="right-column">
            <!-- Device Discovery Card -->
            <v-card class="mb-4">
              <DeviceDiscovery />
            </v-card>

            <!-- Parameters Card - Only show if parameters are loaded -->
            <v-card v-if="parameters?.length">
              <v-card-title>Parameters</v-card-title>
              <v-card-text>
                <!-- Parameters content will go here -->
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <!-- Connection Dialog -->
    <v-dialog
      v-model="connectionDialog"
      persistent
      width="auto"
    >
      <SerialPortConnection
        ref="serialPort"
        :initial-baud-rate="115200"
        @connected="onConnected"
        @disconnected="onDisconnected"
        @error="onError"
        @status-change="onStatusChange"
      />
    </v-dialog>
  </v-app>
</template>

<style scoped>
.v-navigation-drawer :deep(.v-list-item--selected) {
  background-color: rgb(var(--v-theme-primary));
  color: white;
}
.fill-width {
  width: 100% !important;
  max-width: 100% !important;
}
.device-select {
  max-width: 250px;
}

:deep(.v-field__input) {
  min-height: 32px !important;
}

.main-container {
  padding-left: 24px !important;
  padding-right: 24px !important;
}
</style>
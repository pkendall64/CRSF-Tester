<script setup>
import { ref, computed } from 'vue'
import { useSerialPort } from './composables/useSerialPort'
import { useDeviceId } from './composables/useDeviceId'
import SerialPortConnection from '@/components/SerialPortConnection.vue'
import ChannelMonitor from "@/components/ChannelMonitor.vue";
import DeviceDiscovery from "@/components/DeviceDiscovery.vue"
import LinkStats from "@/components/LinkStats.vue";
import DeviceParameters from "@/components/DeviceParameters.vue";
import GpsMonitor from './components/GPS.vue'
import BatterySensor from './components/BatterySensor.vue'
import Attitude3D from './components/Attitude3D.vue'

const connectionDialog = ref(true)
const { isConnected } = useSerialPort()
const { selectedDeviceId } = useDeviceId()
const selectedDevice = ref(null)
const showGps = ref(false)
const showChannels = ref(false)
const showBattery = ref(false)
const showAttitude3D = ref(false)

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
        <v-chip :color="getStatusColor" size="small" class="mr-2">
          {{ getConnectionStatus }}
        </v-chip>
        <v-tooltip activator="parent" location="bottom">
          <template #activator="{ props }">
            <v-btn icon="mdi-usb-port" @click="showConnectionDialog" v-bind="props" />
          </template>
          <span>Manage Connection</span>
        </v-tooltip>
      </template>
    </v-app-bar>

    <!-- Main Content -->
    <v-main class="bg-grey-lighten-3">
      <v-container class="mt-4 main-container" fluid>
        <v-row>
          <!-- Left Column -->
          <v-col cols="12" md="6" lg="4" class="left-column">
            <!-- Link Stats Card -->
            <v-card class="mb-4">
              <LinkStats />
            </v-card>

            <!-- Channel Monitor Card -->
            <v-card v-show="showChannels">
              <ChannelMonitor v-model:show="showChannels" />
            </v-card>
          </v-col>

          <!-- Right Column -->
          <v-col cols="12" md="6" lg="8" class="right-column">
            <!-- Device Discovery Card -->
            <v-card class="mb-4">
              <DeviceDiscovery v-model:selected-device="selectedDevice" />
            </v-card>
            <!-- Device Parameters Component -->
            <DeviceParameters v-if="selectedDevice" :device-id="selectedDevice.address"
              :device-name="selectedDevice.name" :parameter-count="selectedDevice.parametersTotal" />
          </v-col>
        </v-row>
        <v-row>
          <v-col v-show="showBattery" cols="12" sm="6" md="4">
            <BatterySensor v-model:show="showBattery" />
          </v-col>
          <v-col v-show="showAttitude3D" cols="12" md="6">
            <Attitude3D v-model:show="showAttitude3D" />
          </v-col>
          <v-col v-show="showGps" cols="12" md="4" lg="3" class="left-column">
            <GpsMonitor v-model:show="showGps" />
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <!-- Connection Dialog -->
    <v-dialog v-model="connectionDialog" persistent width="auto">
      <SerialPortConnection
        ref="serialPort"
        :initial-baud-rate="115200"
        v-model:selected-device-id="selectedDeviceId"
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

.main-container {
  padding-left: 24px !important;
  padding-right: 24px !important;
}
</style>
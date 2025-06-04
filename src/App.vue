<script setup>
import { ref} from 'vue'
import { computed } from 'vue'
import { useSerialPort } from './composables/useSerialPort'
import SerialPortConnection from '@/components/SerialPortConnection.vue'
import ChannelMonitor from "@/components/ChannelMonitor.vue";
import DeviceDiscovery from "@/components/DeviceDiscovery.vue"
import LinkStats from "@/components/LinkStats.vue";

const connectionDialog = ref(true)
const { isConnected } = useSerialPort()

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
      <v-app-bar-title>CRSF Tester Dashboard</v-app-bar-title>
      <template v-slot:append>
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
      <v-container class="pa-2" fluid>
        <v-row>
          <v-col cols="12" md="12" lg="4">
            <LinkStats />
          </v-col>
          <v-col cols="12" md="6" lg="4">
            <ChannelMonitor />
          </v-col>
          <v-col cols="12" md="6" lg="4">
            <DeviceDiscovery />
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

.v-container {
  max-width: none !important;
}
</style>
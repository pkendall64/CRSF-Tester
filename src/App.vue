<script setup>
import { ref } from 'vue'
import { computed } from 'vue'
import { useSerialPort } from './composables/useSerialPort'
import SerialPortConnection from './components/SerialPortConnection.vue'

const drawer = ref(true)
const rail = ref(true)
const connectionDialog = ref(true)
const { isConnected, statusMessage } = useSerialPort()

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
    <!-- Navigation Drawer -->
    <v-navigation-drawer
      v-model="drawer"
      :rail="rail"
      permanent
    >
      <v-list-item
        prepend-avatar="https://randomuser.me/api/portraits/men/85.jpg"
        title="CRSF Tester"
      >
        <template v-slot:append>
          <v-btn
            variant="text"
            icon="mdi-chevron-left"
            @click.stop="rail = !rail"
          ></v-btn>
        </template>
      </v-list-item>

      <v-divider></v-divider>

      <v-list density="compact" nav>
        <v-list-item
          prepend-icon="mdi-view-dashboard"
          title="Dashboard"
          value="dashboard"
          selected
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-usb-port"
          title="Connection"
          value="connection"
          @click="showConnectionDialog"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-chart-line"
          title="Monitoring"
          value="monitoring"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-cog"
          title="Settings"
          value="settings"
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>

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
        <v-btn
            icon="mdi-usb-port"
            @click="showConnectionDialog"
        >
          <v-tooltip activator="parent" location="bottom">
            Manage Connection
          </v-tooltip>
        </v-btn>
        <v-btn icon="mdi-refresh"></v-btn>
        <v-btn icon="mdi-dots-vertical"></v-btn>
      </template>
    </v-app-bar>

    <!-- Main Content -->
    <v-main>
      <v-container>
        <v-row>
          <v-col cols="12">
            <v-card>
              <v-card-title>Welcome to CRSF Tester</v-card-title>
              <v-card-text>
                <p>Please connect to a serial port to begin testing.</p>
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
</style>
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'

const { registerFrameHandler, unregisterFrameHandler } = useSerialPort()

// CRSF frame type for link statistics
const CRSF_FRAMETYPE_LINK_STATISTICS = 0x14

// RF Profile names
const RF_PROFILE_NAMES = []

RF_PROFILE_NAMES[0] = 'LORA 900M 25Hz'
RF_PROFILE_NAMES[1] = 'LORA 900M 50Hz'
RF_PROFILE_NAMES[2] = 'LORA 900M 100Hz'
RF_PROFILE_NAMES[3] = 'LORA 900M 100Hz Full'
RF_PROFILE_NAMES[4] = 'LORA 900M 150Hz'
RF_PROFILE_NAMES[5] = 'LORA 900M 200Hz'
RF_PROFILE_NAMES[6] = 'LORA 900M 200Hz Full'
RF_PROFILE_NAMES[7] = 'LORA 900M 250Hz'
RF_PROFILE_NAMES[8] = 'LORA 900M 333Hz Full'
RF_PROFILE_NAMES[9] = 'LORA 900M 500Hz'
RF_PROFILE_NAMES[10] = 'LORA 900M 50Hz_DVDA'
RF_PROFILE_NAMES[11] = 'FSK 900M 1000Hz Full'

RF_PROFILE_NAMES[20] = 'LORA 2.4G 25Hz'
RF_PROFILE_NAMES[21] = 'LORA 2.4G 50Hz'
RF_PROFILE_NAMES[22] = 'LORA 2.4G 100Hz'
RF_PROFILE_NAMES[23] = 'LORA 2.4G 100Hz Full'
RF_PROFILE_NAMES[24] = 'LORA 2.4G 150Hz'
RF_PROFILE_NAMES[25] = 'LORA 2.4G 200Hz'
RF_PROFILE_NAMES[26] = 'LORA 2.4G 200Hz Full'
RF_PROFILE_NAMES[27] = 'LORA 2.4G 250Hz'
RF_PROFILE_NAMES[28] = 'LORA 2.4G 333Hz Full'
RF_PROFILE_NAMES[29] = 'LORA 2.4G 500Hz'
RF_PROFILE_NAMES[30] = 'FLRC 2.4G 250Hz DVDA'
RF_PROFILE_NAMES[31] = 'FLRC 2.4G 500Hz DVDA'
RF_PROFILE_NAMES[32] = 'FLRC 2.4G 500Hz'
RF_PROFILE_NAMES[33] = 'FLRC 2.4G 1000Hz'
RF_PROFILE_NAMES[34] = 'FSK 2.4G 250Hz DVDA'
RF_PROFILE_NAMES[35] = 'FSK 2.4G 500Hz DVDA'
RF_PROFILE_NAMES[36] = 'FSK 2.4G 1000Hz'

RF_PROFILE_NAMES[100] = 'LORA 900M/2.4G 100Hz Full'
RF_PROFILE_NAMES[101] = 'LORA 900M/2.4G 150Hz'

// RF Power levels in mW
const RF_POWER_LEVELS = [0, 10, 25, 100, 500, 1000, 2000, 250, 50]

const linkStats = ref({
  uplink: {
    rssiAnt1: 0,    // dBm * -1
    rssiAnt2: 0,    // dBm * -1
    lq: 0,          // %
    snr: 0,         // dB
    activeAntenna: 1,
    rfProfile: 0,
    rfPower: 0      // index into RF_POWER_LEVELS
  },
  downlink: {
    rssi: 0,        // dBm * -1
    lq: 0,          // %
    snr: 0          // dB
  }
})

const lastUpdate = ref(new Date())

// Format RSSI for display (-dBm)
const formatRSSI = (rssi) => {
  return `-${rssi} dBm`
}

const getRFModeName = (profile) => {
  return RF_PROFILE_NAMES[profile] || 'Unknown'
}

const getRFPower = (powerIndex) => {
  return RF_POWER_LEVELS[powerIndex] || 0
}

// Get color based on link quality
const getLQColor = (lq) => {
  if (lq < 50) return 'error'
  if (lq < 75) return 'warning'
  return 'success'
}

// Get color based on RSSI
const getRSSIColor = (rssi) => {
  if (rssi > 100) return 'error'    // weaker than -100 dBm
  if (rssi > 90) return 'warning'   // weaker than -90 dBm
  return 'success'
}

// Handle incoming link statistics frames
const handleLinkStats = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_LINK_STATISTICS) {
    const data = frame.payload

    // Update link statistics
    linkStats.value = {
      uplink: {
        rssiAnt1: data[0],
        rssiAnt2: data[1],
        lq: data[2],
        snr: data[3],          // Already signed
        activeAntenna: data[4],
        rfProfile: data[5],
        rfPower: data[6]
      },
      downlink: {
        rssi: data[7],
        lq: data[8],
        snr: data[9]           // Already signed
      }
    }

    lastUpdate.value = new Date()
  }
}

// Register and unregister frame handler
onMounted(() => {
  registerFrameHandler(handleLinkStats)
})

onUnmounted(() => {
  unregisterFrameHandler(handleLinkStats)
})
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Link Statistics
      <v-spacer></v-spacer>
      <v-chip size="small" color="primary">
        Last update: {{ lastUpdate.toLocaleTimeString() }}
      </v-chip>
    </v-card-title>

    <v-card-text>
      <v-container>
        <v-row>
          <!-- Uplink Statistics -->
          <v-col cols="12" md="6">
            <v-card variant="outlined">
              <v-card-title class="text-subtitle-1">
                Uplink
                <v-spacer></v-spacer>
                <v-chip size="small">
                  {{ getRFModeName(linkStats.uplink.rfProfile) }}
                </v-chip>
              </v-card-title>
              <v-card-text>
                <v-list density="compact">
                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon :color="getRSSIColor(linkStats.uplink.rssiAnt1)">
                        mdi-antenna
                      </v-icon>
                    </template>
                    <v-list-item-title>RSSI Ant 1</v-list-item-title>
                    <template v-slot:append>
                      <v-chip :color="getRSSIColor(linkStats.uplink.rssiAnt1)" size="small">
                        {{ formatRSSI(linkStats.uplink.rssiAnt1) }}
                      </v-chip>
                    </template>
                  </v-list-item>

                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon :color="getRSSIColor(linkStats.uplink.rssiAnt2)">
                        mdi-antenna
                      </v-icon>
                    </template>
                    <v-list-item-title>RSSI Ant 2</v-list-item-title>
                    <template v-slot:append>
                      <v-chip :color="getRSSIColor(linkStats.uplink.rssiAnt2)" size="small">
                        {{ formatRSSI(linkStats.uplink.rssiAnt2) }}
                      </v-chip>
                    </template>
                  </v-list-item>

                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon :color="getLQColor(linkStats.uplink.lq)">
                        mdi-link
                      </v-icon>
                    </template>
                    <v-list-item-title>Link Quality</v-list-item-title>
                    <template v-slot:append>
                      <v-chip :color="getLQColor(linkStats.uplink.lq)" size="small">
                        {{ linkStats.uplink.lq }}%
                      </v-chip>
                    </template>
                  </v-list-item>

                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon>mdi-sine-wave</v-icon>
                    </template>
                    <v-list-item-title>SNR</v-list-item-title>
                    <template v-slot:append>
                      <v-chip size="small">
                        {{ linkStats.uplink.snr }} dB
                      </v-chip>
                    </template>
                  </v-list-item>

                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon :color="linkStats.uplink.activeAntenna === 1 ? 'primary' : ''">
                        mdi-antenna
                      </v-icon>
                    </template>
                    <v-list-item-title>Active Antenna</v-list-item-title>
                    <template v-slot:append>
                      <v-chip size="small" :color="linkStats.uplink.activeAntenna === 1 ? 'primary' : ''">
                        {{ linkStats.uplink.activeAntenna }}
                      </v-chip>
                    </template>
                  </v-list-item>

                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon>mdi-transmission-tower</v-icon>
                    </template>
                    <v-list-item-title>TX Power</v-list-item-title>
                    <template v-slot:append>
                      <v-chip size="small">
                        {{ getRFPower(linkStats.uplink.rfPower) }} mW
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Downlink Statistics -->
          <v-col cols="12" md="6">
            <v-card variant="outlined">
              <v-card-title class="text-subtitle-1">Downlink</v-card-title>
              <v-card-text>
                <v-list density="compact">
                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon :color="getRSSIColor(linkStats.downlink.rssi)">
                        mdi-signal
                      </v-icon>
                    </template>
                    <v-list-item-title>RSSI</v-list-item-title>
                    <template v-slot:append>
                      <v-chip :color="getRSSIColor(linkStats.downlink.rssi)" size="small">
                        {{ formatRSSI(linkStats.downlink.rssi) }}
                      </v-chip>
                    </template>
                  </v-list-item>

                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon :color="getLQColor(linkStats.downlink.lq)">
                        mdi-link
                      </v-icon>
                    </template>
                    <v-list-item-title>Link Quality</v-list-item-title>
                    <template v-slot:append>
                      <v-chip :color="getLQColor(linkStats.downlink.lq)" size="small">
                        {{ linkStats.downlink.lq }}%
                      </v-chip>
                    </template>
                  </v-list-item>

                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon>mdi-sine-wave</v-icon>
                    </template>
                    <v-list-item-title>SNR</v-list-item-title>
                    <template v-slot:append>
                      <v-chip size="small">
                        {{ linkStats.downlink.snr }} dB
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-card-text>
  </v-card>
</template>
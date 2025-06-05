<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'

const { registerFrameHandler, unregisterFrameHandler } = useSerialPort()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show'])

const CRSF_FRAMETYPE_GPS = 0x02

const gpsData = ref({
  latitude: 0,
  longitude: 0,
  speed: 0,
  altitude: 0,
  satellites: 0
})

// Convert CRSF GPS coordinates to decimal degrees
const convertCoordinate = (value) => {
  return value / 10000000.0
}

// Format speed in km/h
const formatSpeed = (speed) => {
  return (speed / 100.0).toFixed(2)
}

// Format altitude in meters
const formatAltitude = (altitude) => {
  return (altitude / 100.0).toFixed(2)
}

const handleGpsFrame = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_GPS) {
    // Parse GPS data according to CRSF spec
    const latitude = convertCoordinate(frame.payload.readInt32BE(0))
    const longitude = convertCoordinate(frame.payload.readInt32BE(4))
    const speed = frame.payload.readUInt16BE(8)
    const altitude = frame.payload.readInt16BE(10) - 1000
    const satellites = frame.payload[12]

    gpsData.value = {
      latitude,
      longitude,
      speed,
      altitude,
      satellites
    }
    emit('update:show', true)
  }
}

onMounted(() => {
  registerFrameHandler(handleGpsFrame)
})

onUnmounted(() => {
  unregisterFrameHandler(handleGpsFrame)
})
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      GPS Monitor
    </v-card-title>
    <v-card-text>
      <v-list>
        <v-list-item>
          <template v-slot:prepend>
            <v-icon icon="mdi-map-marker" />
          </template>
          <v-list-item-title>
            Position
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ gpsData.latitude.toFixed(6) }}°, {{ gpsData.longitude.toFixed(6) }}°
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item>
          <template v-slot:prepend>
            <v-icon icon="mdi-speedometer" />
          </template>
          <v-list-item-title>
            Speed
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ formatSpeed(gpsData.speed) }} km/h
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item>
          <template v-slot:prepend>
            <v-icon icon="mdi-altimeter" />
          </template>
          <v-list-item-title>
            Altitude
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ formatAltitude(gpsData.altitude) }} m
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item>
          <template v-slot:prepend>
            <v-icon icon="mdi-satellite" />
          </template>
          <v-list-item-title>
            Satellites
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ gpsData.satellites }} satellites
          </v-list-item-subtitle>
        </v-list-item>

      </v-list>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.v-list-item {
  min-height: 48px;
}
</style> 
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

const CRSF_FRAMETYPE_ATTITUDE = 0x1E

const hasReceivedData = ref(false)
const attitudeData = ref({
  pitch: 0,
  roll: 0,
  yaw: 0
})

// Convert CRSF attitude values from 100 micro radians to degrees
const convertAttitude = (value) => {
  // Convert from 100 micro radians to radians, then to degrees
  return (value * 0.0001) * (180.0 / Math.PI)
}

const handleAttitudeFrame = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_ATTITUDE) {
    const pitch = convertAttitude(frame.payload.readInt16BE(0))
    const roll = convertAttitude(frame.payload.readInt16BE(2))
    const yaw = convertAttitude(frame.payload.readInt16BE(4))

    attitudeData.value = {
      pitch,
      roll,
      yaw
    }
    hasReceivedData.value = true
    emit('update:show', true)
  }
}

// Get compass label (N, NE, E, etc.)
const getCompassLabel = (degrees) => {
  const labels = {
    0: 'N',
    90: 'E',
    180: 'S',
    270: 'W',
    30: 'NE',
    60: 'NE',
    120: 'SE',
    150: 'SE',
    210: 'SW',
    240: 'SW',
    300: 'NW',
    330: 'NW'
  }
  return labels[degrees] || ''
}

onMounted(() => {
  registerFrameHandler(handleAttitudeFrame)
})

onUnmounted(() => {
  unregisterFrameHandler(handleAttitudeFrame)
})
</script>

<template>
  <v-card v-if="hasReceivedData" class="attitude-panel">
    <v-card-title class="text-h6">
      Attitude Indicator
    </v-card-title>
    <v-card-text>
      <div class="attitude-container">
        <!-- Artificial Horizon -->
        <div class="artificial-horizon" :style="{
          transform: `rotate(${attitudeData.roll}deg)`
        }">
          <div class="sky" :style="{
            transform: `translateY(${attitudeData.pitch * 2}px)`
          }" />
          <div class="ground" :style="{
            transform: `translateY(${attitudeData.pitch * 2}px)`
          }" />
          <div class="pitch-lines">
            <div v-for="i in 9" :key="i" class="pitch-line" :style="{
              top: `${(i - 5) * 20}px`
            }">
              <span class="pitch-value">{{ (i - 5) * 10 }}°</span>
            </div>
          </div>
        </div>

        <!-- Roll Indicator -->
        <div class="roll-indicator">
          <div class="roll-marker" :style="{
            transform: `rotate(${-attitudeData.roll}deg)`
          }">
            <div class="roll-triangle" />
          </div>
          <div class="roll-scale">
            <div v-for="i in 7" :key="i" class="roll-tick" :style="{
              transform: `rotate(${(i - 4) * 30}deg)`
            }">
              <span class="roll-value">{{ (i - 4) * 30 }}°</span>
            </div>
          </div>
        </div>

        <!-- Compass Rose -->
        <div class="compass-rose" :style="{
          transform: `rotate(${attitudeData.yaw}deg)`
        }">
          <div v-for="i in 36" :key="i" class="compass-tick" :style="{
            transform: `rotate(${i * 10}deg)`
          }">
            <div class="compass-major" v-if="i % 3 === 0">
              <span class="compass-label">{{ getCompassLabel(i * 10) }}</span>
            </div>
            <div class="compass-minor" v-else />
          </div>
        </div>

        <!-- Heading Indicator -->
        <div class="heading-indicator">
          <div class="heading-marker">
            <div class="heading-triangle" />
          </div>
          <div class="heading-window">
            <span class="heading-value">{{ Math.round(attitudeData.yaw) }}°</span>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.attitude-panel {
  background: white;
  color: #333;
}

.attitude-container {
  position: relative;
  width: 300px;
  height: 300px;
  margin: 0 auto;
  border-radius: 50%;
  overflow: hidden;
  background: #f5f5f5;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
  border: 1px solid #e0e0e0;
}

.artificial-horizon {
  position: absolute;
  width: 100%;
  height: 100%;
  transition: transform 0.1s ease-out;
}

.sky {
  position: absolute;
  width: 100%;
  height: 50%;
  background: linear-gradient(to bottom, #1e90ff, #87ceeb);
  transition: transform 0.1s ease-out;
}

.ground {
  position: absolute;
  width: 100%;
  height: 50%;
  top: 50%;
  background: linear-gradient(to bottom, #8b4513, #654321);
  transition: transform 0.1s ease-out;
}

.pitch-lines {
  position: absolute;
  width: 100%;
  height: 100%;
}

.pitch-line {
  position: absolute;
  width: 100%;
  height: 1px;
  background: rgba(0, 0, 0, 0.5);
}

.pitch-line::before,
.pitch-line::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 1px;
  background: rgba(0, 0, 0, 0.5);
}

.pitch-line::before {
  left: 20%;
}

.pitch-line::after {
  right: 20%;
}

.pitch-value {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #333;
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.5);
}

.roll-indicator {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.roll-marker {
  position: absolute;
  width: 100%;
  height: 100%;
  transition: transform 0.1s ease-out;
}

.roll-triangle {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 12px solid #333;
}

.roll-scale {
  position: absolute;
  width: 100%;
  height: 100%;
}

.roll-tick {
  position: absolute;
  width: 100%;
  height: 1px;
  background: rgba(0, 0, 0, 0.3);
}

.roll-value {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #333;
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.5);
}

.compass-rose {
  position: absolute;
  width: 100%;
  height: 100%;
  transition: transform 0.1s ease-out;
  pointer-events: none;
}

.compass-tick {
  position: absolute;
  width: 100%;
  height: 100%;
}

.compass-major {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 15px;
  background: #333;
}

.compass-minor {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  height: 8px;
  background: rgba(0, 0, 0, 0.3);
}

.compass-label {
  position: absolute;
  top: 25px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #333;
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.5);
}

.heading-indicator {
  position: absolute;
  bottom: 20px;
  width: 100%;
  height: 30px;
  pointer-events: none;
}

.heading-marker {
  position: absolute;
  width: 100%;
  height: 100%;
  transition: transform 0.1s ease-out;
}

.heading-triangle {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 8px solid #333;
}

.heading-window {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.heading-value {
  font-size: 14px;
  font-weight: bold;
  color: #333;
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.5);
}
</style> 
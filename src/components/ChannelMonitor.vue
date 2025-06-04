<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  channels: {
    type: Array,
    default: () => Array(16).fill(0)
  }
})

// Compute percentage for v-progress-linear
const getPercentage = (value) => {
  return (value / 2047) * 100
}

// Format the display value
const formatValue = (value) => {
  return value.toFixed(0)
}

// Generate channel labels
const channelLabels = Array.from({ length: 16 }, (_, i) => `CH${i + 1}`)

// Color computation based on value
const getColor = (value) => {
  if (value < 682) return 'red' // First third
  if (value < 1365) return 'orange' // Second third
  return 'green' // Last third
}
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Channel Monitor
      <v-spacer></v-spacer>
      <v-chip
          size="small"
          color="primary"
      >
        16 Channels
      </v-chip>
    </v-card-title>

    <v-card-text>
      <v-container>
        <v-row dense>
          <v-col
              v-for="(value, index) in channels"
              :key="index"
              cols="12"
              sm="6"
              md="4"
              lg="3"
          >
            <v-card variant="outlined" class="pa-2">
              <div class="d-flex align-center mb-1">
                <span class="text-subtitle-2">{{ channelLabels[index] }}</span>
                <v-spacer></v-spacer>
                <span class="text-caption">{{ formatValue(value) }}</span>
              </div>
              <v-progress-linear
                  :model-value="getPercentage(value)"
                  :color="getColor(value)"
                  height="20"
                  rounded
              >
                <template v-slot:default="{ value }">
                  <span class="text-caption white--text">{{ formatValue(value * 20.47) }}</span>
                </template>
              </v-progress-linear>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.v-progress-linear {
  transition: all 0.2s ease-out;
}
</style>
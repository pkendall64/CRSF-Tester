<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'
import { useDeviceId } from '../composables/useDeviceId'

const props = defineProps({
  deviceId: {
    type: Number,
    required: true
  },
  deviceName: {
    type: String,
    required: true
  },
  parameterCount: {
    type: Number,
    required: true
  }
})

const CRSF_FRAMETYPE_PARAM_ENTRY = 0x2B
const CRSF_FRAMETYPE_PARAM_READ = 0x2C
const DATA_TYPE_FLOAT = 0x08

const { sendFrame, registerFrameHandler, unregisterFrameHandler } = useSerialPort()
const { getDeviceIdNumber } = useDeviceId()

const parameters = ref([])
const loading = ref(false)
const currentChunk = ref({
  paramNumber: 0,
  chunkNumber: 0
})

// Helper function to parse null-terminated string from Uint8Array
const parseNullTerminatedString = (array) => {
  const nullIndex = array.findIndex(byte => byte === 0)
  return new TextDecoder().decode(array.slice(0, nullIndex >= 0 ? nullIndex : undefined))
}

const parseNullTerminatedString2 = (array, offset) => {
  const nullIndex = offset + array.slice(offset).findIndex(byte => byte === 0)
  const strValue = new TextDecoder().decode(array.slice(offset, nullIndex >= 0 ? nullIndex : undefined))
  const newOffset = nullIndex >= 0 ? nullIndex+1 : undefined
  console.log('strValue:', strValue)
  console.log('newOffset:', newOffset)
  return { strValue, newOffset }
}


// Helper function to parse parameter value based on type and decimal point
const parseParameterValue = (value, type, decimalPoint) => {
  if (type === DATA_TYPE_FLOAT) {
    return (value / Math.pow(10, decimalPoint)).toFixed(decimalPoint)
  }
  return value
}

// Parameter data types
const PARAM_TYPE = {
  UINT8: 0x00,
  INT8: 0x01,
  UINT16: 0x02,
  INT16: 0x03,
  UINT32: 0x04,
  INT32: 0x05,
  FLOAT: 0x08,
  TEXT_SELECTION: 0x09,
  STRING: 0x0A,
  FOLDER: 0x0B,
  INFO: 0x0C,
  COMMAND: 0x0D,
}

// Parameter parsing functions for different types
const parameterParsers = {
  // Common parser for the header part of all parameters
  parseCommonFields(payload) {
    let offset = 0
    const parentFolder = payload[offset++]
    const dataType = payload[offset++] & 0x3F

    const {strValue, newOffset} = parseNullTerminatedString2(payload, 2)
    return {
      parentFolder,
      dataType,
      name: strValue,
      offset: newOffset
    }
  },

  [PARAM_TYPE.UINT8](payload, offset) {
    return {
      value: payload[offset],
      min: payload[offset + 1],
      max: payload[offset + 2],
      default: payload[offset + 3],
      unit: parseNullTerminatedString(payload.slice(offset + 4))
    }
  },

  [PARAM_TYPE.INT8](payload, offset) {
    return {
      value: new Int8Array([payload[offset]])[0],
      min: new Int8Array([payload[offset + 1]])[0],
      max: new Int8Array([payload[offset + 2]])[0],
      default: new Int8Array([payload[offset + 3]])[0],
      unit: parseNullTerminatedString(payload.slice(offset + 4))
    }
  },

  [PARAM_TYPE.UINT16](payload, offset) {
    const view = new DataView(payload.buffer)
    return {
      value: view.getUint16(offset),
      min: view.getUint16(offset + 2),
      max: view.getUint16(offset + 4),
      default: view.getUint16(offset + 6),
      unit: parseNullTerminatedString(payload.slice(offset + 8))
    }
  },

  [PARAM_TYPE.INT16](payload, offset) {
    const view = new DataView(payload.buffer)
    return {
      value: view.getInt16(offset),
      min: view.getInt16(offset + 2),
      max: view.getInt16(offset + 4),
      default: view.getInt16(offset + 6),
      unit: parseNullTerminatedString(payload.slice(offset + 8))
    }
  },

  [PARAM_TYPE.UINT32](payload, offset) {
    const view = new DataView(payload.buffer)
    return {
      value: view.getUint32(offset),
      min: view.getUint32(offset + 4),
      max: view.getUint32(offset + 8),
      default: view.getUint32(offset + 12),
      unit: parseNullTerminatedString(payload.slice(offset + 16))
    }
  },

  [PARAM_TYPE.INT32](payload, offset) {
    const view = new DataView(payload.buffer)
    return {
      value: view.getInt32(offset),
      min: view.getInt32(offset + 4),
      max: view.getInt32(offset + 8),
      default: view.getInt32(offset + 12),
      unit: parseNullTerminatedString(payload.slice(offset + 16))
    }
  },

  [PARAM_TYPE.FLOAT](payload, offset) {
    const view = new DataView(payload.buffer)
    return {
      value: view.getInt32(offset),
      min: view.getInt32(offset + 4),
      max: view.getInt32(offset + 8),
      default: view.getInt32(offset + 12),
      decimalPoint: payload[offset + 16],
      stepSize: view.getInt32(offset + 17),
      unit: parseNullTerminatedString(payload.slice(offset + 21))
    }
  },

  [PARAM_TYPE.TEXT_SELECTION](payload, offset) {
    const view = new DataView(payload.buffer)
    const {strValue, newOffset} = parseNullTerminatedString2(payload, offset)
    offset = newOffset
    const value = view.getUint8(offset)
    const min = view.getUint8(offset + 1)
    const max = view.getUint8(offset + 2)
    const default_value = view.getUint8(offset + 3)
    const options = strValue.split(';')

    return {
      value,
      min,
      max,
      default: default_value,
      options
    }
  },

  [PARAM_TYPE.STRING](payload, offset) {
    const {strValue, newOffset} = parseNullTerminatedString2(payload, offset)
    const maxLength = payload[newOffset]
    return {
      value: strValue,
      maxLength
    }
  },

  [PARAM_TYPE.FOLDER](payload, offset) {
    const children = payload.slice(offset, -1)
    return {
      value: '',
      children,
      isFolder: true
    }
  },

  [PARAM_TYPE.INFO](payload, offset) {
    return {
      value: parseNullTerminatedString(payload.slice(offset)),
      isInfo: true
    }
  },

  [PARAM_TYPE.COMMAND](payload, offset) {
    const status = payload[offset++]
    const timeout = payload[offset++]
    return {
      status,
      timeout,
      value: parseNullTerminatedString(payload.slice(offset)),
      isCommand: true
    }
  }
}

// Store parameter chunks until complete
const currentParameterChunks = ref([])

// Modified handleParameterEntry to use chunks_remaining
const handleParameterEntry = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_PARAM_ENTRY && frame.origin === props.deviceId) {
    const paramNumber = frame.payload[0]
    const chunksRemaining = frame.payload[1]
    const paramData = frame.payload.slice(2) // Parameter data starts after param_number and chunks_remaining

    // Add chunk to current parameter data
    currentParameterChunks.value.push(paramData)
    currentChunk.value.chunkNumber++

    // If this is the last chunk (chunks_remaining = 0), parse the complete parameter
    if (chunksRemaining === 0) {
      // Combine all chunks into one buffer
      const totalLength = currentParameterChunks.value.reduce((sum, chunk) => sum + chunk.length, 0)
      const completeParameter = new Uint8Array(totalLength)
      let offset = 0

      currentParameterChunks.value.forEach(chunk => {
        completeParameter.set(chunk, offset)
        offset += chunk.length
      })

      // Print hexdump of parameter data
      console.log('Parameter data hexdump:', Array.from(completeParameter).map(b => b.toString(16).padStart(2, '0')).join(' '))

      // Parse the complete parameter
      const { parentFolder, dataType, name, offset: parseOffset } = parameterParsers.parseCommonFields(completeParameter)

      // Get the appropriate parser for this data type
      const parser = parameterParsers[dataType]
      if (!parser) {
        console.warn(`Unknown parameter type: 0x${dataType.toString(16)}`)
        return
      }

      // Parse the type-specific fields
      const typeFields = parser(completeParameter, parseOffset)

      // Combine all fields
      const parameter = {
        paramNumber,
        parentFolder,
        type: dataType,
        name,
        ...typeFields
      }

      // Add or update parameter
      const existingIndex = parameters.value.findIndex(p => p.name === parameter.name)
      if (existingIndex >= 0) {
        parameters.value[existingIndex] = parameter
      } else {
        parameters.value.push(parameter)
      }

      // Clear chunks buffer for next parameter
      currentParameterChunks.value = []

      // Move to next parameter
      currentChunk.value.paramNumber++
      currentChunk.value.chunkNumber = 0
    }

    // Request next chunk or finish
    if (parameters.value.length <= props.parameterCount) {
      requestNextChunk()
    } else {
      loading.value = false
    }
  }
}

// Request next parameter chunk
const requestNextChunk = async () => {
  const frame = {
    type: CRSF_FRAMETYPE_PARAM_READ,
    destination: props.deviceId,
    origin: getDeviceIdNumber(),
    payload: new Uint8Array([
      currentChunk.value.paramNumber,
      currentChunk.value.chunkNumber
    ])
  }

  await sendFrame(frame)
}

// Start loading parameters
const loadParameters = () => {
  loading.value = true
  parameters.value = []
  currentParameterChunks.value = []
  currentChunk.value = {
    paramNumber: 0,
    chunkNumber: 0
  }
  requestNextChunk()
}

// Watch for device ID changes
watch(() => props.deviceId, (newId) => {
  if (newId) {
    loadParameters()
  }
})

// Setup and cleanup
onMounted(() => {
  registerFrameHandler(handleParameterEntry)
  if (props.deviceId) {
    loadParameters()
  }
})

onUnmounted(() => {
  unregisterFrameHandler(handleParameterEntry)
})
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      {{ deviceName }} Parameters
      <v-chip class="ml-2" size="small">
        {{ parameters.length }} / {{ parameterCount }} parameters
      </v-chip>
      <v-spacer></v-spacer>
      <v-btn
          :loading="loading"
          :disabled="loading"
          color="primary"
          size="small"
          @click="loadParameters"
      >
        <v-icon start>mdi-refresh</v-icon>
        Reload
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-table v-if="parameters.length > 0">
        <tbody>
        <tr v-for="(param, index) in parameters" :key="param.name">
          <td>{{ index }}</td>
          <td>{{ param.name }}</td>
          <td>
            <template v-if="param.isFolder">
              📁
            </template>
            <template v-else-if="param.isInfo">
              ℹ️ {{ param.value }}
            </template>
            <template v-else-if="param.isCommand">
              ▶ {{ param.value }}
            </template>
            <template v-else-if="param.type === PARAM_TYPE.TEXT_SELECTION">
              {{ param.options[param.value] }}
            </template>
            <template v-else-if="param.type === PARAM_TYPE.FLOAT">
              {{ (param.value / Math.pow(10, param.decimalPoint)).toFixed(param.decimalPoint) }}
            </template>
            <template v-else>
              {{ param.value }}
            </template>
          </td>
          <td>{{ param.unit || '' }}</td>
          <td>
            <template v-if="!param.isFolder && !param.isInfo && !param.isCommand">
              <template v-if="param.type === PARAM_TYPE.TEXT_SELECTION">
                {{ param.options.join(' | ') }}
              </template>
              <template v-else>
                {{ param.min }} - {{ param.max }}
              </template>
            </template>
            <template v-else-if="param.isFolder">
              Children: {{ param.children }}
            </template>
            <template v-else-if="param.isCommand">
              Status: {{ param.status }}, Timeout: {{ param.timeout * 100 }} ms
            </template>
          </td>
          <td>
            <template v-if="!param.isFolder && !param.isInfo">
              <template v-if="param.type === PARAM_TYPE.TEXT_SELECTION">
                {{ param.options[param.default] }}
              </template>
              <template v-else-if="param.type === PARAM_TYPE.FLOAT">
                {{ (param.default / Math.pow(10, param.decimalPoint)).toFixed(param.decimalPoint) }}
              </template>
              <template v-else>
                {{ param.default }}
              </template>
            </template>
          </td>
          <td>
            <template v-if="param.type === PARAM_TYPE.FLOAT">
              {{ (param.stepSize / Math.pow(10, param.decimalPoint)).toFixed(param.decimalPoint) }}
            </template>
          </td>
        </tr>
        </tbody>
      </v-table>
      <v-progress-linear
          v-else-if="loading"
          indeterminate
          color="primary"
      ></v-progress-linear>
      <v-alert
          v-else
          type="info"
          text="No parameters loaded"
      ></v-alert>
    </v-card-text>
  </v-card>
</template>
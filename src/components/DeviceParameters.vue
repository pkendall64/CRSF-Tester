<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'
import { useDeviceId } from '../composables/useDeviceId'
import TextSelectionWidget from "@/components/TextSelectionWidget.vue";
import NumberInputWidget from "@/components/NumberInputWidget.vue";
import { PARAM_TYPE, parseCommonFields } from '../constants/parameterTypes'
import { parameterParsers, parameterSerializers } from '../utils/parameterParsers'

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
const CRSF_FRAMETYPE_PARAM_WRITE = 0x2D

const { sendFrame, registerFrameHandler, unregisterFrameHandler } = useSerialPort()
const { getDeviceIdNumber } = useDeviceId()

const parameters = ref([])
const folder = ref(0)
const loading = ref(false)
const currentChunk = ref({
  paramNumber: 0,
  chunkNumber: 0
})
let parameterQueue = []
const transitionName = ref('slide')
const isTransitioning = ref(false)
const currentFolderContent = ref([])
const pendingFolderChange = ref(null)
const loadedParameterCount = ref(0)

// Store parameter chunks until complete
const currentParameterChunks = ref([])

// Handle incoming parameter entry frames
// Processes chunks of parameter data and assembles complete parameters
const handleParameterEntry = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_PARAM_ENTRY && frame.origin === props.deviceId) {
    const paramNumber = frame.payload[0]
    const chunksRemaining = frame.payload[1]
    const paramData = frame.payload.slice(2)

    // Add chunk to current parameter data
    currentParameterChunks.value.push(paramData)
    currentChunk.value.chunkNumber++

    // If this is the last chunk, parse the complete parameter
    if (chunksRemaining === 0) {
      // Combine all chunks into one buffer
      const totalLength = currentParameterChunks.value.reduce((sum, chunk) => sum + chunk.length, 0)
      const completeParameter = new Uint8Array(totalLength)
      let offset = 0

      currentParameterChunks.value.forEach(chunk => {
        completeParameter.set(chunk, offset)
        offset += chunk.length
      })

      // Parse the complete parameter
      const { parentFolder, dataType, isHidden, name, offset: parseOffset } = parseCommonFields(completeParameter)

      // Get the appropriate parser for this data type
      const parser = parameterParsers[dataType]
      if (!parser) {
        console.warn(`Unknown parameter type: 0x${dataType.toString(16)}`)
        return
      }

      // Parse the type-specific fields
      const typeFields = parser(completeParameter, parseOffset)

      // Combine all fields into the final parameter object
      const parameter = {
        paramNumber,
        parentFolder,
        type: dataType,
        isHidden,
        name,
        ...typeFields
      }

      // Add or update parameter
      parameters.value[currentChunk.value.paramNumber] = parameter
      loadedParameterCount.value = parameters.value.length - 1

      // Clear chunks buffer for next parameter
      currentParameterChunks.value = []
      currentChunk.value.chunkNumber = 0

      // Move to next parameter or finish if none in the queue
      if (parameterQueue.length > 0) {
        currentChunk.value.paramNumber = parameterQueue.pop()
      } else {
        loading.value = false
      }
    }

    // Request next chunk if still loading
    if (loading.value) {
      requestNextChunk()
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
const loadParameters = (all) => {
  loading.value = true
  currentParameterChunks.value = []
  if (all) {
    parameters.value = []
    folder.value = 0
    parameterQueue = Array.from({ length: props.parameterCount }, (_, i) => i + 1).reverse()
  }
  else {
    parameterQueue = Array.from(parameters.value[folder.value].children).reverse()
  }
  currentChunk.value = {
    paramNumber: folder.value,
    chunkNumber: 0
  }
  requestNextChunk()
}

const updateCurrentFolderContent = () => {
  currentFolderContent.value = parameters.value.filter((param, index) => 
    param.parentFolder === folder.value && index !== 0
  )
}

const executeCommand = (index) => {
  console.log('execute:', index)
}

const updateParameter = (index) => {
  const serializer = parameterSerializers[parameters.value[index].type]
  if (serializer) {
    const data = serializer(parameters.value[index].value)
    const frame = {
      type: CRSF_FRAMETYPE_PARAM_WRITE,
      destination: props.deviceId,
      origin: getDeviceIdNumber(),
      payload: Array([index, ...data]).flat()
    }
    sendFrame(frame)
  }

  // Add a delay before reloading parameters
  setTimeout(() => {
    loadParameters(false)
  }, 100)
}

const handleTransitionEnd = () => {
  if (pendingFolderChange.value !== null) {
    const { index, isBack } = pendingFolderChange.value
    pendingFolderChange.value = null
    
    // Clear current content
    currentFolderContent.value = []
    
    if (isBack) {
      updateCurrentFolderContent()
    } else {
      // Check if we need to load this folder's parameters
      if (!parameters.value[index]?.children?.length) {
        loadParameters(false)
      } else {
        updateCurrentFolderContent()
      }
    }
    
    isTransitioning.value = false
  }
}

const enterFolder = async (index) => {
  if (isTransitioning.value) return
  
  isTransitioning.value = true
  transitionName.value = 'slide'
  pendingFolderChange.value = { index, isBack: false }
  folder.value = index
}

const goBack = async () => {
  if (isTransitioning.value) return
  
  isTransitioning.value = true
  transitionName.value = 'slide-back'
  const parentFolder = parameters.value[folder.value].parentFolder
  pendingFolderChange.value = { index: parentFolder, isBack: true }
  folder.value = parentFolder
}

// Watch for device ID changes
watch(() => props.deviceId, (newId) => {
  if (newId) {
    loadParameters(true)
  }
})

// Watch for parameter updates
watch(parameters, () => {
  updateCurrentFolderContent()
}, { deep: true })

// Setup and cleanup
onMounted(() => {
  registerFrameHandler(handleParameterEntry)
  if (props.deviceId) {
    loadParameters(true)
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
        {{ loadedParameterCount }} / {{ parameterCount }} parameters
      </v-chip>
      <v-spacer></v-spacer>
      <v-btn :loading="loading" :disabled="loading || isTransitioning" color="primary" size="small" @click="loadParameters(false)">
        <v-icon start>mdi-refresh</v-icon>
        Reload
      </v-btn>
    </v-card-title>

    <v-card-text>
      <template v-if="parameters.length > 0">
        <div class="parameters-container">
          <transition :name="transitionName" @after-leave="handleTransitionEnd">
            <div :key="folder" class="parameters-content">
              <template v-for="param in currentFolderContent" :key="param.name">
                <v-row no-gutters class="mb-2" v-if="!param.isHidden">
                  <v-col cols="3" class="text-subtitle-1 d-flex align-center">{{ param.name }}</v-col>
                  <v-col class="d-flex align-center">
                    <template v-if="param.type === PARAM_TYPE.UINT8 || param.type === PARAM_TYPE.INT8">
                      <NumberInputWidget
                        :min="param.min"
                        :max="param.max"
                        :unit="param.unit"
                        v-model="parameters[param.paramNumber].value"
                        @update:model-value="updateParameter(param.paramNumber)"
                      />
                    </template>
                    <template v-if="param.type === PARAM_TYPE.UINT16 || param.type === PARAM_TYPE.INT16">
                      <NumberInputWidget
                        :min="param.min"
                        :max="param.max"
                        :unit="param.unit"
                        v-model="parameters[param.paramNumber].value"
                        @update:model-value="updateParameter(param.paramNumber)"
                      />
                    </template>
                    <template v-if="param.type === PARAM_TYPE.UINT32 || param.type === PARAM_TYPE.INT32">
                      <NumberInputWidget
                        :min="param.min"
                        :max="param.max"
                        :unit="param.unit"
                        v-model="parameters[param.paramNumber].value"
                        @update:model-value="updateParameter(param.paramNumber)"
                      />
                    </template>
                    <template v-else-if="param.type === PARAM_TYPE.TEXT_SELECTION">
                      <TextSelectionWidget v-model="parameters[param.paramNumber]" @update:model-value="updateParameter(param.paramNumber)" class="text-selection-widget" />
                    </template>
                    <template v-else-if="param.type === PARAM_TYPE.FOLDER">
                      <v-btn color="primary" size="small" @click="enterFolder(param.paramNumber)" :disabled="isTransitioning">
                        <v-icon start>mdi-folder</v-icon>
                        Enter
                      </v-btn>
                    </template>
                    <template v-else-if="param.type === PARAM_TYPE.COMMAND">
                      <v-btn color="secondary" size="small" @click="executeCommand(param.paramNumber)" :disabled="isTransitioning">
                        <v-icon start>mdi-folder</v-icon>
                        Execute
                      </v-btn>
                    </template>
                    <template v-else-if="param.type === PARAM_TYPE.FLOAT">
                      {{ (param.value / Math.pow(10, param.decimalPoint)).toFixed(param.decimalPoint) }}
                    </template>
                    <template v-else-if="param.type === PARAM_TYPE.INFO || param.type === PARAM_TYPE.STRING">
                      {{ param.value }}
                    </template>
                  </v-col>
                </v-row>
              </template>
              <v-row v-if="folder !== 0" class="mt-4 mb-2">
                <v-col>
                  <v-btn color="primary" size="small" @click="goBack" :disabled="isTransitioning">
                    <v-icon start>mdi-folder</v-icon>
                    Back
                  </v-btn>
                </v-col>
              </v-row>
            </div>
          </transition>
        </div>
      </template>
      <v-progress-linear v-else-if="loading" indeterminate color="primary"></v-progress-linear>
      <v-alert v-else type="info" text="No parameters loaded"></v-alert>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.text-selection-widget {
  width: 100%;
  max-width: 200px;
}

.parameters-container {
  position: relative;
  overflow: hidden;
  min-height: 100px;
}

.parameters-content {
  position: relative;
  width: 100%;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.5s ease;
  position: absolute;
  width: 100%;
}

.slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-back-enter-active,
.slide-back-leave-active {
  transition: all 0.5s ease;
  position: absolute;
  width: 100%;
}

.slide-back-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-back-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
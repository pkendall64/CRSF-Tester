<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'
import { useDeviceId } from '../composables/useDeviceId'
import TextSelectionWidget from "@/components/TextSelectionWidget.vue";
import NumberInputWidget from "@/components/NumberInputWidget.vue";
import { PARAM_TYPE, parseCommonFields, parseNullTerminatedString } from '../constants/parameterTypes'
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

const COMMAND_STATUS = {
  STOPPED: 0,
  START: 1,
  RUNNING: 2,
  CONFIRMATION: 3,
  CONFIRMED: 4,
  STOP: 5,
  POLL: 6
}

const COMMAND_STATUS_LABELS = {
  [COMMAND_STATUS.STOPPED]: 'Stopped',
  [COMMAND_STATUS.START]: 'Starting',
  [COMMAND_STATUS.RUNNING]: 'Running',
  [COMMAND_STATUS.CONFIRMATION]: 'Awaiting confirmation',
  [COMMAND_STATUS.CONFIRMED]: 'Confirmed',
  [COMMAND_STATUS.STOP]: 'Stopping',
  [COMMAND_STATUS.POLL]: 'Polling'
}

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

const COMMAND_POLL_FALLBACK_TIMEOUT_MS = 200
const COMMAND_NO_RESPONSE_TIMEOUT_MS = 5000

const createDefaultCommandExecutionState = () => ({
  active: false,
  isPolling: false,
  paramNumber: null,
  name: '',
  status: COMMAND_STATUS.STOPPED,
  timeout: COMMAND_POLL_FALLBACK_TIMEOUT_MS,
  info: '',
  awaitingPollResponse: false,
  lastResponseAt: 0
})

const commandDialog = ref(false)
const disconnectedErrorDialog = ref(false)
const disconnectedErrorMessage = ref('')
const commandExecution = ref(createDefaultCommandExecutionState())
const commandResponseChunks = ref([])
let commandPollIntervalId = null

const getCommandStatusLabel = (status) => COMMAND_STATUS_LABELS[status] ?? `Unknown (${status})`

const combineChunks = (chunks) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const combinedData = new Uint8Array(totalLength)
  let offset = 0

  chunks.forEach(chunk => {
    combinedData.set(chunk, offset)
    offset += chunk.length
  })

  return combinedData
}

const parseParameterChunks = (paramNumber, chunks) => {
  const completeParameter = combineChunks(chunks)
  const { parentFolder, dataType, isHidden, name, offset: parseOffset } = parseCommonFields(completeParameter)

  if (dataType === PARAM_TYPE.COMMAND) {
    const status = completeParameter[parseOffset]
    const timeout = completeParameter[parseOffset + 1]
    const value = parseNullTerminatedString(completeParameter.slice(parseOffset + 2))

    return {
      paramNumber,
      parentFolder,
      type: dataType,
      isHidden,
      name,
      status,
      timeout,
      value
    }
  }

  const parser = parameterParsers[dataType]
  if (!parser) {
    console.warn(`Unknown parameter type: 0x${dataType.toString(16)}`)
    return null
  }

  const typeFields = parser(completeParameter, parseOffset)

  return {
    paramNumber,
    parentFolder,
    type: dataType,
    isHidden,
    name,
    ...typeFields
  }
}

const extractCommandResponseHeaderFromFirstChunk = (chunk) => {
  if (!chunk || chunk.length < 5) {
    return null
  }

  const nameNullRelativeIndex = chunk.slice(2).findIndex(byte => byte === 0)
  if (nameNullRelativeIndex < 0) {
    return null
  }

  const statusIndex = 2 + nameNullRelativeIndex + 1
  const timeoutIndex = statusIndex + 1

  if (timeoutIndex >= chunk.length) {
    return null
  }

  return {
    status: chunk[statusIndex],
    timeout: chunk[timeoutIndex]
  }
}

const stopCommandPolling = () => {
  if (commandPollIntervalId) {
    clearInterval(commandPollIntervalId)
    commandPollIntervalId = null
  }

  commandExecution.value.isPolling = false
}

const handleCommandPollingDisconnected = () => {
  commandDialog.value = false
  disconnectedErrorMessage.value = `No response received for ${Math.floor(COMMAND_NO_RESPONSE_TIMEOUT_MS / 1000)} seconds. Device appears disconnected.`
  disconnectedErrorDialog.value = true
  resetCommandExecution()
}

const startCommandPollingLoop = () => {
  if (!commandExecution.value.active || commandExecution.value.paramNumber === null) {
    return
  }

  stopCommandPolling()

  const pollDelay = Math.max(commandExecution.value.timeout || COMMAND_POLL_FALLBACK_TIMEOUT_MS, 10)
  commandExecution.value.isPolling = true

  if (!commandExecution.value.lastResponseAt) {
    commandExecution.value.lastResponseAt = Date.now()
  }

  commandPollIntervalId = setInterval(async () => {
    if (!commandExecution.value.active || commandExecution.value.paramNumber === null) {
      return
    }

    if (Date.now() - commandExecution.value.lastResponseAt >= COMMAND_NO_RESPONSE_TIMEOUT_MS) {
      handleCommandPollingDisconnected()
      return
    }

    const pollSent = await sendCommandStatus(commandExecution.value.paramNumber, COMMAND_STATUS.POLL, {
      timeout: commandExecution.value.timeout,
      value: commandExecution.value.info
    })

    if (pollSent) {
      commandExecution.value.awaitingPollResponse = true
    }
  }, pollDelay)
}

const resetCommandExecution = () => {
  stopCommandPolling()
  commandResponseChunks.value = []
  commandExecution.value = createDefaultCommandExecutionState()
}

const sendCommandStatus = async (index, status, options = {}) => {
  const parameter = parameters.value[index]
  if (!parameter || parameter.type !== PARAM_TYPE.COMMAND) {
    return false
  }

  const serializer = parameterSerializers[PARAM_TYPE.COMMAND]
  if (!serializer) {
    return false
  }

  const timeout = options.timeout ?? commandExecution.value.timeout ?? parameter.timeout ?? COMMAND_POLL_FALLBACK_TIMEOUT_MS
  const value = options.value ?? commandExecution.value.info ?? parameter.value ?? ''

  const data = serializer({
    status,
    timeout,
    value
  })

  const frame = {
    type: CRSF_FRAMETYPE_PARAM_WRITE,
    destination: props.deviceId,
    origin: getDeviceIdNumber(),
    payload: new Uint8Array([index, ...data])
  }

  await sendFrame(frame)
  return true
}

const beginCommandExecution = (index) => {
  if (commandExecution.value.active) {
    return false
  }

  const parameter = parameters.value[index]
  if (!parameter || parameter.type !== PARAM_TYPE.COMMAND) {
    return false
  }

  disconnectedErrorDialog.value = false
  disconnectedErrorMessage.value = ''

  commandExecution.value = {
    active: true,
    isPolling: false,
    paramNumber: index,
    name: parameter.name,
    status: COMMAND_STATUS.START,
    timeout: parameter.timeout ?? COMMAND_POLL_FALLBACK_TIMEOUT_MS,
    info: parameter.value ?? '',
    awaitingPollResponse: false,
    lastResponseAt: Date.now()
  }

  commandResponseChunks.value = []
  commandDialog.value = true
  return true
}

const finalizeStoppedCommand = () => {
  commandExecution.value.active = false
  commandDialog.value = false
  resetCommandExecution()

  setTimeout(() => {
    loadParameters(false)
  }, 100)
}

const handleCommandResponseChunk = (paramNumber, chunksRemaining, paramData) => {
  const isFirstChunk = commandResponseChunks.value.length === 0
  if (isFirstChunk) {
    commandExecution.value.awaitingPollResponse = false
    commandExecution.value.lastResponseAt = Date.now()

    const firstChunkHeader = extractCommandResponseHeaderFromFirstChunk(paramData)
    if (firstChunkHeader) {
      commandExecution.value.status = firstChunkHeader.status
      commandExecution.value.timeout = firstChunkHeader.timeout ?? commandExecution.value.timeout

      // Keep polling cadence synced to latest response timeout
      startCommandPollingLoop()
    }

    if (commandExecution.value.status === COMMAND_STATUS.STOPPED) {
      finalizeStoppedCommand()
      return
    }
  }

  commandResponseChunks.value.push(paramData)

  if (chunksRemaining > 0) {
    return
  }

  const commandParameter = parseParameterChunks(paramNumber, commandResponseChunks.value)
  commandResponseChunks.value = []

  if (!commandParameter || commandParameter.type !== PARAM_TYPE.COMMAND) {
    return
  }

  parameters.value[paramNumber] = commandParameter
  commandExecution.value.status = commandParameter.status
  commandExecution.value.timeout = commandParameter.timeout ?? commandExecution.value.timeout
  commandExecution.value.info = commandParameter.value ?? ''
  commandExecution.value.name = commandParameter.name ?? commandExecution.value.name

  if (commandExecution.value.status === COMMAND_STATUS.STOPPED) {
    finalizeStoppedCommand()
  }
}

const stopActiveCommand = async () => {
  if (!commandExecution.value.active || commandExecution.value.paramNumber === null) {
    return
  }

  const stopSent = await sendCommandStatus(commandExecution.value.paramNumber, COMMAND_STATUS.STOP, {
    timeout: commandExecution.value.timeout,
    value: commandExecution.value.info
  })

  if (stopSent) {
    commandExecution.value.status = COMMAND_STATUS.STOP
  }
}

const closeCommandDialog = () => {
  commandDialog.value = false
  resetCommandExecution()
}

const closeDisconnectedErrorDialog = () => {
  disconnectedErrorDialog.value = false
  disconnectedErrorMessage.value = ''
}

// Handle incoming parameter entry frames
// Processes chunks of parameter data and assembles complete parameters
const handleParameterEntry = async (frame) => {
  if (frame.type !== CRSF_FRAMETYPE_PARAM_ENTRY || frame.origin !== props.deviceId) {
    return
  }

  const paramNumber = frame.payload[0]
  const chunksRemaining = frame.payload[1]
  const paramData = frame.payload.slice(2)

  if (commandExecution.value.active && paramNumber === commandExecution.value.paramNumber) {
    await handleCommandResponseChunk(paramNumber, chunksRemaining, paramData)
    return
  }

  // Add chunk to current parameter data
  currentParameterChunks.value.push(paramData)
  currentChunk.value.chunkNumber++

  // If this is the last chunk, parse the complete parameter
  if (chunksRemaining === 0) {
    const parameter = parseParameterChunks(paramNumber, currentParameterChunks.value)

    if (!parameter) {
      currentParameterChunks.value = []
      currentChunk.value.chunkNumber = 0
      return
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

const executeCommand = async (index) => {
  const started = beginCommandExecution(index)
  if (!started) {
    return
  }

  await sendCommandStatus(index, COMMAND_STATUS.START, {
    timeout: commandExecution.value.timeout,
    value: commandExecution.value.info
  })

  startCommandPollingLoop()
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
                    <template v-if="param.type === PARAM_TYPE.UINT8 || param.type === PARAM_TYPE.INT8 ||
                        param.type === PARAM_TYPE.UINT16 || param.type === PARAM_TYPE.INT16 ||
                        param.type === PARAM_TYPE.UINT32 || param.type === PARAM_TYPE.INT32">
                      <NumberInputWidget
                        :min="param.min"
                        :max="param.max"
                        :unit="param.unit"
                        v-model="parameters[param.paramNumber].value"
                        @update:model-value="updateParameter(param.paramNumber)"
                        class="text-selection-widget"
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
                      <v-btn color="secondary" size="small" @click="executeCommand(param.paramNumber)" :disabled="isTransitioning || commandExecution.active">
                        <v-icon start>mdi-play</v-icon>
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

  <v-dialog :model-value="commandDialog" persistent max-width="520" @update:model-value="closeCommandDialog">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="secondary">mdi-progress-clock</v-icon>
        Running Command
      </v-card-title>
      <v-card-text>
        <div class="text-subtitle-1 mb-2">{{ commandExecution.name || 'Command' }}</div>
        <div class="text-body-2 mb-1">Status: {{ getCommandStatusLabel(commandExecution.status) }}</div>
        <div class="text-body-2 mb-1">Timeout: {{ commandExecution.timeout }} ms</div>
        <div class="text-body-2">Message: {{ commandExecution.info || '-' }}</div>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="closeCommandDialog">Close</v-btn>
        <v-btn color="error" :disabled="!commandExecution.active" @click="stopActiveCommand">Stop</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog :model-value="disconnectedErrorDialog" max-width="520" @update:model-value="closeDisconnectedErrorDialog">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="error">mdi-alert-circle</v-icon>
        Device Disconnected
      </v-card-title>
      <v-card-text>
        {{ disconnectedErrorMessage }}
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" @click="closeDisconnectedErrorDialog">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.text-selection-widget {
  width: 100%;
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
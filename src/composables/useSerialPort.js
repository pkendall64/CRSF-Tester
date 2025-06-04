import { ref, readonly } from 'vue'

// Singleton state
const port = ref(null)
const isConnected = ref(false)
const portInfo = ref(null)
const selectedBaudRate = ref(115200)
const statusMessage = ref('Not connected')
const hasError = ref(false)
const reader = ref(null)
const channelData = ref(Array(16).fill(1024))

// CRSF frame parsing constants
const CRSF_SYNC_BYTE = 0xC8
const CRSF_FRAMELEN_MIN = 4
const CRSF_SIZE_MAX = 64

export function useSerialPort() {
  const startReading = async () => {
    if (!port.value) return

    try {
      reader.value = port.value.readable.getReader()

      let buffer = new Uint8Array(0)

      while (true) {
        const { value, done } = await reader.value.read()
        if (done) break

        // Append new data to existing buffer
        const newBuffer = new Uint8Array(buffer.length + value.length)
        newBuffer.set(buffer)
        newBuffer.set(value, buffer.length)
        buffer = newBuffer

        // Process buffer for CRSF frames
        while (buffer.length > 0) {
          // Look for sync byte
          const syncIndex = buffer.findIndex(b => b === CRSF_SYNC_BYTE)

          if (syncIndex === -1) {
            buffer = new Uint8Array(0)
            break
          }

          // Remove data before sync byte
          if (syncIndex > 0) {
            buffer = buffer.slice(syncIndex)
          }

          // Check if we have enough data for frame length
          if (buffer.length < 2) break

          const frameLength = buffer[1]

          // Validate frame length
          if (frameLength < CRSF_FRAMELEN_MIN || frameLength > CRSF_SIZE_MAX) {
            buffer = buffer.slice(1)
            continue
          }

          // Check if we have complete frame
          if (buffer.length < frameLength + 2) break

          // Extract frame
          const frame = buffer.slice(0, frameLength + 2)
          buffer = buffer.slice(frameLength + 2)

          // Process RC channels frame
          if (frame[2] === 0x16) { // RC channels
            console.log('RC channels frame:', frame)
            processRCChannels(frame.slice(3))
          }
        }
      }
    } catch (error) {
      console.error('Error reading serial data:', error)
      throw error
    } finally {
      reader.value?.releaseLock()
    }
  }

  const processRCChannels = (data) => {
    // CRSF RC channels are 11 bits each, packed
    const channels = new Array(16).fill(0)

    // Each 11-bit channel value is packed across the byte stream
    // We need 22 bytes to store 16 channels of 11 bits each
    if (data.length < 22) {
      console.warn('Incomplete CRSF channel data received')
      return
    }

    let byteIndex = 0
    let bitIndex = 0

    for (let channelIndex = 0; channelIndex < 16; channelIndex++) {
      let value = 0

      // Read up to 3 bytes to get our 11 bits
      value = data[byteIndex]                         // First byte
      value |= (data[byteIndex + 1] << 8)            // Second byte
      value |= (data[byteIndex + 2] << 16)           // Third byte if needed

      // Extract 11 bits starting from current bit position
      value = (value >> bitIndex) & 0x07FF

      channels[channelIndex] = value

      // Move to next channel position
      bitIndex += 11
      byteIndex += Math.floor(bitIndex / 8)
      bitIndex %= 8
    }

    // Update channel values
    channelData.value = channels
  }

  const connect = async (baudRate) => {
    try {
      hasError.value = false
      statusMessage.value = 'Requesting port access...'

      const selectedPort = await navigator.serial.requestPort()

      statusMessage.value = 'Opening port...'
      await selectedPort.open({ baudRate: baudRate || selectedBaudRate.value })
      port.value = selectedPort

      portInfo.value = selectedPort.getInfo()
      isConnected.value = true
      selectedBaudRate.value = baudRate || selectedBaudRate.value
      statusMessage.value = `Connected to ${getPortDescription()}`

      // Start reading data
      startReading()

      return {
        port: selectedPort,
        baudRate: selectedBaudRate.value,
        portInfo: portInfo.value
      }
    } catch (error) {
      console.error('Error connecting to serial port:', error)
      hasError.value = true
      isConnected.value = false
      portInfo.value = null
      throw error
    }
  }

  const disconnect = async () => {
    if (reader.value) {
      await reader.value.cancel()
      reader.value = null
    }

    if (port.value) {
      try {
        hasError.value = false
        statusMessage.value = 'Disconnecting...'
        await port.value.close()
        port.value = null
        isConnected.value = false
        portInfo.value = null
        statusMessage.value = 'Not connected'
      } catch (error) {
        console.error('Error disconnecting from serial port:', error)
        hasError.value = true
        statusMessage.value = `Error disconnecting: ${error.message}`
        throw error
      }
    }
  }

  const getPortDescription = () => {
    if (!portInfo.value) return 'Unknown port'
    
    const { usbVendorId, usbProductId } = portInfo.value
    let description = []
    
    if (usbVendorId) {
      description.push(`VID: ${usbVendorId.toString(16).padStart(4, '0')}`)
    }
    if (usbProductId) {
      description.push(`PID: ${usbProductId.toString(16).padStart(4, '0')}`)
    }
    
    return description.length ? `Port (${description.join(', ')})` : 'Port'
  }

  const setBaudRate = (baudRate) => {
    if (!isConnected.value) {
      selectedBaudRate.value = baudRate
    }
  }

  return {
    // State (readonly)
    isConnected: readonly(isConnected),
    portInfo: readonly(portInfo),
    statusMessage: readonly(statusMessage),
    hasError: readonly(hasError),
    selectedBaudRate: readonly(selectedBaudRate),
    channelData: readonly(channelData),

    // Methods
    connect,
    disconnect,
    getPortDescription,
    setBaudRate
  }
}
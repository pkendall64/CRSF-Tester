import { ref, readonly } from 'vue'

const port = ref(null)
const reader = ref(null)
const writer = ref(null)
const isConnected = ref(false)
const portInfo = ref(null)
const selectedBaudRate = ref(420000)
const statusMessage = ref('Not connected')
const hasError = ref(false)
const frameHandlers = ref(new Set())

// Singleton state
export function useSerialPort() {

  // CRSF protocol constants
  const CRSF_SYNC_BYTE = 0xC8

  // CRC calculation for CRSF
  const calculateCRC = (data) => {
    let crc = 0
    for (let i = 0; i < data.length; i++) {
      crc = crc ^ data[i]
      for (let j = 0; j < 8; j++) {
        if (crc & 0x80) {
          crc = (crc << 1) ^ 0xD5
        } else {
          crc = crc << 1
        }
        crc &= 0xFF
      }
    }
    return crc
  }

  const frameToHexString = (frame) => {
    // Calculate total frame length
    const frameLength = frame.payload.length + 4 // type + dest + origin + payload + crc
    const frameBuffer = new Uint8Array(frameLength + 2) // +2 for sync byte and length
    let index = 0

    // Construct frame buffer
    frameBuffer[index++] = CRSF_SYNC_BYTE
    frameBuffer[index++] = frameLength
    frameBuffer[index++] = frame.type
    frameBuffer[index++] = frame.destination
    frameBuffer[index++] = frame.origin
    frameBuffer.set(frame.payload, index)
    index += frame.payload.length

    // Calculate and add CRC
    const crc = calculateCRC(frameBuffer.slice(2, index))
    frameBuffer[index] = crc

    // Convert to hex string with formatting
    let hexString = Array.from(frameBuffer)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ')

    // Add structure markers
    const parts = {
      sync: hexString.slice(0, 2),
      len: hexString.slice(3, 5),
      type: hexString.slice(6, 8),
      dest: hexString.slice(9, 11),
      origin: hexString.slice(12, 14),
      payload: hexString.slice(15, -3),
      crc: hexString.slice(-2)
    }

    return {
      raw: hexString,
      formatted: `[${parts.sync}] ${parts.len} ${parts.type} ${parts.dest} ${parts.origin} ${parts.payload} [${parts.crc}]`,
      parts
    }
  }

  // Send CRSF frame
  const sendFrame = async (frame) => {
    if (!writer.value || !isConnected.value) {
      console.error('Serial port writer not available')
      return
    }

    const frameLength = frame.payload.length + 4
    const frameBuffer = new Uint8Array(frameLength + 2)
    let index = 0

    frameBuffer[index++] = CRSF_SYNC_BYTE
    frameBuffer[index++] = frameLength
    frameBuffer[index++] = frame.type
    frameBuffer[index++] = frame.destination
    frameBuffer[index++] = frame.origin
    frameBuffer.set(frame.payload, index)

    const crc = calculateCRC(frameBuffer.slice(2, frameBuffer.length - 1))
    frameBuffer[frameBuffer.length - 1] = crc

    // Use the new logging function
    const hexLog = frameToHexString(frame)
    // console.log('Sending frame:', hexLog.formatted)
    // console.log('Frame parts:', hexLog.parts)

    try {
      await writer.value.write(frameBuffer)
    } catch (error) {
      console.error('Error sending frame:', error)
      statusMessage.value = `Send error: ${error.message}`
    }
  }

  // Frame handler registration
  const registerFrameHandler = (handler) => {
    frameHandlers.value.add(handler)
  }

  const unregisterFrameHandler = (handler) => {
    frameHandlers.value.delete(handler)
  }

  // Buffer for incomplete frames
  let receiveBuffer = new Uint8Array()

  // Process received data
  const processReceivedData = (newData) => {
    const tempBuffer = new Uint8Array(receiveBuffer.length + newData.length)
    tempBuffer.set(receiveBuffer)
    tempBuffer.set(newData, receiveBuffer.length)
    receiveBuffer = tempBuffer

    while (receiveBuffer.length >= 3) {
      if (receiveBuffer[0] !== CRSF_SYNC_BYTE) {
        receiveBuffer = receiveBuffer.slice(1)
        continue
      }

      const frameLength = receiveBuffer[1]
      const totalLength = frameLength + 2

      if (receiveBuffer.length < totalLength) {
        break
      }

      const frameData = receiveBuffer.slice(0, totalLength)
      receiveBuffer = receiveBuffer.slice(totalLength)

      const calculatedCRC = calculateCRC(frameData.slice(2, -1))
      if (calculatedCRC === frameData[frameData.length - 1]) {
        const frame = {
          type: frameData[2],
          destination: frameData[2] < 0x28 ? 0 : frameData[3],
          origin: frameData[2] < 0x28 ? 0 : frameData[4],
          payload: frameData[2] < 0x28 ? frameData.slice(3, -1) : frameData.slice(5, -1)
        }

        // Log received frame
        const hexLog = frameToHexString(frame)
        // console.log('Received frame:', hexLog.formatted)
        // console.log('Frame parts:', hexLog.parts)

        // Notify all registered handlers
        frameHandlers.value.forEach(handler => {
          handler(frame)
        })
      }
    }
  }

  const readLoop = async () => {
    while (port.value && reader.value) {
      try {
        const { value, done } = await reader.value.read()
        if (done) {
          console.log('Reader closed')
          break
        }
        processReceivedData(value)
      } catch (error) {
        console.error('Error reading from port:', error)
        statusMessage.value = `Read error: ${error.message}`
        break
      }
    }

    // Clean up if the loop exits
    if (isConnected.value) {
      await disconnect()
    }
  }

  const connect = async (baudRate) => {
    try {
      hasError.value = false
      statusMessage.value = 'Requesting port access...'

      navigator.serial.ondisconnect = (e) => { disconnect() }
      const selectedPort = await navigator.serial.requestPort()

      statusMessage.value = 'Opening port...'
      await selectedPort.open({ baudRate: baudRate || selectedBaudRate.value })
      port.value = selectedPort

      portInfo.value = selectedPort.getInfo()
      isConnected.value = true
      selectedBaudRate.value = baudRate || selectedBaudRate.value
      statusMessage.value = `Connected to ${getPortDescription()}`

      reader.value = port.value.readable.getReader()
      writer.value = port.value.writable.getWriter()

      // Start reading data
      readLoop()

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
    isConnected.value = false

    if (reader.value) {
      await reader.value.cancel()
      reader.value = null
    }
    if (writer.value) {
      await writer.value.releaseLock()
      writer.value = null
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

    // Methods
    setBaudRate,
    connect,
    disconnect,
    getPortDescription,
    sendFrame,
    registerFrameHandler,
    unregisterFrameHandler
  }
}
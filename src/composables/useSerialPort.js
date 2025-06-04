import { ref, readonly } from 'vue'

// Create singleton state
const port = ref(null)
const isConnected = ref(false)
const portInfo = ref(null)
const selectedBaudRate = ref(115200)
const statusMessage = ref('Not connected')
const hasError = ref(false)

// Export composable function
export function useSerialPort() {
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
      let errorMessage = 'Failed to connect'
      
      if (error.name === 'NotFoundError') {
        errorMessage = 'No port selected'
      } else if (error.name === 'SecurityError') {
        errorMessage = 'Serial port access denied'
      } else {
        errorMessage = error.message || 'Failed to connect'
      }
      
      statusMessage.value = `Error: ${errorMessage}`
      throw error
    }
  }

  const disconnect = async () => {
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

  return {
    // State (readonly)
    isConnected: readonly(isConnected),
    portInfo: readonly(portInfo),
    statusMessage: readonly(statusMessage),
    hasError: readonly(hasError),
    selectedBaudRate: readonly(selectedBaudRate),
    
    // Methods
    connect,
    disconnect,
    getPortDescription
  }
}
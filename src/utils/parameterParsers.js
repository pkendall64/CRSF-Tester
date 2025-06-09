import { PARAM_TYPE, parseNullTerminatedString, parseNullTerminatedString2 } from '../constants/parameterTypes'

// Parameter parsing functions for different types
export const parameterParsers = {
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
    const { strValue, newOffset } = parseNullTerminatedString2(payload, offset)
    const options = strValue.split(';')
    offset = newOffset
    const value = view.getUint8(offset)
    const min = view.getUint8(offset + 1)
    const max = view.getUint8(offset + 2)
    const default_value = view.getUint8(offset + 3)
    const unit = parseNullTerminatedString2(payload, offset + 4).strValue

    return {
      value,
      min,
      max,
      default: default_value,
      options,
      unit
    }
  },

  [PARAM_TYPE.STRING](payload, offset) {
    const { strValue, newOffset } = parseNullTerminatedString2(payload, offset)
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
      children
    }
  },

  [PARAM_TYPE.INFO](payload, offset) {
    return {
      value: parseNullTerminatedString(payload.slice(offset))
    }
  },

  [PARAM_TYPE.COMMAND](payload, offset) {
    const status = payload[offset++]
    const timeout = payload[offset++]
    return {
      status,
      timeout,
      value: parseNullTerminatedString(payload.slice(offset))
    }
  }
}

// Parameter serialization functions
export const parameterSerializers = {
  [PARAM_TYPE.UINT8](value) {
    return new Uint8Array([value])
  },

  [PARAM_TYPE.INT8](value) {
    return new Uint8Array([value])
  },

  [PARAM_TYPE.TEXT_SELECTION](value) {
    return new Uint8Array([value])
  },

  [PARAM_TYPE.COMMAND](value) {
    return new Uint8Array([
      value.status,
      value.timeout,
      ...new TextEncoder().encode(value.value),
      0
    ])
  }
} 
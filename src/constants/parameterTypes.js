// Parameter data types
export const PARAM_TYPE = {
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

// Top bit in type byte indicates parameter should be hidden from UI
export const PARAM_HIDDEN = 0x80

// Helper function to parse null-terminated string from Uint8Array
export const parseNullTerminatedString = (array) => {
  const nullIndex = array.findIndex(byte => byte === 0)
  return new TextDecoder().decode(array.slice(0, nullIndex >= 0 ? nullIndex : undefined))
}

// Helper function to parse null-terminated string from a specific offset in Uint8Array
// Returns both the string value and the new offset after the string
export const parseNullTerminatedString2 = (array, offset) => {
  const nullIndex = offset + array.slice(offset).findIndex(byte => byte === 0)
  const strValue = new TextDecoder().decode(array.slice(offset, nullIndex >= 0 ? nullIndex : undefined))
  const newOffset = nullIndex >= 0 ? nullIndex + 1 : undefined
  return { strValue, newOffset }
}

// Common parser for the header part of all parameters
// Extracts parent folder, type, hidden status, and name
export const parseCommonFields = (payload) => {
  let offset = 0
  const parentFolder = payload[offset++]  // First byte is parent folder ID
  const typeByte = payload[offset++]      // Second byte contains type and hidden flag
  const dataType = typeByte & 0x3F        // Extract type from bottom 6 bits
  const isHidden = (typeByte & PARAM_HIDDEN) !== 0  // Check if top bit is set

  const { strValue, newOffset } = parseNullTerminatedString2(payload, 2)
  return {
    parentFolder,
    dataType,
    isHidden,
    name: strValue,
    offset: newOffset
  }
} 
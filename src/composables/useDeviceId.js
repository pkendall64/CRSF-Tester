import { ref } from 'vue'

const selectedDeviceId = ref('0xC8')

export function useDeviceId() {
    const setDeviceId = (id) => {
        selectedDeviceId.value = id
    }

    const getDeviceIdNumber = () => {
        return parseInt(selectedDeviceId.value, 16)
    }

    return {
        selectedDeviceId,
        setDeviceId,
        getDeviceIdNumber
    }
}

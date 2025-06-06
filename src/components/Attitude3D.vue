<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, shallowRef } from 'vue'
import { useSerialPort } from '../composables/useSerialPort'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { TextureLoader } from 'three'

// Import assets
import airplaneObj from '../assets/models/airplane.obj'
import airplaneTexture from '../assets/models/texture.gif'

const { registerFrameHandler, unregisterFrameHandler } = useSerialPort()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show'])

const CRSF_FRAMETYPE_ATTITUDE = 0x1E

// Three.js variables
const scene = shallowRef(null)
const camera = shallowRef(null)
const renderer = shallowRef(null)
const controls = shallowRef(null)
const plane = shallowRef(null)
const container = ref(null)
const isLoading = ref(true)
const hasError = ref(false)

// Attitude data
const attitudeData = ref({
  pitch: 0,
  roll: 0,
  yaw: 0
})

// Attitude offsets
const attitudeOffsets = ref({
  roll: 0,
  pitch: 0,
  yaw: 0
})

// Watch for first attitude data to set initial offset
const hasInitialOffset = ref(false)

// Convert from 100 micro radians to degrees
const convertAttitude = (value) => {
  return (value * 0.0001) * (180.0 / Math.PI)
}

const handleAttitudeFrame = (frame) => {
  if (frame.type === CRSF_FRAMETYPE_ATTITUDE) {
    const view = new DataView(frame.payload.buffer)
    
    attitudeData.value = {
      pitch: convertAttitude(view.getInt16(0, false)),
      roll: convertAttitude(view.getInt16(2, false)),
      yaw: convertAttitude(view.getInt16(4, false))
    }
    
    emit('update:show', true)
    
    // Only try to reset if the model is loaded
    if (!hasInitialOffset.value && !isLoading.value && plane.value) {
      resetView()
      hasInitialOffset.value = true
    }
  }
}

// Get adjusted attitude values
const getAdjustedAttitude = () => {
  return {
    roll: attitudeData.value.roll - attitudeOffsets.value.roll,
    pitch: attitudeData.value.pitch - attitudeOffsets.value.pitch,
    yaw: (attitudeData.value.yaw - attitudeOffsets.value.yaw + 180) % 360 // Add 180 degrees to yaw
  }
}

// Load the 3D model
const loadModel = async () => {
  const objLoader = new OBJLoader()
  const textureLoader = new TextureLoader()
  
  try {
    // Load the model
    const model = await new Promise((resolve, reject) => {
      objLoader.load(airplaneObj, resolve, undefined, reject)
    })
    
    // Load the texture
    const texture = await new Promise((resolve, reject) => {
      textureLoader.load(airplaneTexture, resolve, undefined, reject)
    })
    
    // Apply texture to all materials in the model
    model.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshPhongMaterial({
          map: texture,
          shininess: 30
        })
      }
    })
    
    // Scale and position the model
    model.scale.set(0.1, 0.1, 0.1)
    
    // Remove old plane if it exists
    if (plane.value) {
      scene.value.remove(plane.value)
    }
    
    plane.value = model
    scene.value.add(plane.value)

    // Force a render
    if (renderer.value && scene.value && camera.value) {
      renderer.value.render(scene.value, camera.value)
    }

    isLoading.value = false

    // If we have initial data, set the offset now
    if (!hasInitialOffset.value && attitudeData.value.yaw !== undefined) {
      resetView()
      hasInitialOffset.value = true
    }
  } catch (error) {
    hasError.value = true
    isLoading.value = false
  }
}

// Initialize Three.js scene
const initThree = async () => {
  if (!container.value) {
    return
  }

  try {
    // Create scene
    scene.value = new THREE.Scene()
    scene.value.background = new THREE.Color(0xf5f5f5)

    // Create camera
    const aspect = container.value.clientWidth / container.value.clientHeight
    camera.value = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
    camera.value.position.set(0, 5, 10)
    camera.value.lookAt(0, 0, 0)

    // Create renderer
    renderer.value = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    })
    renderer.value.setSize(container.value.clientWidth, container.value.clientHeight)
    renderer.value.setPixelRatio(window.devicePixelRatio)
    container.value.appendChild(renderer.value.domElement)

    // Add a grid helper
    const gridHelper = new THREE.GridHelper(20, 20)
    scene.value.add(gridHelper)

    // Add orbit controls
    controls.value = new OrbitControls(camera.value, renderer.value.domElement)
    controls.value.enableDamping = true
    controls.value.dampingFactor = 0.05
    controls.value.minDistance = 5
    controls.value.maxDistance = 20

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9)
    scene.value.add(ambientLight)
    
    // Add multiple directional lights for better coverage
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.0)
    frontLight.position.set(0, 5, 10)
    scene.value.add(frontLight)
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.7)
    backLight.position.set(0, 5, -10)
    scene.value.add(backLight)
    
    const topLight = new THREE.DirectionalLight(0xffffff, 0.8)
    topLight.position.set(0, 10, 0)
    scene.value.add(topLight)

    // Load the model
    await loadModel()

    // Start animation loop
    animate()
  } catch (error) {
    hasError.value = true
    isLoading.value = false
  }
}

// Animation loop
const animate = () => {
  if (!scene.value || !camera.value || !renderer.value) {
    return
  }
  
  requestAnimationFrame(animate)
  
  if (plane.value) {
    const adjusted = getAdjustedAttitude()
    
    // Create quaternions for each rotation
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-adjusted.yaw))
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(adjusted.pitch))
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(adjusted.roll))
    
    // Apply rotations in order: yaw, pitch, roll
    plane.value.quaternion.identity()
    plane.value.quaternion.multiply(yawQuat)
    plane.value.quaternion.multiply(pitchQuat)
    plane.value.quaternion.multiply(rollQuat)
  }

  controls.value.update()
  renderer.value.render(scene.value, camera.value)
}

// Handle window resize
const handleResize = () => {
  if (!container.value || !camera.value || !renderer.value) return
  
  const width = container.value.clientWidth
  const height = container.value.clientHeight

  camera.value.aspect = width / height
  camera.value.updateProjectionMatrix()
  renderer.value.setSize(width, height)

  // Force a render after resize
  renderer.value.render(scene.value, camera.value)
}

// Cleanup function
const cleanup = () => {
  if (renderer.value) {
    renderer.value.dispose()
    renderer.value = null
  }
  if (scene.value) {
    scene.value.clear()
    scene.value = null
  }
  if (plane.value) {
    plane.value = null
  }
  if (controls.value) {
    controls.value.dispose()
    controls.value = null
  }
  if (camera.value) {
    camera.value = null
  }
  isLoading.value = true
  hasError.value = false
}

// Watch for show prop changes
watch(() => props.show, (newValue) => {
  if (newValue) {
    nextTick(() => {
      initThree()
    })
  } else {
    cleanup()
  }
}, { immediate: true })

// Watch for attitude changes
watch(attitudeData, () => {
  if (plane.value) {
    const adjusted = getAdjustedAttitude()
    
    // Create quaternions for each rotation
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-adjusted.yaw))
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(adjusted.pitch))
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(adjusted.roll))
    
    // Apply rotations in order: yaw, pitch, roll
    plane.value.quaternion.identity()
    plane.value.quaternion.multiply(yawQuat)
    plane.value.quaternion.multiply(pitchQuat)
    plane.value.quaternion.multiply(rollQuat)
  }
}, { deep: true })

// Reset view function
const resetView = () => {
  if (!camera.value || !controls.value || !plane.value) {
    return
  }
  
  // Set only yaw offset to current value
  attitudeOffsets.value.yaw = attitudeData.value.yaw
  
  // Reset camera position
  camera.value.position.set(0, 5, 10)
  camera.value.lookAt(0, 0, 0)
  
  // Reset controls
  controls.value.target.set(0, 0, 0)
  controls.value.update()
  
  // Force a render
  if (renderer.value && scene.value && camera.value) {
    renderer.value.render(scene.value, camera.value)
  }
}

onMounted(() => {
  registerFrameHandler(handleAttitudeFrame)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  unregisterFrameHandler(handleAttitudeFrame)
  window.removeEventListener('resize', handleResize)
  cleanup()
})
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      Attitude (3rd Person View)
    </v-card-title>
    <v-card-text>
      <div class="attitude-3d">
        <div ref="container" class="container"></div>
        <div v-if="isLoading" class="loading">
          <v-progress-circular indeterminate></v-progress-circular>
        </div>
        <div v-if="hasError" class="error">
          Failed to load 3D model
        </div>
        <v-btn
          v-if="!isLoading && !hasError"
          class="reset-button"
          icon="mdi-refresh"
          @click="resetView"
          title="Reset View"
        ></v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.attitude-3d {
  position: relative;
  width: 100%;
  height: 300px;
  background-color: #f5f5f5;
}

.container {
  width: 100%;
  height: 100%;
}

.loading, .error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #666;
}

.error {
  color: #ff5252;
}

.reset-button {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1000;
}
</style> 
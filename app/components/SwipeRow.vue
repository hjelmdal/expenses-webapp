<script setup lang="ts">
// Swipe-til-venstre quick actions som i iOS: kortet trækkes til side, og
// handlingerne (ikoner) kommer frem bag det i højre side. Trækkes kortet helt
// over, udløses den første handling direkte. Kun én række er åben ad gangen.
export interface SwipeAction { key: string, icon: string, label: string, color?: 'error' | 'primary' | 'neutral' }
const props = defineProps<{ actions: SwipeAction[] }>()
const emit = defineEmits<{ action: [key: string] }>()

const ACTION_W = 76
const openW = computed(() => props.actions.length * ACTION_W)
const row = ref<HTMLElement>()
const x = ref(0)
const dragging = ref(false)
const id = Symbol('row')
const openRow = useState<symbol | null>('swipe-open-row', () => null)
watch(openRow, v => { if (v !== id && !dragging.value) x.value = 0 })

let startX = 0, startY = 0, base = 0, axis: 'x' | 'y' | null = null
let suppressClick = false   // browseren sender et klik efter et træk — det skal ignoreres
function down(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  startX = e.clientX; startY = e.clientY; base = x.value; axis = null
}
function move(e: PointerEvent) {
  if (startX === 0 && startY === 0) return
  const dx = e.clientX - startX, dy = e.clientY - startY
  if (!axis) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (axis === 'x') { dragging.value = true; openRow.value = id; row.value?.setPointerCapture(e.pointerId) }
  }
  if (axis !== 'x') return
  const w = row.value?.offsetWidth || 360
  let nx = Math.min(0, base + dx)
  if (nx < -w) nx = -w
  x.value = nx
}
function up() {
  if (axis === 'x') {
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 400)
    const w = row.value?.offsetWidth || 360
    if (x.value < -w * 0.55 && props.actions[0]) { x.value = -w; fire(props.actions[0].key) }
    else if (x.value < -openW.value / 2) x.value = -openW.value
    else { x.value = 0; if (openRow.value === id) openRow.value = null }
  }
  dragging.value = false; startX = 0; startY = 0; axis = null
}
// Et tryk på en åben række lukker den i stedet for at åbne posten.
function click(e: MouseEvent) {
  if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; return }
  if (x.value !== 0 && !(e.target as HTMLElement).closest('[data-swipe-action]')) {
    e.preventDefault(); e.stopPropagation(); x.value = 0; openRow.value = null
  }
}
function fire(key: string) {
  emit('action', key)
  setTimeout(() => { x.value = 0; if (openRow.value === id) openRow.value = null }, 250)
}
const full = computed(() => (row.value?.offsetWidth || 360) * 0.55 < -x.value)
</script>

<template>
  <div ref="row" class="relative overflow-hidden" style="touch-action: pan-y"
    @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click.capture="click">
    <!-- Handlinger bag kortet, højre side -->
    <div v-show="x < 0" class="absolute inset-y-0 right-0 flex" :style="{ width: `${-x}px` }">
      <button v-for="(a, i) in actions" :key="a.key" type="button" :aria-label="a.label" data-swipe-action
        class="flex h-full items-center justify-center text-white transition-[flex-grow] duration-200"
        :class="[a.color === 'primary' ? 'bg-primary' : a.color === 'neutral' ? 'bg-zinc-500' : 'bg-red-600', i === 0 && full ? 'grow-[10]' : 'grow']"
        @click.stop="fire(a.key)">
        <UIcon :name="a.icon" class="size-6" />
      </button>
    </div>
    <!-- Selve kortet -->
    <div class="relative bg-default" :class="dragging ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'"
      :style="{ transform: `translateX(${x}px)` }">
      <slot />
    </div>
  </div>
</template>

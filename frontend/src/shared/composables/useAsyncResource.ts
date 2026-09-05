import { onScopeDispose, ref, shallowRef } from 'vue'

/** Only the latest request may publish data, errors, or loading state. */
export function useAsyncResource<T>(options: {
  initial: () => T
  load: () => Promise<T>
  onError: (error: unknown) => void
  resetOnError?: boolean
}) {
  const data = shallowRef<T>(options.initial())
  const loading = ref(false)
  let generation = 0
  let disposed = false

  onScopeDispose(() => {
    disposed = true
    generation += 1
  })

  async function refresh() {
    if (disposed) return
    const request = ++generation
    loading.value = true
    try {
      const result = await options.load()
      if (request === generation) data.value = result
    } catch (error) {
      if (request !== generation) return
      if (options.resetOnError) data.value = options.initial()
      options.onError(error)
    } finally {
      if (request === generation) loading.value = false
    }
  }

  return { data, loading, refresh }
}

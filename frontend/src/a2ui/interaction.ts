import { inject, readonly, ref, type InjectionKey, type Ref } from 'vue'

export const A2UI_BUSY: InjectionKey<Readonly<Ref<boolean>>> = Symbol('a2ui-busy')

/** Runtime-owned state, never a component property supplied by the model. */
export function useA2uiBusy() {
  return inject(A2UI_BUSY, readonly(ref(false)))
}

import { defineComponent, onUnmounted, ref, watch, type PropType, type VNode } from 'vue'
import { useA2uiBusy } from './interaction'
import {
  GenericBinder,
  type ComponentApi,
  type ComponentContext,
  type InferredComponentApiSchemaType,
  type ResolveA2uiProps,
} from '@a2ui/web_core/v0_9'

export interface VueA2uiComponentProps<T, S = void> {
  props: T
  buildChild: (id: string, basePath?: string) => VNode
  context: ComponentContext
  state: S
  busy: boolean
}

export interface VueComponentImplementation extends ComponentApi {
  render: ReturnType<typeof defineComponent>
}

export function createVueComponent<Api extends ComponentApi, S = void>(
  api: Api,
  renderFn: (componentProps: VueA2uiComponentProps<ResolveA2uiProps<InferredComponentApiSchemaType<Api>>, S>) => VNode | VNode[] | null,
  setupState?: () => S,
): VueComponentImplementation {
  type Props = ResolveA2uiProps<InferredComponentApiSchemaType<Api>>
  const VueWrapper = defineComponent({
    name: `DataAgentA2UI_${api.name}`,
    props: {
      context: { type: Object as PropType<ComponentContext>, required: true },
      buildChild: { type: Function as PropType<(id: string, basePath?: string) => VNode>, required: true },
    },
    setup(wrapperProps) {
      const busy = useA2uiBusy()
      const resolvedProps = ref<Props>({} as Props)
      const state = setupState ? setupState() : (undefined as S)
      let binder: GenericBinder<Props> | null = null
      const bind = (context: ComponentContext) => {
        binder?.dispose()
        binder = new GenericBinder<Props>(context, api.schema)
        resolvedProps.value = binder.snapshot
        binder.subscribe(next => { resolvedProps.value = next })
      }
      bind(wrapperProps.context)
      watch(() => wrapperProps.context, bind)
      onUnmounted(() => { binder?.dispose(); binder = null })
      return () => renderFn({
        props: resolvedProps.value,
        buildChild: wrapperProps.buildChild,
        context: wrapperProps.context,
        state,
        busy: busy.value,
      })
    },
  })
  return { name: api.name, schema: api.schema, render: VueWrapper }
}

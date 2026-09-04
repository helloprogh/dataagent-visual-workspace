import { h, ref, type CSSProperties, type VNode } from 'vue'
import { Catalog } from '@a2ui/web_core/v0_9'
import {
  TextApi, ImageApi, IconApi, VideoApi, AudioPlayerApi, RowApi, ColumnApi,
  ListApi, CardApi, TabsApi, DividerApi, ModalApi, ButtonApi, TextFieldApi,
  CheckBoxApi, ChoicePickerApi, SliderApi, DateTimeInputApi, BASIC_FUNCTIONS,
} from '@a2ui/web_core/v0_9/basic_catalog'
import { createVueComponent, type VueComponentImplementation } from './createVueComponent'

const gap = '0.5rem'
const border = '0.0625rem solid var(--da-border)'
const radius = 'var(--da-radius-sm)'

function children(value: unknown, build: (id: string, basePath?: string) => VNode): VNode[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: any) => typeof item === 'string' ? [build(item)] : item?.id ? [build(item.id, item.basePath)] : [])
}

function align(value?: string) {
  return ({ start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as any)[value ?? '']
}

function justify(value?: string) {
  return ({ start: 'flex-start', center: 'center', end: 'flex-end', spaceBetween: 'space-between',
    spaceAround: 'space-around', spaceEvenly: 'space-evenly' } as any)[value ?? '']
}

let formId = 0
const nextId = () => `a2ui-field-${++formId}`

const Text = createVueComponent(TextApi, ({ props }: any) => {
  const tag = ({ h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', caption: 'small' } as any)[props.variant] ?? 'span'
  return h(tag, { style: { display: 'inline-block', margin: gap, color: props.variant === 'caption' ? 'var(--da-text-muted)' : undefined } }, String(props.text ?? ''))
})

const Image = createVueComponent(ImageApi, ({ props }: any) => h('img', {
  src: props.url,
  alt: props.description ?? '',
  style: { display: 'block', width: props.variant === 'icon' ? '1.5rem' : props.variant === 'avatar' ? '2.5rem' : '100%',
    height: props.variant === 'avatar' ? '2.5rem' : 'auto', borderRadius: props.variant === 'avatar' ? '50%' : radius,
    objectFit: props.fit === 'scaleDown' ? 'scale-down' : props.fit ?? 'fill', margin: gap } as CSSProperties,
}))

const Icon = createVueComponent(IconApi, ({ props }: any) => h('span', {
  style: { display: 'inline-grid', placeItems: 'center', minWidth: '1.5rem', margin: gap, color: 'var(--da-accent-primary)', fontWeight: 700 },
}, typeof props.name === 'string' ? props.name : props.name?.path ?? '◆'))

const Video = createVueComponent(VideoApi, ({ props }: any) => h('video', {
  src: props.url, controls: true, style: { width: '100%', aspectRatio: '16/9', margin: gap, borderRadius: radius },
}))

const AudioPlayer = createVueComponent(AudioPlayerApi, ({ props }: any) => h('div', { style: { margin: gap } }, [
  props.description ? h('small', { style: { display: 'block', color: 'var(--da-text-muted)' } }, props.description) : null,
  h('audio', { src: props.url, controls: true, style: { width: '100%' } }),
]))

const Row = createVueComponent(RowApi, ({ props, buildChild }: any) => h('div', { style: {
  display: 'flex', flexDirection: 'row', flexWrap: 'wrap', width: '100%', justifyContent: justify(props.justify), alignItems: align(props.align),
} }, children(props.children, buildChild)))

const Column = createVueComponent(ColumnApi, ({ props, buildChild }: any) => h('div', { style: {
  display: 'flex', flexDirection: 'column', width: '100%', justifyContent: justify(props.justify), alignItems: align(props.align),
} }, children(props.children, buildChild)))

const List = createVueComponent(ListApi, ({ props, buildChild }: any) => h('div', { style: {
  display: 'flex', flexDirection: props.direction === 'horizontal' ? 'row' : 'column', flexWrap: 'wrap', width: '100%', overflow: 'auto', alignItems: align(props.align),
} }, children(props.children, buildChild)))

const Card = createVueComponent(CardApi, ({ props, buildChild }: any) => h('section', { style: {
  width: 'calc(100% - 1rem)', margin: gap, padding: '0.875rem 1rem', border, borderRadius: 'var(--da-radius-md)',
  color: 'var(--da-text-primary)', background: 'var(--da-surface-1)', boxShadow: 'var(--da-shadow-sm)',
} }, props.child ? [buildChild(props.child)] : []))

const Tabs = createVueComponent(TabsApi, ({ props, buildChild, state }: any) => {
  const tabs = props.tabs ?? []
  return h('div', { style: { width: '100%', margin: gap } }, [
    h('div', { role: 'tablist', style: { display: 'flex', gap: '0.25rem', borderBottom: border } }, tabs.map((tab: any, index: number) => h('button', {
      role: 'tab', 'aria-selected': state.index.value === index, onClick: () => { state.index.value = index },
      style: { padding: '0.5rem 0.8125rem', border: 0, borderBottom: state.index.value === index ? '0.125rem solid var(--da-accent-primary)' : '0.125rem solid transparent',
        color: state.index.value === index ? 'var(--da-accent-primary)' : 'var(--da-text-muted)', background: 'transparent', cursor: 'pointer' },
    }, String(tab.title ?? '')))),
    h('div', { role: 'tabpanel', style: { paddingTop: '0.625rem' } }, tabs[state.index.value]?.child ? [buildChild(tabs[state.index.value].child)] : []),
  ])
}, () => ({ index: ref(0) }))

const Divider = createVueComponent(DividerApi, ({ props }: any) => h('div', { style: props.axis === 'vertical'
  ? { width: '0.0625rem', minHeight: '1.75rem', margin: gap, background: 'var(--da-border)' }
  : { width: '100%', height: '0.0625rem', margin: gap, background: 'var(--da-border)' } }))

const Modal = createVueComponent(ModalApi, ({ props, buildChild, state }: any) => h('div', [
  h('span', { onClick: () => { state.open.value = true }, style: { display: 'inline-block' } }, props.trigger ? [buildChild(props.trigger)] : []),
  state.open.value ? h('div', { role: 'dialog', 'aria-modal': 'true', onClick: () => { state.open.value = false }, style: {
    position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)',
  } }, [h('section', { onClick: (event: Event) => event.stopPropagation(), style: {
    width: 'min(42.5rem,90vw)', maxHeight: '86vh', overflow: 'auto', padding: '1.25rem', borderRadius: 'var(--da-radius-lg)', color: 'var(--da-text-primary)', background: 'var(--da-surface-1)',
  } }, [
    h('button', { 'aria-label': '关闭', onClick: () => { state.open.value = false }, style: { float: 'right' } }, '×'),
    props.content ? buildChild(props.content) : null,
  ])]) : null,
]), () => ({ open: ref(false) }))

const controlStyle = { width: '100%', padding: '0.5rem 0.625rem', border, borderRadius: radius, color: 'var(--da-text-primary)', background: 'var(--da-surface-0)' }
const Button = createVueComponent(ButtonApi, ({ props, buildChild }: any) => h('button', {
  disabled: props.isValid === false,
  onClick: props.isValid === false ? undefined : props.action,
  style: { margin: gap, padding: '0.5rem 0.875rem', border: props.variant === 'borderless' ? 0 : border, borderRadius: radius,
    color: props.variant === 'primary' ? 'var(--da-on-accent, #fff)' : 'var(--da-text-primary)',
    background: props.variant === 'primary' ? 'var(--da-accent-primary)' : props.variant === 'borderless' ? 'transparent' : 'var(--da-surface-1)',
    cursor: props.isValid === false ? 'not-allowed' : 'pointer', opacity: props.isValid === false ? 0.55 : 1 },
}, props.child ? [buildChild(props.child)] : []))

function fieldShell(label: unknown, id: string, control: VNode, errors?: unknown[]) {
  return h('div', { style: { display: 'grid', gap: '0.3125rem', width: 'calc(100% - 1rem)', margin: gap } }, [
    label ? h('label', { for: id, style: { color: 'var(--da-text-secondary)', fontSize: '0.8125rem', fontWeight: 650 } }, String(label)) : null,
    control,
    errors?.length ? h('small', { style: { color: 'var(--da-danger, #dc2626)' } }, String(errors[0])) : null,
  ])
}

const TextField = createVueComponent(TextFieldApi, ({ props, state }: any) => {
  const attrs = { id: state.id, value: props.value ?? '', style: controlStyle,
    onInput: (event: Event) => props.setValue((event.target as HTMLInputElement).value) }
  const control = props.variant === 'longText' ? h('textarea', attrs) : h('input', { ...attrs, type: props.variant === 'number' ? 'number' : props.variant === 'obscured' ? 'password' : 'text' })
  return fieldShell(props.label, state.id, control, props.validationErrors)
}, () => ({ id: nextId() }))

const CheckBox = createVueComponent(CheckBoxApi, ({ props, state }: any) => fieldShell(props.label, state.id, h('input', {
  id: state.id, type: 'checkbox', checked: Boolean(props.value), onChange: (event: Event) => props.setValue((event.target as HTMLInputElement).checked),
}), props.validationErrors), () => ({ id: nextId() }))

const ChoicePicker = createVueComponent(ChoicePickerApi, ({ props, context, state }: any) => {
  const selected = Array.isArray(props.value) ? props.value : []
  const exclusive = props.variant === 'mutuallyExclusive'
  const options = (props.options ?? []).filter((option: any) => !props.filterable || String(option.label ?? option.value).toLowerCase().includes(state.filter.value.toLowerCase()))
  const toggle = (value: string) => props.setValue(exclusive ? [value] : selected.includes(value) ? selected.filter((item: string) => item !== value) : [...selected, value])
  return h('fieldset', { style: { width: 'calc(100% - 1rem)', margin: gap, padding: '0.625rem', border, borderRadius: radius } }, [
    props.label ? h('legend', { style: { fontSize: '0.8125rem', fontWeight: 650 } }, String(props.label)) : null,
    props.filterable ? h('input', { value: state.filter.value, placeholder: '筛选选项', style: controlStyle,
      onInput: (event: Event) => { state.filter.value = (event.target as HTMLInputElement).value } }) : null,
    ...options.map((option: any) => h('label', { style: { display: 'flex', gap: '0.4375rem', padding: '0.25rem' } }, [
      h('input', { type: exclusive ? 'radio' : 'checkbox', name: exclusive ? `choice-${context.componentModel.id}` : undefined,
        checked: selected.includes(option.value), onChange: () => toggle(option.value) }), String(option.label ?? option.value),
    ])),
  ])
}, () => ({ filter: ref('') }))

const Slider = createVueComponent(SliderApi, ({ props, state }: any) => fieldShell(props.label, state.id, h('input', {
  id: state.id, type: 'range', min: props.min ?? 0, max: props.max, value: props.value ?? 0,
  onInput: (event: Event) => props.setValue(Number((event.target as HTMLInputElement).value)), style: { width: '100%' },
})), () => ({ id: nextId() }))

const DateTimeInput = createVueComponent(DateTimeInputApi, ({ props, state }: any) => fieldShell(props.label, state.id, h('input', {
  id: state.id, type: props.enableDate && !props.enableTime ? 'date' : !props.enableDate && props.enableTime ? 'time' : 'datetime-local',
  value: props.value ?? '', min: typeof props.min === 'string' ? props.min : undefined, max: typeof props.max === 'string' ? props.max : undefined,
  onInput: (event: Event) => props.setValue((event.target as HTMLInputElement).value), style: controlStyle,
})), () => ({ id: nextId() }))

export const dataAgentBasicComponents: VueComponentImplementation[] = [
  Text, Image, Icon, Video, AudioPlayer, Row, Column, List, Card, Tabs, Divider,
  Modal, Button, TextField, CheckBox, ChoicePicker, Slider, DateTimeInput,
]

export const dataAgentBasicCatalog = new Catalog(
  'https://a2ui.org/specification/v0_9/basic_catalog.json',
  dataAgentBasicComponents,
  BASIC_FUNCTIONS,
)

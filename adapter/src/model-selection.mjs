const isSafeId = (value) => typeof value === 'string'
  && value.length > 0
  && value.length <= 256
  && !/[\u0000-\u001f\u007f]/.test(value)

export const modelSelectionFromState = (state) => {
  const value = state?.modelSelection
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const providerID = typeof value.providerID === 'string' ? value.providerID.trim() : ''
  const modelID = typeof value.modelID === 'string' ? value.modelID.trim() : ''
  if (!isSafeId(providerID) || !isSafeId(modelID)) return undefined
  return { providerID, modelID }
}

export const withoutModelSelection = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state
  if (!Object.prototype.hasOwnProperty.call(state, 'modelSelection')) return state
  const { modelSelection: _modelSelection, ...rest } = state
  return rest
}

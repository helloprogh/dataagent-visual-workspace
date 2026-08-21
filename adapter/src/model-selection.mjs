const isSafeId = (value) => typeof value === 'string'
  && value.length > 0
  && value.length <= 256
  && !/[\u0000-\u001f\u007f]/.test(value)

export const modelSelectionFromForwardedProps = (forwardedProps) => {
  const value = forwardedProps?.model
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const providerID = typeof value.providerID === 'string' ? value.providerID.trim() : ''
  const modelID = typeof value.modelID === 'string' ? value.modelID.trim() : ''
  if (!isSafeId(providerID) || !isSafeId(modelID)) return undefined
  return { providerID, modelID }
}

// Acknowledge before streaming so the submitted draft clears independently of the answer.
export async function publishAndRun<T>(prepared: T, publish: () => void, accepted: ((receipt: T) => void) | undefined, run: () => Promise<unknown>) {
  publish()
  accepted?.(prepared)
  await run()
  return prepared
}

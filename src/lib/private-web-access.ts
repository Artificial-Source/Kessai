export type PrivateWebAccessState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface PrivateWebAccessStatus {
  state: PrivateWebAccessState
  enabled: boolean
  port: number
  error?: string
  serveCommand: string
  accessKey?: string
}

export interface ApplyPrivateWebAccessArgs {
  enabled: boolean
  port: number
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

let invokePromise: Promise<TauriInvoke> | null = null

function getTauriInvoke(): Promise<TauriInvoke> {
  invokePromise ??= import('@tauri-apps/api/core').then(({ invoke }) => invoke as TauriInvoke)
  return invokePromise
}

export async function getPrivateWebAccessStatus(): Promise<PrivateWebAccessStatus> {
  const invoke = await getTauriInvoke()
  return invoke<PrivateWebAccessStatus>('get_private_web_access_status')
}

export async function applyPrivateWebAccess(
  args: ApplyPrivateWebAccessArgs
): Promise<PrivateWebAccessStatus> {
  const invoke = await getTauriInvoke()
  return invoke<PrivateWebAccessStatus>('apply_private_web_access', args)
}

import { getVersion } from '@tauri-apps/api/app'
import { invoke, isTauri } from '@tauri-apps/api/core'
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'
import { create } from 'zustand'
import { toast } from 'sonner'

type UpdateSupport = 'supported' | 'development' | 'browser' | 'manual-linux-install'

type UpdaterContext = {
  executablePath: string
  bundleType: string | null
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error) {
    return error
  }

  return fallback
}

const isUnsupportedLinuxInstall = ({ executablePath, bundleType }: UpdaterContext) => {
  if (navigator.userAgent.toLowerCase().indexOf('linux') === -1) {
    return false
  }

  const isPackageBundle = bundleType === 'deb' || bundleType === 'rpm'
  const isLocalBinary = executablePath.includes('/.local/bin/')

  return isPackageBundle && isLocalBinary
}

const manualLinuxInstallMessage =
  'This Linux build was installed as a local binary but still identifies as a package build. Reinstall Kessai once from the AppImage release to enable in-app updates.'

type UpdateState = {
  support: UpdateSupport
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'up-to-date'
    | 'downloading'
    | 'installing'
    | 'error'
    | 'unsupported'
  currentVersion: string | null
  latestVersion: string | null
  releaseNotes: string | null
  releaseDate: string | null
  progress: number
  error: string | null
  initialize: () => Promise<void>
  checkForUpdates: (options?: { silent?: boolean }) => Promise<boolean>
  installUpdate: () => Promise<void>
}

let initializePromise: Promise<void> | null = null
let initialized = false
let pendingUpdate: Update | null = null

const getSupport = (): UpdateSupport => {
  if (!isTauri()) return 'browser'
  if (import.meta.env.DEV) return 'development'
  return 'supported'
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  support: getSupport(),
  status: 'idle',
  currentVersion: null,
  latestVersion: null,
  releaseNotes: null,
  releaseDate: null,
  progress: 0,
  error: null,

  initialize: async () => {
    if (initialized) {
      return
    }

    if (initializePromise) {
      await initializePromise
      return
    }

    initializePromise = (async () => {
      const support = getSupport()

      if (support === 'browser') {
        set({ support, status: 'unsupported' })
        initialized = true
        return
      }

      try {
        const currentVersion = await getVersion()

        if (typeof navigator !== 'undefined') {
          const updaterContext = await invoke<UpdaterContext>('get_updater_context')

          if (isUnsupportedLinuxInstall(updaterContext)) {
            set({
              support: 'manual-linux-install',
              currentVersion,
              latestVersion: currentVersion,
              status: 'unsupported',
              error: manualLinuxInstallMessage,
            })
            initialized = true
            return
          }
        }

        set({
          support,
          currentVersion,
          latestVersion: currentVersion,
          status: support === 'supported' ? 'idle' : 'unsupported',
          error: null,
        })
        initialized = true
      } catch (error) {
        set({
          support,
          status: support === 'supported' ? 'error' : 'unsupported',
          error: getErrorMessage(error, 'Failed to read current app version'),
        })
      } finally {
        if (!initialized) {
          initializePromise = null
        }
      }
    })()

    await initializePromise
  },

  checkForUpdates: async ({ silent = false } = {}) => {
    await get().initialize()

    if (get().support !== 'supported') {
      return false
    }

    set({ status: 'checking', error: null, progress: 0 })

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (!update) {
        pendingUpdate = null
        set((state) => ({
          status: 'up-to-date',
          latestVersion: state.currentVersion,
          releaseNotes: null,
          releaseDate: null,
          progress: 0,
        }))

        if (!silent) {
          toast.success('Kessai is up to date')
        }

        return false
      }

      pendingUpdate = update
      set({
        status: 'available',
        latestVersion: update.version,
        releaseNotes: update.body ?? null,
        releaseDate: update.date ?? null,
        progress: 0,
      })

      toast.info(`Kessai ${update.version} is ready`, {
        description: 'Open Settings > Updates to install it.',
      })

      return true
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to check for updates')
      set({ status: 'error', error: message, progress: 0 })

      if (!silent) {
        toast.error('Failed to check for updates', {
          description: message,
        })
      }

      return false
    }
  },

  installUpdate: async () => {
    await get().initialize()

    if (get().support !== 'supported' || !pendingUpdate) {
      return
    }

    set({ status: 'downloading', error: null, progress: 0 })

    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')

      let downloadedBytes = 0
      let totalBytes = 0

      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0
          set({ progress: 0, status: 'downloading' })
          return
        }

        if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
          set({ progress, status: 'downloading' })
          return
        }

        set({ progress: 100, status: 'installing' })
      })

      toast.success('Update installed. Restarting Kessai...')
      await relaunch()
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to install update')
      set({ status: 'available', error: message })
      toast.error('Failed to install update', {
        description: message,
      })
    }
  },
}))

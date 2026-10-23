import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Download, FileSpreadsheet, FileUp, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ImportDialog } from '@/components/settings/import-dialog'
import { CSVImportWizard } from '@/components/settings/csv-import-wizard'
import { SettingRow } from '@/components/settings/settings-section'
import {
  exportData,
  saveBackupToFile,
  importData,
  validateBackupData,
  readFileAsJson,
} from '@/lib/data-management'
import { logger } from '@/lib/logger'

const IMPORT_CHOICES = [
  {
    key: 'backup',
    icon: Upload,
    title: 'Restore a backup',
    description: 'Replace everything in Kessai with a Kessai backup (.json).',
  },
  {
    key: 'structured',
    icon: FileUp,
    title: 'Import subscriptions',
    description: 'Add subscriptions from a CSV, a Kessai backup, or a Wallos export.',
  },
  {
    key: 'csv',
    icon: FileSpreadsheet,
    title: 'Import a bank statement',
    description: 'Find recurring charges in a bank CSV by mapping its columns.',
  },
] as const

type ImportChoice = (typeof IMPORT_CHOICES)[number]['key']

interface DataManagementProps {
  onDataChanged: (restored?: boolean) => void | Promise<void>
}

export function DataManagement({ onDataChanged }: DataManagementProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [showImportOptions, setShowImportOptions] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showCSVImportWizard, setShowCSVImportWizard] = useState(false)
  const [pendingImportData, setPendingImportData] = useState<unknown>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const data = await exportData()
      const saved = await saveBackupToFile(data)
      if (saved) {
        toast.success('Backup saved successfully')
      }
    } catch (error) {
      // Export fails closed on a row it can't vouch for; core names the row and the fix.
      const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
      toast.error('Couldn’t export your data', {
        description: reason || 'No backup file was written. Try again.',
      })
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const openBackupImport = () => {
    setShowImportOptions(false)
    fileInputRef.current?.click()
  }

  const openStructuredImport = () => {
    setShowImportOptions(false)
    setShowImportDialog(true)
  }

  const openCSVImport = () => {
    setShowImportOptions(false)
    setShowCSVImportWizard(true)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = await readFileAsJson(file)

      if (!validateBackupData(data)) {
        toast.error('Invalid backup file format')
        return
      }

      setPendingImportData(data)
      setShowImportConfirm(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to read file')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImportConfirm = async () => {
    if (!pendingImportData || !validateBackupData(pendingImportData)) return

    setIsImporting(true)
    setShowImportConfirm(false)

    try {
      const result = await importData(pendingImportData, { clearExisting: true })

      if (result.success) {
        await onDataChanged(true)
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed')
      console.error('Import error:', error)
    } finally {
      setIsImporting(false)
      setPendingImportData(null)
    }
  }

  const handleChoice = (choice: ImportChoice) => {
    if (choice === 'backup') openBackupImport()
    else if (choice === 'structured') openStructuredImport()
    else openCSVImport()
  }

  return (
    <div className="divide-border flex flex-col divide-y [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      <SettingRow
        label="Export a backup"
        description="Save every subscription, payment, and setting to a JSON file."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleExport()}
          disabled={isExporting}
          aria-busy={isExporting}
        >
          {isExporting ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Export backup
        </Button>
      </SettingRow>

      <SettingRow
        label="Import data"
        description="Restore a backup or bring in subscriptions from a file. Restoring a full backup requires Private Web Access to be stopped."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowImportOptions(true)}
          disabled={isImporting}
          aria-busy={isImporting}
        >
          {isImporting ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          Import data
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Backup JSON file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </SettingRow>

      <SettingRow
        label="Diagnostic logs"
        description="Download Kessai's logs to attach to a bug report."
      >
        <Button variant="outline" size="sm" onClick={() => logger.downloadLogs()}>
          <Download aria-hidden="true" />
          Download logs
        </Button>
      </SettingRow>

      <ConfirmDialog
        open={showImportConfirm}
        onOpenChange={setShowImportConfirm}
        title="Restore this backup?"
        description="Everything in Kessai is replaced by the backup. This can't be undone, so export a backup first if you might need today's data."
        confirmLabel="Restore backup"
        variant="destructive"
        onConfirm={handleImportConfirm}
      />

      <Dialog open={showImportOptions} onOpenChange={setShowImportOptions}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import data</DialogTitle>
            <DialogDescription>Choose what you&rsquo;re bringing into Kessai.</DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-3">
            {IMPORT_CHOICES.map(({ key, icon: Icon, title, description }) => (
              <li key={key}>
                <Card asChild interactive padding="sm">
                  <button
                    type="button"
                    onClick={() => handleChoice(key)}
                    className="flex w-full items-start gap-3"
                  >
                    <span className="border-border-hover bg-accent-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-md border">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground text-sm font-medium">{title}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed text-pretty">
                        {description}
                      </span>
                    </span>
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onDataChanged={onDataChanged}
      />

      <CSVImportWizard
        open={showCSVImportWizard}
        onOpenChange={setShowCSVImportWizard}
        onDataChanged={onDataChanged}
      />
    </div>
  )
}

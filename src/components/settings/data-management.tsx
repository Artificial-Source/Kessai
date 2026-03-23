import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ImportDialog } from '@/components/settings/import-dialog'
import {
  exportData,
  saveBackupToFile,
  importData,
  validateBackupData,
  readFileAsJson,
} from '@/lib/data-management'

interface DataManagementProps {
  onDataChanged: () => void
}

export function DataManagement({ onDataChanged }: DataManagementProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
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
      toast.error('Failed to export data')
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
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
        toast.success(result.message)
        onDataChanged()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Import failed')
      console.error('Import error:', error)
    } finally {
      setIsImporting(false)
      setPendingImportData(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
            Export Data
          </p>
          <p className="text-muted-foreground text-xs">
            Download all your subscriptions as a backup
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isExporting}
          className="shrink-0 gap-2"
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
            Import Data
          </p>
          <p className="text-muted-foreground text-xs">Restore from a backup file</p>
        </div>
        <Button
          variant="outline"
          onClick={handleImportClick}
          disabled={isImporting}
          className="shrink-0 gap-2"
        >
          <Upload className="h-4 w-4" />
          {isImporting ? 'Importing...' : 'Import'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div className="border-border border-t pt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
              Import from CSV / Other Apps
            </p>
            <p className="text-muted-foreground text-xs">
              Import from CSV, Wallos, or other formats
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            className="shrink-0 gap-2"
          >
            <FileUp className="h-4 w-4" />
            Import
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showImportConfirm}
        onOpenChange={setShowImportConfirm}
        title="Import Backup?"
        description="This will replace all your current data with the backup. This action cannot be undone."
        confirmLabel="Import"
        onConfirm={handleImportConfirm}
      />

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onDataChanged={onDataChanged}
      />
    </div>
  )
}

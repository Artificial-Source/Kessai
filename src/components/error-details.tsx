/** Collapsible technical message for crash screens; kept out of the way of the recovery actions. */
export function ErrorDetails({ message }: { message: string }) {
  return (
    <details className="border-border bg-surface w-full max-w-md rounded-md border text-left">
      <summary className="type-label text-muted-foreground hover:text-foreground cursor-pointer px-3 py-2">
        Error details
      </summary>
      <pre className="text-destructive border-border overflow-auto border-t px-3 py-2 font-[family-name:var(--font-mono)] text-xs whitespace-pre-wrap">
        {message}
      </pre>
    </details>
  )
}

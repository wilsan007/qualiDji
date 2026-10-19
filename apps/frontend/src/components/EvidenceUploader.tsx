import { useRef, useState } from 'react'
import { stepsApi } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Paperclip, CheckCircle2, X } from 'lucide-react'

interface EvidenceUploaderProps {
  actionId: string
  stepId: string
}

export function EvidenceUploader({ actionId, stepId }: EvidenceUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? [])
    setFiles((prev) => [...prev, ...newFiles])
    setDone(false)
    setError('')
    // Réinitialise pour permettre de re-sélectionner le même fichier
    if (e.target) e.target.value = ''
  }

  const handleUpload = async () => {
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer()
        const hash = await crypto.subtle.digest('SHA-256', arrayBuffer)
        const checksum = Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

        await stepsApi.addEvidence(actionId, stepId, {
          kind: file.type.startsWith('image/') ? 'photo' : 'file',
          storage_path: `evidence/${Date.now()}_${file.name}`,
          checksum,
          value: { filename: file.name, size: file.size, mime: file.type },
        })
      }
      setFiles([])
      setDone(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/70 hover:border-blue-300 transition-colors">
      <p className="text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-slate-400" /> Preuves à joindre
      </p>
      <p className="text-xs text-slate-400 mb-3">
        Photo, PDF ou export — l'empreinte SHA-256 est calculée automatiquement pour la traçabilité.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleAdd}
        className="block w-full text-sm text-slate-500
          file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0
          file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
          hover:file:bg-blue-100 file:cursor-pointer"
      />

      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2"
              >
                <span className="truncate text-slate-600">{f.name}</span>
                <span className="flex items-center gap-2 shrink-0 text-slate-400">
                  {Math.max(1, Math.round(f.size / 1024))} Ko
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Retirer ${f.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <Button onClick={handleUpload} loading={uploading} disabled={uploading} size="sm">
            Joindre {files.length} preuve(s)
          </Button>
        </div>
      )}

      {done && (
        <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Preuve(s) enregistrée(s) — elle(s) figurera dans le journal d'audit.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { evidenceApi, type EvidenceItem } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Paperclip, CheckCircle2, X, Download, ShieldCheck, ShieldAlert } from 'lucide-react'

interface EvidenceUploaderProps {
  actionId: string
  stepId: string
}

async function sha256Hex(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function sizeLabel(bytes?: number): string {
  if (!bytes) return ''
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

export function EvidenceUploader({ actionId, stepId }: EvidenceUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [items, setItems] = useState<EvidenceItem[]>([])
  const [integrity, setIntegrity] = useState<Record<string, 'ok' | 'ko'>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      const r = await evidenceApi.list(actionId)
      setItems((r.evidence ?? []).filter((e) => e.step_id === stepId))
    } catch {
      /* la liste est un confort : l'échec ne bloque pas le dépôt */
    }
  }, [actionId, stepId])

  useEffect(() => {
    void reload()
  }, [reload])

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
        // Le serveur recalcule l'empreinte et refuse le dépôt si elle diffère (transfert altéré)
        await evidenceApi.upload(actionId, stepId, file, await sha256Hex(file))
      }
      setFiles([])
      setDone(true)
      await reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (id: string) => {
    setError('')
    try {
      const r = await evidenceApi.download(id)
      window.open(r.url, '_blank', 'noopener')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleVerify = async (id: string) => {
    setError('')
    try {
      const r = await evidenceApi.verify(id)
      setIntegrity((prev) => ({ ...prev, [id]: r.intact ? 'ok' : 'ko' }))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/70 hover:border-blue-300 transition-colors">
      <p className="text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-slate-400" /> Preuves à joindre
      </p>
      <p className="text-xs text-slate-400 mb-3">
        Photo, PDF, tableur ou texte (25 Mo max) — le fichier est stocké de façon privée et son empreinte SHA-256
        est vérifiée par le serveur.
      </p>

      {items.length > 0 && (
        <ul className="mb-3 space-y-1" aria-label="Preuves enregistrées">
          {items.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
              <span className="truncate text-slate-700">
                {ev.value?.filename ?? ev.kind}
                <span className="text-slate-400"> · {sizeLabel(ev.value?.size)} · {ev.checksum?.slice(0, 8)}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {integrity[ev.id] === 'ok' && <span className="text-emerald-600 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> intègre</span>}
                {integrity[ev.id] === 'ko' && <span className="text-red-600 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> ALTÉRÉ</span>}
                {ev.checksum && (
                  <button type="button" onClick={() => handleVerify(ev.id)} className="text-slate-500 hover:text-blue-600">
                    Vérifier
                  </button>
                )}
                {ev.checksum && (
                  <button type="button" onClick={() => handleDownload(ev.id)} className="text-slate-500 hover:text-blue-600 flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> Télécharger
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

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
                  {sizeLabel(f.size)}
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
          <CheckCircle2 className="w-4 h-4" /> Preuve(s) stockée(s) — elle(s) figurera dans le journal d'audit.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

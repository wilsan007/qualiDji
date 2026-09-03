'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Camera, Upload, CheckCircle2, XCircle } from 'lucide-react'

interface TaskActionsProps {
  taskId: string
  status: string
  isAssignedToMe: boolean
  canVerify: boolean
  evidenceLevelMin: string
  locale: string
}

export function TaskActions({
  taskId,
  status,
  isAssignedToMe,
  canVerify,
  evidenceLevelMin,
  locale,
}: TaskActionsProps) {
  const t = useTranslations('Tasks')
  const tEvidence = useTranslations('Evidence')
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ name: string; hash: string; size: number }>
  >([])

  async function hashFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async function handleFileSelect(files: FileList | null, type: 'photo' | 'document') {
    if (!files || files.length === 0) return
    setLoading(true)

    const newFiles: Array<{ name: string; hash: string; size: number }> = []
    for (const file of Array.from(files)) {
      const hash = await hashFile(file)
      newFiles.push({ name: file.name, hash, size: file.size })
    }
    setUploadedFiles((prev) => [...prev, ...newFiles])
    setLoading(false)
  }

  async function handleStart() {
    setLoading(true)
    await supabase
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', taskId)
    setLoading(false)
    router.refresh()
  }

  async function handleSubmit() {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // Upload files to Supabase Storage
    for (const fileMeta of uploadedFiles) {
      // In a real implementation, we'd upload the actual file to Supabase Storage
      // and create an evidence record with the storage path and hash
      await supabase.from('evidence').insert({
        task_id: taskId,
        uploaded_by: user.id,
        type: 'document',
        storage_path: `evidence/${taskId}/${fileMeta.name}`,
        file_name: fileMeta.name,
        file_size: fileMeta.size,
        file_hash: fileMeta.hash,
        level: evidenceLevelMin,
      })
    }

    // Create completion record
    await supabase.from('task_completions').insert({
      task_id: taskId,
      user_id: user.id,
      comment,
    })

    // Update task status
    await supabase
      .from('tasks')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', taskId)

    setLoading(false)
    router.refresh()
  }

  async function handleVerify(approved: boolean) {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('task_verifications').insert({
      task_id: taskId,
      verifier_id: user.id,
      status: approved ? 'approved' : 'rejected',
      comment,
    })

    await supabase
      .from('tasks')
      .update({
        status: approved ? 'verified' : 'rejected',
        verified_at: new Date().toISOString(),
        verified_by: user.id,
        rejection_reason: approved ? null : comment,
      })
      .eq('id', taskId)

    setLoading(false)
    router.refresh()
  }

  if (status === 'verified' || status === 'rejected') {
    return null
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        {/* Start button */}
        {isAssignedToMe && status === 'pending' && (
          <Button onClick={handleStart} disabled={loading} className="w-full">
            {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('startTask')}
          </Button>
        )}

        {/* Evidence upload + submit */}
        {isAssignedToMe && (status === 'in_progress' || status === 'pending') && (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">
                {t('evidenceRequired', { level: `N${evidenceLevelMin}` })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="me-2 h-4 w-4" />
                  {tEvidence('capturePhoto')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="me-2 h-4 w-4" />
                  {tEvidence('uploadFile')}
                </Button>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files, 'photo')}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files, 'document')}
              />
            </div>

            {/* Uploaded files */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.hash.substring(0, 12)}...
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Comment */}
            <div>
              <textarea
                className="w-full rounded-md border border-input bg-background p-3 text-sm"
                rows={3}
                placeholder={t('comment')}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <Button onClick={handleSubmit} disabled={loading} className="w-full">
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('submitTask')}
            </Button>
          </>
        )}

        {/* Verification actions */}
        {canVerify && status === 'submitted' && (
          <>
            <div>
              <textarea
                className="w-full rounded-md border border-input bg-background p-3 text-sm"
                rows={3}
                placeholder={t('verificationComment')}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => handleVerify(true)}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="me-2 h-4 w-4" />
                )}
                {t('verifyTask')}
              </Button>
              <Button
                onClick={() => handleVerify(false)}
                disabled={loading}
                variant="destructive"
                className="flex-1"
              >
                <XCircle className="me-2 h-4 w-4" />
                {t('rejectTask')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

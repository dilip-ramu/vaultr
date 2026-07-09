'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Reusable drag-and-drop for any attachment/upload area.
 *
 *   const { dragOver, dropProps } = useFileDrop(files => handleFiles(files))
 *   <div {...dropProps} style={{ borderColor: dragOver ? 'var(--brand)' : ... }}>
 *
 * `onFiles` receives the dropped FileList. Pass `disabled` to ignore drops
 * (e.g. while uploading). Uses a counter so nested children don't flicker the
 * highlight on dragenter/dragleave.
 */
export function useFileDrop(
  onFiles: (files: FileList) => void,
  opts: { disabled?: boolean } = {},
) {
  const [dragOver, setDragOver] = useState(false)
  const depth = useRef(0)

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (opts.disabled) return
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault(); e.stopPropagation()
    depth.current += 1
    setDragOver(true)
  }, [opts.disabled])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (opts.disabled) return
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [opts.disabled])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (opts.disabled) return
    e.preventDefault(); e.stopPropagation()
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragOver(false)
  }, [opts.disabled])

  const onDrop = useCallback((e: React.DragEvent) => {
    depth.current = 0
    setDragOver(false)
    if (opts.disabled) return
    const files = e.dataTransfer?.files
    if (files && files.length) { e.preventDefault(); e.stopPropagation(); onFiles(files) }
  }, [onFiles, opts.disabled])

  return { dragOver, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } }
}

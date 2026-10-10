import { useEffect, useRef } from 'react'

interface VideoLightboxProps {
  videoId: string
  titulo: string
  onClose: () => void
}

/** Visualizador grande de un video de YouTube, con X para cerrar, Escape y click afuera. */
export function VideoLightbox({ videoId, titulo, onClose }: VideoLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="video-lightbox-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="video-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
      >
        <button className="video-lightbox-close" onClick={onClose} aria-label="Cerrar video">
          ✕
        </button>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={titulo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  )
}

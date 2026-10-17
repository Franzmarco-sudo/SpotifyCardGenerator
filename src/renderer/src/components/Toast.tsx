import { useToast } from '@renderer/stores/toast'

export default function Toast(): React.JSX.Element {
  const { message, success, visible } = useToast()
  return (
    <div className={`toast ${visible ? 'visible' : ''} ${success ? 'ok' : 'err'}`} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path
          d={
            success
              ? 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,17L5,12L6.41,10.59L10,14.17L17.59,6.58L19,8L10,17Z'
              : 'M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z'
          }
        />
      </svg>
      <span>{message}</span>
    </div>
  )
}

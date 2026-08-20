import type { DropProgress } from '../data/drops'

export function PrintMeter({
  progress,
  tone = 'dark',
}: {
  progress: DropProgress
  tone?: 'dark' | 'light'
}) {
  const reserved = Math.min(progress.reservedCopies, progress.target)
  const remaining = Math.max(progress.target - progress.reservedCopies, 0)
  const reached = remaining === 0

  return (
    <div className={`print-meter print-meter-${tone}`}>
      <div className="print-meter-heading">
        <span>Print Meter</span>
        <strong>{progress.reservedCopies} / {progress.target}</strong>
      </div>
      <div
        className="print-meter-track"
        role="progressbar"
        aria-label={`${progress.reservedCopies} of ${progress.target} copies reserved`}
        aria-valuemin={0}
        aria-valuemax={progress.target}
        aria-valuenow={Math.min(progress.reservedCopies, progress.target)}
      >
        {Array.from({ length: progress.target }, (_, index) => (
          <span key={index} className={index < reserved ? 'is-filled' : ''} />
        ))}
      </div>
      <p className="print-meter-copy">
        <strong>{progress.reservedCopies} of {progress.target} copies reserved.</strong>{' '}
        {reached
          ? 'The First Edition target is reached.'
          : `${remaining} ${remaining === 1 ? 'copy' : 'copies'} still needed to make this poster happen.`}
      </p>
    </div>
  )
}

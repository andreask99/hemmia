import { RecoveryCodePanel } from '../components/RecoveryCodePanel.tsx';

export function StepRecovery({ code, onNext }: { code: string; onNext: () => void }) {
  return <RecoveryCodePanel code={code} onDone={onNext} />;
}

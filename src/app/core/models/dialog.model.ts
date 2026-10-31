import type { IconName } from '../../shared/components/icon/icon.component';

export interface DialogChoice {
  value: string;
  label: string;
  description?: string;
  icon: IconName;
}

export interface DialogRequest {
  kind: 'choice' | 'input' | 'confirm' | 'notice';
  title: string;
  message?: string;
  step?: string;
  icon?: IconName;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  maxLength?: number;
  submitLabel?: string;
  requiredMessage?: string;
  errorMessage?: string;
  destructive?: boolean;
  choices?: DialogChoice[];
  validate?: (value: string) => string | null;
  back?: () => DialogRequest;
  onCancel?: () => void;
  onSubmit?: (value: string) => void | DialogRequest | Promise<void | DialogRequest>;
}

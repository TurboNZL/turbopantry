import type { SelectHTMLAttributes } from 'react';

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: string;
  onChange(value: string): void;
  options: { value: string; label: string }[];
}

/** A native drop-down in the themes' `.input` look. */
export function Select({ value, onChange, options, className, ...rest }: Props) {
  return (
    <select {...rest} className={`input ${className ?? ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

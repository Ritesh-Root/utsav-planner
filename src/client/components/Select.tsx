import type { SelectHTMLAttributes } from 'react';

type NativeProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'children'>;

/** A `<select>` over a fixed list of values; only listed values ever reach `onChange`. */
export function Select<T extends string>({
  value,
  options,
  optionLabel,
  onChange,
  ...select
}: NativeProps & {
  value: T;
  options: readonly T[];
  optionLabel: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <select
      {...select}
      value={value}
      onChange={(e) => {
        const picked = options.find((option) => option === e.target.value);
        if (picked !== undefined) onChange(picked);
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  );
}

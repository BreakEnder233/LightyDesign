import { forwardRef, type ChangeEvent, type ComponentPropsWithoutRef } from "react";

import type { NumericColumnKind } from "../types/desktopApp";

type NumericCellInputProps = Omit<ComponentPropsWithoutRef<"input">, "inputMode" | "onChange" | "type"> & {
  numericKind: NumericColumnKind;
  onChangeValue: (nextValue: string) => void;
};

function hasDigit(value: string) {
  return /\d/.test(value);
}

function isValidPartialNumericValue(value: string, numericKind: NumericColumnKind) {
  if (value.length === 0) {
    return true;
  }

  if (numericKind === "integer") {
    return /^[+-]?\d*$/.test(value);
  }

  const exponentMatches = value.match(/[eE]/g);
  if ((exponentMatches?.length ?? 0) > 1) {
    return false;
  }

  const exponentOffset = Math.max(value.indexOf("e"), value.indexOf("E"));
  const mantissa = exponentOffset >= 0 ? value.slice(0, exponentOffset) : value;
  const exponent = exponentOffset >= 0 ? value.slice(exponentOffset + 1) : null;

  if (!/^[+-]?(?:\d+\.?\d*|\.\d*)?$/.test(mantissa)) {
    return false;
  }

  if (exponent !== null) {
    if (!hasDigit(mantissa)) {
      return false;
    }

    if (!/^[+-]?\d*$/.test(exponent)) {
      return false;
    }
  }

  return true;
}

export const NumericCellInput = forwardRef<HTMLInputElement, NumericCellInputProps>(function NumericCellInput(
  { numericKind, onChangeValue, ...inputProps },
  ref,
) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    if (!isValidPartialNumericValue(nextValue, numericKind)) {
      return;
    }

    onChangeValue(nextValue);
  }

  return (
    <input
      {...inputProps}
      inputMode={numericKind === "integer" ? "numeric" : "decimal"}
      onChange={handleChange}
      ref={ref}
      type="text"
    />
  );
});
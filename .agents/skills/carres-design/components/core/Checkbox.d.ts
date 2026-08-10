import React from "react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** default = flame fill (a real choice) · select = blue fill (row multi-select). */
  variant?: "default" | "select";
}

/**
 * 17px checkbox — flame when it's a choice, blue when it's row selection.
 * @startingPoint section="Core" subtitle="Flame / blue-select checkbox" viewport="260x80"
 */
export function Checkbox(props: CheckboxProps): JSX.Element;
